# Shared by backup.sh, restore.sh and backup-latest.sh (ADR-053). Sourced,
# never run: it only defines functions.

die() {
  echo "error: $*" >&2
  exit 1
}

note() {
  echo "==> $*" >&2
}

require_env() {
  local name
  for name in "$@"; do
    [[ -n "${!name:-}" ]] || die "$name is not set (see docs/runbooks/restore.md)"
  done
}

require_tool() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is not installed. $2"
}

# pg_dump and pg_restore must be the server's major version or newer: an
# older client refuses a newer server. Production runs Postgres 18.
require_pg_client() {
  local tool=$1 major
  require_tool "$tool" "macOS: brew install libpq && brew link --force libpq. Ubuntu: install postgresql-client-18 from apt.postgresql.org."
  major=$("$tool" --version | sed -E 's/[^0-9]*([0-9]+).*/\1/')
  ((major >= 18)) || die "$tool is version $major; Postgres 18 needs 18 or newer"
}

# sha256sum on Linux, shasum on macOS: the same digest, two names.
sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

# Bytes, the same on Linux (GNU stat) and macOS (BSD stat).
size_of() {
  wc -c <"$1" | tr -d ' '
}

# aws with the endpoint added when one is set: AWS itself needs none, and
# Backblaze, R2 and MinIO each need theirs. Credentials come from the
# standard AWS_* variables, mapped from BACKUP_S3_* by the caller.
s3() {
  if [[ -n "${BACKUP_S3_ENDPOINT:-}" ]]; then
    aws --endpoint-url "$BACKUP_S3_ENDPOINT" s3 "$@"
  else
    aws s3 "$@"
  fi
}

use_s3_credentials() {
  require_env BACKUP_BUCKET BACKUP_S3_REGION BACKUP_S3_ACCESS_KEY_ID BACKUP_S3_SECRET_ACCESS_KEY
  require_tool aws "Install the AWS CLI (it talks to any S3-compatible store)."
  export AWS_ACCESS_KEY_ID=$BACKUP_S3_ACCESS_KEY_ID
  export AWS_SECRET_ACCESS_KEY=$BACKUP_S3_SECRET_ACCESS_KEY
  export AWS_DEFAULT_REGION=$BACKUP_S3_REGION
}

# Seconds since the epoch for a backup's stamp, 20261003T100000Z, on GNU
# date (Linux) and BSD date (macOS) alike.
epoch_of_stamp() {
  local stamp=$1
  date -u -d "${stamp:0:4}-${stamp:4:2}-${stamp:6:2} ${stamp:9:2}:${stamp:11:2}:${stamp:13:2}" +%s 2>/dev/null ||
    date -u -j -f "%Y%m%dT%H%M%SZ" "$stamp" +%s
}

# The stamp inside a backup's name: production-20261003T100000Z.dump.age.
stamp_of() {
  sed -E 's/.*-([0-9]{8}T[0-9]{6}Z).*/\1/' <<<"$1"
}
