#!/usr/bin/env bash
#
# Applies db/migrations/*.sql, in order, to any Postgres.
#
#   scripts/migrate.sh "$POSTGRES_URL"
#   POSTGRES_URL=... scripts/migrate.sh
#
# `supabase db reset` covers the local stack. This exists for a hosted project,
# where the README otherwise says "run seven files in order" and leaves you to
# it. Every migration is idempotent, so re-running is safe and is the intended
# way to bring an existing deployment up to date.
#
# Uses psql if it is installed, and otherwise borrows the one inside the local
# Supabase container — which saves installing Postgres client tools just to
# deploy.
set -euo pipefail

URL="${1:-${POSTGRES_URL:-}}"

if [ -z "$URL" ]; then
  echo "usage: scripts/migrate.sh <postgres-connection-string>" >&2
  echo "   or: POSTGRES_URL=... scripts/migrate.sh" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS="$ROOT/db/migrations"

# A hosted Supabase pooler URL needs the direct connection for DDL; say so
# rather than failing halfway through with a confusing error.
case "$URL" in
  *pooler.supabase.com*6543*)
    echo "warning: that looks like a transaction-mode pooler URL." >&2
    echo "         DDL needs the direct connection (port 5432)." >&2
    ;;
esac

USE_DOCKER=0
if ! command -v psql >/dev/null 2>&1; then
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^supabase_db_muse$'; then
    USE_DOCKER=1
    # Inside the container, localhost is the container. A host-side local URL
    # would silently fail to connect, so point at the local stack properly.
    case "$URL" in
      *127.0.0.1*|*localhost*)
        echo "error: that is a local URL, and the only psql here lives inside" >&2
        echo "       the database container, where localhost means something" >&2
        echo "       else. Use 'npm run db:reset' for the local stack." >&2
        exit 2
        ;;
    esac
  fi
fi

run_psql() {
  if [ "$USE_DOCKER" = "1" ]; then
    docker exec -i supabase_db_muse psql "$URL" -v ON_ERROR_STOP=1 -q -f -
  elif command -v psql >/dev/null 2>&1; then
    psql "$URL" -v ON_ERROR_STOP=1 -q -f -
  else
    echo "error: no psql available. Install postgresql-client, or start the" >&2
    echo "       local stack with 'npm run db:start' to borrow its client." >&2
    exit 1
  fi
}

for file in "$MIGRATIONS"/*.sql; do
  name="$(basename "$file")"
  printf 'applying %s ... ' "$name"
  if run_psql < "$file" > /dev/null; then
    echo "ok"
  else
    echo "FAILED"
    exit 1
  fi
done

echo
echo "all migrations applied."
