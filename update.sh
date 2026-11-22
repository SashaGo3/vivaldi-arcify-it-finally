#!/bin/zsh
# Apply changes to the mods without quitting Vivaldi: after you edit them,
# pull new ones (git pull), or change your config.
#
#   ./update.sh                 JS mods and background jobs
#   ./update.sh --save-config   also save this Mac's workspaces and UI layout
#                               to your config (scripts/export-config.py)
#
# CSS changes need nothing: Vivaldi reads the CSS folder on every start.
# Themes, workspaces and the layout need Vivaldi closed: run ./setup.sh.
set -euo pipefail
REPO=${0:A:h}
source "$REPO/scripts/lib.zsh"

[[ -f "$ARCIFY_CONFIG" ]] || die "No config at $ARCIFY_CONFIG. Run ./setup.sh first."

if [[ "${1:-}" == "--save-config" ]]; then
  say "Saving workspaces and UI layout to your config"
  /usr/bin/python3 "$REPO/scripts/export-config.py"
fi
"$REPO/scripts/get-vivalarc.sh" >/dev/null || true
say "JS mods"
"$REPO/scripts/install-js.sh"
if [[ "$(cfg autoReinstall false)" == true ]]; then
  say "Auto-reinstall job"
  "$REPO/scripts/auto-reinstall.sh"
fi
if [[ "$(cfg syncPinnedTabs false)" == true ]]; then
  say "Pinned tab sync"
  "$REPO/scripts/pinned-sync.sh"
fi
say "Done. Restart Vivaldi (Cmd+Q, then open it) to load JS changes."
