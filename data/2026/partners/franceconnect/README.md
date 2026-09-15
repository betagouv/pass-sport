# Source franceconnect — fabriquer des codes pour les `eligible_pending`

Cette source n'est pas un fichier partenaire : c'est une requête sur la table
`eligibility_results` du worker, en production.

Le parcours FranceConnect du site n'écrit plus que deux des verdicts documentés dans
[worker/src/db/schema.ts](../../../../worker/src/db/schema.ts) : `not_eligible` quand aucune
route n'est ouverte, et `eligible_pending` quand les réponses d'API Particulier en ouvrent une.
Ce second-là n'est pas terminal : il désigne quelqu'un que **nos** règles jugent
éligible et à qui aucun code n'a été servi — ce parcours n'interroge plus la base LCA du tout,
son `pass_sport_code` est donc toujours NULL et il n'a reçu que l'accusé de réception de sa
demande. Ce dossier est ce qui transforme cette promesse en code.

## Les 6 étapes, dans cet ordre

| # | Quoi | À la main | En ligne de commande |
|---|------|-----------|----------------------|
| 1 | Extraire les `eligible_pending` de la base | `export_eligible_pending.sql` | idem |
| 2 | Nettoyer vers le schéma PSP | `clean_franceconnect.ipynb` | `fc_pipeline.py clean` |
| 3 | Chercher chacun dans la base bénéficiaires | `match_beneficiaires.sql` | idem |
| 4 | Marquer les **retrouvés** `eligible_confirmed` | `writeback_confirmed.sql` | idem |
| 5 | Fabriquer les codes des **non retrouvés** | `../generate_new_codes.ipynb` avec `SOURCE = 'FC'` | `fc_pipeline.py codes` |
| 6 | Marquer les servis `eligible_confirmed`, code compris, en base | `writeback_codes.ipynb` puis `writeback_verdict.sql` | `fc_pipeline.py writeback` puis les `.sql` |

**L'étape 3 est ce qui remplace l'appel LCA** que ce parcours ne fait plus. Sans elle, une
personne déjà présente dans la base bénéficiaires — parce que la CNAF, la MSA ou le CNOUS
l'ont déclarée — recevrait un second code. Elle doit passer **avant** l'étape 5 : un code
tiré est comptabilisé dans `EXISTING_CODES_PATHFILE_2026` et ne se reprend pas.

⚠️ **Deux bases, à ne pas confondre.** Les étapes 1, 4 et 6 visent la base du site, sur
Scalingo, à travers un tunnel. L'étape 3 vise la base bénéficiaires locale du lamp
([lamp01/](../../../../lamp01/)), en direct.

```mermaid
flowchart TD
    DB[("eligibility_results<br/>verdict = eligible_pending")]
    LAMP[("base bénéficiaires du lamp<br/>CNAF + MSA + CNOUS + codes FC")]

    DB -->|"1 · export_eligible_pending.sql"| F1["fc_2026_eligible_pending.csv<br/>export brut"]
    F1 -->|"2 · fc_pipeline.py clean"| F2["DB_FC_EXPORT_2026<br/>schéma PSP"]
    F1 -->|"2 · fc_pipeline.py clean --match-out"| M1["fc_2026_match_candidates.csv<br/>colonnes de rapprochement"]
    F1 -->|"2 · fc_pipeline.py clean --cnaf-extra-out"| C1["fc_2026_cnaf_extra_field.csv<br/>champs CNAF des codes CAF"]

    M1 -->|"3 · match_beneficiaires.sql"| LAMP
    LAMP -->|"retrouvés"| M2["fc_2026_confirmed.csv<br/>eligibility_result_id;id_psp"]
    LAMP -->|"non retrouvés"| M3["ids des non-appariés"]
    M2 -->|"4 · writeback_confirmed.sql<br/>verdict eligible_confirmed"| DB

    F2 --> SPLIT{"fc_pipeline.py<br/>split-matched"}
    M3 --> SPLIT
    SPLIT -->|"non-appariés seuls"| F2B["fc_2026_non_apparies.csv"]

    F2B -->|"5 · fc_pipeline.py codes"| F3["AAAA-MM-JJ-fc-with-codes.csv<br/>+ pass_sport_code, + eligibility_result_id"]
    F3 -. met à jour .-> CODES[("EXISTING_CODES_PATHFILE_2026<br/>codes déjà distribués")]
    F3 -->|"6 · fc_pipeline.py writeback"| F4A["fc_2026_writeback.csv<br/>eligibility_result_id;id_psp"]
    F3 -->|"6 · fc_pipeline.py writeback"| F4B["AAAA-MM-JJ-fc-prod.csv<br/>sans colonne technique"]
    F3 -->|"6 · fc_pipeline.py writeback --lamp-out"| F4C["fc-lamp01.csv<br/>CSV de prod + colonnes cnaf_*"]
    C1 --> F4C
    F4A -->|"writeback_verdict.sql"| DB
    F4B -->|"copie + renommage atomique"| DEPOT["beneficiaires-insertion-N-TS.csv<br/>déposé dans FC_PROD_DROP_DIR"]
    F4C -->|"inject_csv.sh"| LAMP
```

