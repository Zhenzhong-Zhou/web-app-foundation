#!/usr/bin/env bash
#
# Find the newest backup, say how old it is, and optionally fetch it
# (ADR-053). The daily freshness check and the monthly drill both start here.
#
#   scripts/backup-latest.sh [--max-age-hours N] [--download DIR]
#
#   --max-age-hours N  exit 1 if the newest backup is older than N hours
#   --download DIR     fetch the backup and its .sha256 into DIR, print the path
#
#   BACKUP_ENVIRONMENT  optional; default production
#   BACKUP_DESTINATION  where backup.sh put them: local, s3 or artifact
#   BACKUP_DIR          local: the folder; default ./backups
#   BACKUP_BUCKET, BACKUP_S3_*                       s3
#   GH_TOKEN, GITHUB_REPOSITORY                      artifact (set by Actions)
#
# Age comes from the stamp in the backup's name, the moment it was taken,
# whichever store holds it.

set -euo pipefail
source "$(dirname "$0")/lib-backup.sh"

max_age_hours=
download=
while [[ $# -gt 0 ]]; do
  case $1 in
    --max-age-hours) max_age_hours=$2; shift 2 ;;
    --download) download=$2; shift 2 ;;
    *) die "unknown option $1" ;;
  esac
done

environment=${BACKUP_ENVIRONMENT:-production}
destination=${BACKUP_DESTINATION:-local}

case $destination in
  local)
    latest=$(find "${BACKUP_DIR:-./backups}/$environment" -name '*.dump.age' 2>/dev/null | sort | tail -1 || true)
    [[ -n $latest ]] || die "no backups under ${BACKUP_DIR:-./backups}/$environment"
    name=$(basename "$latest")
    ;;

  s3)
    use_s3_credentials
    base="s3://$BACKUP_BUCKET/$environment"
    key=$(s3 ls "$base/daily/" --recursive | grep '\.dump\.age$' | sort -k4 | tail -1 | awk '{print $4}' || true)
    [[ -n $key ]] || die "no backups under $base/daily/"
    name=$(basename "$key")
    ;;

  artifact)
    require_env GH_TOKEN GITHUB_REPOSITORY
    require_tool gh "GitHub's CLI, present on Actions runners."
    # Artifacts named backup-<environment>-<stamp>, newest first, unexpired.
    read -r artifact_id artifact_name < <(
      gh api "repos/$GITHUB_REPOSITORY/actions/artifacts?per_page=100" --paginate \
        --jq ".artifacts[] | select(.expired | not) | select(.name | startswith(\"backup-$environment-\")) | \"\(.id) \(.name)\"" |
        sort -k2 | tail -1
    ) || true
    [[ -n ${artifact_id:-} ]] || die "no unexpired backup-$environment-* artifacts"
    name="${artifact_name#backup-}.dump.age"
    ;;

  *)
    die "BACKUP_DESTINATION must be local, s3 or artifact, not $destination"
    ;;
esac

stamp=$(stamp_of "$name")
age_hours=$((($(date -u +%s) - $(epoch_of_stamp "$stamp")) / 3600))
note "Newest backup: $name, ${age_hours}h old"

if [[ -n $max_age_hours ]] && ((age_hours > max_age_hours)); then
  echo "::error::The newest backup is ${age_hours}h old (limit ${max_age_hours}h). Check the Backup workflow."
  die "newest backup is ${age_hours}h old, over the ${max_age_hours}h limit"
fi

if [[ -n $download ]]; then
  mkdir -p "$download"
  case $destination in
    local) cp "$latest" "$latest.sha256" "$download/" ;;
    s3)
      s3 cp "s3://$BACKUP_BUCKET/$key" "$download/$name" --only-show-errors
      s3 cp "s3://$BACKUP_BUCKET/$key.sha256" "$download/$name.sha256" --only-show-errors
      ;;
    artifact)
      gh api "repos/$GITHUB_REPOSITORY/actions/artifacts/$artifact_id/zip" >"$download/artifact.zip"
      unzip -q -o "$download/artifact.zip" -d "$download"
      rm "$download/artifact.zip"
      ;;
  esac
  [[ -f "$download/$name" ]] || die "fetched, but $name is not in $download"
  echo "$download/$name"
fi
