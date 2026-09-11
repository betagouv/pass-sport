#!/usr/bin/env bash
#
# Injection transactionnelle d'un CSV de bénéficiaires, désigné par son chemin.
#
#   ./inject_csv.sh [--env integration|prod] <chemin-du-csv>
#
# C'est l'outil d'injection MANUELLE : les sorties des notebooks CNAF, MSA et CNOUS, qu'on
# injecte une fois, en connaissant leur chemin. Le dépôt automatique de la cron FranceConnect
# passe, lui, par /nfs/run et par l'injecteur qui scanne ce répertoire tout seul — ce script
# ne scanne rien, ne déplace rien et ne met rien en quarantaine.
#
# Les colonnes JSON `allocataire` et `adresse_allocataire` des CSV sont APLATIES : chaque
# clé va dans la colonne allocataire_<clé> / adresse_allocataire_<clé> de beneficiaires. Une
# clé sans colonne fait échouer l'injection plutôt que d'être perdue en silence.
#
# Les colonnes du CSV absentes de beneficiaires mais présentes dans
# beneficiaire_cnaf_extra_field (la sortie de reconcile_cnaf_raw_with_codes.ipynb) vont dans
# cette table-là, reliées par id_psp, dans la même transaction.
#
# Tout ou rien : le CSV est chargé dans une table temporaire aux types des tables cibles, le
# nombre de lignes et les clés JSON sont vérifiés à l'intérieur de la transaction, et les
# INSERT n'ont lieu qu'après. Une erreur à n'importe quelle étape laisse la base exactement où
# elle était.
#
# Configuration, par l'environnement ou par lamp01/.env (voir README.md) :
#   LAMP_DB_PASSWORD  obligatoire
#   LAMP_DB_USER      défaut u_passsport
#   LAMP_DB_NAME      défaut passsport
#   LAMP_DB_HOST      défaut 127.0.0.1
#   LAMP_INTEGRATION_PORT / LAMP_PROD_PORT   défauts 55432 / 55433

set -euo pipefail

LAMP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

die() { printf 'ERREUR : %s\n' "$*" >&2; exit 1; }

# --- Arguments ----------------------------------------------------------------------

TARGET_ENV=integration
CSV_FILE=""

while [ $# -gt 0 ]; do
    case "$1" in
        --env)
            [ $# -ge 2 ] || die "--env attend une valeur"
            TARGET_ENV="$2"
            shift 2
            ;;
        --env=*)
            TARGET_ENV="${1#--env=}"
            shift
            ;;
        -h|--help)
            sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        -*)
            die "option inconnue : $1"
            ;;
        *)
            [ -z "$CSV_FILE" ] || die "un seul CSV à la fois (déjà : $CSV_FILE)"
            CSV_FILE="$1"
            shift
            ;;
    esac
done

[ -n "$CSV_FILE" ] || die "aucun CSV indiqué — usage : $0 [--env integration|prod] <chemin-du-csv>"
[ -f "$CSV_FILE" ] || die "fichier introuvable : $CSV_FILE"
[ -r "$CSV_FILE" ] || die "fichier illisible : $CSV_FILE"

case "$TARGET_ENV" in
    integration|prod) ;;
    *) die "environnement inconnu : $TARGET_ENV (integration ou prod)" ;;
esac

CSV_FILE=$(realpath "$CSV_FILE")

# Le chemin est interpolé dans un littéral SQL simple-quoté : psql n'interpole aucune
# variable dans les arguments de \copy, il n'y a pas d'autre moyen de le lui passer. On
# refuse donc ce qui casserait la quote.
case "$CSV_FILE" in
    *"'"*|*$'\n'*) die "chemin non supporté (apostrophe ou retour ligne) : $CSV_FILE" ;;
esac

# --- Connexion ----------------------------------------------------------------------

# lamp01/.env, si présent, sans écraser ce que l'appelant a déjà posé dans l'environnement.
if [ -f "$LAMP_DIR/.env" ]; then
    while IFS= read -r line; do
        case "$line" in ''|'#'*) continue ;; esac
        name="${line%%=*}"
        [ -n "${!name:-}" ] && continue
        value="${line#*=}"
        value="${value%\"}"; value="${value#\"}"
        printf -v "$name" '%s' "$value"
    done < "$LAMP_DIR/.env"
fi

DB_HOST="${LAMP_DB_HOST:-127.0.0.1}"
DB_USER="${LAMP_DB_USER:-u_passsport}"
DB_NAME="${LAMP_DB_NAME:-passsport}"
if [ "$TARGET_ENV" = prod ]; then
    DB_PORT="${LAMP_PROD_PORT:-55433}"
else
    DB_PORT="${LAMP_INTEGRATION_PORT:-55432}"
fi

