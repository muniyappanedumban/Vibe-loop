#!/bin/sh
# Runs once on first start of the primary (docker-entrypoint-initdb.d): replication role, hba rule, role-level timeout.
set -eu
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<SQL
CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD '${REPLICATION_PASSWORD}';
ALTER ROLE "${POSTGRES_USER}" SET statement_timeout = '15s';
SQL
echo "host replication replicator all scram-sha-256" >> "$PGDATA/pg_hba.conf"
