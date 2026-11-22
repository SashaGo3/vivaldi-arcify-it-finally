#!/bin/zsh
# Copy js/*.js into Vivaldi's app bundle and load them from window.html.
# Safe to re-run. Vivaldi updates replace window.html, so this has to run
# again after each update (the auto-reinstall job does it for you), then
# restart Vivaldi.
#
#   scripts/install-js.sh            install / refresh
#   scripts/install-js.sh --remove   restore the original window.html
#
# Your config is copied in as arcify_mods/00-config.js, loaded first.
set -euo pipefail
REPO=${0:A:h:h}
source "$REPO/scripts/lib.zsh"

HTML="$ARCIFY_RES/window.html"
MODS="$ARCIFY_RES/arcify_mods"
MARK='<!-- vivaldi-arcify -->'
CACHE="$ARCIFY_HOME/arcify_mods"

[[ -f "$HTML" ]] || die "window.html not found at $HTML"
[[ -w "$HTML" ]] || die "Can't write to $VIVALDI_APP. Give your terminal App Management permission (System Settings > Privacy & Security > App Management), then run this again."

# Strip any previous injection so the result is always clean.
tmp=$(mktemp)
grep -v -- "$MARK" "$HTML" > "$tmp" || true

if [[ "${1:-}" == "--remove" ]]; then
  cat "$tmp" > "$HTML"; rm -f "$tmp"; rm -rf "$MODS" "$CACHE"
  echo "JS mods removed. Restart Vivaldi."; exit 0
fi

[[ -f "$HTML.orig" ]] || cp "$tmp" "$HTML.orig"

rm -rf "$MODS"; mkdir -p "$MODS"
tags=""
if [[ -f "$ARCIFY_CONFIG" ]]; then
  { printf 'window.ARCIFY_CONFIG = '; cat "$ARCIFY_CONFIG"; printf ';\n'; } > "$MODS/00-config.js"
  tags+="  <script src=\"arcify_mods/00-config.js\"></script> $MARK\n"
fi
for f in "$REPO"/js/*.js; do
  cp "$f" "$MODS/"
  tags+="  <script src=\"arcify_mods/${f:t}\"></script> $MARK\n"
done

awk -v tags="$tags" '/<\/body>/ { printf "%s", tags } { print }' "$tmp" > "$HTML"
rm -f "$tmp"

# Keep a copy for the auto-reinstall job, which can't read this folder.
rm -rf "$CACHE"; mkdir -p "$ARCIFY_HOME"; cp -R "$MODS" "$CACHE"
echo "$(ls "$MODS" | wc -l | tr -d ' ') files installed into Vivaldi. Restart Vivaldi to load them."
