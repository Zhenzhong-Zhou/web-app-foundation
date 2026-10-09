#!/usr/bin/env bash
#
# Every file a restored database knows of has its copy in the backup bucket
# (ADR-059). Run by the monthly restore drill after restore.sh; by hand after
# a real restore, before pointing the server at it.
#
#   scripts/check-files-backup.sh <restored database URL>
#
#   BACKUP_BUCKET, BACKUP_S3_REGION, BACKUP_S3_ENDPOINT,
#   BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY   a key that can list the backup bucket
#   BACKUP_FILES_PREFIX     optional  where copies are; default files/
#   RESTORE_PGSSLMODE       optional  default require; disable for a local database
#
# Released files are left out: they may be purged, and their copies with
# them. The dump and the copy are taken in that order on the same night, so
# every file in the dump was copied after it. Exits non-zero, listing the
# first few, when any file has no copy.

set -euo pipefail
source "$(dirname "$0")/lib-backup.sh"

[[ $# -eq 1 ]] || die "usage: scripts/check-files-backup.sh <restored database URL>"
database=$1
use_s3_credentials
require_pg_client psql
prefix=${BACKUP_FILES_PREFIX:-files/}
export PGSSLMODE=${RESTORE_PGSSLMODE:-require}

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

if [[ $(psql "$database" -At -c "select to_regclass('public.files') is not null") != t ]]; then
  note "This backup predates file storage: nothing to check"
  exit 0
fi

psql "$database" -At -v ON_ERROR_STOP=1 -c "
  -- The owner: the organization, or for a photo the person (ADR-063);
  -- read through to_jsonb so a backup from before user_id still checks.
  select coalesce(f.organization_id::text, to_jsonb(f)->>'user_id')
    || '/' || f.id || '/' || size
  from files f, jsonb_object_keys(f.sizes) as size
  where f.released_at is null" | LC_ALL=C sort >"$work/expected"

# `aws s3 ls --recursive` prints date, time, size and key; keys have no spaces.
s3 ls "s3://$BACKUP_BUCKET/$prefix" --recursive |
  awk '{ print $4 }' |
  sed "s|^$prefix||" |
  LC_ALL=C sort >"$work/held"

expected=$(wc -l <"$work/expected" | tr -d ' ')
missing=$(LC_ALL=C comm -23 "$work/expected" "$work/held")
if [[ -n $missing ]]; then
  echo "$missing" | head -5 >&2
  die "$(echo "$missing" | wc -l | tr -d ' ') of $expected stored objects have no copy in s3://$BACKUP_BUCKET/$prefix"
fi

note "All $expected stored objects have their copy"
