#!/bin/zsh
# Build (or keep) the one helper app, /Applications/Vivaldi Arcify.app, that
# both optional background jobs run through. Called by
# scripts/auto-reinstall.sh and scripts/pinned-sync.sh; prints "rebuilt" if
# it had to build it, which means macOS forgot its permissions and they need
# allowing again.
#
#   scripts/helpers/helper-app.sh           build if changed
#   scripts/helpers/helper-app.sh --remove  remove it if no job uses it
set -euo pipefail
REPO=${0:A:h:h:h}
source "$REPO/scripts/lib.zsh"
AGENTS="$HOME/Library/LaunchAgents"

case "${1:-}" in
  --remove)
    if [[ ! -f "$AGENTS/vivaldi-arcify.reinstall.plist" && ! -f "$AGENTS/vivaldi-arcify.pinned-sync.plist" ]]; then
      rm -rf "$ARCIFY_HELPER"
    fi
    exit ;;
esac

SYNC_DIR=$(cfg syncFolder "")
SYNC_DIR=${SYNC_DIR/#\~/$HOME}
[[ -n "$SYNC_DIR" ]] || SYNC_DIR=${ARCIFY_CONFIG:h}

# Background jobs get no PATH, and Python shims (pyenv, asdf) hang there:
# use macOS's own Python (the sync script works with its 3.9).
"$REPO/scripts/helpers/build-helper.sh" "$REPO/scripts/helpers/arcify-helper.applescript" "$ARCIFY_HELPER" \
  vivaldi-arcify.helper "$REPO/assets/helper-icons/arcify.icns" \
  PYTHON=/usr/bin/python3 \
  SYNC_SCRIPT="$ARCIFY_HOME/pinned-sync.py" SYNC_LOG="$ARCIFY_HOME/pinned-sync.log" \
  REINSTALL_SCRIPT="$ARCIFY_HOME/reinstall-after-update.sh" REINSTALL_LOG="$ARCIFY_HOME/reinstall.log" \
  HTML="$ARCIFY_RES/window.html" \
  SHARED_DIR="$SYNC_DIR" AGENTS="$AGENTS" \
  ARCIFY_HOME="$ARCIFY_HOME" VIVALDI_PROFILE="$VIVALDI_PROFILE"
