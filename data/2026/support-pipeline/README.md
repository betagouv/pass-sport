# support-pipeline — codes AAH transmis par le support

Les bénéficiaires AAH signalés par le support reçoivent un code pass Sport par mail, sans passer par
le parcours du site. Le script se lance à la main, sur le lamp.

```bash
cd /srv/pass-sport/data/2026/support-pipeline
./run_aah_direct.sh --dry-run liste.csv   # toujours d'abord
./run_aah_direct.sh liste.csv
```

## Fichier d'entrée

Séparateur `;` ou `,` (détecté sur l'en-tête), une ligne d'en-tête. Les espaces autour des
séparateurs sont tolérés, et le fichier peut être en UTF-8 (avec ou sans BOM) ou en cp1252.
L'en-tête est reconnu sans tenir compte des accents ni de la casse. Les noms techniques
`genre,prenom,nom,date_naissance,email,critere` sont aussi acceptés.

```csv
genre;Prénom;Nom;Date de naissance;email;Critère d'éligibilité
M ; Toto ; MERTZ ; 07/08/2006; toto@example.org ; aah
```

- `genre` : `M` ou `F`.
- `Date de naissance` : `JJ/MM/AAAA`, dans la fenêtre AAH (1996-01-01 → 2010-12-31).
- `Critère d'éligibilité` : `aah` (seul critère pris en charge).
- `Nom` : de préférence le **nom de naissance**. C'est lui que FranceConnect transmet. Si la
  personne passe un jour par le site, le rapprochement lui rendra ce même code.

Une ligne invalide ou en double est écartée, avec son motif dans `rejets.csv`. Les autres lignes
sont traitées normalement.

## Étapes

1. **Contrôles** : verrou partagé avec la cron FranceConnect (`FC_LOCK_FILE`), aucun dépôt en attente
   dans `/nfs/run`, configuration d'envoi présente dans `worker/.env.local`.
2. **Lecture** : `aah_direct_pipeline.py clean` met le fichier au schéma PSP (`situation=AAH`,
   `organisme=CAF`).
3. **Rapprochement avec lamp01** : `franceconnect/match_beneficiaires.sql`, avec les règles AAH
   (`aah_msa`, `aah_caf`) et l'exercice 5.
   - les personnes retrouvées vont dans `deja-connus.csv`, avec leur code : ni code neuf, ni mail ;
   - les cas ambigus (plusieurs lignes possibles) vont dans `a-verifier.csv` : ni code, ni mail.
     Ils sont à trancher à la main.
4. **Codes** : `fc_pipeline.py codes`, à partir de `EXISTING_CODES_PATHFILE_2026`.
5. **Injection dans lamp01** : `lamp01/inject_csv.sh`, ligne `beneficiaire_cnaf_extra_field`
   comprise. C'est tout ou rien.
6. **Dépôt dans `/nfs/run`** : `beneficiaires-insertion-<N>-<horodatage>.csv`, déposé de façon
   atomique. Ce fichier est ensuite repris par l'injecteur de production.
7. **Mails** : `pnpm codes:aah-emails` envoie le gabarit `code_direct_aah` via Link Mobility,
   programmé à +30 min (`AAH_EMAIL_DELAY_MIN`). Rien n'est écrit sur Scalingo.

Le passage s'arrête à la première erreur. lamp01 est rempli avant le dépôt, et un mail ne part
jamais pour un code qui n'a pas été déposé.

## Passage à blanc

`--dry-run` joue toutes les étapes, mais rien ne sort de son dossier `run/<horodatage>-dry-run/` :

- les codes sont tirés sur une copie de la liste ;
- l'injection lamp01 est annulée (ROLLBACK) ;
- rien n'est déposé ;
- Link Mobility n'est pas appelé. `envois.csv` liste les mails qui seraient partis (statut
  `simule`), avec leurs variables.

## Dossier d'un passage

Chaque passage crée `run/<AAAA-MM-JJTHH-MM-SS>[-dry-run]/` et ajoute une ligne à `run/passages.log`.
`run/latest` pointe vers le dernier passage, et `run/derniere-erreur` vers le dernier échec.

| Fichier | Contenu |
|---|---|
| `entree.csv` | copie du fichier reçu |
| `rejets.csv` | lignes écartées et motif |
| `deja-connus.csv` | personnes déjà en base, avec leur code |
| `a-verifier.csv` | rapprochements ambigus, à traiter à la main |
| `aah-prod.csv` | ce qui est déposé dans `/nfs/run` |
| `aah-lamp01.csv` | ce qui est injecté dans lamp01 |
| `aah-emails.csv` | entrée de l'envoi |
| `envois.csv` | journal d'envoi : `envoye`, `refuse`, `erreur` ou `simule` |
| `run.log` | journal complet |

## Reprise après échec

Le message d'erreur donne la commande exacte à relancer.

- **Injection lamp01 refusée** : rien n'a été déposé et aucun mail n'est parti. Les codes tirés
  sont perdus, ce qui est sans conséquence. Corriger la cause, puis relancer le passage.
- **Dépôt échoué** : lamp01 contient déjà les codes, mais la production ne les a pas. Il faut
  rejouer le dépôt avec la commande affichée, puis l'envoi des mails.
- **Mails non tous envoyés** : relancer la commande affichée. Les lignes déjà `envoye` dans
  `envois.csv` sont sautées. Attention à une ligne `erreur` sans réponse de Link Mobility
  (« fetch failed », délai dépassé) : son mail est peut-être parti, à vérifier avant de relancer.

## Configuration

| Variable | Où | Défaut |
|---|---|---|
| `EXISTING_CODES_PATHFILE_2026` | `data/.env` | obligatoire |
| `LAMP_DB_PASSWORD`, `LAMP_DB_HOST/PORT/USER/NAME` | `data/.env` | `127.0.0.1` / `55432` / `u_passsport` / `passsport` |
| `FC_PROD_DROP_DIR` | `data/.env` | `/nfs/run` |
| `FC_LOCK_FILE` | `data/.env` | `/tmp/pass-sport-fc.lock` |
| `FC_EXERCICE_ID` | `data/.env` | `5` |
| `AAH_RUN_DIR` | `data/.env` | `run/` dans ce dossier |
| `AAH_EMAIL_DELAY_MIN` | `data/.env` | `30` |
| `LINK_MOBILITY_API_KEY`, `LINK_MOBILITY_TEMPLATE_CODE_DIRECT_AAH` | `worker/.env.local` | obligatoires |

Les variables déjà présentes dans l'environnement l'emportent. Pour un essai réel sans toucher
`/nfs/run` : `FC_PROD_DROP_DIR=/tmp/aah-drop ./run_aah_direct.sh liste.csv`.

## Tests

```bash
cd data
source .venv/bin/activate
pytest 2026/support-pipeline   # le bout-en-bout demande docker et pnpm, sinon il est sauté
```
