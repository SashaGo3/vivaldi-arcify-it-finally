#!/bin/zsh
# Run by the background job (scripts/auto-reinstall.sh). If a Vivaldi update
# removed the JS mods from window.html, put them back from the copy that
# install-js.sh keeps in ~/Library/Application Support/VivaldiArcify, and
# restart Vivaldi so they load.
#
# Only uses that folder: background jobs can't read ~/Documents or iCloud
# Drive without extra permissions.
set -euo pipefail

ARCIFY_HOME=${ARCIFY_HOME:-"$HOME/Library/Application Support/VivaldiArcify"}
CACHE="$ARCIFY_HOME/arcify_mods"
APP=${VIVALDI_APP:-/Applications/Vivaldi.app}
RES="$APP/Contents/Frameworks/Vivaldi Framework.framework/Versions/Current/Resources/vivaldi"
HTML="$RES/window.html"
MARK='<!-- vivaldi-arcify -->'

[[ -f "$HTML" && -d "$CACHE" ]] || exit 0
grep -q -- "$MARK" "$HTML" && exit 0   # still installed

notify() { osascript -e "display notification \"$1\" with title \"Vivaldi Arcify\"" || true; }
fail() {
  echo "$(date '+%F %T') could not reinstall: $1"
  notify "Couldn't reinstall the mods after a Vivaldi update. Allow 'Vivaldi Arcify' in System Settings > Privacy & Security > App Management (open the Vivaldi Arcify app to check), or run update.sh."
  exit 1
}
trap 'fail "command failed (line $LINENO)"' ERR

rm -rf "$RES/arcify_mods"
cp -R "$CACHE" "$RES/arcify_mods"
tags=""
for f in "$RES"/arcify_mods/*.js(N); do
  tags+="  <script src=\"arcify_mods/${f:t}\"></script> $MARK\n"
done
[[ -f "$HTML.orig" ]] || cp "$HTML" "$HTML.orig"
tmp=$(mktemp)
awk -v tags="$tags" '/<\/body>/ { printf "%s", tags } { print }' "$HTML" > "$tmp"
cat "$tmp" > "$HTML"
rm -f "$tmp"

echo "$(date '+%F %T') reinstalled mods after a Vivaldi update"
trap - ERR

# Vivaldi loads the mods only at launch. If it's running, restart it
# (tabs are restored), but not while you're using it: wait until Vivaldi
# isn't the front app or you've been idle for a minute. After two hours it
# restarts anyway.
pgrep -xq Vivaldi || exit 0
front_is_vivaldi() { lsappinfo info -only bundleID "$(lsappinfo front)" 2>/dev/null | grep -q '"com.vivaldi.Vivaldi"'; }
idle_secs() { ioreg -c IOHIDSystem | awk '/HIDIdleTime/ {print int($NF/1000000000); exit}'; }
for i in {1..720}; do
  pgrep -xq Vivaldi || exit 0   # you quit it yourself: mods load next launch
  front_is_vivaldi && (( $(idle_secs) < 60 )) || break
  /bin/sleep 10
done
osascript -e 'tell application "Vivaldi" to quit' 2>/dev/null || pkill -TERM -x Vivaldi || true
for i in {1..30}; do pgrep -xq Vivaldi || break; /bin/sleep 1; done
if pgrep -xq Vivaldi; then
  echo "$(date '+%F %T') Vivaldi didn't quit"
  notify "Vivaldi didn't quit. Restart it yourself (⌘Q) to load the mods."
  exit 0
fi
open -a "$APP"
echo "$(date '+%F %T') restarted Vivaldi"
