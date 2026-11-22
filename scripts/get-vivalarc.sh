#!/bin/zsh
# Download VivalArc (https://github.com/tovifun/VivalArc by tovifun), the base
# styles these mods build on, into css/vivalarc.css. VivalArc has no license
# file, so it isn't copied into this repo: setup fetches the exact version the
# mods were made with (1.1.0) and checks it. css/vivalarc-tweaks.css has our
# changes on top.
set -euo pipefail
REPO=${0:A:h:h}
COMMIT=a88f5c75dbbbb889244aa2d893337df666933489
SHA1=8cae4b04f5dadba42d96ea700e50d2efc95eb5ca
OUT="$REPO/css/vivalarc.css"
URL="https://raw.githubusercontent.com/tovifun/VivalArc/$COMMIT/vivalarc.css"

if [[ -f "$OUT" && "$(shasum "$OUT" | cut -c1-40)" == "$SHA1" ]]; then
  echo "VivalArc 1.1.0 is there."; exit 0
fi
tmp=$(mktemp)
if ! curl -fsSL --retry 2 "$URL" -o "$tmp"; then
  rm -f "$tmp"
  echo "Couldn't download VivalArc ($URL). The mods work without it, but the frame looks less polished. Run setup again when you're online." >&2
  exit 1
fi
if [[ "$(shasum "$tmp" | cut -c1-40)" != "$SHA1" ]]; then
  rm -f "$tmp"; echo "VivalArc download didn't match the expected file; skipped." >&2; exit 1
fi
mv "$tmp" "$OUT"
echo "Downloaded VivalArc 1.1.0 by tovifun."