[ -n "${LAMP_DB_PASSWORD:-}" ] || die "LAMP_DB_PASSWORD absent — voir lamp01/README.md"
command -v psql >/dev/null || die "psql introuvable"

TARGET_TABLE="${TARGET_TABLE:-beneficiaires}"
EXTRA_TABLE="${EXTRA_TABLE:-beneficiaire_cnaf_extra_field}"

# Les colonnes JSON des CSV, dépliées chacune dans les colonnes de la table cible qui portent
# son nom suivi de `_` (adresse_allocataire_* ne commence pas par allocataire_ : pas de
# chevauchement).
JSON_SOURCES="allocataire,adresse_allocataire"

# PGPASSWORD plutôt qu'une URI : le mot de passe n'apparaît pas dans `ps`.
export PGPASSWORD="$LAMP_DB_PASSWORD"
PSQL_OPTS=(-h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME")

# --- Lecture de l'en-tête -----------------------------------------------------------

# awk compte des lignes physiques, pas des enregistrements CSV : un champ quoté multi-ligne
# gonfle ce total. C'est précisément ce que le contrôle transactionnel plus bas détecte, en
# comparant ce compte au nombre de lignes que COPY a réellement chargées.
TOTAL_LINES=$(awk 'END {print NR}' "$CSV_FILE")
[ "$TOTAL_LINES" -gt 1 ] || die "CSV vide ou réduit à son en-tête : $CSV_FILE"
EXPECTED_ROWS=$((TOTAL_LINES - 1))

# COPY ... HEADER true saute la ligne d'en-tête et charge POSITIONNELLEMENT : l'ordre du CSV
# n'est pas celui de la table, il faut donc nommer les colonnes explicitement.
CSV_COLUMNS=$(head -n 1 "$CSV_FILE" | tr -d '"\r' | tr ';' ',')

# Cette liste est interpolée dans du SQL : n'accepter que des noms de colonnes non quotés
# rend toute injection impossible.
if [[ ! "$CSV_COLUMNS" =~ ^[a-z_][a-z0-9_]*(,[a-z_][a-z0-9_]*)*$ ]]; then
    die "en-tête CSV inexploitable : $CSV_COLUMNS"
fi

echo "=== $(basename "$CSV_FILE") -> [$TARGET_ENV] ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
echo "Lignes attendues (hors en-tête) : $EXPECTED_ROWS"
echo "Colonnes : $CSV_COLUMNS"

# --- Pré-vol ------------------------------------------------------------------------

# Tout le plan de chargement se lit dans le catalogue, à travers ces deux relations : les
# colonnes du CSV dans leur ordre, et celles des deux tables avec leur type exact
# (format_type garde les enums et les varchar(255), que information_schema ne rend pas).
CATALOG_CTE="
    WITH csv AS (
        SELECT column_name, position
        FROM unnest(string_to_array('${CSV_COLUMNS}', ',')) WITH ORDINALITY AS c(column_name, position)
    ), catalog AS (
        SELECT cl.relname AS table_name, a.attname AS column_name, a.atttypid AS type_oid,
               format_type(a.atttypid, a.atttypmod) AS column_type,
               a.attgenerated <> '' AS is_generated
        FROM pg_attribute a
        JOIN pg_class cl ON cl.oid = a.attrelid
        JOIN pg_namespace ns ON ns.oid = cl.relnamespace
        WHERE ns.nspname = 'public'
          AND cl.relname IN ('${TARGET_TABLE}', '${EXTRA_TABLE}')
          AND a.attnum > 0 AND NOT a.attisdropped
    ), target AS (
        SELECT * FROM catalog WHERE table_name = '${TARGET_TABLE}'
    ), extra AS (
        SELECT * FROM catalog WHERE table_name = '${EXTRA_TABLE}'
    ), json_source AS (
        SELECT unnest(string_to_array('${JSON_SOURCES}', ',')) AS column_name
    )"

catalog_query() {
    psql "${PSQL_OPTS[@]}" -Atq -v ON_ERROR_STOP=1 -c "${CATALOG_CTE} $1"
}

# Chaque colonne de l'en-tête doit exister dans la table cible, dans la table des champs
# supplémentaires, ou être une colonne JSON à aplatir. Sans ce contrôle, un renommage côté
# producteur produirait une erreur COPY bien plus difficile à lire.
unknown_columns=$(catalog_query "
    SELECT string_agg(column_name, ', ' ORDER BY position) FROM csv
    WHERE column_name NOT IN (SELECT column_name FROM catalog)
      AND column_name NOT IN (SELECT column_name FROM json_source);")

[ -z "$unknown_columns" ] || die "colonnes absentes de ${TARGET_TABLE} et de ${EXTRA_TABLE} : ${unknown_columns} (${EXTRA_TABLE} manquante ? voir db-init/01-beneficiaire-cnaf-extra-field.sql)"

# Répartition des colonnes, dans l'ordre du CSV : celles de la table cible, celles qui
# n'existent que dans la table des champs supplémentaires, et les colonnes JSON.
TARGET_COLUMNS=$(catalog_query "
    SELECT string_agg(column_name, ',' ORDER BY position) FROM csv
    WHERE column_name IN (SELECT column_name FROM target);")

EXTRA_COLUMNS=$(catalog_query "
    SELECT string_agg(column_name, ',' ORDER BY position) FROM csv
    WHERE column_name NOT IN (SELECT column_name FROM target)
      AND column_name IN (SELECT column_name FROM extra);")

CSV_JSON_SOURCES=$(catalog_query "
    SELECT string_agg(column_name, ',' ORDER BY position) FROM csv
    WHERE column_name IN (SELECT column_name FROM json_source);")

# La ligne supplémentaire n'a d'autre clé que le code du bénéficiaire.
if [ -n "$EXTRA_COLUMNS" ] && [[ ",${TARGET_COLUMNS}," != *,id_psp,* ]]; then
    die "colonnes de ${EXTRA_TABLE} sans colonne id_psp pour les relier : ${EXTRA_COLUMNS}"
fi

# Une colonne générée refuse toute valeur fournie : la signaler ici plutôt que de laisser
# l'INSERT échouer sur un message qui ne dit pas d'où vient la colonne.
generated_columns=$(catalog_query "
    SELECT string_agg(column_name, ', ') FROM target
    WHERE is_generated AND column_name IN (SELECT column_name FROM csv);")

[ -z "$generated_columns" ] \
    || die "colonnes générées présentes dans le CSV, à retirer : ${generated_columns}"

# Les colonnes de la table cible que les JSON du CSV alimentent, et l'expression qui lit
# chacune : allocataire_matricule <- allocataire ->> 'matricule'.
FLATTENED_TARGETS="
    SELECT t.column_name, s.column_name AS json_column,
           substr(t.column_name, length(s.column_name) + 2) AS json_key
    FROM target t
    JOIN json_source s ON left(t.column_name, length(s.column_name) + 1) = s.column_name || '_'
    WHERE s.column_name IN (SELECT column_name FROM csv)"

# Une valeur fournie deux fois, en colonne et dans le JSON, n'aurait pas de gagnant évident.
duplicated_columns=$(catalog_query "
    SELECT string_agg(f.column_name, ', ') FROM (${FLATTENED_TARGETS}) f
    WHERE f.column_name IN (SELECT column_name FROM csv);")

[ -z "$duplicated_columns" ] \
    || die "colonnes fournies à la fois dans le CSV et dans son JSON : ${duplicated_columns}"

FLATTENED_COLUMNS=$(catalog_query "
    SELECT string_agg(column_name, ',' ORDER BY column_name) FROM (${FLATTENED_TARGETS}) f;")

FLATTENED_EXPRESSIONS=$(catalog_query "
    SELECT string_agg(format('%I ->> %L', json_column, json_key), ', ' ORDER BY column_name)
    FROM (${FLATTENED_TARGETS}) f;")

# Les clés que chaque colonne JSON a le droit de porter, en tableau SQL : le contrôle de la
# transaction refuse toutes les autres.
JSON_KEY_CHECKS=""
for json_column in ${CSV_JSON_SOURCES//,/ }; do
    allowed_keys=$(catalog_query "
        SELECT format('ARRAY[%s]::text[]', coalesce(string_agg(quote_literal(json_key), ', '), ''))
        FROM (${FLATTENED_TARGETS}) f WHERE json_column = '${json_column}';")
    JSON_KEY_CHECKS="${JSON_KEY_CHECKS:+${JSON_KEY_CHECKS} UNION ALL }SELECT '${json_column}.' || k FROM tmp_beneficiaires, json_object_keys(${json_column}) AS k WHERE k <> ALL (${allowed_keys})"
done

# Colonnes du CSV avec le type de leur table, et `json` pour les colonnes à aplatir, qui
# n'existent plus dans la table cible. Une définition explicite plutôt qu'un
# `CREATE TABLE AS SELECT ... FROM $TARGET_TABLE`, qui ne peut pas donner leur type à ces
# dernières.
TMP_COLUMNS_DEFINITION=$(catalog_query "
    SELECT string_agg(format('%I %s', c.column_name,
                             coalesce(t.column_type, e.column_type, 'json')), ', ' ORDER BY c.position)
    FROM csv c
    LEFT JOIN target t ON t.column_name = c.column_name
    LEFT JOIN extra e ON e.column_name = c.column_name;")

# Le producteur écrit en QUOTE_ALL : une valeur absente arrive comme "" — une chaîne vide,
# pas un NULL. C'est fatal pour un uuid, un bool, un int, une date, un json ou un enum.
# FORCE_NULL les ramène à NULL, sur une liste dérivée des types réels pour n'avoir rien à
# maintenir en dur ici. Le type d'une colonne présente dans les deux tables (id_psp) est
# celui de la table cible.
force_null_columns=$(catalog_query "
    SELECT string_agg(c.column_name, ', ' ORDER BY c.position)
    FROM csv c
    LEFT JOIN target t ON t.column_name = c.column_name
    LEFT JOIN extra e ON e.column_name = c.column_name
    WHERE coalesce(t.type_oid, e.type_oid, 'json'::regtype)
          NOT IN ('varchar'::regtype, 'bpchar'::regtype, 'text'::regtype);")

# FORCE_NULL () est une erreur de syntaxe : l'option n'est ajoutée que si la liste existe.
COPY_OPTIONS="FORMAT csv, HEADER true, DELIMITER ';'"
if [ -n "$force_null_columns" ]; then
    COPY_OPTIONS="${COPY_OPTIONS}, FORCE_NULL (${force_null_columns})"
    echo "Colonnes forcées à NULL si vides : ${force_null_columns}"
fi

# --- Transaction --------------------------------------------------------------------

INSERT_COLUMNS="${TARGET_COLUMNS}${TARGET_COLUMNS:+${FLATTENED_COLUMNS:+,}}${FLATTENED_COLUMNS}"
INSERT_VALUES="${TARGET_COLUMNS}${TARGET_COLUMNS:+${FLATTENED_EXPRESSIONS:+, }}${FLATTENED_EXPRESSIONS}"

if [ -n "$FLATTENED_COLUMNS" ]; then
    echo "Colonnes aplaties depuis ${CSV_JSON_SOURCES} : ${FLATTENED_COLUMNS}"
fi

if [ -n "$JSON_KEY_CHECKS" ]; then
    JSON_KEY_CHECK_BLOCK="DO \$\$
DECLARE
    v_unknown_keys TEXT;
BEGIN
    SELECT string_agg(DISTINCT unknown_key, ', ') INTO v_unknown_keys
    FROM (${JSON_KEY_CHECKS}) AS unknown(unknown_key);
    IF v_unknown_keys IS NOT NULL THEN
        RAISE EXCEPTION 'CLÉS JSON SANS COLONNE dans ${TARGET_TABLE} : %', v_unknown_keys;
    END IF;
END \$\$;"
else
    JSON_KEY_CHECK_BLOCK=""
fi

if [ -n "$EXTRA_COLUMNS" ]; then
    EXTRA_INSERT="INSERT INTO $EXTRA_TABLE (id_psp,$EXTRA_COLUMNS) SELECT id_psp,$EXTRA_COLUMNS FROM tmp_beneficiaires;"
    echo "Colonnes vers ${EXTRA_TABLE} : ${EXTRA_COLUMNS}"
else
    EXTRA_INSERT=""
fi

# Le heredoc n'est volontairement pas quoté : ${CSV_FILE} et les autres sont développés par
# bash. C'est obligatoire pour \copy, qui — contrairement aux autres méta-commandes —
# n'effectue AUCUNE interpolation de variable psql : un `FROM :'chemin'` y est pris au pied
# de la lettre et échoue sur « :: No such file or directory ».
psql "${PSQL_OPTS[@]}" -v ON_ERROR_STOP=1 <<EOF
BEGIN;

CREATE TEMP TABLE tmp_beneficiaires ($TMP_COLUMNS_DEFINITION) ON COMMIT DROP;

\copy tmp_beneficiaires ($CSV_COLUMNS) FROM '$CSV_FILE' WITH ($COPY_OPTIONS)

-- Le compte attendu est interpolé par bash : psql ne substitue pas ses propres variables à
-- l'intérieur d'une chaîne dollar-quotée, un \`:expected\` ici resterait littéral et
-- casserait la compilation plpgsql.
DO \$\$
DECLARE
    v_count INTEGER;
    v_expected INTEGER := $EXPECTED_ROWS;
BEGIN
    SELECT COUNT(*) INTO v_count FROM tmp_beneficiaires;
    IF v_count <> v_expected THEN
        RAISE EXCEPTION 'ÉCHEC DE COMPTAGE : % lignes attendues dans le CSV vs % chargées.',
            v_expected, v_count;
    END IF;
END \$\$;

$JSON_KEY_CHECK_BLOCK

-- \`id\` est volontairement absent : il vient de la séquence de la table cible.
INSERT INTO $TARGET_TABLE ($INSERT_COLUMNS) SELECT $INSERT_VALUES FROM tmp_beneficiaires;

-- Après les bénéficiaires : la clé étrangère sur id_psp exige qu'ils existent déjà.
$EXTRA_INSERT

COMMIT;
EOF

echo "=== $EXPECTED_ROWS ligne(s) injectée(s) dans [$TARGET_ENV]"
