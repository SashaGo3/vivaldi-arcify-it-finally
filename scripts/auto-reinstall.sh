#!/bin/zsh
# Optional background job that puts the JS mods back after Vivaldi updates
# itself (updates replace the file that loads them).
#
#   scripts/auto-reinstall.sh           install or update the job
#   scripts/auto-reinstall.sh --remove  remove the job
#
# A LaunchAgent runs reinstall-after-update.sh when Vivaldi's Info.plist
# changes (that is, after an update), at login, and once an hour as a
# fallback. It does nothing while the mods are still installed.
#
# macOS only lets apps with "App Management" permission change files inside
# Vivaldi.app, and a bare /bin/zsh run by launchd can't be given it. So the
# job runs through the helper app "Vivaldi Arcify" (shared with pinned tab
# sync), which you allow once in System Settings > Privacy & Security >
# App Management.
set -euo pipefail
REPO=${0:A:h:h}
source "$REPO/scripts/lib.zsh"

LABEL=vivaldi-arcify.reinstall
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true

if [[ "${1:-}" == "--remove" ]]; then
  rm -rf "$PLIST" "$ARCIFY_HOME/reinstall-after-update.sh"
  "$REPO/scripts/helpers/helper-app.sh" --remove
  echo "Auto-reinstall job removed."
  exit 0
fi

mkdir -p "$ARCIFY_HOME" "${PLIST:h}"
cp "$REPO/scripts/reinstall-after-update.sh" "$ARCIFY_HOME/"
chmod +x "$ARCIFY_HOME/reinstall-after-update.sh"

built=$("$REPO/scripts/helpers/helper-app.sh")

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$ARCIFY_HELPER/Contents/MacOS/applet</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>VIVALDI_APP</key><string>$VIVALDI_APP</string>
    <key>ARCIFY_HOME</key><string>$ARCIFY_HOME</string>
    <key>VM_TASK</key><string>reinstall</string>
  </dict>
  <key>WatchPaths</key>
  <array><string>$VIVALDI_APP/Contents/Info.plist</string></array>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>3600</integer>
  <key>StandardOutPath</key><string>$ARCIFY_HOME/reinstall.log</string>
  <key>StandardErrorPath</key><string>$ARCIFY_HOME/reinstall.log</string>
</dict>
</plist>
PLIST

launchctl bootstrap "gui/$UID" "$PLIST"
echo "Auto-reinstall job is on."
if [[ "$built" == rebuilt ]]; then
  echo
  echo "One-time step: allow \"Vivaldi Arcify\" in System Settings >"
  echo "Privacy & Security > App Management (opening it now). If it isn't"
  echo "listed, click + and pick it from Applications."
  echo "To check it later, open Vivaldi Arcify (Applications)."
  open "x-apple.systempreferences:com.apple.preference.security?Privacy_AppBundles" || true
fi
