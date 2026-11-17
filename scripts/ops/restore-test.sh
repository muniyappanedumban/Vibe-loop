#!/usr/bin/env bash
# Proves the newest backup actually restores: checksum → restore into a throwaway database → sanity counts → drop it.
#   ADMIN_URL=postgresql://user:pass@host:5432/postgres BACKUP_DIR=/backups ./scripts/ops/restore-test.sh [dump]
# Exit code ≠ 0 means the backup is NOT usable — open an incident.
set -euo pipefail
: "${ADMIN_URL:?set ADMIN_URL (a role that may CREATE DATABASE)}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
DUMP="${1:-$(ls -1t "$BACKUP_DIR"/vibeloop-*.dump | head -1)}"
[[ -f "$DUMP" ]] || { echo "no dump found"; exit 2; }
if [[ -f "$DUMP.sha256" ]]; then [[ "$(shasum -a 256 "$DUMP" | awk '{print $1}')" == "$(cat "$DUMP.sha256")" ]] || { echo "CHECKSUM MISMATCH: $DUMP"; exit 3; }; fi
DB="vibeloop_restore_test_$$"; BASE="${ADMIN_URL%/*}"
psql "$ADMIN_URL" -qc "CREATE DATABASE $DB" >/dev/null
trap 'psql "$ADMIN_URL" -qc "DROP DATABASE IF EXISTS $DB" >/dev/null' EXIT
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$BASE/$DB" "$DUMP"
q() { psql "$BASE/$DB" -tAc "$1"; }
USERS=$(q "select count(*) from users"); VER=$(q "select version_num from alembic_version" || echo "?")
[[ "$USERS" -gt 0 ]] || { echo "RESTORE EMPTY: users=0"; exit 4; }
echo "restore ok: $(basename "$DUMP") → users=$USERS posts=$(q 'select count(*) from posts') messages=$(q 'select count(*) from chat_messages' 2>/dev/null || echo '?') schema=$VER"