### Comment le rapprochement identifie quelqu'un

**Une stratégie par (situation, caisse)**, choisie par la `situation` et l'`organisme` du
candidat (résolus par `clean_fc_lib`), et qui ne cherche que les lignes de base portant cette
même situation et cette même caisse (plus `exercice_id` et un `id_psp` non nul). Le verdict
est **strict** : un candidat est apparié ssi sa stratégie retourne **exactement un** `id_psp`
distinct. Zéro ou plusieurs = non apparié → code neuf, le comportement le moins risqué des
deux. Aucun départageur.

**Au moins un des deux allocataires du foyer** (AEEH et jeune) : la base partenaire porte le
responsable dossier, qui peut être l'AUTRE parent que celui qui s'est connecté. Chaque candidat
présente donc jusqu'à deux personas allocataire — le connecté, et le conjoint quand
`resolve_allocataire_conjoint` en identifie un — et la stratégie apparie si l'un des deux
atteint la ligne. Le verdict strict reste posé par candidat : deux personas sur la même
personne comptent pour un `id_psp`, deux personnes différentes restent inconcluantes.

| stratégie | allocataire | bénéficiaire |
|---|---|---|
| **boursier** | `allocataire_matricule` = INE, exact — le CNOUS y range l'INE du boursier ; rien d'équivalent CNAF/MSA | — |
| **AAH MSA** | — | nom de **naissance** (`family_name`) · prénoms ⊆ · genre · naissance |
| **AAH CAF** | — | nom d'**usage** (`preferred_username`), ou nom de **naissance** (`family_name`) confronté à `beneficiaire_cnaf_extra_field` · prénoms ⊆ · genre · naissance |
| **AEEH MSA** | *l'un des deux allocataires du foyer* : nom de naissance · prénoms ⊆ · qualité (M/Mme) · naissance | nom · prénoms stricts · genre · naissance |
| **AEEH CAF** | *l'un des deux allocataires du foyer* : nom d'usage (`RESPDOS`), ou nom de naissance confronté à `beneficiaire_cnaf_extra_field` · prénoms ⊆ · qualité · *pas* de naissance (la CNAF ne la sérialise pas) | nom (`NOMENF`, accepté sous ses deux formes candidat) · prénoms stricts · genre · naissance |
| **jeune MSA** | *l'un des deux allocataires du foyer* : nom de naissance · prénoms ⊆ · qualité · naissance | nom · prénoms ⊆ · genre · naissance |
| **jeune CAF** | *l'un des deux allocataires du foyer* : nom de **naissance**, genre et naissance depuis `beneficiaire_cnaf_extra_field` (rempli pour l'origine ARS, la population QF, et pour les codes CAF de ce dossier) · prénoms ⊆ | nom (deux formes) · prénoms ⊆ · genre · naissance |

**⊆ — le containment des prénoms** : les prénoms venus de la base LAMP doivent être
**contenus** dans les prénoms FranceConnect — sous-ensemble de mots, ordre libre, après
normalisation des deux côtés. La CNAF ne stocke qu'un prénom (`PRENOMDOS`, `NOMENF`),
FranceConnect les porte tous.

