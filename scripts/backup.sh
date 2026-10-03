#!/usr/bin/env bash
#
# Take one encrypted backup of a Postgres database (ADR-053).
#
#   pg_dump (custom format, zstd)  →  age (public key only)  →  file + .sha256
#                                                            →  a local folder or an S3 bucket
#
# Every location is a setting, so the same script runs on a laptop, in GitHub
# Actions or on any host:
#
#   BACKUP_DATABASE_URL    required  postgresql://… of the database to back up
#   BACKUP_AGE_RECIPIENT   required  age public key (age1…); the private key is never needed here
#   BACKUP_ENVIRONMENT     optional  first part of every name; default production
#   BACKUP_DESTINATION     optional  local (default) or s3
#   BACKUP_DIR             optional  local: the folder backups go to; default ./backups
#   BACKUP_PGSSLMODE       optional  default require; disable only for a local test database
#   BACKUP_MIN_BYTES       optional  smaller than this is refused as empty; default 10240
#   BACKUP_BUCKET, BACKUP_S3_REGION, BACKUP_S3_ENDPOINT,
#   BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY      for s3
#
# Prints the backup's path (local) or key (s3) on the last line. Exits non-zero
# on any failure, so a scheduler sees it: a failed pg_dump never leaves an
# encrypted empty file behind looking like a backup.

set -euo pipefail
source "$(dirname "$0")/lib-backup.sh"

require_env BACKUP_DATABASE_URL BACKUP_AGE_RECIPIENT
[[ $BACKUP_DATABASE_URL == postgres://* || $BACKUP_DATABASE_URL == postgresql://* ]] ||
  die "BACKUP_DATABASE_URL must start with postgresql://"
[[ $BACKUP_AGE_RECIPIENT == age1* ]] ||
  die "BACKUP_AGE_RECIPIENT must be an age public key (age1…), never the private key"

require_pg_client pg_dump
require_tool age "macOS: brew install age. Ubuntu: apt install age."

environment=${BACKUP_ENVIRONMENT:-production}
destination=${BACKUP_DESTINATION:-local}
min_bytes=${BACKUP_MIN_BYTES:-10240}

stamp=$(date -u +%Y%m%dT%H%M%SZ)
day_path=$(date -u +%Y/%m/%d)
name="$environment-$stamp.dump.age"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
file="$work/$name"

note "Dumping and encrypting $environment"
started=$SECONDS
PGSSLMODE=${BACKUP_PGSSLMODE:-require} \
  pg_dump --format=custom --compress=zstd --no-owner --no-acl \
  --dbname="$BACKUP_DATABASE_URL" |
  age --recipient "$BACKUP_AGE_RECIPIENT" >"$file"

bytes=$(size_of "$file")
((bytes >= min_bytes)) ||
  die "backup is only $bytes bytes (minimum $min_bytes): treated as empty, not kept"

sha256_of "$file" | sed "s|\$|  $name|" >"$file.sha256"
note "$name: $bytes bytes in $((SECONDS - started))s"

# A size that moved more than 50% from the last backup is worth a look: a bug
# or lost data shows up there first. A warning, not a failure: a big import is
# also a reason.
check_size() {
  local previous=$1
  [[ -n $previous && $previous -gt 0 ]] || return 0
  local change=$(((bytes - previous) * 100 / previous))
  if ((change > 50 || change < -50)); then
    echo "::warning::Backup size changed ${change}% ($previous → $bytes bytes). Check before trusting it."
    note "warning: size changed ${change}% from the previous backup"
  fi
}

case $destination in
  local)
    dir="${BACKUP_DIR:-./backups}/$environment/$day_path"
    previous_file=$(find "${BACKUP_DIR:-./backups}/$environment" -name '*.dump.age' 2>/dev/null | sort | tail -1 || true)
    [[ -n $previous_file ]] && check_size "$(size_of "$previous_file")"
    mkdir -p "$dir"
    mv "$file" "$file.sha256" "$dir/"
    echo "$dir/$name"
    ;;

  s3)
    use_s3_credentials
    base="s3://$BACKUP_BUCKET/$environment"
    previous_size=$(s3 ls "$base/daily/" --recursive | grep '\.dump\.age$' | sort | tail -1 | awk '{print $3}' || true)
    check_size "$previous_size"
    s3 cp "$file" "$base/daily/$day_path/$name" --only-show-errors
    s3 cp "$file.sha256" "$base/daily/$day_path/$name.sha256" --only-show-errors
    # The first backup of each month is also kept under monthly/, which the
    # bucket's lifecycle rule keeps for a year; daily/ is kept 30 days.
    if [[ $(date -u +%d) == 01 ]]; then
      month_path=$(date -u +%Y/%m)
      s3 cp "$file" "$base/monthly/$month_path/$name" --only-show-errors
      s3 cp "$file.sha256" "$base/monthly/$month_path/$name.sha256" --only-show-errors
    fi
    echo "$base/daily/$day_path/$name"
    ;;

  *)
    die "BACKUP_DESTINATION must be local or s3, not $destination"
    ;;
esac
