#!/usr/bin/env bash
# What CI runs, on this machine and in CI's order: the Markdown check, the
# server's checks and both its suites, the tests of scripts/ itself, then
# the client's checks, unit tests and the Playwright suite. Stops at the
# first failure, so the last heading printed is what failed.
#
#   scripts/verify.sh            everything, about as long as CI takes
#   scripts/verify.sh --quick    format, lint, types, checks, build and unit
#                                tests; no end-to-end suites
#   scripts/verify.sh --docs     the docs' checks alone, in seconds: the
#                                Markdown step and the scripts' format and
#                                tests; it refuses, naming the files, when the
#                                uncommitted changes touch anything but .md
#                                files and scripts/, or anything in client/,
#                                which need --quick
#
# client/ is refused even for Markdown: the Help guides in
# client/src/help/guides/ are the app's content, which
# client/src/help/guides.test.ts checks and --docs does not run.
#
# Needs what each suite needs on its own: the database up
# (docker compose up -d) and ../.env. The two end-to-end suites use their
# own databases and run one after the other, never together.
#
# The API contract runs in both modes (ADR-068): it regenerates
# server/openapi.json and client/src/api/, and stops if either changed,
# leaving the fresh files in place to commit.
#
# So do the three checks CI makes of a pull request against main, here
# against origin/main as last fetched: a breaking API change raises the
# revision (oasdiff, in Docker), each new migration leaves the running
# release working (squawk; both ADR-081), and no commit the branch adds
# carries a placeholder identity (ADR-082). Each says why when it cannot
# run.
#
# Not run here, though CI runs it: npm run seed:demo, which would add a demo
# organization to the dev database on every run. Run it after changing a
# service the demo calls (engineering.md, Moving code).
set -euo pipefail

cd "$(dirname "$0")/.."

quick=false
docs=false
if [[ "${1:-}" == "--quick" ]]; then
  quick=true
elif [[ "${1:-}" == "--docs" ]]; then
  docs=true
elif [[ $# -gt 0 ]]; then
  echo "Usage: scripts/verify.sh [--quick | --docs]" >&2
  exit 2
fi

step() { printf '\n== %s\n\n' "$*"; }

# The docs workflow's check, at the version it pins, with the repository's
# .markdownlint-cli2.jsonc. The first run downloads it. Then its other
# check, scripts/check-docs.mjs: links, ADR front matter and the index
# (ADR-086); paths written as code, the rules files' citations and
# .claude/rules/'s patterns, and the notice against origin/main (ADR-087).
markdown() {
  step 'Markdown: every .md file, as the docs workflow checks it'
  npx --yes markdownlint-cli2@0.23.3
  node scripts/check-docs.mjs
}

contract() {
  step 'API contract: the committed document and client types are current'
  (cd server && npm run api)
  local changed
  changed="$(git status --porcelain -- server/openapi.json client/src/api)"
  if [[ -n "$changed" ]]; then
    echo "$changed"
    echo 'The API changed without its regenerated files. Commit them' >&2
    echo '(conventions.md, "The API contract").' >&2
    exit 1
  fi
}

# The scripts' format, by the Prettier both packages pin, here the
# server's, with Prettier's defaults, since no .prettierrc covers scripts/;
# CI runs their tests (ci.yml) but not this. Then their own tests, on
# Node's runner (node --test finds each *.test.mjs): scripts/ sits outside
# both packages, so neither one's Vitest runs them. i18n-review.test.mjs
# uses both packages' node_modules.
scripts_tests() {
  step 'Scripts: their format and their own tests'
  server/node_modules/.bin/prettier --check scripts/
  node --test scripts/
}

# A check that exits 3 when it cannot run, having said why: reported and
# gone on from, as Docker not running is. Any other failure stops here.
may_skip() {
  local status=0
  "$@" || status=$?
  if [[ $status -eq 3 ]]; then
    echo 'Skipped, as it says above.'
    return 0
  fi
  return "$status"
}

against_main() {
  local main=origin/main base
  # Where this branch left main, not main's tip: a branch behind main would
  # see what main has added since as taken away, and be told to raise the
  # API revision for nothing. CI compares with main as the change merges.
  base="$(git merge-base "$main" HEAD 2> /dev/null || true)"

  step 'Against origin/main: a breaking API change raises the revision'
  if [[ -z "$base" ]]; then
    echo "Skipped: no $main to compare with. git fetch origin main, then run again."
  elif ! docker info > /dev/null 2>&1; then
    echo 'Skipped: Docker is not running, and oasdiff runs in a container.'
    echo 'CI runs it on the pull request.'
  else
    may_skip scripts/check-api-breaking.sh "$base"
  fi

  step 'Against origin/main: new migrations leave the running release working'
  if [[ -z "$base" ]]; then
    echo "Skipped: no $main to compare with. git fetch origin main, then run again."
  else
    may_skip scripts/check-migrations.sh "$base"
  fi

  step 'Against origin/main: every commit by a real identity'
  if [[ -z "$base" ]]; then
    echo "Skipped: no $main to compare with. git fetch origin main, then run again."
  else
    scripts/check-authors.sh "$main..HEAD"
  fi
}

# --docs stands in for --quick only when the docs' checks are all a change
# needs (ADR-086): every uncommitted change, staged or not, and every new
# file git does not ignore, is a .md file or in scripts/, and none is in
# client/ (above). The Markdown step already runs adr-index.mjs's --check,
# through check-docs.mjs.
if $docs; then
  others="$(
    {
      git -c core.quotePath=false diff --name-only --no-renames HEAD
      git -c core.quotePath=false ls-files --others --exclude-standard
    } | awk '/^client\// || !/\.md$|^scripts\//' | sort -u
  )"
  if [[ -n "$others" ]]; then
    echo 'Changed, and not what --docs checks (Markdown outside client/, and scripts/):' >&2
    sed 's/^/  /' <<< "$others" >&2
    echo 'Run scripts/verify.sh --quick instead.' >&2
    exit 1
  fi
  markdown
  scripts_tests
  step 'All passed'
  exit 0
fi

markdown

if $quick; then
  step 'Server: format, lint, types, checks, build, unit tests'
  (cd server && npm run format:check && npm run lint:ci && npm run typecheck \
    && npm run checks && npm run build && npm test)

  contract
  scripts_tests
  against_main

  step 'Client: format, lint, catalogues, build, unit tests'
  (cd client && npm run verify)
else
  step 'Server: format, lint, types, checks, build, unit and e2e tests'
  (cd server && npm run verify)

  contract
  scripts_tests
  against_main

  step 'Client: format, lint, catalogues, build, unit tests, Playwright'
  (cd client && npm run verify:all)
fi

step 'All passed'
