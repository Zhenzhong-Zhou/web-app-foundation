#!/usr/bin/env bash
#
# Every shell script in scripts/, scripts/hooks/ and server/scripts/,
# through ShellCheck, a linter for shell scripts (ADR-088), at its default
# strictness: every level of finding, down to style. A finding it is wrong
# about is turned off on its line, with the reason on the line above, as
# the scripts' other disables carry one.
#
#     scripts/check-shell.sh
#
# Run from a pinned container image rather than installed, so it needs
# Docker, as check-api-breaking.sh runs oasdiff. CI runs it (ci.yml, the
# server job); scripts/verify.sh runs it in every mode where Docker is up.
#
# -x follows each `source` into the file it reads, and -P SCRIPTDIR looks
# for that file in the sourcing script's own folder, where the backup
# scripts keep lib-backup.sh.
#
# Exits 0 when nothing is found; 1 when something is, each finding named
# with its file and line, or when ShellCheck could not read a script; 3
# when the check cannot run, the image neither here nor to be fetched,
# which scripts/verify.sh reports and goes on from.
#
# Written for the bash that ships with macOS (3.2).

set -euo pipefail

cd "$(dirname "$0")/.."

# v0.11.0, released on 4 August 2025; the digest keeps the tag from
# moving under it, and names one image for both the Mac's arm64 and CI's
# amd64.
image='koalaman/shellcheck:v0.11.0@sha256:61862eba1fcf09a484ebcc6feea46f1782532571a34ed51fedf90dd25f925a8d'

if ! docker image inspect "$image" > /dev/null 2>&1 \
  && ! docker pull --quiet "$image" > /dev/null 2>&1; then
  echo 'Could not run: the ShellCheck image is neither here nor to be fetched' >&2
  echo '(Docker not answering, offline, or the registry down). CI runs it.' >&2
  exit 3
fi

# The hook has no extension, so its folder is taken whole.
files=(scripts/*.sh scripts/hooks/* server/scripts/*.sh)

# No network, and the repository read only: nothing else is wanted. From
# its root, so each finding names the script's path there.
status=0
docker run --rm --network none -v "$PWD:/mnt:ro" -w /mnt "$image" \
  -x -P SCRIPTDIR "${files[@]}" || status=$?

if [[ $status -le 1 ]]; then
  exit "$status"
fi

# ShellCheck's own 3 is a flag it does not know, not "cannot run".
echo "ShellCheck could not check the scripts (exit $status)." >&2
exit 1
