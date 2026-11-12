#!/usr/bin/env bash
# What CI runs, on this machine and in CI's order: the Markdown check, the
# server's checks and both its suites, the tests of scripts/ itself, then
# the client's checks, unit tests and the Playwright suite, and in full
# the specs every browser runs, in Firefox and Linux WebKit, below. Stops
# at the first failure, so the last heading printed is what failed.
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
# The end-to-end and browser parts, the Linux browsers' below among them,
# wait for another working folder's: each runs under the lock both folders
# share, scripts/one-at-a-time.mjs (ADR-089's amendment), which says each
# minute what it waits for. Format, lint, build and unit tests do not wait.
#
# The API contract runs in full and with --quick, not with --docs
# (ADR-068): it regenerates server/openapi.json and client/src/api/, and
# stops if that changed either, committed or not, leaving the fresh files
# in place to commit.
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
# The full run ends with the specs every browser runs, the accessibility
# spec and the refused PDF's page (playwright.config.ts's EVERY_ENGINE),
# in Firefox, then in Linux WebKit, neither of which a pull request's CI
# runs, since it runs Chromium alone: a failure in Firefox first met main
# (#506). Playwright's Firefox cannot start on some Macs, so it runs from
# Playwright's Linux image in Docker, as conventions.md's "Firefox on such
# a Mac" does by hand, at the client's Playwright version, and WebKit from
# the same container. The client's suite runs the Mac's WebKit, whose timing
# differs from Linux WebKit's (#232, and 5631d0d8 in conventions.md's
# "Tests").
# It needs the network, and stops the run when the container cannot start.
#
# Not run here, though CI runs it: npm run seed:demo, which would add a demo
# organization to the dev database on every run, and the check after it
# that SO-DEMO-1's History reads in order (#222). Run it after changing a
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
  # The full run's own call, for its last part under the lock: below, at
  # linux_browsers.
  1:--linux-browsers) mode=linux ;;
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

# What the regenerated files hold in the working tree, staged or not and
# committed or not, as one git tree id: HEAD's files, with those paths as
# the working tree has them, files git ignores aside (a Mac's .DS_Store).
# Written through an index of its own, the path given, so what is staged
# stays as it is.
api_tree() (
  export GIT_INDEX_FILE="$1"
  git read-tree HEAD &&
    git add --all -- server/openapi.json client/src/api &&
    git write-tree
)

