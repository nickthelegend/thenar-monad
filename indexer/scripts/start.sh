#!/bin/sh
# Start the Thenar indexer against thenar-envio-pg / thenar-envio-hasura.
#
#   sh scripts/start.sh          foreground (Ctrl-C stops it)
#   sh scripts/start.sh --bg     background; logs to .run/indexer.log, pid in .run/indexer.pid
#   sh scripts/start.sh -r       wipe the indexer's tables and re-index from the start blocks
#
# It refuses to start unless both of this project's containers are up and
# healthy, because otherwise the Envio CLI would try to create or reuse its own
# fixed-name containers (envio-postgres / envio-hasura), which on this machine
# belong to another project.
set -eu
. "$(dirname -- "$0")/env.sh"
cd "$INDEXER_DIR"

BACKGROUND=0
RESTART=""
for arg in "$@"; do
  case "$arg" in
    --bg) BACKGROUND=1 ;;
    -r|--restart) RESTART="-r" ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

healthy() {
  [ "$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$1" 2>/dev/null || true)" = "healthy" ]
}
for c in thenar-envio-pg thenar-envio-hasura; do
  if ! healthy "$c"; then
    echo "Container $c is not running and healthy. Start it first:  pnpm db:up" >&2
    exit 1
  fi
done

# The port we point at must be *our* container's, not something else's.
hasura_port="$(docker port thenar-envio-hasura 8080/tcp 2>/dev/null | head -1 | sed 's/.*://')"
pg_port="$(docker port thenar-envio-pg 5432/tcp 2>/dev/null | head -1 | sed 's/.*://')"
if [ "$hasura_port" != "$HASURA_EXTERNAL_PORT" ] || [ "$pg_port" != "$ENVIO_PG_PORT" ]; then
  echo "Port mismatch: thenar-envio-hasura is on $hasura_port (want $HASURA_EXTERNAL_PORT)," \
    "thenar-envio-pg is on $pg_port (want $ENVIO_PG_PORT). Refusing to start." >&2
  exit 1
fi

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "The indexer is already running (pid $(cat "$PID_FILE")). Stop it with: pnpm stop" >&2
  exit 1
fi

echo "Postgres  $ENVIO_PG_HOST:$ENVIO_PG_PORT/$ENVIO_PG_DATABASE (schema $ENVIO_PG_SCHEMA)"
echo "Hasura    http://localhost:$HASURA_EXTERNAL_PORT/v1/graphql"
echo "Chains    Monad 10143: $( [ "${ENVIO_THENAR_SKIP_MONAD:-true}" = "false" ] && echo on || echo "skipped (ENVIO_THENAR_SKIP_MONAD)" )," \
  "local 31337: $( [ "${ENVIO_THENAR_SKIP_LOCAL:-false}" = "true" ] && echo "skipped (ENVIO_THENAR_SKIP_LOCAL)" || echo on )"

ENVIO="$INDEXER_DIR/node_modules/.bin/envio"
if [ "$BACKGROUND" = 1 ]; then
  mkdir -p "$RUN_DIR"
  # shellcheck disable=SC2086
  nohup "$ENVIO" start $RESTART >"$LOG_OUT" 2>&1 &
  echo $! >"$PID_FILE"
  echo "Started in the background (pid $(cat "$PID_FILE")). Logs: $LOG_OUT"
else
  # shellcheck disable=SC2086
  exec "$ENVIO" start $RESTART
fi
