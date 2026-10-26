"""Read-only preview of the DN démarche, behind apercu_dn.sh.

    python apercu.py [--extraction | --voir]

Without option: access, labels, codes annotation and champs compared with mapping.py, counts.
No personal data: champ labels only.
--extraction: also cleans what the pipeline would take, as it would, in a private temp
directory: the run's first two steps, without lamp01, codes nor feedback.
--voir: also prints the fetched dossiers and the cleaned output (personal data on screen).

Writes nothing to DN or lamp01. Settings come from the environment, then data/.env.
"""

import argparse
import json
import os
import sys
import tempfile
from collections import Counter
from pathlib import Path

import pandas as pd
import requests
from dotenv import load_dotenv

import dn_pipeline as pipeline
import mapping
from dn_client import DnApiError, DnClient


def _ok(found: bool) -> str:
    return 'ok     ' if found else 'ABSENT '


def _short(label: str, width: int = 60) -> str:
    return label if len(label) <= width else label[:width - 3] + '...'


def dn_overview(client: DnClient, numero: int) -> list[dict]:
    """Prints the overview and returns every dossier of the démarche."""
    labels = client.labels(numero)
    annotations = client.annotations(numero)
    dossiers = list(client.iter_dossiers(numero, state=None))

    print(f"démarche {numero} : accès OK")
    print(f"labels de la démarche : {', '.join(sorted(labels)) or 'aucun'}")
    folded_labels = {mapping.fold(name) for name in labels}
    for name in mapping.DN_LABELS.values():
        print(f"  {_ok(mapping.fold(name) in folded_labels)} {name}")

    print(f"annotations privées : {', '.join(sorted(annotations)) or 'aucune'}")
    codes = {mapping.fold(label): spec for label, spec in annotations.items()}.get(
        mapping.fold(mapping.DN_ANNOTATION_CODES))
    if codes and codes['type'] != mapping.DN_ANNOTATION_TYPE:
        print(f"  TYPE ? {mapping.DN_ANNOTATION_CODES} : {codes['type']}, attendu Texte long")
    else:
        print(f"  {_ok(codes is not None)} {mapping.DN_ANNOTATION_CODES} (Texte long)")

    states = Counter(dossier['state'] for dossier in dossiers)
    print(f"dossiers : {len(dossiers)} "
          f"({', '.join(f'{s} {n}' for s, n in sorted(states.items())) or 'aucun'})")
    if not dossiers:
        return dossiers
    connections = Counter(dossier.get('connectionUsager') or '?' for dossier in dossiers)
    print(f"connexion : {', '.join(f'{c} {n}' for c, n in sorted(connections.items()))}")
    skipped = Counter(pipeline.dn_skip_reason(dossier) for dossier in dossiers)
    to_process = skipped.pop('', 0)
    print(f"à traiter (en instruction par un instructeur, FranceConnect, sans label) : {to_process}"
          + (f" ; ignorés : {', '.join(f'{r} {n}' for r, n in sorted(skipped.items()))}" if skipped else ''))

    # Labels only, in first-seen order, over every dossier: a conditional champ may be missing
    # from some of them.
    champs, sous_champs = {}, {}
    for dossier in dossiers:
        for champ in dossier['champs']:
            champs.setdefault(mapping.fold(champ['label']), (champ['__typename'], champ['label']))
            for row in champ.get('rows') or []:
                for sous in row.get('champs') or []:
                    sous_champs.setdefault(mapping.fold(sous['label']), (sous['__typename'], sous['label']))

    print("\nchamps de la démarche :")
    for typename, label in champs.values():
        print(f"  {typename:<26} {label}")
    print("champs du bloc répétable :")
    for typename, label in sous_champs.values():
        print(f"  {typename:<26} {label}")

    print("\nchamps attendus par mapping.py :")
    for expected, found in ((mapping.DN_CHAMPS, champs), (mapping.DN_ENFANT_CHAMPS, sous_champs)):
        for key, label in expected.items():
            print(f"  {_ok(mapping.fold(label) in found)} {key:<18} {label}")
    return dossiers


def dn_to_process(dossiers: list[dict]) -> list[dict]:
    """What the pipeline's fetch keeps, minus its check that the labels exist."""
    return [dossier for dossier in dossiers if not pipeline.dn_skip_reason(dossier)]


def _dn_value(champ: dict) -> str:
    text = champ.get('date') or champ.get('stringValue') or ''
    insee = (champ.get('address') or {}).get('cityCode')
    return f"{text} (INSEE {insee})" if insee else text


