#!/bin/zsh
# Build a helper app from an AppleScript template:
#
#   build-helper.sh TEMPLATE APP BUNDLE_ID ICON.icns KEY=VALUE…
#
# @KEY@ in the template is replaced by VALUE. The app gets the icon, runs
# without a Dock icon when started by the background job, and is signed
# ad hoc. Rebuilding changes its signature, so macOS forgets permissions
# given to it: it's only rebuilt when the template or icon changed (a hash
# is kept in its Info.plist). Prints "rebuilt" when it did.
set -euo pipefail

tpl=$1 app=$2 id=$3 icon=$4; shift 4
src=$(mktemp -t helper).applescript
python3 -I - "$tpl" "$src" "$@" <<'PY'
import sys
tpl, out, *pairs = sys.argv[1:]
s = open(tpl, encoding='utf-8').read()
for p in pairs:
    k, v = p.split('=', 1)
    s = s.replace(f'@{k}@', v.replace('\\', '\\\\').replace('"', '\\"'))
open(out, 'w', encoding='utf-8').write(s)
PY
hash=$(cat "$src" "$icon" | shasum | cut -c1-12)
pl="$app/Contents/Info.plist"
if [[ -d "$app" ]] && [[ "$(/usr/libexec/PlistBuddy -c 'Print :VMHelperVersion' "$pl" 2>/dev/null)" == "$hash" ]]; then
  rm -f "$src"; exit 0
fi
rm -rf "$app"
osacompile -o "$app" "$src"
rm -f "$src"
cp "$icon" "$app/Contents/Resources/applet.icns"
/usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string $id" "$pl" 2>/dev/null || /usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier $id" "$pl"
/usr/libexec/PlistBuddy -c "Add :VMHelperVersion string $hash" "$pl"
/usr/libexec/PlistBuddy -c "Add :LSUIElement bool true" "$pl"   # no Dock icon
codesign --force --deep -s - "$app" 2>/dev/null
touch "$app"   # Finder picks up the new icon
echo rebuilt
