#!/usr/bin/env bash
#
# Refuses commits authored or committed by a placeholder identity, such as
# "Claude (draft) <draft@example.invalid>": an address at .invalid, or a
# name with "(draft)" (docs/handoff.md, Working agreements, Commits).
# Removing those once took a history rewrite.
#
#     scripts/check-authors.sh origin/main..HEAD      # what a branch adds
#     scripts/check-authors.sh <sha> --not --remotes  # what no remote has
#
# Takes revisions as git log takes them. The pre-push hook
# (scripts/hooks/pre-push) runs it on what is being pushed, CI on a pull
# request's own commits (ci.yml, authors), since a clone can lack the hook
# or a push skip it (ADR-082), and scripts/verify.sh on what the branch
# adds to origin/main.
#
# Exits 0 when no commit carries one; 1 when some do, naming each and
# what to do; 2 without revisions; git's own status when it cannot read
# them.
#
# Written for the bash that ships with macOS (3.2).

set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo 'Usage: scripts/check-authors.sh <revisions>... (as git log takes them)' >&2
  exit 2
fi

# Revisions git cannot read stop here, with git's own error.
commits="$(git log --format='%h  %an <%ae>  (committer %cn <%ce>)' "$@")"

bad="$(grep -iE '\.invalid>|\(draft\)' <<< "$commits" || true)"

if [[ -z "$bad" ]]; then
  exit 0
fi

{
  echo "$bad"
  echo 'Author them as Zhenzhong Zhou <bob0823.zhou@gmail.com>'
  echo '(git commit --amend --reset-author, or a rebase), then push again.'
} >&2
exit 1
