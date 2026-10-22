#!/usr/bin/env bash
#
# A breaking API change must raise the revision (ADR-081). Compares the
# base's server/openapi.json with this tree's using oasdiff's breaking
# check. Breaking changes with info.version where the base has it fail,
# naming the changes; with the revision raised they pass, and are listed,
# since every tab still open will be refused until it reloads.
#
#     scripts/check-api-breaking.sh            # against origin/main
#     scripts/check-api-breaking.sh <ref>      # against another commit
#
# Run from a pinned container image rather than installed, so it needs
# Docker. CI runs it on pull requests, against main as the change merges
# into it (ci.yml, against-main); scripts/verify.sh runs it where Docker
# is up. Reads server/openapi.json as it is on disk, so after an API
# change run `npm run api` first, as the contract check asks.

set -euo pipefail

cd "$(dirname "$0")/.."

base="${1:-origin/main}"

# v1.33.0, released on 1 October 2026; the digest keeps the tag from
# moving under it.
image='tufin/oasdiff:v1.33.0@sha256:6263a96dd2ef0726c54e21fea9b8e1607eac4841add0079324b424c1f52b819c'

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

git show "$base:server/openapi.json" > "$work/base.json"
cp server/openapi.json "$work/revision.json"

# oasdiff calls a request property or parameter removed a warning, since
# most APIs ignore one they do not know. This one refuses it (the
# validation pipe's forbidNonWhitelisted), so an old tab that still sends
# it gets a 400: ADR-080's roleId was one.
printf '%s\n' \
  'request-property-removed err' \
  'request-parameter-removed err' > "$work/levels.txt"

version() {
  node -p 'require(process.argv[1]).info.version' "$1"
}
base_version="$(version "$work/base.json")"
revision_version="$(version "$work/revision.json")"

# No network: both documents are local, and nothing else is wanted.
status=0
docker run --rm --network none -v "$work:/specs:ro" "$image" \
  breaking /specs/base.json /specs/revision.json \
  --severity-levels /specs/levels.txt --fail-on ERR || status=$?

if [[ $status -eq 0 ]]; then
  exit 0
fi
if [[ $status -ne 1 ]]; then
  echo "oasdiff could not compare the documents (exit $status)." >&2
  exit "$status"
fi

if [[ "$revision_version" != "$base_version" ]]; then
  echo "Breaking, with info.version raised from $base_version to $revision_version:"
  echo 'every tab still open is refused until it reloads (ADR-081).'
  exit 0
fi

echo "Breaking, with info.version still $revision_version. Raise API_REVISION in" >&2
echo 'server/src/common/api-revision.ts and run npm run api, or keep the old' >&2
echo 'shape working (ADR-081).' >&2
exit 1
