# La base bénéficiaires du lamp

Le PostgreSQL qui détient la table `beneficiaires` : celle que les pipelines CNAF, MSA et
CNOUS de [data/2026/partners/](../data/2026/partners/) alimentent, et que le passage
FranceConnect interroge désormais avant de fabriquer un code.

```
lamp01/
├── compose.yml            les deux services, integration et prod
├── db-init/               le schéma, chargé par les deux services
│   ├── 00-schema.sql      beneficiaires, le DDL de production au JSON près : aplati
│   └── 01-beneficiaire-cnaf-extra-field.sql   ce que la CNAF laisse hors du JSON
├── inject_csv.sh          injecte un CSV désigné par son chemin
└── untracked_scripts/     hors dépôt : l'injecteur automatique et son banc
```

## Les deux environnements

| | port | usage |
|---|---|---|
| `integration` | 127.0.0.1:55432 | cible par défaut partout : essais, répétitions, `inject_csv.sh` sans `--env` |
| `prod` | 127.0.0.1:55433 | jamais atteint sans l'avoir nommé explicitement |

Deux volumes nommés distincts : une répétition ne peut pas écrire dans la base dont le site
dépend. Les deux ports n'écoutent que sur la boucle locale — les pipelines tournent sur cette
même machine, rien n'a besoin d'atteindre la base depuis le réseau.

## Démarrer

Le mot de passe n'est pas dans le dépôt, qui est public. Le poser dans `lamp01/.env`
(gitignoré), que Compose lit tout seul :

```bash
printf 'LAMP_DB_PASSWORD=%s\n' '<le mot de passe>' > lamp01/.env
chmod 600 lamp01/.env
docker compose -f lamp01/compose.yml up -d
```

`LAMP_DB_USER` (défaut `u_passsport`) et `LAMP_DB_NAME` (défaut `passsport`) n'ont à être
renseignés que si la base a été créée sous d'autres noms. Sans `LAMP_DB_PASSWORD`, Compose
refuse de démarrer plutôt que de retomber sur une valeur par défaut que personne ne penserait
à changer.

## Changer le schéma

`db-init/` ne s'exécute que sur un volume **vierge** : modifier un de ses fichiers ne change
rien à une base déjà créée. Il n'y a pas de script de migration — on recrée les volumes, puis
on réinjecte les CSV :

```bash
docker compose -f lamp01/compose.yml down -v     # efface pgdata-integration ET pgdata-prod
docker compose -f lamp01/compose.yml up -d
./lamp01/inject_csv.sh <chaque CSV MSA, CNOUS et CNAF réconcilié>       # puis --env prod
```

`down -v` détruit les deux bases, prod comprise : garder sous la main tous les CSV à
réinjecter avant de le lancer.

## Injecter un CSV

```bash
./lamp01/inject_csv.sh data/2026/partners/msa/msa_2026_final.csv          # integration
./lamp01/inject_csv.sh --env prod data/2026/partners/msa/msa_2026_final.csv
```

Il accepte tel quel ce que produisent :

| notebook | fichier | tables alimentées |
|---|---|---|
| `msa/clean_msa_2_after_qf_batch.ipynb`, `msa/clean_msa_2a_aah_aeeh.ipynb` | `DB_MSA_EXPORT_2026`, `DB_MSA_EXPORT_2026_AAH_AEEH` | `beneficiaires` (sans `id_psp` : les codes viennent après, de `generate_new_codes.ipynb`) |
| `cnous/clean_cnous.ipynb` | `DB_CNOUS_EXPORT_2026` | `beneficiaires` |
| `cnaf/reconcile_cnaf_raw_with_codes.ipynb` | `CNAF_RECONCILED_PATHFILE_2026` | `beneficiaires` **et** `beneficiaire_cnaf_extra_field` |

Les CSV portent l'allocataire et son adresse en JSON, dans les colonnes `allocataire` et
`adresse_allocataire`, comme la production les stocke. La base lamp01, elle, n'a pas de
colonne JSON : l'injection **aplatit** chaque clé dans sa colonne, `allocataire_<clé>` et
`adresse_allocataire_<clé>` (`{"matricule": "…"}` → `allocataire_matricule`). La liste des
colonnes aplaties est lue dans le schéma, rien n'est codé en dur dans le script. Et une clé
sans colonne correspondante fait échouer toute l'injection, qui la nomme, plutôt que d'être
perdue en silence : il suffit alors d'ajouter la colonne à `00-schema.sql`.

