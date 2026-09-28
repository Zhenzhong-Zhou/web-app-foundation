#!/usr/bin/env bash
# Runs the e2e suite repeatedly and records which tests fail, so a flake
# becomes a list with a pattern instead of a feeling (issue #1).
#
#   scripts/e2e-flake-hunt.sh                 # 10 full runs
#   scripts/e2e-flake-hunt.sh 20 shipments    # 20 runs of one suite
#
# Logs land in .flake-hunt/ (gitignored). The summary counts each failing
# test across runs and keeps the first error line of each failing run. A run
# that fails without naming a test — a suite that would not load, a database
# that was not there — prints the end of its log instead, so it is never
# reported as clean.
set -uo pipefail

RUNS="${1:-10}"
PATTERN="${2:-}"
OUT=".flake-hunt"
rm -rf "$OUT" && mkdir -p "$OUT"

npm run migrate:test >/dev/null

failed=0
failed_runs=()

for i in $(seq 1 "$RUNS"); do
  printf 'run %s/%s ... ' "$i" "$RUNS"
  # shellcheck disable=SC2209
  if NODE_ENV=test npx jest --config ./test/jest-e2e.json --runInBand \
       ${PATTERN:+"$PATTERN"} >"$OUT/run-$i.log" 2>&1; then
    echo pass
  else
    echo FAIL
    failed=$((failed + 1))
    failed_runs+=("$i")
  fi
done

echo
echo "$((RUNS - failed)) of $RUNS runs passed."

[ "$failed" -eq 0 ] && exit 0

echo
echo "Failing tests, by how often:"
if ! for i in "${failed_runs[@]}"; do grep -h '●' "$OUT/run-$i.log"; done | sed 's/^ *//' | sort | uniq -c | sort -rn \
     | grep .; then
  echo "  (none named — see the log ends below)"
fi

echo
echo "Per failing run:"
for i in "${failed_runs[@]}"; do
  f="$OUT/run-$i.log"
  line=$(grep -m1 -E 'expected [0-9]+|Exceeded timeout|Test suite failed to run' "$f")
  if [ -n "$line" ]; then
    echo "  run-$i: $line"
  else
    echo "  run-$i: failed without naming a test; last lines:"
    tail -15 "$f" | sed 's/^/      /'
  fi
done

exit 1