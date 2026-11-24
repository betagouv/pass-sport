#!/usr/bin/env bash
#
# Prévient les opérateurs par courriel quand le passage FranceConnect est en panne. Lancé par la
# crontab pass-sport-fc juste après chaque run_fc_pipeline.sh (deploy/ansible/tasks/ordonnancement.yml) :
#
#   alerte_echecs.sh --seuil 3 --destinataire a@x.fr [--destinataire b@y.fr …] [--dossier-passages DIR]
#
# Lit DIR/passages.log (FC_RUN_DIR, <ce dossier>/run par défaut) et regarde la série en fin de fichier.
# Deux pannes, deux courriels distincts :
#   - SEUIL passages `echec` d'affilée          → « en échec » ;
#   - SEUIL passages `ignore-verrou` d'affilée  → « bloqué » : un passage garde le verrou sans finir,
#     et tous les suivants renoncent sans rien écrire d'autre.
# Les passages à blanc (-dry-run) ne comptent pas : ce sont des essais à la main. Un `ignore-verrou`
# ne casse pas une série d'échecs (un passage en échec qui dure plus de 30 min en produit).
#
# UN SEUL COURRIEL PAR SÉRIE : un témoin (DIR/alerte-echec-envoyee, DIR/alerte-blocage-envoyee),
# qui retient le premier passage de la série signalée, est posé une fois le courriel accepté par
# sendmail. Une nouvelle série, après un passage qui casse la précédente, réarme l'alerte.
# Supprimer le témoin à la main force un nouvel envoi.
#
# Le courriel ne reprend que les lignes de passages.log, jamais run.log, qui peut porter des
# données personnelles.
#
# Envoi par le sendmail du MTA de la machine (postfix) ; SENDMAIL le remplace, pour les tests.

set -Eeuo pipefail
umask 007

FC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SENDMAIL="${SENDMAIL:-/usr/sbin/sendmail}"

die() { printf 'alerte_echecs.sh : %s\n' "$*" >&2; exit 2; }

SEUIL=3
RUNS_DIR="$FC_DIR/run"
DESTINATAIRES=()
while (( $# )); do
  case "$1" in
    --seuil) SEUIL="${2:?--seuil sans valeur}"; shift 2 ;;
    --destinataire) DESTINATAIRES+=("${2:?--destinataire sans valeur}"); shift 2 ;;
    --dossier-passages) RUNS_DIR="${2:?--dossier-passages sans valeur}"; shift 2 ;;
    *) die "argument inconnu : $1" ;;
  esac
done
[[ "$SEUIL" =~ ^[1-9][0-9]*$ ]] || die "--seuil doit être un entier ≥ 1 : $SEUIL"
(( ${#DESTINATAIRES[@]} )) || die "au moins un --destinataire"

RUNS_INDEX="$RUNS_DIR/passages.log"
[[ -f "$RUNS_INDEX" ]] || exit 0

HOST="$(hostname)"

# Lignes des vrais passages, la plus récente d'abord. Colonnes : dossier, statut, code, résumé.
recent_first() { awk '$1 !~ /-dry-run$/' "$RUNS_INDEX" | tac; }

# Longueur de la série en cours et dossier de son premier passage, qui l'identifie.
# awk lit tout au lieu de faire `exit` : en quittant tôt, il ferait tuer tac par SIGPIPE dès que
# passages.log dépasse la mémoire du tube (~64 Kio), et pipefail ferait échouer la commande.
read -r FAILURES FAILURES_START < <(recent_first | awk '
  done { next } $2 == "ignore-verrou" { next } $2 == "echec" { n++; start = $1; next } { done = 1 }
  END { print n + 0, start }')
read -r SKIPPED SKIPPED_START < <(recent_first | awk '
  done { next } $2 == "ignore-verrou" { n++; start = $1; next } { done = 1 }
  END { print n + 0, start }')

# Les lignes `statut` de la série, dans l'ordre chronologique, 10 au plus.
series_lines() {
  local status="$1" count="$2"
  (( count > 10 )) && count=10
  awk -v s="$status" '$1 !~ /-dry-run$/ && $2 == s' "$RUNS_INDEX" | tail -n "$count"
}

send_mail() {
  local subject="$1"
  local to
  to="$(IFS=,; printf '%s' "${DESTINATAIRES[*]}")"
  {
    printf 'To: %s\n' "${to//,/, }"
    # Sujet en ASCII : un en-tête 8 bits brut n'est pas garanti de passer partout.
    printf 'Subject: %s\n' "$subject"
    printf 'MIME-Version: 1.0\nContent-Type: text/plain; charset=UTF-8\nContent-Transfer-Encoding: 8bit\n\n'
    cat
  } | "$SENDMAIL" -t -oi
}

# Envoie au plus un courriel par série : $1 longueur, $2 premier passage de la série, $3 témoin,
# $4 sujet ; corps sur stdin. Le témoin garde le premier passage de la série signalée : une autre
# série en a un autre, même si aucune vérification n'a vu le succès qui les sépare.
alert_once() {
  local count="$1" start="$2" marker="$3" subject="$4"
  if (( count < SEUIL )); then
    rm -f "$marker"
    cat >/dev/null
    return
  fi
  if [[ -e "$marker" && "$(<"$marker")" == "$start" ]]; then
    cat >/dev/null
    return
  fi
  send_mail "$subject"
  printf '%s\n' "$start" >"$marker"
}

alert_once "$FAILURES" "${FAILURES_START:-}" "$RUNS_DIR/alerte-echec-envoyee" \
  "[pass Sport] FranceConnect : $FAILURES passages en echec d'affilee ($HOST)" <<EOF
Les $FAILURES derniers passages FranceConnect sur $HOST sont en échec :

$(series_lines echec "$FAILURES")

Journal du dernier échec : $RUNS_DIR/derniere-erreur/run.log
Tous les passages        : $RUNS_INDEX

Aucun autre courriel ne sera envoyé pour cette série : le prochain partira après un passage réussi
suivi de $SEUIL nouveaux échecs.
EOF

alert_once "$SKIPPED" "${SKIPPED_START:-}" "$RUNS_DIR/alerte-blocage-envoyee" \
  "[pass Sport] FranceConnect : passage bloque, $SKIPPED passages ecartes d'affilee ($HOST)" <<EOF
Un passage FranceConnect garde le verrou sur $HOST : les $SKIPPED derniers passages ont renoncé
(ignore-verrou) sans rien traiter.

$(series_lines ignore-verrou "$SKIPPED")

Journal du passage bloqué : $RUNS_DIR/latest/run.log
Processus                 : pgrep -af run_fc_pipeline.sh

Aucun autre courriel ne sera envoyé pour ce blocage : le prochain partira après la fin du passage
bloqué suivie d'un nouveau blocage.
EOF
