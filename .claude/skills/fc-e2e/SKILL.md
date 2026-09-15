---
name: fc-e2e
description: Test de bout en bout du parcours FranceConnect en local — semer lamp01 depuis les lignes eligibility_results réelles, dérouler le writeback (export, clean, rapprochement, marquage) puis le job fc_code_emails, et vérifier chaque étape. À utiliser quand on veut valider la chaîne parcours FC → writeback → courriel du code sur la stack locale.
---

# Test e2e local : parcours FranceConnect → writeback → courriel du code

Rejoue la boucle complète sur les bases locales. Aucune donnée réelle : les identités
viennent du sandbox FranceConnect via le parcours joué sur `http://localhost:3000`.

## Prérequis (vérifier avant de commencer)

```bash
docker compose ps                                   # stack racine : app, worker, db(5432), redis
docker compose -f lamp01/compose.yml up -d integration   # base bénéficiaires, port 55432
cat lamp01/.env                                     # LAMP_DB_PASSWORD=<réel>, PAS le placeholder
```

- Le mot de passe Postgres est figé à la **création du volume** : changer `.env` après
  coup ne change pas celui de la base. En cas de doute, tester
  `PGPASSWORD=<mdp> psql -h 127.0.0.1 -p 55432 -U u_passsport -d passsport -c 'select 1'`.
- Pour que les mails partent : `LINK_MOBILITY_*` dans l'env du worker (sinon les envois
  échouent en `LINK_MOBILITY_API_KEY is not set` — le reste de la boucle se valide quand
  même, plafond 3 tentatives par ligne).
- Au moins une ligne `eligible_pending` dans `eligibility_results` (sinon : jouer le
  parcours sur le site avec une identité de test FC sandbox).

## Étape 1 — lire ce qu'il y a à apparier

```bash
docker exec pass-sport-db-1 psql -U passsport -d passsport \
  -c "select id, source, verdict, situation, caisse, allocataire_identite, enfant_identite
      from eligibility_results where verdict='eligible_pending' order by created_at;"
# Les détails côté caisse (nom de naissance/usage, prénoms, date de l'allocataire, INE) :
docker exec pass-sport-db-1 psql -U passsport -d passsport \
  -Atc "select action, response_payload -> 'data' from eligibility_history
        where actor='api_particulier' and status='success' order by created_at;"
```

## Étape 2 — forger le CSV de seed, une ligne par candidat

Fichier `lamp01/seed-fc-test.csv`, format des fichiers codes : `;`, tout quoté, JSON
`allocataire`/`adresse_allocataire` aplati à l'injection. En-tête :

```
"nom";"prenom";"date_naissance";"genre";"organisme";"situation";"allocataire";"adresse_allocataire";"exercice_id";"zrr";"qpv";"a_valider";"refuser";"id_psp";"cnaf_allocataire_nom_naissance";"cnaf_allocataire_date_naissance";"cnaf_allocataire_genre"
```

Règles de construction — écrire chaque ligne **comme la caisse l'écrit**, pour que la
stratégie correspondante de `match_beneficiaires.sql` la retrouve :

| situation candidate | ligne à forger | pièges |
|---|---|---|
| AAH (caisse indéterminable) | `organisme=MSA` (ou CAF), `situation=AAH` ; `nom` = family_name FC si MSA, = preferred_username FC si CAF | sans `preferred_username` côté FC, seule la variante MSA peut matcher. Ne PAS semer les deux : deux stratégies à 1 ligne = inconcluant (voulu) |
| jeune (QF) CAF | `situation=jeune` ; `nom` bénéf = nom_naissance de l'enfant ; `allocataire.nom` = **nom_usage** (RESPDOS) ; nom de naissance + date + genre (`male`/`female`) de l'allocataire dans les colonnes `cnaf_*` (obligatoires pour cette stratégie → `beneficiaire_cnaf_extra_field`) | les valeurs `cnaf_*` sortent de `qf_allocataires` dans `eligibility_history` |
| jeune (QF) MSA | `allocataire.nom` = nom de naissance, `allocataire.date_naissance` ISO dans le JSON | |
| AEEH CAF | comme jeune CAF mais **sans** les colonnes `cnaf_*` (pas exigées) ; qualité allocataire M/Mme dans le JSON | |
| AEEH MSA | nom de naissance + `date_naissance` allocataire dans le JSON (exigée par la stratégie) | |
| boursier | `organisme=cnous`, `situation=boursier`, `allocataire.matricule` = INE (réponse `cnous.etudiant_boursier_identite`), date au format `JJ/MM/AAAA` | l'INE seul apparie |

