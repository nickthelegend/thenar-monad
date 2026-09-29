# shellcheck shell=sh
# Sourced by the other scripts: where the indexer's database and GraphQL live.
#
# These point `envio start` at thenar-envio-pg / thenar-envio-hasura (from
# db.compose.yaml) instead of the fixed-name envio-postgres / envio-hasura
# containers that `envio dev` would create or reuse. Every value can be
# overridden from the environment.

INDEXER_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
export INDEXER_DIR

# Load indexer/.env like dotenv does: a variable already in the environment
# wins. `docker compose` reads the same file, so ports and secrets set there
# reach both the containers and the indexer.
if [ -f "$INDEXER_DIR/.env" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in '' | \#*) continue ;; esac
    key="${line%%=*}"
    val="${line#*=}"
    case "$key" in '' | *[!A-Za-z0-9_]*) continue ;; esac
    val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
    eval "already=\${$key+set}"
    [ "$already" = set ] || export "$key=$val"
  done <"$INDEXER_DIR/.env"
fi

# Our Postgres. Setting ENVIO_PG_HOST is what tells the Envio CLI to use this
# database instead of starting (or reusing) its own Docker container.
export ENVIO_PG_HOST="${ENVIO_PG_HOST:-127.0.0.1}"
export ENVIO_PG_PORT="${ENVIO_PG_PORT:-${THENAR_ENVIO_PG_PORT:-55441}}"
export ENVIO_PG_USER="${ENVIO_PG_USER:-postgres}"
export ENVIO_PG_PASSWORD="${ENVIO_PG_PASSWORD:-${THENAR_ENVIO_PG_PASSWORD:-thenar-envio}}"
export ENVIO_PG_DATABASE="${ENVIO_PG_DATABASE:-envio-dev}"
export ENVIO_PG_SCHEMA="${ENVIO_PG_SCHEMA:-public}"

# Our Hasura. The CLI checks HASURA_EXTERNAL_PORT and, when something already
# answers there, uses it rather than creating a container; the indexer then
# tracks its tables through HASURA_GRAPHQL_ENDPOINT.
export HASURA_EXTERNAL_PORT="${HASURA_EXTERNAL_PORT:-${THENAR_ENVIO_HASURA_PORT:-8089}}"
export HASURA_GRAPHQL_ENDPOINT="${HASURA_GRAPHQL_ENDPOINT:-http://localhost:${HASURA_EXTERNAL_PORT}/v1/metadata}"
export HASURA_GRAPHQL_ADMIN_SECRET="${HASURA_GRAPHQL_ADMIN_SECRET:-${THENAR_ENVIO_HASURA_SECRET:-thenar-admin}}"

# The indexer's own HTTP port (metrics, health). Envio's default is 9898, which
# another local indexer may be using.
export ENVIO_INDEXER_PORT="${ENVIO_INDEXER_PORT:-9941}"

# Plain line-buffered logs, not the interactive terminal UI.
export ENVIO_TUI="${ENVIO_TUI:-false}"

RUN_DIR="$INDEXER_DIR/.run"
PID_FILE="$RUN_DIR/indexer.pid"
LOG_OUT="$RUN_DIR/indexer.log"
