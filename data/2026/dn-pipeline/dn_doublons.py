"""Flags the DN dossiers en construction whose beneficiaries lamp01 may already know.

    python dn_doublons.py --journal doublons.csv [--dry-run]

Takes the dossiers an instructeur follows, matches them with match_dn.sql, the rules of the
dossiers en instruction, then writes the codes found in a private annotation and adds a label.
A labelled dossier is left alone until someone removes the label.

Settings come from the environment (data/.env, loaded by run_dn_doublons.sh).
"""

import argparse
import os
import subprocess
import tempfile
from collections.abc import Callable
from pathlib import Path

import pandas as pd

# First: it puts the partners and FranceConnect directories on sys.path.
import dn_pipeline as pipeline

import mapping  # noqa: E402
from dn_client import DEFAULT_API_URL, DnClient  # noqa: E402

STATE = 'en_construction'
MATCH_SQL = Path(__file__).resolve().parent / 'match_dn.sql'
LABEL = mapping.DN_LABEL_DOUBLON_POTENTIEL
NOTES = mapping.DN_ANNOTATION_NOTES_CONSTRUCTION


def lamp01_matches(candidates: pd.DataFrame) -> pd.DataFrame:
    """match_dn.sql on these candidates: eligibility_result_id, id_psp, type."""
    with tempfile.TemporaryDirectory(prefix='dn-doublons-') as workdir:
        pipeline._write(candidates, Path(workdir) / 'dn_candidats.csv', pipeline.MATCH_COLUMNS)
        correspondences = Path(workdir) / 'correspondances.csv'
        subprocess.run(
            ['psql', '-h', pipeline._required_env('LAMP_DB_HOST'),
             '-p', pipeline._required_env('LAMP_DB_PORT'),
             '-U', pipeline._required_env('LAMP_DB_USER'),
             '-d', pipeline._required_env('LAMP_DB_NAME'),
             '-q', '-v', 'ON_ERROR_STOP=1', '-v', f'correspondances={correspondences}',
             '-v', 'touchees=/dev/null', '-v', f"exercice={pipeline._required_env('FC_EXERCICE_ID')}",
             '-f', str(MATCH_SQL)],
            cwd=workdir, check=True, stdout=subprocess.DEVNULL,
            env={**os.environ, 'PGPASSWORD': pipeline._required_env('LAMP_DB_PASSWORD')})
        return pipeline._read(correspondences)


def _require_setup(client, numero: int) -> str:
    """The label's id; refuses a démarche without the label or the Texte long annotation."""
    label_id = next((label_id for name, label_id in client.labels(numero).items()
                     if mapping.fold(name) == mapping.fold(LABEL)), None)
    if label_id is None:
        raise ValueError(f"label « {LABEL} » absent de la démarche {numero}")
    annotation = next((spec for label, spec in client.annotations(numero).items()
                       if mapping.fold(label) == mapping.fold(NOTES)), None)
    if annotation is None or annotation['type'] != mapping.DN_ANNOTATION_TYPE:
        raise ValueError(f"annotation privée « {NOTES} » de type Texte long absente de la démarche {numero}")
    return label_id


def skip_reason(dossier: dict, only: set[int] | None) -> str:
    """Why the dossier is left alone, '' when it is examined; the label is checked first."""
    if pipeline._holds_label(dossier, LABEL):
        return 'deja_labellise'
    if not dossier.get('instructeurs'):
        return 'sans_instructeur'
    if only is not None and dossier['number'] not in only:
        return 'hors_dn_dossiers'
    return ''


def following_instructeur_id(dossier: dict) -> str:
    return min(dossier['instructeurs'], key=lambda instructeur: instructeur['email'].lower())['id']


