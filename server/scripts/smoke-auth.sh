#!/usr/bin/env bash
# Smoke test against a *running dev server*. Hits the development database and
# leaves rows behind — not a substitute for the e2e suite.
set -euo pipefail

BASE="${BASE:-http://localhost:3000/v1}"

# One jar per identity the script needs to be. Sharing a single jar lets a
# failed-login flood or a cleared cookie leak into a later check and make it
# pass or fail for the wrong reason.
JAR="$(mktemp)"        # the authenticated session under test
NAKED="$(mktemp)"      # never authenticated
FLOODJAR="$(mktemp)"   # rate-limit attempts only
BODY="$(mktemp)"
HEADERS="$(mktemp)"
trap 'rm -f "$JAR" "$NAKED" "$FLOODJAR" "$BODY" "$HEADERS"' EXIT

EMAIL="smoke-$(date +%s)@example.com"
PASSWORD="correct-horse-battery"

# Body arrives on stdin, so no JSON is ever escaped inside a shell string.
post() { # post <path> [jar]   < body
  local jar="${2:-$JAR}"
  curl -sS -o "$BODY" -w '%{http_code}' -X POST "$BASE$1" \
    -b "$jar" -c "$jar" \
    -H 'Content-Type: application/json' \
    -H 'X-Requested-With: XMLHttpRequest' \
    --data-binary @-
}

post_empty() { # post_empty <path> [jar]
  local jar="${2:-$JAR}"
  curl -sS -o "$BODY" -w '%{http_code}' -X POST "$BASE$1" \
    -b "$jar" -c "$jar" -H 'X-Requested-With: XMLHttpRequest'
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

if ! curl -sS -o /dev/null --max-time 2 "http://localhost:3000/health"; then
  echo "  server not reachable — is npm run start:dev running?" >&2
  exit 1
fi

echo "using $EMAIL"

check 201 "$(registration "$EMAIL" | post /auth/register)" "register"
check 409 "$(registration "$EMAIL" | post /auth/register)" "register again"
check 200 "$(credentials "$EMAIL" "$PASSWORD" | post /auth/login)" "login"
check 200 "$(credentials "$(echo "$EMAIL" | tr 'a-z' 'A-Z')" "$PASSWORD" | post /auth/login)" "login, mixed case"
check 401 "$(credentials "$EMAIL" "wrong" | post /auth/login "$NAKED")" "login, wrong password"

check 400 "$(printf '{"email":"%s","password":"%s","extra":1}' "$EMAIL" "$PASSWORD" \
  | post /auth/login "$NAKED")" "login, unknown field"

# Must be indistinguishable. Printed rather than asserted: the error body
# carries a request id that differs per call.
credentials "$EMAIL" "wrong" | post /auth/login "$NAKED" >/dev/null
WRONG="$(cat "$BODY")"
credentials "nobody-$(date +%s)@example.com" "wrong" | post /auth/login "$NAKED" >/dev/null
MISSING="$(cat "$BODY")"
printf '\n  wrong password : %s\n  unknown email  : %s\n\n' "$WRONG" "$MISSING"

# Its own email bucket and its own jar, so the block cannot strand the account
# used above or leak cookie state into the logout checks.
FLOOD="flood-$(date +%s)@example.com"
for _ in $(seq 1 10); do
  credentials "$FLOOD" "wrong" | post /auth/login "$FLOODJAR" >/dev/null
done
check 429 "$(credentials "$FLOOD" "wrong" | post /auth/login "$FLOODJAR")" "rate limit"

# The first check that a protected route actually rejects — everything above
# this point is @Public().
check 401 "$(post_empty /auth/logout "$NAKED")" "logout, no cookie"

check 200 "$(credentials "$EMAIL" "$PASSWORD" | post /auth/login)" "login before logout"
check 204 "$(post_empty /auth/logout)" "logout"

# Passes whether curl dropped the cleared cookie or kept a dead value: both end
# in 401, because the row is gone either way.
check 401 "$(post_empty /auth/logout)" "logout, cookie already revoked"

# The clearing cookie must mirror the one that was set. A mismatched Path
# writes a *second* cookie instead of removing the first, and the original
# stays in the browser.
#
# Its own account: $EMAIL has been through five logins by now and the limit is
# ten per fifteen minutes on email + IP.
FLAGS_EMAIL="flags-$(date +%s)@example.com"
check 201 "$(registration "$FLAGS_EMAIL" | post /auth/register)" "register for flags check"
check 200 "$(credentials "$FLAGS_EMAIL" "$PASSWORD" | post /auth/login)" "login for flags check"

curl -sS -o /dev/null -D "$HEADERS" -X POST "$BASE/auth/logout" \
  -b "$JAR" -c "$JAR" -H 'X-Requested-With: XMLHttpRequest'

CLEARED="$(grep -i '^set-cookie:' "$HEADERS" || true)"

if printf '%s' "$CLEARED" | grep -qi 'path=/' &&
   printf '%s' "$CLEARED" | grep -qi 'samesite=lax'; then
  printf '  ok    %-32s Path=/ SameSite=Lax\n' "logout cookie flags"
else
  printf '  FAIL  %-32s %s\n' "logout cookie flags" "${CLEARED:-<no set-cookie>}"
  exit 1
fi

# A POST without the header is what a cross-site form looks like. Needs a live
# session, or SessionGuard rejects it as 401 before CsrfGuard ever runs.
check 200 "$(credentials "$FLAGS_EMAIL" "$PASSWORD" | post /auth/login)" "login for csrf check"
check 403 "$(curl -sS -o "$BODY" -w '%{http_code}' -X POST "$BASE/auth/logout" \
  -b "$JAR" -c "$JAR")" "logout, no csrf header"

echo "  done"