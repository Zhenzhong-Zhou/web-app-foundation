#!/usr/bin/env bash
#
# Copy every stored file into the backup bucket (ADR-059).
#
#   waf-files  →  this machine  →  waf-backups/files/
#
# A file never changes, so a backup is a copy of whatever the backup does not
# hold yet: nothing there is overwritten or deleted. Two logins, never one:
# the files bucket is read with its own read-only key, the backup bucket is
# written with the backup's. The lifecycle rule on files/ ends each copy after
# 31 days and the next night's run writes it again, so every live file always
# has one, and a purged file's copy lasts a month.
#
#   BACKUP_FILES_BUCKET                 required  the files bucket, waf-files
#   BACKUP_FILES_S3_ACCESS_KEY_ID,
#   BACKUP_FILES_S3_SECRET_ACCESS_KEY   required  its read-only key
#   BACKUP_FILES_PREFIX                 optional  where copies go; default files/
#   BACKUP_BUCKET, BACKUP_S3_REGION, BACKUP_S3_ENDPOINT,
#   BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY   the backup bucket, as for backup.sh
#
# Both buckets are reached through BACKUP_S3_ENDPOINT: they are one account.
# Every object is read each night, which is nothing at today's size and free
# of egress on R2; once the files outgrow a runner's disk, list both sides and
# copy only the difference instead.
#
# Prints how many objects the files bucket holds on the last line.

set -euo pipefail
source "$(dirname "$0")/lib-backup.sh"

require_env BACKUP_FILES_BUCKET BACKUP_FILES_S3_ACCESS_KEY_ID BACKUP_FILES_S3_SECRET_ACCESS_KEY
use_s3_credentials
prefix=${BACKUP_FILES_PREFIX:-files/}

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

note "Reading s3://$BACKUP_FILES_BUCKET with its read-only key"
(
  export AWS_ACCESS_KEY_ID=$BACKUP_FILES_S3_ACCESS_KEY_ID
  export AWS_SECRET_ACCESS_KEY=$BACKUP_FILES_S3_SECRET_ACCESS_KEY
  s3 sync "s3://$BACKUP_FILES_BUCKET" "$work" --only-show-errors
)

count=$(find "$work" -type f | wc -l | tr -d ' ')
note "Copying into s3://$BACKUP_BUCKET/$prefix what it does not hold, of $count objects"
# --size-only: a file never changes, so a copy already there with its size is
# that file. Without --delete: a purged file's copy ends by the lifecycle rule.
s3 sync "$work" "s3://$BACKUP_BUCKET/$prefix" --size-only --only-show-errors

echo "$count"