# Stale when npm run api changes what the working tree holds, so files
# regenerated and not yet committed pass, and --quick passes before the
# commit that adds them (#346). Its tests, in verify.test.mjs, run the
# script with stand-ins for the other steps.
contract() {
  step 'API contract: the document and client types are what npm run api writes'
  local index before after changed
  index="$(git rev-parse --git-path verify-api-index)"
  before="$(api_tree "$index")"
  (cd server && npm run api)
  after="$(api_tree "$index")"
  rm -f "$index"
  changed="$(git diff --name-status "$before" "$after")"
  if [[ -n "$changed" ]]; then
    echo "$changed"
    echo 'npm run api changed the files above, so they were not current. Check' >&2
    echo 'what it wrote and commit it (conventions.md, "The API contract").' >&2
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

# The specs every browser runs, as each project's testMatch names them,
# in Firefox, then in WebKit, each browser in Playwright's Linux image and
# the tests on this machine, connected to it as a remote browser;
# '<loopback>' lets that browser reach this machine's localhost:5273 and
# :3100, so the session cookies stay on localhost.
# E2E_FIREFOX=1 gives the config its firefox project, which it leaves out
# on a Mac; --project=webkit leaves that project unused. One container
# serves both browsers, one run after the other, each the same call.
# The image and the playwright it runs are the version of the client's
# @playwright/test, read here, so a raise needs nothing in this file. The
# container has a name of its own and a free port, so one started by hand
# is left alone, and the trap removes it however the run ends. Its own
# logs are printed when it does not start, at once when it has exited and
# after 120 seconds when it is running and silent.
# The container and both browsers run under one hold of the lock the
# working folders share, since another folder's full run removes the
# container by its name: the full run calls this script again, as
# --linux-browsers, through scripts/one-at-a-time.mjs, in the same bash.
# When a browser's run fails, what Playwright left in client/e2e/.output/
# is copied to tmp/linux-browsers/<date-time>-<browser>/ before the next
# run clears it, and its path printed, then the run stops as before: Linux
# WebKit misses about 1 test in 500, a stall that neither memory nor CPU
# explains (#521), so the next miss is read from what its page showed.
# Linux WebKit also records a trace of each test and keeps a failed one's,
# which says what the page was still waiting for when the test gave up.
BROWSERS_CONTAINER=verify-linux-browsers

linux_browsers() {
  step "Client: the specs every browser runs, in Firefox, from Playwright's Linux image"
  local version address waited=0
  version="$(node -p "require('./client/node_modules/@playwright/test/package.json').version")"

  docker rm --force "$BROWSERS_CONTAINER" > /dev/null 2>&1 || true
  trap 'docker rm --force "$BROWSERS_CONTAINER" > /dev/null 2>&1 || true' EXIT
  if ! docker run --detach --init --name "$BROWSERS_CONTAINER" \
    --publish 127.0.0.1::3333 --ipc=host \
    "mcr.microsoft.com/playwright:v$version-noble" \
    /bin/sh -c "cd /tmp && npx -y playwright@$version run-server --port 3333 --host 0.0.0.0" \
    > /dev/null; then
    echo "Could not start Playwright's Linux image, v$version-noble (Docker" >&2
    echo 'not answering, offline, or the registry down).' >&2
    return 1
  fi

  until [[ "$(docker logs "$BROWSERS_CONTAINER" 2>&1)" == *'Listening on'* ]]; do
    if [[ "$(docker inspect --format '{{.State.Running}}' "$BROWSERS_CONTAINER" 2> /dev/null)" != true ]]; then
      docker logs "$BROWSERS_CONTAINER" >&2 || true
      echo "Playwright's server in the container stopped before it listened;" >&2
      echo 'its logs are above.' >&2
      return 1
    fi
    if ((waited == 120)); then
      docker logs "$BROWSERS_CONTAINER" >&2 || true
      echo "Playwright's server in the container did not start in 120 seconds;" >&2
      echo 'its logs are above.' >&2
      return 1
    fi
    sleep 1
    waited=$((waited + 1))
  done
  address="$(docker port "$BROWSERS_CONTAINER" 3333/tcp)"

  local project status kept trace
  for project in firefox webkit; do
    trace=''
    if [[ "$project" == webkit ]]; then
      step 'Client: the specs every browser runs, in Linux WebKit, from the same container'
      trace='--trace=retain-on-failure'
    fi
    status=0
    (cd client && E2E_FIREFOX=1 PW_TEST_CONNECT_WS_ENDPOINT="ws://$address/" \
      PW_TEST_CONNECT_EXPOSE_NETWORK='<loopback>' \
      npx playwright test --project="$project" ${trace:+"$trace"}) || status=$?
    if ((status != 0)); then
      # A run that failed before any test, such as one that could not
      # reach the container, leaves no folder: nothing to copy.
      if [[ -d client/e2e/.output ]]; then
        kept="tmp/linux-browsers/$(date +%Y-%m-%d-%H%M%S)-$project"
        mkdir -p tmp/linux-browsers
        cp -R client/e2e/.output "$kept"
        echo "Kept in $kept/: the failed test's page snapshot, error-context.md, its video and, in WebKit, its trace (#521)." >&2
      else
        echo 'Playwright left nothing in client/e2e/.output/ to keep (#521).' >&2
      fi
      return "$status"
    fi
  done
}

if [[ $mode == linux ]]; then
  # Only under the lock: typed by hand, it would remove the container by
  # its name under another folder's run.
  if [[ -z "${ONE_AT_A_TIME_HELD:-}" ]]; then
    echo '--linux-browsers is the full run'"'"'s own call, under the lock the working folders share.' >&2
    echo 'Run scripts/verify.sh in full, or: node scripts/one-at-a-time.mjs linux-browsers -- bash scripts/verify.sh --linux-browsers' >&2
    exit 2
  fi
  linux_browsers
  exit 0
fi

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

  node scripts/one-at-a-time.mjs linux-browsers -- \
    "$BASH" scripts/verify.sh --linux-browsers
fi

step 'All passed'
