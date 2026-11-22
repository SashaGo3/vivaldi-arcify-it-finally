# Shared paths and helpers for the Vivaldi Arcify scripts. Source it:
#   source "${0:A:h}/scripts/lib.zsh"     (from the repo root)
#
# Everything can be overridden with an environment variable:
#   VIVALDI_APP      the Vivaldi app            (/Applications/Vivaldi.app)
#   VIVALDI_PROFILE  the Vivaldi profile folder (…/Vivaldi/Default)
#   ARCIFY_HOME      local state, logs, caches  (~/Library/Application Support/VivaldiArcify)
#   ARCIFY_CONFIG    your config file           (see below)

export VIVALDI_APP=${VIVALDI_APP:-/Applications/Vivaldi.app}
export VIVALDI_PROFILE=${VIVALDI_PROFILE:-"$HOME/Library/Application Support/Vivaldi/Default"}
export VIVALDI_PREFS="$VIVALDI_PROFILE/Preferences"
export ARCIFY_HOME=${ARCIFY_HOME:-"$HOME/Library/Application Support/VivaldiArcify"}
ARCIFY_ICLOUD="$HOME/Library/Mobile Documents/com~apple~CloudDocs/VivaldiArcify"
ARCIFY_RES="$VIVALDI_APP/Contents/Frameworks/Vivaldi Framework.framework/Versions/Current/Resources/vivaldi"
ARCIFY_HELPER=${ARCIFY_HELPER:-"/Applications/Vivaldi Arcify.app"}

# Where the config lives: $ARCIFY_CONFIG, else the place setup remembered
# (local or iCloud Drive), else iCloud Drive if a config is already there
# (another Mac set it up), else the local folder.
if [[ -z "${ARCIFY_CONFIG:-}" ]]; then
  if [[ -s "$ARCIFY_HOME/config-path" ]]; then
    ARCIFY_CONFIG=$(<"$ARCIFY_HOME/config-path")
  elif [[ -f "$ARCIFY_ICLOUD/config.json" ]]; then
    ARCIFY_CONFIG="$ARCIFY_ICLOUD/config.json"
  else
    ARCIFY_CONFIG="$ARCIFY_HOME/config.json"
  fi
fi
export ARCIFY_CONFIG

say()  { print -P "%F{green}==>%f $*"; }
note() { print -P "    %F{8}$*%f"; }
warn() { print -P "%F{yellow}warning:%f $*" >&2; }
die()  { print -P "%F{red}error:%f $*" >&2; exit 1; }

# Read a key from the config: cfg KEY [DEFAULT]. Prints true/false for booleans.
cfg() {
  /usr/bin/python3 -I - "$ARCIFY_CONFIG" "$1" "${2:-}" <<'PY'
import json, sys
path, key, default = sys.argv[1:]
try:
    v = json.load(open(path)).get(key, None)
except (OSError, ValueError):
    v = None
if v is None:
    print(default)
elif isinstance(v, bool):
    print("true" if v else "false")
else:
    print(v)
PY
}

# Set keys in the config: cfg_set KEY=JSON_VALUE…  (cfg_set syncPinnedTabs=true)
cfg_set() {
  /usr/bin/python3 -I - "$ARCIFY_CONFIG" "$@" <<'PY'
import json, sys
path, *pairs = sys.argv[1:]
c = json.load(open(path))
for p in pairs:
    k, v = p.split("=", 1)
    c[k] = json.loads(v)
open(path, "w").write(json.dumps(c, indent=2, ensure_ascii=False) + "\n")
PY
}

# Is Vivaldi running with this profile? Chromium keeps a SingletonLock
# symlink ("host-pid") in the user data folder while it runs.
vivaldi_running() {
  local lock="${VIVALDI_PROFILE:h}/SingletonLock" pid
  [[ -L "$lock" ]] || return 1
  pid=${$(readlink "$lock")##*-}
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

# Ask a yes/no question: ask "Question?" y|n. Without a terminal, the default.
ask() {
  local q=$1 def=${2:-n} hint reply
  [[ $def == y ]] && hint="[Y/n]" || hint="[y/N]"
  if [[ ! -t 0 ]]; then [[ $def == y ]]; return; fi
  read "reply?$q $hint "
  [[ -z "$reply" ]] && reply=$def
  [[ "$reply" == [yY]* ]]
}