Toujours : `exercice_id=5`, `date_naissance` bénéficiaire en `AAAA-MM-JJ 04:00:00`
(décalage +4 h des pipelines), genre `M`/`F`, prénom LAMP = **sous-ensemble** des prénoms
FC (un seul prénom suffit et exerce le containment), `id_psp` unique type `26-TEST-XXX1`.

Injection :

```bash
lamp01/inject_csv.sh --env integration lamp01/seed-fc-test.csv
```

## Étape 3 — writeback (depuis data/2026/partners/franceconnect, cwd OBLIGATOIRE)

```bash
cd data/2026/partners/franceconnect
export FC_DATABASE_URL="postgres://passsport:passsport@127.0.0.1:5432/passsport?sslmode=disable"
export LAMP_DATABASE_URL="postgres://u_passsport:<mdp>@127.0.0.1:55432/passsport"

psql "$FC_DATABASE_URL" -v ON_ERROR_STOP=1 -f export_eligible_pending.sql
../../../.venv/bin/python fc_pipeline.py clean \
  --input fc_2026_eligible_pending.csv --output fc_2026_clean.csv \
  --match-out fc_2026_match_candidates.csv
# apparies=fc_2026_confirmed.csv : le nom que writeback_confirmed.sql lit (figé).
psql "$LAMP_DATABASE_URL" -v ON_ERROR_STOP=1 -v apparies=fc_2026_confirmed.csv \
  -f match_beneficiaires.sql
psql "$FC_DATABASE_URL" -v ON_ERROR_STOP=1 -f writeback_confirmed.sql
psql "$FC_DATABASE_URL" -Atq -f check_confirmed.sql    # DOIT rendre 0
```

Contrôles : le récap du rapprochement doit compter 1 par stratégie semée et
`non_apparies=0` ; `writeback_confirmed.sql` doit afficher `lignes_csv = lignes_marquees` ;
les lignes passent `eligible_confirmed` avec le code lamp, trace `psp.code_match_base`.

Branche **code neuf** (code fabriqué, confirmé tout de suite) : ne pas semer une identité
(ou changer son `nom`), puis :

```bash
../../../.venv/bin/python fc_pipeline.py split-matched --input fc_2026_clean.csv \
  --unmatched-ids fc_2026_non_apparies.csv --output fc_2026_restants.csv
../../../.venv/bin/python fc_pipeline.py codes --input fc_2026_restants.csv \
  --existing-codes <fichier codes existants>
../../../.venv/bin/python fc_pipeline.py writeback
psql "$FC_DATABASE_URL" -v ON_ERROR_STOP=1 -f writeback_verdict.sql
psql "$FC_DATABASE_URL" -Atq -f check_writeback.sql    # DOIT rendre 0
```

Contrôles : les lignes passent `eligible_confirmed` avec le code fabriqué, trace
`psp.code_writeback` (`verdict_after = eligible_confirmed`).

## Étape 4 — le courriel du code (fc_code_emails)

En production, `run_fc_pipeline.sh` pose ce job lui-même en fin de passage. En local, à la
main :

```bash
cd worker && source "$NVM_DIR/nvm.sh" && nvm use
FC_CODE_EMAILS_REDIS_URL="redis://passsport:passsport@localhost:6379" \
  npm run fc:code-emails:enqueue -- --dry-run --limit 5
# puis le passage réel :
FC_CODE_EMAILS_REDIS_URL="redis://passsport:passsport@localhost:6379" npm run fc:code-emails:enqueue
docker logs pass-sport-worker-1 --since 2m | grep -E 'fc_code_emails|code mail'
```

Attendu dans les logs : `N confirmed row(s) awaiting their code mail` (les deux branches,
base et code neuf), puis `N code mail(s) sent` avec le **template de la situation**
(`code_direct_aah`, `code_direct_boursier`, `code_indirect`).

## Remise à zéro (pour rejouer)

```bash
# lamp01 : retirer les lignes de test
psql "$LAMP_DATABASE_URL" -c "delete from beneficiaires where id_psp like '26-TEST-%';"
# base du site : revenir à l'état d'avant writeback
docker exec pass-sport-db-1 psql -U passsport -d passsport -c \
 "update eligibility_results set verdict='eligible_pending', pass_sport_code=null
   where pass_sport_code like '26-TEST-%';
  delete from eligibility_history where action in ('psp.code_match_base', 'psp.code_writeback');"
rm -f data/2026/partners/franceconnect/fc_2026_*.csv
```

Ne jamais viser `--env prod` (port 55433) ni committer les CSV générés.
