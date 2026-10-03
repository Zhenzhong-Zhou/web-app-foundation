#!/usr/bin/env bash
#
# Restore one encrypted backup into an EMPTY database, then check it
# (ADR-053). Used by the monthly drill and by a person following
# docs/runbooks/restore.md.
#
#   scripts/restore.sh <backup.dump.age> <target-database-url>
#
#   BACKUP_AGE_IDENTITY_FILE  path to the age private key file, or
#   BACKUP_AGE_IDENTITY       the private key itself (CI secrets); one is required
#   RESTORE_PGSSLMODE         optional; default prefer
#   RESTORE_CONFIRM           required when the target is not on this machine:
#                             the target database's name, typed out, so a
#                             restore never lands somewhere by accident
#
# Refuses a database that already has tables: restoring over live data would
# erase every organization's work since the backup (ADR-053). To recover one
# organization, restore into a scratch database and copy its rows back.

set -euo pipefail
source "$(dirname "$0")/lib-backup.sh"

[[ $# -eq 2 ]] || die "usage: scripts/restore.sh <backup.dump.age> <target-database-url>"
backup=$1
target=$2

[[ -f $backup ]] || die "no such backup: $backup"
[[ $target == postgres://* || $target == postgresql://* ]] ||
  die "the target must be a postgresql:// URL"

require_pg_client pg_restore
require_tool psql "It comes with pg_restore."
require_tool age "macOS: brew install age. Ubuntu: apt install age."

export PGSSLMODE=${RESTORE_PGSSLMODE:-prefer}

# The private key: a file a person points at, or a secret CI writes to a
# file only this process can read, removed on exit.
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
if [[ -n ${BACKUP_AGE_IDENTITY_FILE:-} ]]; then
  identity=$BACKUP_AGE_IDENTITY_FILE
elif [[ -n ${BACKUP_AGE_IDENTITY:-} ]]; then
  identity="$work/identity.txt"
  (umask 077 && printf '%s\n' "$BACKUP_AGE_IDENTITY" >"$identity")
else
  die "set BACKUP_AGE_IDENTITY_FILE (a key file) or BACKUP_AGE_IDENTITY (the key)"
fi

# 1. The file is exactly what was written.
if [[ -f "$backup.sha256" ]]; then
  expected=$(cut -d' ' -f1 <"$backup.sha256")
  actual=$(sha256_of "$backup")
  [[ $expected == "$actual" ]] || die "checksum mismatch: the backup was changed or damaged"
  note "Checksum OK"
else
  die "no $backup.sha256 beside the backup; refusing an unverified file"
fi

# 2. The target is on this machine, or the person typed its name.
host=$(sed -E 's|^[a-z]+://([^@/]*@)?([^:/?]+).*|\2|' <<<"$target")
database=$(sed -E 's|^[a-z]+://[^/]+/([^?]+).*|\1|' <<<"$target")
case $host in
  localhost | 127.0.0.1 | ::1) ;;
  *)
    [[ ${RESTORE_CONFIRM:-} == "$database" ]] ||
      die "$host is not this machine. Set RESTORE_CONFIRM=$database to restore there."
    ;;
esac

# 3. The target is empty.
tables=$(psql "$target" -XAtc "select count(*) from information_schema.tables where table_schema = 'public'")
((tables == 0)) || die "$database already has $tables tables; restore into a new, empty database"

# 4. Restore. --exit-on-error: a half-restored database is not a backup
#    that worked.
note "Restoring into $database on $host"
started=$SECONDS
age --decrypt --identity "$identity" "$backup" |
  pg_restore --no-owner --no-acl --exit-on-error --dbname="$target"
elapsed=$((SECONDS - started))

# 5. Check what came back. Freshness is the backup's own timestamp, not the
#    newest audit row: a quiet database has none.
organizations=$(psql "$target" -XAtc "select count(*) from organizations")
migrations=$(psql "$target" -XAtc "select count(*) from drizzle.__drizzle_migrations")

journal="$(dirname "$0")/../server/src/database/migrations/meta/_journal.json"
if [[ -f $journal ]] && command -v node >/dev/null 2>&1; then
  expected_migrations=$(node -e "console.log(require(process.argv[1]).entries.length)" "$(cd "$(dirname "$journal")" && pwd)/_journal.json")
  ((migrations <= expected_migrations)) ||
    die "the backup has $migrations migrations, the code knows $expected_migrations: restore with the code it was taken from"
  ((migrations == expected_migrations)) ||
    note "the backup is $((expected_migrations - migrations)) migration(s) behind the code; npm run migrate brings it up"
fi

((organizations > 0)) || die "restored, but there are no organizations: not a usable backup"

note "Restored $organizations organization(s), $migrations migrations, in ${elapsed}s"

if [[ -n ${GITHUB_STEP_SUMMARY:-} ]]; then
  {
    echo "### Restore drill"
    echo
    echo "| Backup | Organizations | Migrations | Restore time |"
    echo "|---|---|---|---|"
    echo "| $(basename "$backup") | $organizations | $migrations | ${elapsed}s |"
  } >>"$GITHUB_STEP_SUMMARY"
fi
