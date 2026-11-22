#!/bin/zsh
# Remove Vivaldi Arcify: the JS mods, the background jobs and the helper
# app, and (with Vivaldi quit) the CSS folder setting. Your tabs, workspaces
# and the themes stay; switch theme in Settings > Themes.
#
#   ./uninstall.sh            keep your config
#   ./uninstall.sh --all      also delete your config and local state
set -euo pipefail
REPO=${0:A:h}
source "$REPO/scripts/lib.zsh"
AGENTS="$HOME/Library/LaunchAgents"

say "JS mods"
"$REPO/scripts/install-js.sh" --remove || warn "couldn't restore window.html (a Vivaldi update may already have)"
[[ -f "$AGENTS/vivaldi-arcify.reinstall.plist" ]] && "$REPO/scripts/auto-reinstall.sh" --remove
[[ -f "$AGENTS/vivaldi-arcify.pinned-sync.plist" ]] && "$REPO/scripts/pinned-sync.sh" --remove
rm -rf "$ARCIFY_HELPER"

if vivaldi_running; then
  print "\nVivaldi is running, so the CSS is still on. To turn it off: Settings >"
  print "Appearance > Custom UI Modifications > clear the folder. (Or quit Vivaldi and"
  print "run this again.)"
else
  /usr/bin/python3 -I - "$VIVALDI_PREFS" "$REPO/css" <<'PY'
import json, sys
path, css = sys.argv[1:]
p = json.load(open(path))
a = p.get("vivaldi", {}).get("appearance", {})
if a.get("css_ui_mods_directory") == css:
    a["css_ui_mods_directory"] = ""
    open(path, "w").write(json.dumps(p, separators=(",", ":")))
    print("CSS folder setting cleared.")
PY
fi

if [[ "${1:-}" == "--all" ]]; then
  rm -f "$ARCIFY_CONFIG"
  rm -rf "$ARCIFY_HOME"
  echo "Config and local state deleted."
fi
say "Done. Restart Vivaldi. (Themes stay in Settings > Themes; delete any you don't want.)"
