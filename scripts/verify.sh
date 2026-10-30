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
#                                Markdown step and the scripts' format,
#                                tests and ShellCheck, for a change of docs
#                                and scripts/ alone; what it refuses is
#                                where it runs, below
#
# Needs what each suite needs on its own: the database up
# (docker compose up -d) and ../.env. The two end-to-end suites use their
# own databases and run one after the other, never together.
#
# The API contract runs in full and with --quick, not with --docs
# (ADR-068): it regenerates server/openapi.json and client/src/api/, and
# stops if either changed, leaving the fresh files in place to commit.
# So do the table diagrams in docs/tables/ (ADR-086), which change nothing
# and stop when a page is not what the schema gives or a table is in no
# area.
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
# service the demo calls (engineering.md, Moving code). Nor npm audit
# (#268, ADR-084): it judges the registry's state that day, not the
# change, and needs the network; CI runs it after each job's tests, and
# every night.
set -euo pipefail

cd "$(dirname "$0")/.."

mode=full
case "$#:${1:-}" in
  0:) ;;
  1:--quick) mode=quick ;;
  1:--docs) mode=docs ;;
  *)
    echo "Usage: scripts/verify.sh [--quick | --docs], one at most" >&2
    exit 2
    ;;
esac

step() { printf '\n== %s\n\n' "$*"; }

# The docs workflow's check, at the version it pins, with the repository's
# .markdownlint-cli2.jsonc. The first run downloads it. Then its other
# check, scripts/check-docs.mjs, whose header says what it checks
# (ADR-086, ADR-087).
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

# One diagram per area of its tables, written from the Drizzle schema by
# `npm run diagrams` in server/, which names what differs.
diagrams() {
  step 'Table diagrams: docs/tables/ is the schema, every table in an area'
  (cd server && npm run diagrams -- --check)
}

# The scripts' format, by the Prettier both packages pin, here the
# server's, with Prettier's defaults, since no .prettierrc covers scripts/;
# the root's .prettierignore leaves out scripts/fixtures/.
# Then their own tests, on Node's runner (node --test finds each
# *.test.mjs): scripts/ sits outside both packages, so neither one's Vitest
# runs them. i18n-review.test.mjs uses both packages' node_modules.
# Then ShellCheck over every shell script, server/scripts/ among them, in
# Docker as oasdiff runs (ADR-088).
scripts_tests() {
  step 'Scripts: their format and their own tests'
  server/node_modules/.bin/prettier --check scripts/
  node --test scripts/

  step 'Scripts: ShellCheck over every shell script'
  may_skip 'CI runs it.' scripts/check-shell.sh
}

# A check that exits 3 when it cannot run, Docker not running or offline,
# having said why: reported and gone on from, with where it runs instead,
# said here since in CI it would not be true. Any other failure stops here.
#
#   may_skip <where it runs instead> <command>...
may_skip() {
  local instead="$1" status=0
  shift
  "$@" || status=$?
  if [[ $status -eq 3 ]]; then
    echo "Skipped, as it says above. $instead"
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
  local no_base="Skipped: no $main to compare with. git fetch origin main, then run again."

  step 'Against origin/main: a breaking API change raises the revision'
  if [[ -z "$base" ]]; then
    echo "$no_base"
  else
    may_skip 'CI runs it on the pull request.' \
      scripts/check-api-breaking.sh "$base"
  fi

  step 'Against origin/main: new migrations leave the running release working'
  if [[ -z "$base" ]]; then
    echo "$no_base"
  else
    may_skip 'CI runs it on the pull request.' \
      scripts/check-migrations.sh "$base"
  fi

  step 'Against origin/main: every commit by a real identity'
  if [[ -z "$base" ]]; then
    echo "$no_base"
  else
    scripts/check-authors.sh "$main..HEAD"
  fi
}

# --docs stands in for --quick only when the docs' checks are all a change
# needs (ADR-086): every uncommitted change, staged or not, and every new
# file git does not ignore, is a .md file or in scripts/, and none is in
# client/ or docs/tables/. client/ is refused even for Markdown: the Help
# guides in client/src/help/guides/ are the app's content, which
# client/src/help/guides.test.ts checks and --docs does not run. So is
# docs/tables/: its pages are written from the schema, which
# `npm run diagrams -- --check` checks and --docs does not run. Anything
# else, it names and stops, each file indented as it is printed. The
# Markdown step already runs adr-index.mjs's --check, through
# check-docs.mjs.
if [[ $mode == docs ]]; then
  others="$(
    {
      git -c core.quotePath=false diff --name-only --no-renames HEAD
      git -c core.quotePath=false ls-files --others --exclude-standard
    } | awk '/^client\/|^docs\/tables\// || !/\.md$|^scripts\//' |
      sort -u | sed 's/^/  /'
  )"
  if [[ -n "$others" ]]; then
    echo 'Changed, and not what --docs checks (Markdown outside client/ and docs/tables/, and scripts/):' >&2
    echo "$others" >&2
    echo 'Run scripts/verify.sh --quick instead.' >&2
    exit 1
  fi
fi

markdown

if [[ $mode == docs ]]; then
  scripts_tests
elif [[ $mode == quick ]]; then
  step 'Server: format, lint, types, checks, build, unit tests'
  (cd server && npm run format:check && npm run lint:ci && npm run typecheck \
    && npm run checks && npm run build && npm test)

  contract
  diagrams
  scripts_tests
  against_main

  step 'Client: format, lint, catalogues, build, unit tests'
  (cd client && npm run verify)
else
  step 'Server: format, lint, types, checks, build, unit and e2e tests'
  (cd server && npm run verify)

  contract
  diagrams
  scripts_tests
  against_main

  step 'Client: format, lint, catalogues, build, unit tests, Playwright'
  (cd client && npm run verify:all)
fi

step 'All passed'