Chaque colonne du CSV qui n'existe pas dans `beneficiaires` mais existe dans
`beneficiaire_cnaf_extra_field` est chargée dans cette dernière, reliée par `id_psp`, dans la
même transaction que les bénéficiaires. Une colonne absente des deux, ou fournie à la fois
en colonne et dans le JSON, fait échouer le pré-vol.

Le fichier CNAF réconcilié porte les codes déjà distribués par les deux `*cnaf*-with-codes.csv` :
il **remplace** ces fichiers dans la base, il ne s'y ajoute pas. Si leurs `id_psp` y sont déjà,
la contrainte `beneficiaires_id_psp_unique` fait échouer toute l'injection, sans rien écrire.

C'est l'outil d'injection **manuelle** des sorties de notebooks. Le dépôt automatique de la
cron FranceConnect, lui, passe par `/nfs/run` et par l'injecteur de `untracked_scripts/`, qui
scanne ce répertoire tout seul : les deux ne se marchent pas dessus.

## Les champs supplémentaires CNAF

La CNAF ne sérialise dans le JSON `allocataire` que le tronc commun (qualité, matricule, nom,
prénom, contact) - son "nom" y est déjà le nom d'usage (RESPDOS). Son nom de naissance, sa
date, son genre et son lieu de naissance, que `reconcile_cnaf_raw_with_codes.ipynb` retrouve
dans le fichier brut, vont dans `beneficiaire_cnaf_extra_field`, une ligne par `id_psp`, sous
des colonnes préfixées `cnaf_` (`cnaf_allocataire_date_naissance`…). Le préfixe est
nécessaire : l'injection range d'abord une colonne du CSV dans `beneficiaires`, qui a déjà
`allocataire_date_naissance` et consorts, aplatis du JSON des autres partenaires.

```sql
SELECT b.*, e.*
FROM beneficiaires b
LEFT JOIN beneficiaire_cnaf_extra_field e USING (id_psp);
```

Une table à part plutôt que des colonnes de plus dans `beneficiaires` : seule la CNAF les
porte, et seulement dans le fichier réconcilié. La suppression d'un
bénéficiaire emporte sa ligne (`ON DELETE CASCADE`). Seules les lignes d'origine ARS ont la date
et le lieu de naissance : la CNAF ne les remplit pas pour l'AAH et l'AEEH.

## Les index de rapprochement

`match_beneficiaires.sql` interroge la table par **stratégie** : une requête par
(situation, caisse), chacune ancrée sur l'égalité d'un nom normalisé plus le filtre
`exercice_id` / `organisme` / `situation`. Deux index d'expression la servent —
`normalise_recherche` est IMMUTABLE, ce qui les rend possibles :

```sql
beneficiaires_match_nom_idx             (exercice_id, organisme, situation, normalise_recherche(nom))
beneficiaires_match_allocataire_nom_idx (exercice_id, organisme, situation, normalise_recherche(allocataire_nom))
```

Le premier ancre les stratégies qui cherchent le bénéficiaire (AAH, et les stratégies CAF
qui joignent ensuite `beneficiaire_cnaf_extra_field` par `id_psp`) ; le second, celles qui
cherchent l'allocataire (AEEH/QF côté MSA). La route boursier passe par l'index existant sur
`allocataire_matricule` (l'INE).

## La colonne de recherche (héritée)

`beneficiaires.cle_recherche` est une colonne **générée** (`allocataire_nom |
allocataire_prenom | date_naissance | nom | prénoms + ' '`, normalisés) qui servait la
recherche par préfixe de l'ancien rapprochement en cascade. Le rapprochement par stratégies
ne l'utilise **plus** ; la colonne, sa fonction et son index sont conservés en attendant une
suppression dédiée (le DDL de production les porte aussi).

Pour la reconstruire malgré tout — une colonne générée n'est pas recalculée quand la
fonction derrière elle change, et cette fonction ne peut pas être remplacée tant qu'une
colonne en dépend :

```sql
DROP INDEX public.beneficiaires_cle_recherche_idx;
ALTER TABLE public.beneficiaires DROP COLUMN cle_recherche;
-- puis rejouer CREATE OR REPLACE FUNCTION, ALTER TABLE ... ADD COLUMN et CREATE INDEX
-- depuis db-init/00-schema.sql
```

## Le schéma de production

`db-init/` n'est plus le DDL de production : il en diffère par l'aplatissement du JSON. Le
banc de test de l'injecteur automatique (`untracked_scripts/test/`), qui écrit dans les vraies
bases où le JSON reste, charge donc sa propre copie figée du DDL de production, et non ce
dossier. Les valeurs d'énumération des deux sont déduites du code des pipelines partenaires,
pas d'un dump de production — **les réaligner sur la vraie base**, une valeur manquante ferait
passer les tests et échouer la production.
