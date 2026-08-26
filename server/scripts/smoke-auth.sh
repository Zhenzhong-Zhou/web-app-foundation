#!/usr/bin/env bash
# Smoke test against a *running dev server*. Hits the development database and
# leaves rows behind — not a substitute for the e2e suite.
set -euo pipefail

BASE="${BASE:-http://localhost:3000/v1}"
JAR="$(mktemp)"
BODY="$(mktemp)"
trap 'rm -f "$JAR" "$BODY"' EXIT

EMAIL="smoke-$(date +%s)@example.com"
PASSWORD="correct-horse-battery"

# Body arrives on stdin, so no JSON is ever escaped inside a shell string.
post() { # post <path>   < body
  curl -sS -o "$BODY" -w '%{http_code}' -X POST "$BASE$1" \
    -b "$JAR" -c "$JAR" -H 'Content-Type: application/json' --data-binary @-
}

check() { # check <expected> <actual> <label>
  if [ "$1" = "$2" ]; then
    printf '  ok    %-32s %s\n' "$3" "$2"
  else
    printf '  FAIL  %-32s expected %s, got %s\n' "$3" "$1" "$2"
    cat "$BODY"; echo; exit 1
  fi
}

registration() {
  printf '{"email":"%s","password":"%s","name":"Smoke","organizationName":"Smoke Co"}' \
    "$1" "$PASSWORD"
}

credentials() {
  printf '{"email":"%s","password":"%s"}' "$1" "$2"
}

echo "using $EMAIL"

check 201 "$(registration "$EMAIL" | post /auth/register)" "register"
check 409 "$(registration "$EMAIL" | post /auth/register)" "register again"
check 200 "$(credentials "$EMAIL" "$PASSWORD" | post /auth/login)" "login"
check 200 "$(credentials "$(echo "$EMAIL" | tr 'a-z' 'A-Z')" "$PASSWORD" | post /auth/login)" "login, mixed case"
check 401 "$(credentials "$EMAIL" "wrong" | post /auth/login)" "login, wrong password"

check 400 "$(printf '{"email":"%s","password":"%s","extra":1}' "$EMAIL" "$PASSWORD" \
  | post /auth/login)" "login, unknown field"

# The two failures must be indistinguishable. Compared by eye because the error
# body carries a request id that differs per call.
credentials "$EMAIL" "wrong" | post /auth/login >/dev/null
WRONG="$(cat "$BODY")"
credentials "nobody-$(date +%s)@example.com" "wrong" | post /auth/login >/dev/null
MISSING="$(cat "$BODY")"
printf '\n  wrong password : %s\n  unknown email  : %s\n\n' "$WRONG" "$MISSING"

# Its own email bucket, so the block does not strand the account used above.
FLOOD="flood-$(date +%s)@example.com"
for _ in $(seq 1 10); do credentials "$FLOOD" "wrong" | post /auth/login >/dev/null; done
check 429 "$(credentials "$FLOOD" "wrong" | post /auth/login)" "rate limit"

echo "  done"