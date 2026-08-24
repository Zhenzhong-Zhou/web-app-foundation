#!/bin/bash
# Runs once, on first Postgres container boot.
# Creates the separate database used by integration tests.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE ${POSTGRES_DB}_test OWNER $POSTGRES_USER;
EOSQL