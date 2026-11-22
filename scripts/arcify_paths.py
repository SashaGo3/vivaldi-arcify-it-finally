"""Paths shared by the Python scripts. Same rules as scripts/lib.zsh, so a
script run on its own finds the same profile and config as setup.sh."""
import os
import pathlib
import sys

HOME = pathlib.Path.home()
PROFILE = pathlib.Path(os.environ.get("VIVALDI_PROFILE") or
                       HOME / "Library/Application Support/Vivaldi/Default")
PREFS = pathlib.Path(os.environ.get("VIVALDI_PREFS") or PROFILE / "Preferences")
ARCIFY_HOME = pathlib.Path(os.environ.get("ARCIFY_HOME") or
                           HOME / "Library/Application Support/VivaldiArcify")
ICLOUD = HOME / "Library/Mobile Documents/com~apple~CloudDocs/VivaldiArcify"


def config_path():
    if os.environ.get("ARCIFY_CONFIG"):
        return pathlib.Path(os.environ["ARCIFY_CONFIG"])
    remembered = ARCIFY_HOME / "config-path"
    if remembered.is_file() and remembered.read_text().strip():
        return pathlib.Path(remembered.read_text().strip())
    if (ICLOUD / "config.json").is_file():
        return ICLOUD / "config.json"
    return ARCIFY_HOME / "config.json"


def vivaldi_running():
    """True if Vivaldi is running with this profile (Chromium's SingletonLock
    symlink in the user data folder points to "host-pid")."""
    lock = PREFS.parent.parent / "SingletonLock"
    try:
        pid = int(os.readlink(lock).rsplit("-", 1)[1])
        os.kill(pid, 0)
        return True
    except (OSError, ValueError, IndexError):
        return False


def require_quit():
    if vivaldi_running():
        sys.exit("Vivaldi is running. Quit it first (Cmd+Q).")
