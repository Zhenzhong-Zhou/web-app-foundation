#!/usr/bin/env bash
#
# Each migration added since the base, through squawk (ADR-081): a
# migration runs while the previous release still serves, so it leaves
# working what that release reads. server/.squawk.toml says which rules
# hold, which are off and why, and how a statement the running release
# does not read is let through.
#
#     scripts/check-migrations.sh            # against origin/main
#     scripts/check-migrations.sh <ref>      # against another commit
#
# Added means in this tree and not in the base's: committed, staged or
# not yet added, so a migration just generated is checked before its
# commit. Run through npx at a pinned version, as the Markdown check runs
# markdownlint-cli2. CI runs it on pull requests, against main as the
# change merges into it (ci.yml, against-main); scripts/verify.sh runs it
# too.
#
# Written for the bash that ships with macOS (3.2).

set -euo pipefail

cd "$(dirname "$0")/.."

base="${1:-origin/main}"
migrations='server/src/database/migrations/*.sql'

# Migration file names hold no spaces, so one per line is safe to split.
added="$(
  {
    git diff --name-only --no-renames --diff-filter=A "$base" -- "$migrations"
    git ls-files --others --exclude-standard -- "$migrations"
  } | sort -u
)"

if [[ -z "$added" ]]; then
  echo "No migration added since $base."
  exit 0
fi

# 2.68.0, released on 8 October 2026.
# shellcheck disable=SC2086
npx --yes squawk-cli@2.68.0 --config server/.squawk.toml $added
