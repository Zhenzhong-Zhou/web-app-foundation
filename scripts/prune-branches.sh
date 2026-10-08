#!/usr/bin/env bash
#
# Deletes branches that are already in main, locally and on GitHub.
#
#     scripts/prune-branches.sh                 # dry run: lists, deletes nothing
#     scripts/prune-branches.sh --yes           # deletes what the dry run listed
#     scripts/prune-branches.sh --local-only    # leave GitHub alone
#     scripts/prune-branches.sh --remote-only   # leave local branches alone
#
# "Already in main" means proven, by one of the three ways GitHub merges:
#
#   merged    a merge commit or fast-forward: the branch is an ancestor of main;
#   rebased   "Rebase and merge": every commit has an equivalent on main
#             (git cherry), though the hashes differ;
#   squashed  "Squash and merge": the branch's whole change, as one commit,
#             has an equivalent on main.
#
# git branch --merged sees only the first, and this repo uses all three. A
# branch none of them can prove is kept and listed with the command to delete
# it by hand, because an unmerged branch may be the only copy of the work.
#
# Compared against origin/main after a fetch, so a local main that is behind
# cannot hide a merge.
#
# Never touched: main, every release/* branch, the current branch, and
# anything in PROTECT (space-separated names or patterns, e.g.
# PROTECT="spike hotfix/*"). A release branch with no fixes on it yet sits on
# a commit main already has, so it looks merged; without this rule the first
# run deleted release branches that were waiting for their fixes.
#
# Written for the bash that ships with macOS (3.2): no mapfile, no
# associative arrays.

set -euo pipefail
# No filename expansion: release/* and PROTECT's patterns are matched against
# branch names, never against files in the working tree.
set -f

REMOTE=origin
BASE_NAME=main
BASE="$REMOTE/$BASE_NAME"
DO_DELETE=0
DO_LOCAL=1
DO_REMOTE=1

for arg in "$@"; do
  case "$arg" in
    --yes) DO_DELETE=1 ;;
    --local-only) DO_REMOTE=0 ;;
    --remote-only) DO_LOCAL=0 ;;
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

cd "$(git rev-parse --show-toplevel)"

echo "Fetching $REMOTE (and dropping branches already deleted there)…"
git fetch --prune --quiet "$REMOTE"

if ! git rev-parse --verify --quiet "$BASE" >/dev/null; then
  echo "No $BASE to compare against." >&2
  exit 1
fi

CURRENT="$(git symbolic-ref --quiet --short HEAD || true)"
PROTECTED_PATTERNS="$BASE_NAME release/* ${PROTECT:-}"

is_protected() {
  local name="$1" pattern
  [ "$name" = "$CURRENT" ] && return 0
  for pattern in $PROTECTED_PATTERNS; do
    # Unquoted on purpose: the pattern is a pattern.
    # shellcheck disable=SC2254
    case "$name" in $pattern) return 0 ;; esac
  done
  return 1
}

# Prints how the branch reached main and returns 0, or returns 1 if no way
# can be proven.
how_merged() {
  local ref="$1" base_point squash

  if git merge-base --is-ancestor "$ref" "$BASE"; then
    echo merged
    return 0
  fi

  if ! git cherry "$BASE" "$ref" | grep -q '^+'; then
    echo rebased
    return 0
  fi

  # A throwaway commit holding the whole branch as one change, on the point
  # where the branch left main. It uses your git identity, is never
  # referenced or pushed, and git gc clears it later.
  base_point="$(git merge-base "$BASE" "$ref")" || return 1
  squash="$(git commit-tree "$ref^{tree}" -p "$base_point" -m squash-check 2>/dev/null)" ||
    return 1
  case "$(git cherry "$BASE" "$squash")" in
    -*)
      echo squashed
      return 0
      ;;
  esac

  return 1
}

last_commit() {
  git log -1 --format='%cs' "$1"
}

LOCAL_DELETE=()
REMOTE_DELETE=()
KEPT=()

if [ "$DO_LOCAL" -eq 1 ]; then
  echo
  echo "Local branches"
  while IFS='|' read -r name track; do
    if is_protected "$name"; then
      printf '  keep    %-40s %s\n' "$name" "protected"
      continue
    fi
    if how="$(how_merged "refs/heads/$name")"; then
      printf '  delete  %-40s %-9s %s\n' "$name" "$how" "$(last_commit "refs/heads/$name")"
      LOCAL_DELETE+=("$name")
    else
      note=""
      [ "$track" = "[gone]" ] && note=" (deleted on GitHub, but not found in $BASE_NAME)"
      printf '  keep    %-40s %-9s %s%s\n' "$name" "unmerged" "$(last_commit "refs/heads/$name")" "$note"
      KEPT+=("git branch -D $name")
    fi
  done < <(git for-each-ref --format='%(refname:short)|%(upstream:track)' refs/heads)
fi

if [ "$DO_REMOTE" -eq 1 ]; then
  echo
  echo "Branches on $REMOTE"
  while read -r name; do
    if [ "$name" = "HEAD" ]; then
      continue
    fi
    if is_protected "$name"; then
      printf '  keep    %-40s %s\n' "$name" "protected"
      continue
    fi
    if how="$(how_merged "refs/remotes/$REMOTE/$name")"; then
      printf '  delete  %-40s %-9s %s\n' "$name" "$how" "$(last_commit "refs/remotes/$REMOTE/$name")"
      REMOTE_DELETE+=("$name")
    else
      printf '  keep    %-40s %-9s %s\n' "$name" "unmerged" "$(last_commit "refs/remotes/$REMOTE/$name")"
      KEPT+=("git push $REMOTE --delete $name")
    fi
  done < <(git for-each-ref --format='%(refname:lstrip=3)' "refs/remotes/$REMOTE")
fi

if [ -n "$CURRENT" ] && [ "$CURRENT" != "$BASE_NAME" ]; then
  echo
  echo "On $CURRENT, which is never touched. Switch to $BASE_NAME to include it."
fi

echo
if [ "${#LOCAL_DELETE[@]}" -eq 0 ] && [ "${#REMOTE_DELETE[@]}" -eq 0 ]; then
  echo "Nothing to delete."
elif [ "$DO_DELETE" -eq 0 ]; then
  echo "Dry run: nothing deleted. Run again with --yes to delete the branches marked delete."
else
  if [ "${#REMOTE_DELETE[@]}" -gt 0 ]; then
    echo "Deleting on $REMOTE…"
    git push "$REMOTE" --delete "${REMOTE_DELETE[@]}"
  fi
  if [ "${#LOCAL_DELETE[@]}" -gt 0 ]; then
    echo "Deleting locally…"
    # -D, not -d: -d checks against the local main and refuses a rebased or
    # squashed branch, which is already proven merged above.
    git branch -D "${LOCAL_DELETE[@]}"
  fi
fi

if [ "${#KEPT[@]}" -gt 0 ]; then
  echo
  echo "Kept because they are not proven merged. If one is really finished, delete it by hand:"
  for command in "${KEPT[@]}"; do
    echo "  $command"
  done
fi
