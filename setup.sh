#!/bin/zsh
# Vivaldi Arcify: set up (or update) the Arc-style mods for Vivaldi on macOS.
#
#   ./setup.sh                  set up; asks a few questions the first time
#   ./setup.sh --yes            don't ask before quitting Vivaldi
#   ./setup.sh --reconfigure    ask the questions again
#   ./setup.sh --profile "Profile 1"   use another Vivaldi profile
#   ./setup.sh --no-start       don't start Vivaldi at the end
#
# Safe to re-run any time: it only adds or updates things.
set -euo pipefail
REPO=${0:A:h}

YES= RECONFIGURE= NO_START=
while (( $# )); do
  case $1 in
    --yes|-y) YES=1 ;;
    --reconfigure) RECONFIGURE=1 ;;
    --no-start) NO_START=1 ;;
    --profile) shift; export VIVALDI_PROFILE="$HOME/Library/Application Support/Vivaldi/$1" ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) print -u2 "Unknown option: $1"; sed -n '2,10p' "$0"; exit 1 ;;
  esac
  shift
done
source "$REPO/scripts/lib.zsh"
DEFAULT_PROFILE="$HOME/Library/Application Support/Vivaldi/Default"

print -P "\n%BVivaldi Arcify%b: Arc-style Vivaldi\n"
[[ -d "$VIVALDI_APP" ]] || die "Vivaldi isn't installed ($VIVALDI_APP). Get it from https://vivaldi.com, open it once, then run this again."
[[ -f "$VIVALDI_PREFS" ]] || die "No Vivaldi profile at $VIVALDI_PROFILE yet. Open Vivaldi once, then run this again."

interactive() { [[ -t 0 ]]; }

# ── 1. Config ──────────────────────────────────────────────────────────────
FIRST=
if [[ ! -f "$ARCIFY_CONFIG" ]]; then
  FIRST=1
  mkdir -p "$ARCIFY_HOME"
  if [[ -d "${ARCIFY_ICLOUD:h}" ]] && interactive &&
     ask "Keep your Arcify settings in iCloud Drive, so all your Macs share them?" n; then
    ARCIFY_CONFIG="$ARCIFY_ICLOUD/config.json"
  fi
  if [[ ! -f "$ARCIFY_CONFIG" ]]; then
    mkdir -p "${ARCIFY_CONFIG:h}"
    cp "$REPO/config.example.json" "$ARCIFY_CONFIG"
  fi
  print -r -- "$ARCIFY_CONFIG" > "$ARCIFY_HOME/config-path"
  export ARCIFY_CONFIG
fi
say "Config: $ARCIFY_CONFIG"

# ── 2. Questions (first run, or --reconfigure) ────────────────────────────
need() { [[ -n "$RECONFIGURE" || "$(cfg "$1" unset)" == unset ]]; }

if need arcLayout; then
  print "\n  The recommended layout puts tabs on the left, the address field in the"
  print "  sidebar and the side panel icons in a row under the tabs, and hides the top bar."
  ask "  Apply the recommended Arc layout?" y && v=true || v=false
  cfg_set arcLayout=$v
fi

if [[ -n "$FIRST" ]] && interactive && [[ "$(cfg workspaces '[]')" == "[]" ]]; then
  print "\n  Each workspace can have its own theme, switched for you as you move between them."
  if ask "  Create three starter workspaces (Personal, Work, Ideas), each with its own theme?" n; then
    cfg_set 'workspaces=[{"name":"Personal","emoji":"🌿","theme":"Forest Night"},{"name":"Work","emoji":"💼","theme":"Slate"},{"name":"Ideas","emoji":"💡","theme":"Sakura"}]'
  fi
fi

if need autoReinstall; then
  print "\n  Vivaldi updates remove the JS mods. A small helper app can put them back"
  print "  right after each update (it needs one permission: App Management)."
  if interactive && ask "  Reinstall the mods automatically after Vivaldi updates?" y; then v=true; else v=false; fi
  cfg_set autoReinstall=$v
fi

if need syncPinnedTabs; then
  if [[ "$ARCIFY_CONFIG" == "$ARCIFY_ICLOUD"/* || -n "$(cfg syncFolder '')" ]]; then
    print "\n  Pinned tabs can be backed up to a bookmark folder and synced between your"
    print "  Macs (through the same helper app; it needs Full Disk Access)."
    if interactive && ask "  Sync pinned tabs between your Macs?" y; then v=true; else v=false; fi
  else
    v=false
  fi
  cfg_set syncPinnedTabs=$v
fi
print

# ── 3. Vivaldi must be closed to change its settings ──────────────────────
if vivaldi_running; then
  [[ "$VIVALDI_PROFILE" == "$DEFAULT_PROFILE" ]] || die "Vivaldi is running with $VIVALDI_PROFILE. Quit it, then run this again."
  if [[ -z "$YES" ]]; then
    interactive || die "Vivaldi is running and there's no terminal to ask. Quit it first, or run ./setup.sh --yes"
    ask "Vivaldi must quit to apply the settings (your tabs come back when it starts). Quit it now?" y || exit 1
  fi
  say "Quitting Vivaldi…"
  osascript -e "tell application \"${VIVALDI_APP:t:r}\" to quit" || true
  for i in {1..30}; do vivaldi_running || break; sleep 1; done
  vivaldi_running && die "Vivaldi didn't quit."
fi

# ── 4. Install ────────────────────────────────────────────────────────────
say "VivalArc base styles"
"$REPO/scripts/get-vivalarc.sh" || warn "continuing without VivalArc"
say "Themes"
/usr/bin/python3 "$REPO/scripts/install-themes.py"
say "Vivaldi settings"
preset=()
[[ "$(cfg arcLayout true)" == true ]] && preset=(--preset "$REPO/presets/arc-layout.json")
/usr/bin/python3 "$REPO/scripts/apply-prefs.py" --config "$ARCIFY_CONFIG" --css-dir "$REPO/css" "${preset[@]}"
say "JS mods"
"$REPO/scripts/install-js.sh"

AGENTS="$HOME/Library/LaunchAgents"
if [[ "$(cfg autoReinstall false)" == true ]]; then
  say "Auto-reinstall after Vivaldi updates"
  "$REPO/scripts/auto-reinstall.sh"
elif [[ -f "$AGENTS/vivaldi-arcify.reinstall.plist" ]]; then
  "$REPO/scripts/auto-reinstall.sh" --remove
fi
if [[ "$(cfg syncPinnedTabs false)" == true ]]; then
  say "Pinned tab sync"
  "$REPO/scripts/pinned-sync.sh"
elif [[ -f "$AGENTS/vivaldi-arcify.pinned-sync.plist" ]]; then
  "$REPO/scripts/pinned-sync.sh" --remove
fi

# ── 5. Start Vivaldi ──────────────────────────────────────────────────────
if [[ -z "$NO_START" && "$VIVALDI_PROFILE" == "$DEFAULT_PROFILE" ]]; then
  say "Starting Vivaldi"
  open -a "$VIVALDI_APP"
fi

print -P "\n%F{green}Done.%f Next:"
print "  • Pick a theme for each workspace: go to the workspace, then Settings > Themes"
print "    (or Quick Commands: type the theme's name). The mod remembers it."
print "  • After you change or pull the mods: ./update.sh"
print "  • Settings live in $ARCIFY_CONFIG (./setup.sh --reconfigure to answer again)."
