#!/bin/sh
# Stop a background indexer started with `pnpm start:bg`.
#
# This only stops the indexer process. It never runs `envio stop`, which would
# delete the fixed-name envio-postgres / envio-hasura containers that belong to
# another project on this machine. The database stays up; `pnpm db:down` stops it.
set -eu
. "$(dirname -- "$0")/env.sh"

if [ ! -f "$PID_FILE" ]; then
  echo "No pid file ($PID_FILE): nothing started with start:bg."
  exit 0
fi
pid="$(cat "$PID_FILE")"
if kill -0 "$pid" 2>/dev/null; then
  # envio start runs the indexer as a child of the CLI process: stop both.
  pkill -TERM -P "$pid" 2>/dev/null || true
  kill -TERM "$pid" 2>/dev/null || true
  i=0
  while kill -0 "$pid" 2>/dev/null && [ "$i" -lt 20 ]; do sleep 0.5; i=$((i + 1)); done
  kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null || true
  echo "Stopped the indexer (pid $pid)."
else
  echo "The indexer (pid $pid) was not running."
fi
rm -f "$PID_FILE"
