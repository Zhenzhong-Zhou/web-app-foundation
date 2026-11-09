#!/usr/bin/env bash
#
# The two exports the planning chat picks small fixes from (ADR-089's
# amendment, ADR-090), written into tmp/ for Bob to attach:
#
#     scripts/cloud-picks.sh                 # tmp/cloud-picks.json
#     scripts/cloud-picks.sh <N> [<N>...]    # tmp/cloud-picks-shortlist.json
#
# Without numbers: the open fix-now and when-touched issues, none labelled
# later or decision, with their text and without their comments. With
# numbers: each issue's number, title, labels, text and comments. Either
# way it prints the file's path and how many issues it holds.
#
# The filter is the planning skill's section 8 one, run here on the issues
# gh lists rather than in GitHub's search: gh issue list --search with the
# same labels returned the same numbers on 8 November 2026, but only the
# filter can be tested without standing in for GitHub's search.
#
# Needs gh (signed in) and jq. Written for the bash that ships with macOS
# (3.2).

set -euo pipefail

cd "$(dirname "$0")/.."

mkdir -p tmp

if [ "$#" -eq 0 ]; then
  out=tmp/cloud-picks.json
  gh issue list --state open --limit 500 --json number,title,labels,body \
    --jq '[.[] | select(any(.labels[]; .name == "fix-now" or .name == "when-touched")) | select(all(.labels[]; .name != "later" and .name != "decision"))]' \
    >"$out"
else
  out=tmp/cloud-picks-shortlist.json
  for n in "$@"; do
    case "$n" in
      '' | *[!0-9]*)
        echo "cloud-picks.sh: '$n' is not an issue number." >&2
        exit 2
        ;;
    esac
  done
  {
    for n in "$@"; do
      gh issue view "$n" --json number,title,labels,body,comments
    done
  } | jq -s . >"$out"
fi

echo "$out: $(jq length "$out") issues"
