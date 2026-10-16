#!/usr/bin/env bash
# The fonts every document is drawn with (ADR-071), fetched once from the
# Noto project, checked against the sums below, and committed under
# server/assets/fonts, so nothing is downloaded at build or run time.
#
# Run it again only to move to a newer release: change the URL, run it,
# and replace the sum with the one it reports.
set -euo pipefail
cd "$(dirname "$0")/../assets/fonts"

LATIN=https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts
CJK=https://raw.githubusercontent.com/notofonts/noto-cjk/Sans2.004

fetch() {
  local url="$1" file="$2" sum="$3"
  curl --fail --silent --show-error --location --output "$file" "$url"
  if ! echo "$sum  $file" | shasum -a 256 --check --status; then
    echo "$file does not match its sum; it is now $(shasum -a 256 "$file" | cut -d' ' -f1)" >&2
    rm -f "$file"
    exit 1
  fi
  echo "ok  $file"
}

fetch "$LATIN/NotoSans/hinted/ttf/NotoSans-Regular.ttf" NotoSans-Regular.ttf \
  478c558ea716033cd60c03438f628dfa75694dcf6b5f6d505a2f05fd2b4f3823
fetch "$LATIN/NotoSans/hinted/ttf/NotoSans-Bold.ttf" NotoSans-Bold.ttf \
  1df075a380fc7cb898acf64c1f7b3b4dd780de3caa860178bf929de35817a913
fetch "$LATIN/LICENSE" OFL-NotoSans.txt \
  f2095b08bed08b23a6fe26112fcd679a2bee3f002eef077eb05d215ed1051bd8
fetch "$CJK/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf" NotoSansSC-Regular.otf \
  faa6c9df652116dde789d351359f3d7e5d2285a2b2a1f04a2d7244df706d5ea9
fetch "$CJK/Sans/SubsetOTF/SC/NotoSansSC-Bold.otf" NotoSansSC-Bold.otf \
  c6cb5a93abaa9edc8ee7463b7ebb7f42d618d40e6ed2f7a5371c97b0b64767c0
fetch "$CJK/LICENSE" OFL-NotoSansCJK.txt \
  6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2
