#!/usr/bin/env bash
#
# Cleans the working folders a Mac gathers in this repository (ADR-088).
#
#     scripts/clean-local.sh                  # dry run: lists, removes nothing
#     scripts/clean-local.sh --yes            # removes what the dry run marked remove
#     scripts/clean-local.sh --docker         # also prints Docker's clean-up
#     scripts/clean-local.sh --docker --yes   # and runs it
#
# Removes:
#
#   tmp/<folder>  a merged branch's, named as the branch or as its first two
#                 parts when the second is a number (tmp/fix-316 for
#                 fix-316-rate-limit-per-person). The branches are read from
#                 origin/main's merge commits after a fetch, since a merged
#                 branch is pruned. The current branch's folder stays.
#   Playwright's  output folders, as client/playwright*.config.ts name them,
#                 and client/test-results/ where an older run left it.
#                 client/screenshots/out/ stays: a comparison may need it.
#
# Lists, and never removes: git worktrees beyond the main one, and stashes.
#
# Docker, where it runs: its space, by docker system df; with --docker,
# dangling images and build cache older than a week. Never a container or a
# volume, so the databases stay.
#
# Warns when the Mac never sleeps (pmset's SleepDisabled 1).
#
# Before removing anything, it checks each folder and refuses, naming it, a
# symlink, a folder whose real path leaves the repository, one holding a file
# git tracks or a .env file, and server/storage/. Never git clean -X, which
# would remove .env and server/storage/ with the rest.
#
# Written for the bash that ships with macOS (3.2): no mapfile, no
# associative arrays.

set -euo pipefail

BASE=origin/main
DO_DELETE=0
DO_DOCKER=0

# Playwright's output: each configuration's outputDir, the HTML report's
# default folder, and test-results/, Playwright's default outputDir.
# clean-local.test.mjs fails when a configuration names another.
PLAYWRIGHT=(
  client/e2e/.output
  client/screenshots/.output
  client/playwright-report
  client/test-results
)

for arg in "$@"; do
  case "$arg" in
    --yes) DO_DELETE=1 ;;
    --docker) DO_DOCKER=1 ;;
    -h | --help)
      sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (try --help)" >&2
      exit 1
      ;;
  esac
done

ROOT="$(cd "$(git rev-parse --show-toplevel)" && pwd -P)"
cd "$ROOT"

# Each line, with its last field's start after it: a branch's first two
# parts when the second is a number (fix-316 for fix-316-rate-limit), or
# nothing.
with_start() {
  awk '{
    start = ""
    if (split($NF, part, "-") > 1 && part[2] ~ /^[0-9]+$/) start = part[1] "-" part[2]
    print $0, start
  }'
}

kilobytes() { du -sk "$1" | cut -f1; }

indent() { sed 's/^/  /'; }

readable() {
  awk -v k="$1" 'BEGIN {
    if (k >= 1048576) printf "%.1f GB", k / 1048576
    else if (k >= 1024) printf "%.1f MB", k / 1024
    else printf "%d KB", k
  }'
}

refuse() {
  echo "Refused: $1 $2. Nothing was removed." >&2
  exit 1
}

# Before every removal, whatever made the list: a folder may still be one
# that must never go.
guard() {
  local path="$1" real
  if [ -L "$path" ]; then
    refuse "$path" "is a symlink"
  fi
  real="$(cd "$(dirname "$path")" && pwd -P)/$(basename "$path")"
  case "$real" in
    "$ROOT"/?*) ;;
    *) refuse "$path" "leads outside the repository, to $real" ;;
  esac
  if [ -n "$(git ls-files -- "$path")" ]; then
    refuse "$path" "holds files git tracks"
  fi
  case "$path/" in
    server/storage/*) refuse "$path" "is in server/storage/, the files FILE_STORAGE=local keeps" ;;
  esac
  if [ -n "$(find "$path" -name '.env*' -print)" ]; then
    refuse "$path" "holds a .env file"
  fi
}

COUNT=0
TOTAL=0
REMOVE=""

# Prints a folder's size, what is or would be done with it, and why. One
# marked remove is guarded first, and removed only once all are listed.
mark() {
  local action="$1" path="$2" why="$3" size
  if [ "$action" = remove ]; then
    guard "$path"
  fi
  size="$(kilobytes "$path")"
  printf '  %-6s  %9s  %-30s  %s\n' "$action" "$(readable "$size")" "$path" "$why" |
    sed 's/ *$//'
  if [ "$action" = remove ]; then
    COUNT=$((COUNT + 1))
    TOTAL=$((TOTAL + size))
    REMOVE="$REMOVE$path
"
  fi
}

echo "Fetching origin..."
if ! git fetch --quiet origin 2> /dev/null; then
  echo "Could not fetch origin, offline perhaps: using $BASE as last fetched."
fi

# Each branch main merged, newest first: the pull request's number, the
# branch and its start, from GitHub's "Merge pull request #N from
# <owner>/<branch>".
MERGED=""
if git rev-parse --verify --quiet "$BASE" > /dev/null; then
  MERGED="$(git log --merges --format=%s "$BASE" |
    sed -n 's|^Merge pull request #\([0-9][0-9]*\) from [^/]*/\(.*\)$|\1 \2|p' |
    with_start)"
