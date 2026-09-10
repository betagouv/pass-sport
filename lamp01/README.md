# La base bénéficiaires du lamp

Le PostgreSQL qui détient la table `beneficiaires` : celle que les pipelines CNAF, MSA et
CNOUS de [data/2026/partners/](../data/2026/partners/) alimentent, et que le passage
FranceConnect interroge désormais avant de fabriquer un code.

```
lamp01/
├── compose.yml            les deux services, integration et prod
├── db-init/00-schema.sql  le schéma, chargé par les deux — et par le banc de test
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

## Injecter un CSV

```bash
./lamp01/inject_csv.sh data/2026/partners/msa/msa_2026_final.csv          # integration
./lamp01/inject_csv.sh --env prod data/2026/partners/msa/msa_2026_final.csv
```

C'est l'outil d'injection **manuelle** des sorties de notebooks. Le dépôt automatique de la
cron FranceConnect, lui, passe par `/nfs/run` et par l'injecteur de `untracked_scripts/`, qui
scanne ce répertoire tout seul : les deux ne se marchent pas dessus.

## La colonne de recherche

`beneficiaires.cle_recherche` est une colonne **générée** qui concatène, normalisés :

```
allocataire.nom | allocataire.prenom | date_naissance | nom | prénoms + ' '
```

Les prénoms du bénéficiaire viennent en dernier, suivis d'un espace : c'est ce qui permet à
`match_beneficiaires.sql` de chercher sur le 1er prénom, puis sur les deux premiers quand le
premier est ambigu, par simple allongement du préfixe — servi par l'index
`beneficiaires_cle_recherche_idx` en `text_pattern_ops`.

La date de naissance et le lieu de naissance de l'allocataire n'entrent **pas** dans la clé :
seuls CNOUS et le pipeline FranceConnect les déposent dans le JSON, les inclure rendrait
toute ligne CNAF ou MSA introuvable.

**Changer l'ensemble des colonnes** demande de reconstruire la colonne — une colonne générée
n'est pas recalculée quand la fonction derrière elle change, et cette fonction ne peut pas
être remplacée tant qu'une colonne en dépend :

```sql
DROP INDEX public.beneficiaires_cle_recherche_idx;
ALTER TABLE public.beneficiaires DROP COLUMN cle_recherche;
-- puis rejouer CREATE OR REPLACE FUNCTION, ALTER TABLE ... ADD COLUMN et CREATE INDEX
-- depuis db-init/00-schema.sql
```

## Le schéma est partagé

`db-init/00-schema.sql` est monté par les deux services **et** par le banc de test de
`untracked_scripts/test/` : il n'existe qu'une définition du schéma, et le banc ne peut pas
passer contre une version périmée. Les valeurs d'énumération y sont déduites du code des
pipelines partenaires, pas d'un dump de production — **les réaligner sur la vraie base**, une
valeur manquante ici ferait passer les tests et échouer la production.