**Les codes fabriqués ici, eux aussi, doivent être retrouvés** — un bénéficiaire remis en
`eligible_pending` côté worker repasse par le rapprochement. Une ligne que la cron injecte sous
l'organisme `CAF` porte le nom de naissance dans `nom`, là où les stratégies CAF attendent le nom
d'usage de la CNAF, et FranceConnect ne sert pas toujours de `preferred_username` : elles ne la
retrouvent que par `beneficiaire_cnaf_extra_field`. La cron y écrit donc la ligne de chacun de
ses codes CAF (`fc-lamp01.csv`, voir [Étape 4](#étape-4--write-back)), avec exactement les
valeurs que le candidat présentera au passage suivant
(`clean_fc_lib.build_cnaf_extra_field_rows`). Limite connue : en QF et en AEEH, la base garde les
prénoms du pivot quand le candidat présente ceux de la caisse — si le pivot en porte davantage,
le containment échoue et un code neuf est fabriqué.

**AAH, cas particulier** : la caisse est indéterminable depuis l'API (aucun appel
`quotient_familial` sur cette route), les **deux** stratégies sont donc essayées. Concluant
ssi exactement une des deux retourne exactement une ligne et l'autre aucune — deux stratégies
à une ligne, même identique, restent inconcluantes.

Côté candidat, les noms viennent de la réponse `quotient_familial` d'abord (le vocabulaire
même de la caisse), du pivot FranceConnect en repli : nom de naissance =
`qf_allocataires[].nom_naissance` à défaut `family_name`, nom d'usage =
`qf_allocataires[].nom_usage` à défaut `preferred_username`. Pour un enfant, l'usage est
celui que le worker stocke dans `enfant_identite`, à défaut `qf_enfants[].nom_usage` ; sur
une ligne `self`, c'est celui de l'allocataire.

Le **conjoint** est l'autre entrée du couple `qf_allocataires`, une fois le connecté identifié
par la date de naissance du pivot, à défaut par son nom de naissance ; toujours ambigu → pas de
persona conjoint, le rapprochement se fait comme avant sur le seul connecté. Sa date, sa
qualité et son genre sont ceux de **l'entrée elle-même** (`date_naissance`, `sexe`), pas ceux
du pivot : c'est une autre personne. Le worker persiste la même identification dans
`eligibility_results.allocataire_conjoint_identite` (au vocabulaire pivot), mais le pipeline
lit toujours `qf_allocataires` depuis `eligibility_history` — ce qui couvre aussi les lignes
antérieures à cette colonne.

### Rattrapage du conjoint

Une partie des lignes **jeune** et **AEEH** n'a aucun tableau `allocataires` : l'appel
`quotient_familial` du worker n'a rien rendu (404 « Erreur inattendue », 429, maintenance), et
la route AEEH se déduit de toute façon de la seule fenêtre de naissance — elle n'a jamais eu
besoin d'une réponse. Ces foyers ne présentent qu'une persona, et perdent l'élargissement.

La boucle traverse les passages, dans le workdir partagé
[qf-batch-workdir](../qf-batch-workdir) :

1. `clean --conjoints-manquants` écrit `fc_conjoint_2026_qf_batch_input.csv` — un foyer par
   ligne (dédupliqué sur le sub), aux colonnes d'identité qu'exige
   [qf-batch](../../../../worker/src/scripts/qf-batch.ts). Les compteurs
   `conjoints_manquants_*` et `foyers_a_rappeler` chiffrent le gisement AVANT tout appel ;
2. `systemctl start pass-sport-qf-batch@fc_conjoint` (ou `run-qf-batch.sh fc_conjoint`) rappelle
   l'API et écrit `fc_conjoint_2026_qf_batch_output.csv`, colonne `qf_allocataires` comprise.
   `QF_MOIS` choisit le mois de référence ;
3. le passage suivant relit cette sortie tout seul (`clean --conjoints`) : seuls les
   `qf_allocataires` VIDES sont complétés — jamais `qf_valeur`, qu'un quotient d'un autre mois
   ferait basculer d'AEEH en jeune, donc de stratégie et de code ;
