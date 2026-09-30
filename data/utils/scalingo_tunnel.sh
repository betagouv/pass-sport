# Scalingo db-tunnel helpers shared by the lamp01 cron scripts (run_fc_pipeline.sh,
# run_dashboard.sh). Sourced, not executed.
#
# The caller defines log and die, sets SCALINGO_APP, LOG_FILE (the tunnel's own output is
# appended to it) and optionally SCALINGO_SSH_IDENTITY, and calls close_tunnels on exit.
#
# Each concurrent script needs its own local ports: two tunnels are two independent SSH
# sessions, and the only way they can collide is by listening on the same port.

TUNNEL_PIDS=()

# db-tunnel opens its own SSH connection, independent of `scalingo login`: without -i it falls
# back on the SSH agent, then on ~/.ssh/id_rsa, which may not exist on this machine.
open_tunnel() {
  local addon_url_var="$1" port="$2" pid
  local tunnel_args=(--app "$SCALINGO_APP" db-tunnel -p "$port")
  [[ -n "${SCALINGO_SSH_IDENTITY:-}" ]] && tunnel_args+=(-i "$SCALINGO_SSH_IDENTITY")
  tunnel_args+=("$addon_url_var")

  # The readiness probe below cannot tell our tunnel from another listener on the same port.
  if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
    die "le port local $port est déjà occupé (un autre tunnel ?) — choisir un autre port"
  fi

  log "ouverture du tunnel $addon_url_var vers $SCALINGO_APP, port local $port"
  scalingo "${tunnel_args[@]}" >>"$LOG_FILE" 2>&1 &
  pid=$!
  TUNNEL_PIDS+=("$pid")

  for _ in $(seq 1 30); do
    if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
      log "tunnel ouvert"
      return 0
    fi
    kill -0 "$pid" 2>/dev/null || die "le tunnel s'est arrêté — voir le journal"
    sleep 1
  done
  die "le port $port ne répond toujours pas"
}

close_tunnels() {
  local pid
  for pid in "${TUNNEL_PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
      log "tunnel refermé"
    fi
  done
}

# Sets the variable named $2 to the app's Postgres URL, host and port replaced by the tunnel's
# on port $1, query options by the sslmode the tunnel imposes. Never log it: it carries the
# password. [^@/]+ rather than [^/]+, or a password containing an @ would be eaten with the host.
tunnel_database_url() {
  local port="$1" var="$2" remote_url
  remote_url="$(scalingo --app "$SCALINGO_APP" env-get SCALINGO_POSTGRESQL_URL)"
  [[ -n "$remote_url" ]] || die "SCALINGO_POSTGRESQL_URL introuvable sur $SCALINGO_APP"
  printf -v "$var" '%s?sslmode=disable' \
    "$(printf '%s' "$remote_url" | sed -E "s#@[^@/]+/#@127.0.0.1:$port/#; s#\\?.*\$##")"
}
