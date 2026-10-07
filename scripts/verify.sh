#!/usr/bin/env bash
# What CI runs, on this machine and in CI's order: the server's checks and
# both its suites, then the client's checks, unit tests and the Playwright
# suite. Stops at the first failure, so the last heading printed is what
# failed.
#
#   scripts/verify.sh            everything, about as long as CI takes
#   scripts/verify.sh --quick    format, lint, types, checks, build and unit
#                                tests; no end-to-end suites
#
# Needs what each suite needs on its own: the database up
# (docker compose up -d) and ../.env. The two end-to-end suites use their
# own databases and run one after the other, never together.
#
# Not run here, though CI runs it: npm run seed:demo, which would add a demo
# organization to the dev database on every run. Run it after changing a
# service the demo calls (handoff, Moving code).
set -euo pipefail

cd "$(dirname "$0")/.."

quick=false
if [[ "${1:-}" == "--quick" ]]; then
  quick=true
elif [[ $# -gt 0 ]]; then
  echo "Usage: scripts/verify.sh [--quick]" >&2
  exit 2
fi

step() { printf '\n== %s\n\n' "$*"; }

if $quick; then
  step 'Server: format, lint, types, checks, build, unit tests'
  (cd server && npm run format:check && npm run lint:ci && npm run typecheck \
    && npm run checks && npm run build && npm test)

  step 'Client: format, lint, catalogues, build, unit tests'
  (cd client && npm run verify)
else
  step 'Server: format, lint, types, checks, build, unit and e2e tests'
  (cd server && npm run verify)

  step 'Client: format, lint, catalogues, build, unit tests, Playwright'
  (cd client && npm run verify:all)
fi

step 'All passed'