4. `pnpm conjoint:backfill <sortie>` (dry-run par défaut, `--apply` pour écrire) persiste le
   conjoint dans `eligibility_results.allocataire_conjoint_identite`, sur les lignes qui l'ont
   encore à NULL.

Ne sont rappelés que les foyers **sans tableau exploitable** : un allocataire seul ou un couple
ambigu rendrait exactement la même photo. Les vrais 404 se règlent en `non_trouve` et ne sont
plus jamais rappelés.

À la main, `fc_2026_eligible_pending.csv` et `DB_FC_EXPORT_2026` sont réécrits à chaque passage.
La cron, elle, range tout ce qu'un passage produit dans son propre dossier horodaté — voir
[Un dossier par passage](#un-dossier-par-passage). `EXISTING_CODES_PATHFILE_2026` seul survit à
travers les passages : c'est la mémoire des codes déjà distribués, toutes sources confondues.

Les notebooks et la ligne de commande appellent les **mêmes fonctions**, dans
[fc_pipeline.py](fc_pipeline.py) : passer à la main et passer automatiquement ne peuvent pas
diverger. Les notebooks gardent leur intérêt pour regarder les comptes d'un passage et
reprendre une étape isolément.

**L'étape 4 n'est pas optionnelle.** La génération de codes déduplique les *codes*, jamais
les *personnes* : sans elle, le prochain passage réextrairait les mêmes bénéficiaires et leur
fabriquerait un second code. C'est elle qui bascule les lignes traitées en
`eligible_confirmed` avec leur code, que l'étape 1 exclut ensuite. La question ne se pose pas pour les fichiers partenaires, qui sont des
exports figés ; ici la table continue de vivre entre deux passages.

## Passage automatique — la cron

[run_fc_pipeline.sh](run_fc_pipeline.sh) enchaîne les 4 étapes sans interaction : il ouvre et
referme lui-même le tunnel Scalingo, et dépose le CSV final dans `FC_PROD_DROP_DIR`
(`/nfs/run` par défaut), d'où il est injecté en base de production. Il finit en posant le job
`fc_code_emails` du worker, qui envoie leur code par courriel — voir
[Après le write-back](#après-le-write-back).

L'entrée de crontab n'est plus posée à la main : elle l'est par
[deploy/ansible/lamp-setup.yml](../../../../deploy/ansible/lamp-setup.yml), qui la nomme
`pass-sport-fc` — rejouer le playbook ne la duplique donc pas.

```crontab
30 0,6,12,18 * * * /chemin/vers/data/2026/partners/franceconnect/run_fc_pipeline.sh
```

⚠️ **Elle est posée désactivée (commentée) par défaut.** Le passage dépose un CSV en
production et marque `eligibility_results` : il ne part seul qu'une fois l'empreinte SSH
Scalingo amorcée à la main et un [passage à blanc](#passage-à-blanc) validé. Pour
l'activer, rejouer le playbook avec `--extra-vars pass_sport_fc_cron_enabled=true` — voir
[deploy/ansible/README.md](../../../../deploy/ansible/README.md).

Ce que le script garantit, et qu'un passage à la main doit respecter aussi :

- **le dépôt vient en dernier.** Le CSV ne part vers `FC_PROD_DROP_DIR` qu'une fois la base
  marquée *et* le marquage vérifié par `check_writeback.sql`. Un fichier déposé sans marquage
  ferait fabriquer un second code aux mêmes personnes au passage suivant ;
- **un seul passage à la fois** — un verrou `flock` fait renoncer un passage qui en
  chevaucherait un autre, pour la même raison ;
- **rien à traiter n'est pas une erreur** : si l'export ne rend qu'un en-tête, le script sort
  en 0 sans rien déposer. C'est le cas nominal d'une cron plus fréquente que les
  resoumissions, et c'est aussi la preuve que le passage précédent a bien refermé la boucle ;
- **le job courriel est posé à chaque sortie réussie**, même sans nouveau bénéficiaire : il
  retente les courriels échoués et sert les appariés d'un passage précédent. Il ne l'est ni
  sur une erreur ni quand le verrou est déjà pris — le passage suivant s'en charge.

### Passage à blanc

Avant d'activer la cron, ou pour juger l'appariement sur les données du moment :

```bash
./run_fc_pipeline.sh --dry-run
cat run/latest/run.log
```

Le passage est joué en entier, sur les vraies bases, mais n'écrit rien hors de son dossier
(`run/<AAAA-MM-JJTHH-MM-SS>-dry-run/`) :

| Étape | En passage à blanc |
| --- | --- |
| extraction, nettoyage, rapprochement | réels — ils ne font que lire |
| write-backs Scalingo (étapes 4 et 6) | joués avec leur contrôle dans la transaction, puis annulés (`psql -v dry_run=1`) |
| génération des codes | sur une copie de `EXISTING_CODES_PATHFILE_2026`, effacée en sortie |
| dépôt dans `FC_PROD_DROP_DIR` | aucun ; `fc-prod.csv` reste dans le dossier, et un dépôt non consommé n'est qu'un avertissement |
| report dans la base bénéficiaires | `inject_csv.sh --dry-run` sur `fc-lamp01.csv` : chargement, contrôles et INSERT, puis annulation |
| job `fc_code_emails` | non posé, rien n'est écrit dans Redis |

Ce qui ferait échouer un passage réel le fait échouer aussi : un code apparié à deux candidats,
un marquage incomplet, une colonne refusée par l'injection. Les comptes par stratégie du
rapprochement et ceux des deux write-backs se lisent dans le journal.

Annuler n'est pas tout à fait ne rien toucher : le temps de leur transaction, les write-backs
verrouillent les lignes `eligibility_results` du passage, et un identifiant tiré d'une séquence
n'est pas rendu.

### Un dossier par passage

Tout ce qu'un passage produit est rangé dans `FC_RUN_DIR/<AAAA-MM-JJTHH-MM-SS>/` (`run/` de ce
dossier par défaut), et rien n'y est effacé :

```text
run/
├── passages.log                        une ligne par passage, quelle qu'en soit l'issue
├── latest -> …                         le dernier passage
├── derniere-erreur -> …                le dernier passage en échec
└── 2026-09-14T04-30-00/
    ├── STATUT                          la ligne de passages.log de ce passage
    ├── run.log                         son journal complet
    ├── fc_2026_eligible_pending.csv    étape 1, export brut
    ├── fc_2026_clean.csv               étape 2, schéma PSP
    ├── fc_2026_match_candidates.csv    étape 2, candidats au rapprochement
    ├── fc_2026_cnaf_extra_field.csv    étape 2, champs CNAF des codes CAF
    ├── fc_2026_confirmed.csv           étape 3, appariés
    ├── fc_2026_non_apparies_ids.csv    étape 3
    ├── fc_2026_non_apparies.csv        étape 4
    ├── fc-with-codes.csv               étape 5
    ├── fc_2026_writeback.csv           étape 6
    ├── fc-prod.csv                     étape 6, copie exacte du fichier déposé
    └── fc-lamp01.csv                   étape 6, reporté dans la base bénéficiaires
```

Horodaté à la seconde, là où les notebooks s'en tiennent au jour : une cron peut passer plusieurs
fois par jour. Seuls restent hors du dossier `EXISTING_CODES_PATHFILE_2026`, mémoire commune à
tous les passages, et le fichier déposé dans `FC_PROD_DROP_DIR`.

Pour retrouver un échec, l'index suffit — le nom du dossier est en première colonne :

```bash
grep echec run/passages.log        # tous les passages en erreur
cat run/derniere-erreur/run.log    # le journal du dernier
```

```text
2026-09-14T04-30-00  succes           0  1 déposé(s) (beneficiaires-insertion-1-2026-09-14T04-30-00.csv), 1 apparié(s)
2026-09-14T10-30-00  rien-a-faire     0  aucun eligible_pending
2026-09-14T12-30-00  succes           0  0 déposé, 1 apparié(s)
2026-09-14T16-30-00  echec            3  étape 6/6 — codes fabriqués — échec (code 3) ligne <n> : psql "$FC_DATABASE_URL" -v ON_ERROR_STOP=1 "$@"
2026-09-14T16-30-02  ignore-verrou    0  un autre passage est déjà en cours
```

Un passage écarté par le verrou n'a pas de dossier, seulement sa ligne. Un dossier sans `STATUT`
est celui d'un passage tué sans avoir pu se clore (`kill -9`, coupure). Toute sortie non nulle
reste une anomalie, que cron envoie par courriel.

**Après un échec marqué « codes fabriqués »**, reprendre à la main à partir de
`writeback_codes.ipynb` avec le `fc-with-codes.csv` **du dossier de ce passage**, jamais celui
d'un autre, et **sans jamais rejouer le rapprochement ni la génération** — les codes sont déjà
comptabilisés dans `EXISTING_CODES_PATHFILE_2026`, y compris lorsque le passage a échoué après
les avoir tirés.

### Prérequis de la machine

La machine doit porter : `psql`, un `scalingo` authentifié sans interaction
(`SCALINGO_API_TOKEN`) avec une clé SSH sans phrase de passe, et le virtualenv `data/.venv`.

`db-tunnel` monte sa propre connexion SSH, indépendante de l'authentification `scalingo` :
`scalingo login --ssh-identity` ne configure que la poignée de main de login, pas `db-tunnel`.
Sans indication, `db-tunnel` retombe sur l'agent SSH puis sur `~/.ssh/id_rsa`. Si la clé à
utiliser porte un autre nom, soit passer `-i`/`--identity` à la main (voir ci-dessous), soit
renseigner `SCALINGO_SSH_IDENTITY` dans `data/.env` ou `/etc/default/pass-sport-fc` pour que
`run_fc_pipeline.sh` la reprenne automatiquement.

## Étape 1 — extraction

Ouvrir le tunnel Scalingo dans un terminal dédié, et le laisser tourner :

```bash
scalingo --app "$SCALINGO_APP" db-tunnel SCALINGO_POSTGRESQL_URL
# Si la clé n'est ni dans l'agent SSH ni ~/.ssh/id_rsa, ajouter -i ~/.ssh/<la-clé> :
# scalingo --app "$SCALINGO_APP" db-tunnel -i ~/.ssh/<la-clé> SCALINGO_POSTGRESQL_URL
# -> Tunnel ouvert, port local 10000
```

Dans un autre terminal, depuis ce dossier :

```bash
cd data/2026/partners/franceconnect

# L'URL de la base, hôte et port remplacés par ceux du tunnel :
scalingo --app "$SCALINGO_APP" env-get SCALINGO_POSTGRESQL_URL
export FC_DATABASE_URL="postgres://<user>:<pwd>@127.0.0.1:10000/<db>?sslmode=disable"

psql "$FC_DATABASE_URL" -f export_eligible_pending.sql
# -> fc_2026_eligible_pending.csv, ou -v out=<chemin> pour choisir la destination
```

Le CSV produit contient des données personnelles (identités pivot, courriels) : il est
couvert par le `*.csv` de [data/.gitignore](../../../.gitignore) et n'a rien à faire ailleurs
que sur le poste qui traite la campagne.

Contrôle utile avant de lancer la suite — le compte doit correspondre, aux resoumissions
près :

```sql
select count(*) from eligibility_results where verdict = 'eligible_pending';
```

## Étape 2 — nettoyage

`clean_franceconnect.ipynb` reconstruit ce que la table ne mémorise pas, puis écrit
`DB_FC_EXPORT_2026` au schéma de production. Trois manques sont comblés là :

- **la situation** — `eligibility_results` ne retient que `source` (self/enfant) et un
  booléen d'éligibilité, jamais quelle aide a ouvert le droit. Elle se redéduit des réponses
  brutes d'API Particulier, conservées dans `eligibility_history.response_payload`, en rejouant les
  règles de [candidates.ts](../../../../worker/src/eligibility/candidates.ts) ;
- **le genre des enfants** — `enfant_identite` ne porte que nom, prénom et date de naissance ;
  le sexe est retrouvé par appariement dans le tableau `enfants` de la réponse quotient
  familial ;
- **le schéma PSP** — l'identité arrive au vocabulaire FranceConnect, répartie sur deux
  colonnes JSON selon `source`. `adresse_allocataire` y vaut `{}` : le parcours ne demande plus
  la commune de résidence depuis que LCA en est débranché, et FranceConnect n'a jamais fourni
  d'adresse postale. Rien ne rend ce champ obligatoire — les colonnes requises sont
  `nom, prenom, date_naissance, genre` (`partners_lib.NECESSARY_COLUMNS`) plus `situation`.

Ces règles vivent dans `clean_fc_lib.py` ; leur enchaînement, dans `fc_pipeline.clean` :

```bash
source data/.venv/bin/activate
pytest 2026/partners/franceconnect/test_clean_fc_lib.py 2026/partners/franceconnect/test_fc_pipeline.py

# ou, sans notebook :
python 2026/partners/franceconnect/fc_pipeline.py clean
```

La fenêtre AEEH de cette source est celle de `partners_lib` (6-19 ans) : le worker interroge
l'AEEH pour chaque enfant de cette tranche que le quotient familial ne couvre pas déjà. C'est
ce `& ~jeune` qui reste la seule différence avec le fichier partenaire, où la CNAF déclare
elle-même l'AEEH sans regarder le quotient.

## Étape 3 — génération des codes

`../generate_new_codes.ipynb`, avec `SOURCE = 'FC'` dans la cellule de configuration. Rien
d'autre à y changer — ou `python fc_pipeline.py codes`, qui appelle la même fonction. Il
produit `AAAA-MM-JJ-fc-with-codes.csv` à côté de `DB_FC_EXPORT_2026`, et met à jour
`EXISTING_CODES_PATHFILE_2026`.

Ce fichier porte une colonne de plus que les fichiers partenaires :
`eligibility_result_id`, l'identifiant de la ligne d'origine en base. C'est la clé du
write-back, et l'étape 4 la retire avant l'injection en production.

## Étape 4 — write-back

`writeback_codes.ipynb` — ou `python fc_pipeline.py writeback` — découpe le fichier daté en
deux, trois pour la cron :

- `fc_2026_writeback.csv` — deux colonnes `eligibility_result_id;id_psp`, dans ce dossier (dans
  celui du passage pour la cron) ;
- `AAAA-MM-JJ-fc-prod.csv` — le CSV final sans la colonne technique, prêt pour l'injection en
  base de production ;
- `fc-lamp01.csv` — cron seulement (`--cnaf-extra` et `--lamp-out`, qui vont ensemble) : le CSV
  de prod joint aux colonnes `beneficiaire_cnaf_extra_field` qu'a écrites
  `clean --cnaf-extra-out`, reporté dans la base bénéficiaires du lamp. Il ne part jamais en
  production, dont l'injecteur refuse ces colonnes ; un bénéficiaire codé sans sa ligne de
  champs CNAF fait échouer l'étape avant toute écriture.

Puis, tunnel ouvert, **depuis ce dossier** :

```bash
cd data/2026/partners/franceconnect
psql "$FC_DATABASE_URL" -f writeback_verdict.sql
psql "$FC_DATABASE_URL" -At -f check_writeback.sql   # doit afficher 0
```

Le nom `fc_2026_writeback.csv` est figé et le `cd` obligatoire : `\copy` est la seule commande
psql qui n'interpole aucune variable dans ses arguments, le chemin ne peut donc pas lui être
passé, et comme elle s'exécute côté client il est relatif au dossier d'où psql est lancé. La
cron lance donc ses `psql` depuis le dossier du passage, en désignant les `.sql` par leur chemin
complet.

`writeback_verdict.sql` écrit deux tables dans la même transaction : le verdict et le code dans
`eligibility_results`, et une ligne `actor = 'cron'`, `action = 'psp.code_writeback'` dans
`eligibility_history` — la fabrication d'un code est la seule action du parcours qui ne passe
pas par le worker, et n'aurait sinon aucune trace.

Il affiche quatre comptes : `lignes_csv`, `lignes_marquees` et `lignes_historisees` doivent
être égaux, et `ids_introuvables` valoir 0. Il est idempotent — rejoué, il affiche `UPDATE 0`,
le filtre `verdict = 'eligible_pending'` empêchant de re-marquer une ligne ou d'écraser un code
déjà confirmé.

`check_writeback.sql` rend une seule valeur, celle sur laquelle la cron s'arrête : combien des
bénéficiaires de ce passage sont **encore** en `eligible_pending` ou sans ligne d'historique.
Ce doit être 0. Le CSV de production ne part en injection qu'une fois ce contrôle passé.

**Contrôle final** : relancer `export_eligible_pending.sql`. Le CSV doit être vide, en-tête
seul — à ceci près que le site continue de tourner, et qu'une resoumission survenue
entre-temps y apparaîtra légitimement. C'est pour cela que la cron s'appuie sur
`check_writeback.sql`, qui ne regarde que les ids du passage, et non sur ce contrôle-ci.

## Variables d'environnement

À ajouter dans `data/.env` pour les notebooks (elles ne sont pas dans `.env.example`, qui n'est
pas versionné ici) — la cron n'en lit aucune, ses fichiers naissent dans le dossier du passage :

```bash
# Sortie brute de export_eligible_pending.sql
FC_EXPORT_PATHFILE_2026="./2026/partners/franceconnect/fc_2026_eligible_pending.csv"
# CSV nettoyé au schéma PSP, écrit par clean_franceconnect.ipynb
DB_FC_EXPORT_2026="./2026/partners/franceconnect/FC_2026.csv"
# Fichier daté produit par generate_new_codes.ipynb, relu par writeback_codes.ipynb.
# Seuls les notebooks le lisent : la cron recalcule ce chemin à chaque passage, il n'y a donc
# plus de date à éditer à la main entre deux étapes.
FC_WITH_CODES_PATHFILE_2026="./2026/partners/franceconnect/AAAA-MM-JJ-fc-with-codes.csv"
```

Ce dont la cron a besoin en plus. `SCALINGO_APP` et le jeton se mettent plutôt dans
`/etc/default/pass-sport-fc`, que le script lit aussi : ils appartiennent à la machine, pas
au dépôt. Les valeurs déjà présentes dans l'environnement l'emportent sur ces deux fichiers,
ce qui permet un passage d'essai avec un dossier de dépôt détourné —
`FC_PROD_DROP_DIR=/tmp/fc-drop ./run_fc_pipeline.sh`.

```bash
SCALINGO_APP="<application hébergeant la base>"   # obligatoire
SCALINGO_API_TOKEN="<jeton>"                      # pour un scalingo non interactif
FC_PROD_DROP_DIR="/nfs/run"                       # où le CSV final est déposé
FC_TUNNEL_PORT="10000"                            # port local du tunnel Postgres
FC_REDIS_TUNNEL_PORT="10001"                      # port local du tunnel Redis (job courriel)
FC_CODE_EMAILS_DRY_RUN="1"                        # essai : job courriel posé en dry-run
FC_RUN_DIR="./2026/partners/franceconnect/run"    # un dossier par passage, journal compris
FC_LOCK_FILE="/tmp/pass-sport-fc.lock"            # verrou anti-chevauchement
```

## Après le write-back

Les deux write-backs posent `eligible_confirmed` et le code : le site affiche celui-ci tout de
suite, et l'attestation PDF est servie. Seule l'action d'historique distingue un code
**fabriqué** (`psp.code_writeback`, étape 6) d'un code **retrouvé** (`psp.code_match_base`,
étape 4).

L'envoi par courriel n'est pas dans ce dossier : c'est le job `fc_code_emails` du worker
([worker/src/jobs/fc-code-emails.ts](../../../../worker/src/jobs/fc-code-emails.ts)), que
`run_fc_pipeline.sh` pose sur sa queue en fin de passage, à travers un second tunnel, vers le
Redis de Scalingo. Il ramasse toute ligne FranceConnect à `eligible_confirmed` portant un code
et pas encore d'`email_kind`, sans distinguer les deux issues du rapprochement.

Le template dépend de l'aide, que la colonne `situation` retient désormais — le worker l'écrit à
l'insert, ce qui rend à terme `clean_fc_lib.resolve_situation` inutile. Les lignes antérieures à
cette colonne n'en portent pas : celles de `source = 'enfant'` s'en passent (QF et AEEH mènent au
même courriel), celles de `source = 'self'` sont laissées de côté avec une alerte Sentry plutôt que
de partir sur le mauvais texte.
