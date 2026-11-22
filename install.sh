#!/bin/zsh
# Install or update Vivaldi Arcify with one command:
#
#   curl -fsSL https://raw.githubusercontent.com/SashaGo3/vivaldi-arcify-it-finally/main/install.sh | zsh
#
# Downloads the mods to ~/Library/Application Support/VivaldiArcify/app (git
# clone if you have git, a plain download if not), or updates them if they're
# already there, then runs setup.sh. Options are passed on to setup.sh
# (… | zsh -s -- --yes).
#
# Override with ARCIFY_DIR (where the mods go) and ARCIFY_REPO (owner/name).
set -euo pipefail

REPO=${ARCIFY_REPO:-SashaGo3/vivaldi-arcify-it-finally}
DIR=${ARCIFY_DIR:-"$HOME/Library/Application Support/VivaldiArcify/app"}
say() { print -P "%F{green}==>%f $*"; }
die() { print -P "%F{red}error:%f $*" >&2; exit 1; }

[[ "$(uname)" == Darwin ]] || die "Vivaldi Arcify is for macOS."
has_git() { xcode-select -p >/dev/null 2>&1 && command -v git >/dev/null; }

if [[ -d "$DIR/.git" ]] && has_git; then
  say "Updating $DIR"
  git -C "$DIR" pull --ff-only --quiet || die "Couldn't update (local changes?). Fix it in $DIR, then run again."
elif has_git && [[ ! -e "$DIR" ]]; then
  say "Downloading to $DIR"
  mkdir -p "${DIR:h}"
  git clone --quiet "https://github.com/$REPO.git" "$DIR"
else
  say "Downloading to $DIR"
  tmp=$(mktemp -d)
  curl -fsSL "https://github.com/$REPO/archive/refs/heads/main.tar.gz" | tar -xz -C "$tmp" --strip-components=1 \
    || die "Download failed. Check your connection and try again."
  mkdir -p "$DIR"
  # Keep the downloaded vivalarc.css and local files; replace everything else.
  rsync -a --delete --exclude .git --exclude css/vivalarc.css --exclude css/vm-pinned-sync.css "$tmp/" "$DIR/"
  rm -rf "$tmp"
fi

# Piped into zsh, stdin is this script: give setup the terminal for its questions.
if [[ ! -t 0 ]] && [[ -r /dev/tty ]] && { : </dev/tty; } 2>/dev/null; then
  exec "$DIR/setup.sh" "$@" </dev/tty
fi
exec "$DIR/setup.sh" "$@"