def doublon_lines(dossiers: list[dict], numero: int, match: Callable) -> dict[str, list[str]]:
    """Dossier number -> its annotation lines, sorted and unique; absent without correspondence."""
    valid, _ = pipeline.validate(pipeline.extract({'demarche': numero, 'dossiers': dossiers}))
    if valid.empty:
        return {}
    keyed = valid.assign(eligibility_result_id=valid['reference'])
    found = match(pipeline.build_match_candidates(keyed, valid)).merge(keyed, on='eligibility_result_id')

    lines = {}
    for _, row in found.iterrows():
        lines.setdefault(row['dossier_number'], set()).add(mapping.DN_ANNOTATION_DOUBLON_LINE.format(
            prenom=row['prenom'], nom=row['nom'], code=row['id_psp'],
            date_naissance=pipeline.parse_date(row['date_naissance']).strftime('%d/%m/%Y')))
    return {number: sorted(dossier_lines) for number, dossier_lines in lines.items()}


def _single_newlines(text) -> str:
    return '\n'.join((text or '').splitlines())


def notes_text(current: str, lines: list[str]) -> str:
    """The annotation with this script's lines replaced by `lines`, notes typed by hand first."""
    typed_by_hand = [line for line in current.splitlines()
                     if not line.startswith(mapping.DN_ANNOTATION_DOUBLON_PREFIX)]
    return '\n'.join([*typed_by_hand, *lines])


def flag_dossier(dossier: dict, lines: list[str], label_id: str, journal: pipeline.Journal, client,
                 dry_run: bool) -> None:
    """Annotation first: the label is what stops the next runs, so it only follows a success."""
    reference = f"dn:{dossier['number']}"
    annotation = pipeline._dossier_annotation(dossier, NOTES)
    current = _single_newlines((annotation or {}).get('stringValue'))
    text = notes_text(current, lines)
    if not lines and text == current:
        return
    if annotation is None:
        journal.record(reference, 'annotation', 'erreur', f"annotation privée « {NOTES} » absente du dossier")
        return

    steps = (['annotation'] if text != current else []) + (['label'] if lines else [])
    for action in steps:
        if dry_run:
            journal.record(reference, action, 'simule', text if action == 'annotation' else LABEL)
            continue
        try:
            if action == 'annotation':
                client.annoter(dossier['id'], following_instructeur_id(dossier), annotation['id'], text)
            else:
                client.ajouter_label(dossier['id'], label_id)
        except Exception as error:  # noqa: BLE001 - one dossier never stops the others
            journal.record(reference, action, 'erreur', pipeline._failure(error))
            return
        # The journal outlives the run: counts only, no identity.
        journal.record(reference, action, 'fait', f'{len(lines)} ligne(s)' if action == 'annotation' else LABEL)


def doublons(journal_filepath, dry_run=False, dn_client=None, match: Callable = lamp01_matches) -> dict:
    client = dn_client or DnClient(os.environ.get('DN_API_URL') or DEFAULT_API_URL,
                                   pipeline._required_env('DN_API_TOKEN'))
    numero = int(pipeline._required_env('DN_DEMARCHE_NUMBER'))
    only = pipeline.dossier_numbers(os.environ.get('DN_DOSSIERS'))
    label_id = _require_setup(client, numero)

    dossiers = list(client.iter_dossiers(numero, STATE))
    reasons = [skip_reason(dossier, only) for dossier in dossiers]
    examined = sorted((dossier for dossier, reason in zip(dossiers, reasons, strict=True) if not reason),
                      key=lambda dossier: dossier['number'])
    lines = doublon_lines(examined, numero, match)

    journal = pipeline.Journal(journal_filepath)
    for dossier in examined:
        flag_dossier(dossier, lines.get(str(dossier['number']), []), label_id, journal, client, dry_run)

    return {
        'dossiers_en_construction': len(dossiers),
        'dossiers_deja_labellises': reasons.count('deja_labellise'),
        'dossiers_sans_instructeur': reasons.count('sans_instructeur'),
        'dossiers_examines': len(examined),
        'dossiers_avec_doublon': len(lines),
        'actions_faites': journal.counts['fait'],
        'actions_simulees': journal.counts['simule'],
        'erreurs': journal.counts['erreur'],
        'journal': str(journal_filepath),
    }


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--journal', required=True)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args(argv)

    stats = doublons(args.journal, args.dry_run)
    pipeline.print_stats(stats)
    return 1 if stats['erreurs'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
