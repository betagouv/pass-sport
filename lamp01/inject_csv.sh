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
# Tout ou rien : le CSV est chargé dans une table temporaire aux types de la table cible, le
# nombre de lignes est vérifié à l'intérieur de la transaction, et l'INSERT n'a lieu qu'après.
# Une erreur à n'importe quelle étape laisse la base exactement où elle était.
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
            sed -n '2,21p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
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

# Chaque colonne de l'en-tête doit exister dans la table cible. Sans ce contrôle, un
# renommage côté producteur produirait une erreur COPY bien plus difficile à lire.
unknown_columns=$(psql "${PSQL_OPTS[@]}" -Atq -v ON_ERROR_STOP=1 -c "
    SELECT string_agg(c.column_name, ', ')
    FROM unnest(string_to_array('${CSV_COLUMNS}', ',')) AS c(column_name)
    LEFT JOIN information_schema.columns t
           ON t.table_schema = 'public'
          AND t.table_name = '${TARGET_TABLE}'
          AND t.column_name = c.column_name
    WHERE t.column_name IS NULL;")

[ -z "$unknown_columns" ] || die "colonnes absentes de ${TARGET_TABLE} : ${unknown_columns}"

# Une colonne générée refuse toute valeur fournie : la signaler ici plutôt que de laisser
# l'INSERT échouer sur un message qui ne dit pas d'où vient la colonne.
generated_columns=$(psql "${PSQL_OPTS[@]}" -Atq -v ON_ERROR_STOP=1 -c "
    SELECT string_agg(t.column_name, ', ')
    FROM unnest(string_to_array('${CSV_COLUMNS}', ',')) AS c(column_name)
    JOIN information_schema.columns t
      ON t.table_schema = 'public'
     AND t.table_name = '${TARGET_TABLE}'
     AND t.column_name = c.column_name
    WHERE t.is_generated = 'ALWAYS';")

[ -z "$generated_columns" ] \
    || die "colonnes générées présentes dans le CSV, à retirer : ${generated_columns}"

# Le producteur écrit en QUOTE_ALL : une valeur absente arrive comme "" — une chaîne vide,
# pas un NULL. C'est fatal pour un uuid, un bool, un int, une date, un json ou un enum.
# FORCE_NULL les ramène à NULL, sur une liste dérivée des types réels pour n'avoir rien à
# maintenir en dur ici.
force_null_columns=$(psql "${PSQL_OPTS[@]}" -Atq -v ON_ERROR_STOP=1 -c "
    SELECT string_agg(t.column_name, ', ')
    FROM unnest(string_to_array('${CSV_COLUMNS}', ',')) AS c(column_name)
    JOIN information_schema.columns t
      ON t.table_schema = 'public'
     AND t.table_name = '${TARGET_TABLE}'
     AND t.column_name = c.column_name
    WHERE t.data_type NOT IN ('character varying', 'character', 'text');")

# FORCE_NULL () est une erreur de syntaxe : l'option n'est ajoutée que si la liste existe.
COPY_OPTIONS="FORMAT csv, HEADER true, DELIMITER ';'"
if [ -n "$force_null_columns" ]; then
    COPY_OPTIONS="${COPY_OPTIONS}, FORCE_NULL (${force_null_columns})"
    echo "Colonnes forcées à NULL si vides : ${force_null_columns}"
fi

# --- Transaction --------------------------------------------------------------------

# Le heredoc n'est volontairement pas quoté : ${CSV_FILE} et les autres sont développés par
# bash. C'est obligatoire pour \copy, qui — contrairement aux autres méta-commandes —
# n'effectue AUCUNE interpolation de variable psql : un `FROM :'chemin'` y est pris au pied
# de la lettre et échoue sur « :: No such file or directory ».
psql "${PSQL_OPTS[@]}" -v ON_ERROR_STOP=1 <<EOF
BEGIN;

-- Colonnes du CSV, avec les types de la table cible. Un \`LIKE $TARGET_TABLE\` recopierait
-- le NOT NULL de \`id\` sans son DEFAULT, et le chargement échouerait sur cette colonne que
-- le CSV ne fournit pas.
CREATE TEMP TABLE tmp_beneficiaires ON COMMIT DROP AS
    SELECT $CSV_COLUMNS FROM $TARGET_TABLE WITH NO DATA;

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

-- \`id\` est volontairement absent : il vient de la séquence de la table cible.
INSERT INTO $TARGET_TABLE ($CSV_COLUMNS) SELECT $CSV_COLUMNS FROM tmp_beneficiaires;

COMMIT;
EOF

echo "=== $EXPECTED_ROWS ligne(s) injectée(s) dans [$TARGET_ENV]"
