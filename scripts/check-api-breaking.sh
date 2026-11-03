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
# is up, against where the branch left main. Reads server/openapi.json as
# it is on disk, so after an API change run `npm run api` first, as the
# contract check asks.
#
# A change reviewed and found harmless to an open tab, such as a limit the
# API always held now written into the document, goes in
# server/openapi-breaking-accepted.txt with why; oasdiff then lets it
# through. A new permission needs no line there: this script lets it
# through itself (#340), as said below.
#
# Exits 0 when nothing breaks an open tab, or the revision was raised for
# it; 1 when something does and the revision is where it was; 3 when the
# check cannot run, the image neither here nor to be fetched, which
# scripts/verify.sh reports and goes on from.

set -euo pipefail

cd "$(dirname "$0")/.."

base="${1:-origin/main}"

# v1.33.0, released on 1 October 2026; the digest keeps the tag from
# moving under it.
image='tufin/oasdiff:v1.33.0@sha256:6263a96dd2ef0726c54e21fea9b8e1607eac4841add0079324b424c1f52b819c'

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

if ! docker image inspect "$image" > /dev/null 2>&1 \
  && ! docker pull --quiet "$image" > /dev/null 2>&1; then
  echo 'Could not run: the oasdiff image is neither here nor to be fetched' >&2
  echo '(Docker not answering, offline, or the registry down).' >&2
  exit 3
fi

git show "$base:server/openapi.json" > "$work/base.json"
cp server/openapi.json "$work/revision.json"
cp server/openapi-breaking-accepted.txt "$work/accepted.txt"

# oasdiff calls a request property or parameter removed a warning, since
# most APIs ignore one they do not know. This one refuses it (the
# validation pipe's forbidNonWhitelisted), so an old tab that still sends
# it gets a 400: ADR-080's roleId was one. It calls an optional property
# removed from a response information only, and so a rename of one: the
# client reads every field it declares, and an old tab would read the
# removed one as missing, the misread #175 describes.
printf '%s\n' \
  'request-property-removed err' \
  'request-parameter-removed err' \
  'response-optional-property-removed err' > "$work/levels.txt"

version() {
  node -p 'require(process.argv[1]).info.version' "$1"
}
base_version="$(version "$work/base.json")"
revision_version="$(version "$work/revision.json")"

# A new permission reaches every response that lists permissions (the
# session's, each role's, the catalogue's), and oasdiff counts it breaking
# in each, since a client that switches on an enum can meet a value it
# does not know. An open tab cannot be harmed by one: it asks useCan only
# of the permissions it knows, says only those under Your access, shows a
# box only for those, and saves a role from the catalogue the server
# sends, so a role it saves keeps the new one (#340, ADR-008's amendment
# of November 2026). So a response-property-enum-value-added whose value
# is one of the Permission schema's is let through, each written to the
# accepted list in oasdiff's own words; a value added to any other enum,
# an order's status among them, still fails. oasdiff gives the value only
# in those words, so an image that words it otherwise lets none through:
# a false red, never a false green.
docker run --rm --network none -v "$work:/specs:ro" "$image" \
  breaking /specs/base.json /specs/revision.json --format json > "$work/changes.json"
# Single quotes on purpose: the JavaScript's ${} and backticks are node's.
# shellcheck disable=SC2016
node -e '
  const read = (file) => JSON.parse(require("fs").readFileSync(file, "utf8"));
  const [changes, revision] = process.argv.slice(1).map(read);
  const permissions = new Set(revision.components?.schemas?.Permission?.enum ?? []);
  for (const change of changes ?? []) {
    const value = /^added the new `([^`]+)` enum value /.exec(change.text)?.[1];
    if (change.id === "response-property-enum-value-added" && permissions.has(value)) {
      console.log(`${change.operation} ${change.path} ${change.text} -- a new permission`);
    }
  }
' "$work/changes.json" "$work/revision.json" >> "$work/accepted.txt"

# No network: both documents are local, and nothing else is wanted.
status=0
docker run --rm --network none -v "$work:/specs:ro" "$image" \
  breaking /specs/base.json /specs/revision.json \
  --severity-levels /specs/levels.txt --err-ignore /specs/accepted.txt \
  --fail-on ERR || status=$?

if [[ $status -eq 0 ]]; then
  exit 0
fi
if [[ $status -ne 1 ]]; then
  echo "oasdiff could not compare the documents (exit $status)." >&2
  exit "$status"
fi

# Before ADR-081 the document's version was 1, with no revision: the
# client sent none, and the API serves a request without one as it always
# has. Raising it from there refuses no tab.
if [[ ! "$base_version" =~ ^1\.[0-9]+$ && "$revision_version" != "$base_version" ]]; then
  echo "Breaking, with info.version $revision_version where the base has no API"
  echo "revision ($base_version): its tabs send none and are served as before,"
  echo 'so each change above reaches them as it would have before ADR-081.'
  exit 0
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
