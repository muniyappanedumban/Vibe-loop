#!/bin/sh
# Streaming read replica: clone the primary once with pg_basebackup (into a not-yet-existing PGDATA), then run as hot standby.
# If a first clone was interrupted, delete the pg-replica volume and start again.
set -eu
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  until pg_isready -h db-primary -U replicator; do sleep 1; done
  PGPASSWORD="$REPLICATION_PASSWORD" pg_basebackup -h db-primary -U replicator -D "$PGDATA" -R -X stream -P
  chmod 700 "$PGDATA"
fi
exec postgres -c hot_standby=on -c max_standby_streaming_delay=30s -c hot_standby_feedback=on
