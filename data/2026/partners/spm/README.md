# spm — bénéficiaires de la CPS de Saint-Pierre-et-Miquelon

La Caisse de Prévoyance Sociale (CPS) de Saint-Pierre-et-Miquelon envoie son propre fichier de
bénéficiaires. Le passage leur tire un code pass Sport. Il les dépose en production (LCA) et les
injecte dans lamp01, en `organisme=MSA` avec le code organisme `459`, comme en 2025. Il leur
envoie ensuite leur code par Link Mobility.

Le passage se lance à la main sur le lamp. Il faut d'abord arrêter les crons FranceConnect et
Grist/DN : elles tirent dans la même liste de codes et déposent dans le même dossier.

```bash
cd /srv/pass-sport/data/2026/partners/spm
./run_spm.sh --dry-run <fichier_cps.csv>   # toujours d'abord
./run_spm.sh <fichier_cps.csv>
```

## Fichier d'entrée

Le fichier est en CSV, séparé par `,`, avec tous les champs entre guillemets. L'en-tête doit être
exactement celui-ci, sinon le passage s'arrête en nommant les colonnes en trop ou manquantes :

```csv
organisme, date_naissance, nom, nom_naissance, prenom, genre,
allocataire-qualite, allocataire-nom, allocataire-prenom, allocataire-telephone,
allocataire-courriel, allocataire-commune_naissance, allocataire-code_iso_pays_naissance,
adresse-allocataire_voie, adresse-allocataire_nom_adresse_postal,
adresse-allocataire_code_postal, adresse-allocataire_commune, adresse-allocataire_code_insee,
adresse-allocataire_cptl_adresse, quotient-familial
```

## Règles

| champ | traitement |
|---|---|
| `organisme` | doit valoir `CPS` ; stocké `MSA`, code organisme `459`, sans matricule |
| `nom` | le `nom_naissance` s'il est rempli, sinon le `nom` ; sans accents, en majuscules |
| `genre` | `M` ou `F`, sinon arrêt |
| `allocataire-telephone` | premier numéro quand il y en a deux (`/` ou ` - `) ; chiffres seuls (`06-39-98-79-94` reste un seul numéro) ; numéros à 6 chiffres de SPM gardés tels quels |
| `allocataire-commune_naissance` | code INSEE de naissance ; zéro de tête restitué (`9225` → `09225`) ; effacé pour une naissance hors territoire français (codes à 8 chiffres `99xxxxxx`), le code ISO du pays est gardé ; un code restant qui n'est pas un code commune arrête le passage |
| `allocataire-code_iso_pays_naissance` | gardé (`PM`, `FR`, `RE`…) |
| `adresse-allocataire_voie` + `_nom_adresse_postal` | numéro + rue, en sautant les parties vides |
| `quotient-familial` | nombre ; une valeur illisible arrête le passage |

Situation, dans cet ordre :

1. **AAH** : le bénéficiaire est l'allocataire. Il a le même prénom, et un nom égal au nom
   livré ou au nom de naissance. Fenêtre : né entre 1996 et 2010.
2. **jeune** : un quotient familial est renseigné. Fenêtre : né entre 2009 et 2020, avec un QF
   strictement inférieur à 700.
3. **AEEH** : tous les autres cas. Fenêtre : né entre 2007 et 2020.

Les lignes écartées vont dans `rejets.csv`, avec leur motif : `hors_fenetre_aah`,
`hors_fenetre_qf`, `qf_trop_eleve`, `hors_fenetre_aeeh` ou `champ_obligatoire_vide`. Un QF de
700 ou plus est écarté, il ne bascule pas en AEEH.

Un mail part par bénéficiaire codé, vers le courriel de l'allocataire :

- gabarit `code_direct_aah` pour l'AAH ;
- gabarit `code_indirect` pour jeune et AEEH (le parent lit le code de son enfant).

Les frères et sœurs reçoivent donc un mail chacun, à la même adresse.

## Étapes

1. **Contrôle de la configuration d'envoi** : `pnpm codes:partner-emails --check-config`
   (clé Link Mobility et les deux gabarits).
2. **Export** des bénéficiaires de lamp01 de l'exercice.
3. **Script** `18_11_2026_clean_spm.py`. Il nettoie, fixe la situation, écarte les doublons du
   fichier et ceux que lamp01 connaît déjà (identité + allocataire), puis tire les codes.
4. **Injection lamp01 jouée puis annulée.**
5. **Dépôt atomique** dans `/nfs/run`, puis **attente** du rangement dans `succes/`.
6. **Injection lamp01.**
7. **Mails**, programmés à +30 min (`SPM_EMAIL_DELAY_MIN`).

Si un passage réel s'interrompt après son dépôt, il laisse `run/a-reprendre` et le `run.log`
donne la commande de reprise. Les mails se rejouent avec le même journal : ceux déjà `envoye`
sont sautés.

## Dossier d'un passage

Chaque passage crée `run/<AAAA-MM-JJTHH-MM-SS>[-dry-run]/` :

| fichier | contenu |
|---|---|
| `lamp01-beneficiaires.csv` | l'export lamp01 utilisé pour le dédoublonnage |
| `rejets.csv` | lignes écartées, avec le motif et le QF |
| `deja-en-base.csv` | bénéficiaires déjà dans lamp01, avec leur code existant |
| `spm.csv` | ce qui est déposé dans `/nfs/run`, puis injecté dans lamp01 |
| `spm-emails.csv` | entrée de `pnpm codes:partner-emails` |
| `envois.csv` | journal d'envoi : `envoye`, `refuse`, `erreur` ou `simule` |
| `run.log` | journal complet, avec le bilan du script |

## Limites

- **Pas de date de naissance de l'allocataire dans le fichier CPS.** Pour la MSA, le
  `/confirm` LCA des parcours jeune et AEEH la vérifie, tout comme les stratégies FranceConnect
  `qf_msa` et `aeeh_msa`. Ces familles risquent donc de ne pas être retrouvées par le test
  d'éligibilité : c'est le mail qui leur apporte le code. Les AAH, sans bloc allocataire, se
  retrouvent.
- Les gabarits Link Mobility sont ceux du site. Leur texte ne parle pas spécifiquement de SPM.

## Tests

```bash
cd data && source .venv/bin/activate && python -m pytest 2026/partners/spm -v
```
