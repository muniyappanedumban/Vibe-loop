#!/usr/bin/env bash
# Nightly Postgres backup: compressed custom-format dump + SHA-256, keeps the last $KEEP_DAYS days.
#   DATABASE_URL=postgresql://user:pass@host:5432/vibeloop BACKUP_DIR=/backups ./scripts/ops/backup-db.sh
# Optional: S3_URI=s3://bucket/vibeloop (copies each dump off-site with the AWS CLI).
set -euo pipefail
: "${DATABASE_URL:?set DATABASE_URL}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"; KEEP_DAYS="${KEEP_DAYS:-14}"
URL="${DATABASE_URL/postgresql+psycopg:/postgresql:}"   # SQLAlchemy URL → libpq URL
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"; OUT="$BACKUP_DIR/vibeloop-$STAMP.dump"
pg_dump --format=custom --compress=9 --no-owner --no-privileges --file="$OUT.part" "$URL"
mv "$OUT.part" "$OUT"
shasum -a 256 "$OUT" | awk '{print $1}' > "$OUT.sha256"
echo "backup ok: $OUT ($(du -h "$OUT" | cut -f1))"
if [[ -n "${S3_URI:-}" ]]; then aws s3 cp "$OUT" "$S3_URI/" --only-show-errors && aws s3 cp "$OUT.sha256" "$S3_URI/" --only-show-errors && echo "copied to $S3_URI"; fi
find "$BACKUP_DIR" -name 'vibeloop-*.dump*' -mtime +"$KEEP_DAYS" -delete