def show_dn(raw: dict, filepath) -> None:
    print(f"\n=== fichier récupéré : {filepath} — {len(raw['dossiers'])} dossier(s) en instruction ===")
    for dossier in raw['dossiers']:
        demandeur = dossier.get('demandeur') or {}
        print(f"\ndossier {dossier['number']} ({dossier['state']}) : demandeur {demandeur.get('prenom') or ''} "
              f"{demandeur.get('nom') or ''}, compte {(dossier.get('usager') or {}).get('email') or ''}, "
              f"connexion : {dossier.get('connectionUsager') or '?'}, "
              f"dépôt pour un tiers : {'oui' if dossier.get('deposeParUnTiers') else 'non'}")
        for champ in dossier['champs']:
            if champ['__typename'] != 'RepetitionChamp':
                print(f"  {_short(champ['label']):<60} {_dn_value(champ)}")
                continue
            print(f"  {champ['label']} :")
            for index, row in enumerate(champ.get('rows') or [], start=1):
                print(f"    ligne {index} : " + ' | '.join(
                    f"{_short(c['label'])} = {_dn_value(c)}" for c in row.get('champs') or []))


# --- Extraction -------------------------------------------------------------------------

def _read(work: Path, filename: str) -> pd.DataFrame:
    return pd.read_csv(work / filename, sep=';', dtype=str, keep_default_na=False)


def show_cleaned(work: Path) -> None:
    pd.set_option('display.width', 250)
    pd.set_option('display.max_columns', None)
    pd.set_option('display.max_colwidth', 60)

    identites = _read(work, 'identites.csv')
    print(f"\n=== après nettoyage : identites.csv — {len(identites)} bénéficiaire(s) ===")
    if len(identites):
        print(identites[['reference', 'prenom', 'nom', 'date_naissance', 'genre', 'situation', 'caisse',
                         'allocataire_prenom', 'allocataire_nom', 'allocataire_genre',
                         'email']].to_string(index=False))

    clean = _read(work, 'beneficiaires-clean.csv')
    print("\n=== formaté pour lamp01 et /nfs/run : beneficiaires-clean.csv (schéma PSP, avant tirage des codes) ===")
    for index, row in enumerate(clean.drop(columns='eligibility_result_id').to_dict('records'), start=1):
        print(f"--- bénéficiaire {index}")
        for name, cell in row.items():
            print(f"  {name:<20} {cell}")

    rejets = _read(work, 'rejets.csv')
    print(f"\n=== rejets.csv — {len(rejets)} ligne(s) écartée(s) ===")
    if len(rejets):
        print(rejets[['reference', 'prenom', 'nom', 'motif']].to_string(index=False))


def extract(work: Path, dn_raw: dict, show: bool) -> dict:
    """The pipeline's clean step on what was fetched, in `work`, under run_dn.sh's names."""
    dn_filepath = work / 'dn-brut.json'
    dn_filepath.write_text(json.dumps(dn_raw, ensure_ascii=False), encoding='utf-8')

    print(f"\nnettoyage comme le pipeline -> {work}")
    stats = pipeline.clean(dn_filepath, work / 'beneficiaires-clean.csv', work / 'dn_candidats.csv',
                           work / 'cnaf-extra.csv', work / 'identites.csv', work / 'rejets.csv')
    pipeline.print_stats(stats)

    if show:
        if dn_raw['dossiers']:
            show_dn(dn_raw, dn_filepath)
        show_cleaned(work)
    return stats


def _workdir(prefix: str) -> Path:
    # Personal data from here on: private directory, outside the repository.
    os.umask(0o077)
    return Path(tempfile.mkdtemp(prefix=prefix, dir='/tmp'))


def dn_source() -> tuple[DnClient, int]:
    return (DnClient(os.environ.get('DN_API_URL'), pipeline._required_env('DN_API_TOKEN')),
            int(pipeline._required_env('DN_DEMARCHE_NUMBER')))


def preview(client: DnClient, numero: int, mode: str | None) -> Path | None:
    """The overview, then, with a mode, the clean a run would make."""
    dossiers = dn_overview(client, numero)
    if not mode:
        return None
    work = _workdir('dn-test.')
    extract(work, {'demarche': numero, 'labels': {}, 'dossiers': dn_to_process(dossiers)}, mode == 'voir')
    print(f"\nfichiers : {work} (JSON brut complet : python3 -m json.tool {work}/dn-brut.json)")
    print(f"données personnelles : rm -rf {work} une fois lu")
    return work


def explain(error: Exception) -> str:
    if isinstance(error, ValueError):
        return str(error)
    if isinstance(error, requests.HTTPError) and error.response is not None:
        status = error.response.status_code
        if status in (401, 403):
            return f"accès refusé ({status}) : vérifier le jeton d'API et ses droits"
        if status == 404:
            return (f"introuvable (404) : {error.request.url} — vérifier l'URL de l'API "
                    "et le numéro de la démarche")
    return f"{type(error).__name__} : {error}"


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--extraction', dest='mode', action='store_const', const='extraction')
    mode.add_argument('--voir', dest='mode', action='store_const', const='voir')
    args = parser.parse_args(argv)

    load_dotenv(pipeline.DATA_DIR / '.env', override=False)
    try:
        preview(*dn_source(), args.mode)
    except (requests.RequestException, DnApiError, ValueError) as error:
        print(f"ERREUR : {explain(error)}", file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
