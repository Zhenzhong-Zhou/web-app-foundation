#!/bin/bash
# Runs once, on first Postgres container boot.
#
# _test  — server Jest suite; the harness truncates tables between runs.
# _e2e   — client Playwright suite; a live server reads it while the browser
#          drives. Separate from _test so one cannot truncate under the other.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE ${POSTGRES_DB}_test OWNER $POSTGRES_USER;
    CREATE DATABASE ${POSTGRES_DB}_e2e OWNER $POSTGRES_USER;
EOSQL