else
  echo "No $BASE: no tmp/ folder can be matched to a merged branch."
fi

CURRENT="$(git symbolic-ref --quiet --short HEAD || true)"
CURRENT_START="$(echo "$CURRENT" | with_start | awk '{ print $2 }')"

echo
echo "tmp/, a folder per branch"
found=0
for folder in tmp/*/; do
  [ -d "$folder" ] || continue
  found=1
  path="${folder%/}"
  name="${path#tmp/}"
  merge="$(awk -v name="$name" '$2 == name || $3 == name { print "#" $1 ", " $2; exit }' <<< "$MERGED")"
  if [ "$name" = "$CURRENT" ] || [ "$name" = "$CURRENT_START" ]; then
    mark keep "$path" "the current branch's, $CURRENT"
  elif [ -n "$merge" ]; then
    mark remove "$path" "merged by $merge"
  else
    mark keep "$path" "no branch merged into main by that name"
  fi
done
if [ "$found" -eq 0 ]; then
  echo "  No folder."
fi

echo
echo "Playwright's output"
found=0
for path in "${PLAYWRIGHT[@]}"; do
  if [ -e "$path" ] || [ -L "$path" ]; then
    found=1
    mark remove "$path" ""
  fi
done
if [ "$found" -eq 0 ]; then
  echo "  No folder."
fi

echo
if [ "$COUNT" -eq 0 ]; then
  echo "Nothing to remove."
elif [ "$DO_DELETE" -eq 1 ]; then
  while IFS= read -r path; do
    if [ -n "$path" ]; then
      rm -rf -- "$path"
    fi
  done <<< "$REMOVE"
  echo "Removed what is marked remove: $(readable "$TOTAL")."
else
  echo "Dry run: nothing removed. --yes removes what is marked remove: $(readable "$TOTAL")."
fi

WORKTREES="$(git worktree list | tail -n +2)"
if [ -n "$WORKTREES" ]; then
  echo
  echo "Git worktrees beyond the main one, listed and never removed"
  indent <<< "$WORKTREES"
  echo "  One finished with: git worktree remove <path>"
fi

STASHES="$(git stash list)"
if [ -n "$STASHES" ]; then
  echo
  echo "Stashes, listed and never dropped"
  indent <<< "$STASHES"
  echo "  One no longer needed: git stash drop <stash@{n}>"
fi

# Docker's clean-up, run with --yes and printed otherwise: dangling images
# and build cache alone. Never --all, --volumes, container prune or system
# prune, which would take a stopped database's container or its volume.
docker_prune() {
  if [ "$DO_DELETE" -eq 1 ]; then
    echo "  Running: docker $*"
    docker "$@" | sed 's/^/    /'
  else
    echo "  With --yes, would run: docker $*"
  fi
}

echo
echo "Docker"
if command -v docker > /dev/null && docker info > /dev/null 2>&1; then
  docker system df | indent
  if [ "$DO_DOCKER" -eq 1 ]; then
    docker_prune image prune --force
    docker_prune builder prune --force --filter until=168h
  else
    echo "  --docker removes dangling images and build cache older than a week."
  fi
else
  echo "  Not running: nothing to show."
fi

if command -v pmset > /dev/null &&
  [ "$(pmset -g | awk '$1 == "SleepDisabled" { print $2 }')" = 1 ]; then
  echo
  echo "This Mac never sleeps: pmset's SleepDisabled is 1. To let it sleep again:"
  echo "  sudo pmset -a disablesleep 0"
fi
