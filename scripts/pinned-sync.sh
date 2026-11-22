#!/bin/zsh
# Optional: back up your pinned tabs and sync them between your Macs,
# through iCloud Drive (or any synced folder: "syncFolder" in your config).
#
#   scripts/pinned-sync.sh            install or update the background job
#   scripts/pinned-sync.sh --now      sync once, right now, and show the result
#   scripts/pinned-sync.sh --status   what's shared, and this Mac's state
#   scripts/pinned-sync.sh --accept   you unpinned many tabs at once: send it
#   scripts/pinned-sync.sh --log      the job's recent log
#   scripts/pinned-sync.sh --remove   stop syncing on this Mac (keeps your tabs)
#
# How it works: js/pinned-sync.js keeps your pinned tabs in the bookmark
# folder "Other Bookmarks > Pinned tabs (synced)". This job (when that changes,
# and every 5 minutes) merges it with <shared folder>/pinned-tabs.json and
# hands other Macs' changes back to the mod, which pins tabs that are already
# open or opens the missing ones, and never closes a tab.
#
# The job reads iCloud Drive and Vivaldi's CSS folder, which macOS guards.
# It runs through the helper app "Vivaldi Arcify": allow it once in System
# Settings > Privacy & Security > Full Disk Access.
set -euo pipefail
REPO=${0:A:h:h}
source "$REPO/scripts/lib.zsh"

LABEL=vivaldi-arcify.pinned-sync
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$ARCIFY_HOME/pinned-sync.log"
PY="$ARCIFY_HOME/pinned-sync.py"
SYNC_DIR=$(cfg syncFolder "")
SYNC_DIR=${SYNC_DIR/#\~/$HOME}
[[ -n "$SYNC_DIR" ]] || SYNC_DIR=${ARCIFY_CONFIG:h}
export ARCIFY_SYNC_DIR=$SYNC_DIR
# macOS's own Python: background jobs get no PATH, and shims (pyenv, asdf)
# hang there. The sync script works with its 3.9.
python=/usr/bin/python3

case "${1:-}" in
  --now)    "$python" -I "$REPO/scripts/pinned-sync.py" && "$python" -I "$REPO/scripts/pinned-sync.py" --status; exit ;;
  --status) "$python" -I "$REPO/scripts/pinned-sync.py" --status; exit ;;
  --accept) "$python" -I "$REPO/scripts/pinned-sync.py" --accept && echo "Sent."; exit ;;
  --log)    tail -n 40 "$LOG" 2>/dev/null || echo "No log yet ($LOG)."; exit ;;
  --remove)
    launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
    rm -rf "$PLIST" "$PY"
    "$REPO/scripts/helpers/helper-app.sh" --remove
    css=$("$python" -I -c 'import json,sys;print(json.load(open(sys.argv[1])).get("vivaldi",{}).get("appearance",{}).get("css_ui_mods_directory",""))' "$VIVALDI_PREFS" 2>/dev/null || true)
    [[ -n "$css" ]] && rm -f "$css/vm-pinned-sync.css"
    echo "Pinned tab sync is off on this Mac. Your tabs and the bookmark folder are untouched;"
    echo "the shared list stays in $SYNC_DIR for your other Macs."
    exit ;;
  "") ;;
  *) sed -n '2,10p' "$0"; exit 1 ;;
esac

launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
mkdir -p "$ARCIFY_HOME" "${PLIST:h}" "$SYNC_DIR"
cp "$REPO/scripts/pinned-sync.py" "$PY"

built=$("$REPO/scripts/helpers/helper-app.sh")

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>$ARCIFY_HELPER/Contents/MacOS/applet</string></array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>ARCIFY_SYNC_DIR</key><string>$SYNC_DIR</string>
    <key>ARCIFY_HOME</key><string>$ARCIFY_HOME</string>
    <key>VIVALDI_PROFILE</key><string>$VIVALDI_PROFILE</string>
    <key>VM_TASK</key><string>pinned-sync</string>
  </dict>
  <key>WatchPaths</key>
  <array>
    <string>$VIVALDI_PROFILE/Bookmarks</string>
    <string>$SYNC_DIR/pinned-tabs.json</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>300</integer>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST

launchctl bootstrap "gui/$UID" "$PLIST"
echo "Pinned tab sync is on (shared folder: $SYNC_DIR)."
echo "Check it any time: scripts/pinned-sync.sh --status"
if [[ "$built" == rebuilt ]]; then
  echo
  echo "One-time step: allow \"Vivaldi Arcify\" in System Settings >"
  echo "Privacy & Security > Full Disk Access (opening it now). If it isn't listed,"
  echo "click + and pick it from Applications."
  echo "To check it later, open Vivaldi Arcify (Applications)."
  open "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles" || true
fi
