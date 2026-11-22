#!/usr/bin/env python3
"""Pinned tab sync between Macs, through a shared folder (iCloud Drive by
default; any synced folder works, see "syncFolder" in the README).

Run by the background job (scripts/pinned-sync.sh). Each run:

1. Reads this Mac's pinned tabs from Vivaldi's bookmark folder
   "Other Bookmarks > Pinned tabs (synced)" (kept up to date by
   js/pinned-sync.js), and compares them with the last run: what you pinned
   or unpinned since then.
2. Merges that into <shared folder>/pinned-tabs.json, which every
   Mac shares. Each pinned tab (workspace + address) keeps its latest state
   ("pinned" or "unpinned") and when it changed; the newest change wins.
3. Writes the result into vm-pinned-sync.css in Vivaldi's CSS folder, where
   js/pinned-sync.js reads it and applies other Macs' changes.

Safety: if this Mac suddenly has far fewer pinned tabs than last time (a
window that didn't come back after a restart, for example), nothing is sent
until you confirm with `scripts/pinned-sync.sh --accept`.

  pinned-sync.py            one run (what the job does)
  pinned-sync.py --status   show the shared list and this Mac's state
  pinned-sync.py --accept   send a big drop in pinned tabs anyway
  pinned-sync.py --summary  a few lines for the helper app's window
"""
import base64
import glob
import json
import os
import socket
import sys
import time
import uuid

HOME = os.path.expanduser('~')
PROFILE = os.environ.get('VIVALDI_PROFILE', f'{HOME}/Library/Application Support/Vivaldi/Default')
ARCIFY_HOME = os.environ.get('ARCIFY_HOME', f'{HOME}/Library/Application Support/VivaldiArcify')
# The job passes ARCIFY_SYNC_DIR (scripts/pinned-sync.sh works it out).
SYNC_DIR = os.environ.get('ARCIFY_SYNC_DIR',
                          f'{HOME}/Library/Mobile Documents/com~apple~CloudDocs/VivaldiArcify')
SHARED = os.path.join(SYNC_DIR, 'pinned-tabs.json')
STATE = os.path.join(ARCIFY_HOME, 'pinned-sync-state.json')
FOLDER = 'Pinned tabs (synced)'
CSS_NAME = 'vm-pinned-sync.css'
SEP = '␟'
TOMBSTONE_DAYS = 60  # forget "unpinned" entries after this long


def log(*a):
    print(time.strftime('%F %T'), *a, flush=True)


def load(path, default):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def save(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = f'{path}.tmp-{os.getpid()}'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=1, ensure_ascii=False, sort_keys=True)
    os.replace(tmp, path)


def local_pinned():
    """{key: {ws, url, title, order}} from the bookmark folder, or None if
    the folder isn't there (Vivaldi hasn't made it yet)."""
    b = load(os.path.join(PROFILE, 'Bookmarks'), None)
    if not b:
        return None

    def find(node):
        for c in node.get('children', []):
            if c.get('type') == 'folder' and c.get('name') == FOLDER:
                return c
            if c.get('type') == 'folder':
                hit = find(c)
                if hit:
                    return hit
        return None

    folder = None
    for root in ('other', 'bookmark_bar'):  # never the trash
        folder = folder or find(b['roots'].get(root, {}))
    if folder is None:
        return None
    out = {}
    for sub in folder.get('children', []):
        if sub.get('type') != 'folder':
            continue
        for i, bm in enumerate(sub.get('children', [])):
            if bm.get('type') == 'url':
                ws, url = sub['name'], bm['url']
                out[f'{ws}{SEP}{url}'] = {'ws': ws, 'url': url, 'title': bm.get('name', url), 'order': i}
    return out


def merge(into, other):
    """Newest change per tab wins. Returns True if `into` changed."""
    changed = False
    for k, e in other.items():
        if k not in into or e.get('ts', 0) > into[k].get('ts', 0):
            into[k] = e
            changed = True
    return changed


def read_shared():
    """The shared list, merged with any iCloud conflict copies
    ("pinned-tabs 2.json"), which are then removed."""
    entries = load(SHARED, {}).get('entries', {})
    extras = [p for p in glob.glob(os.path.join(os.path.dirname(SHARED), 'pinned-tabs*.json')) if p != SHARED]
    for p in extras:
        merge(entries, load(p, {}).get('entries', {}))
    return entries, extras


def css_dir():
    prefs = load(os.path.join(PROFILE, 'Preferences'), {})
    return prefs.get('vivaldi', {}).get('appearance', {}).get('css_ui_mods_directory') or None


def write_css(device, entries):
    d = css_dir()
    if not d or not os.path.isdir(d):
        log('no CSS folder set in Vivaldi; skipping the hand-off to the mod')
        return
    blob = base64.b64encode(json.dumps({'entries': entries}, ensure_ascii=False).encode()).decode()
    css = ('/* Written by scripts/pinned-sync.py for js/pinned-sync.js. Do not edit. */\n'
           f':root {{ --vm-pinned-device: "{device}"; --vm-pinned-sync: "{blob}"; }}\n')
    path = os.path.join(d, CSS_NAME)
    try:
        with open(path, encoding='utf-8') as f:
            if f.read() == css:
                return
    except OSError:
        pass
    tmp = f'{path}.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write(css)
    os.replace(tmp, path)


def run(accept=False):
    state = load(STATE, {})
    if 'device' not in state:
        state['device'] = uuid.uuid4().hex[:12]
        state['name'] = socket.gethostname().split('.')[0]
    device, name = state['device'], state.get('name', '')
    before = state.get('snapshot')  # None on the first run
    now_pinned = local_pinned()

    entries, extras = read_shared()
    changed = bool(extras)
    now = time.time()

    if now_pinned is not None:
        if before is None:
            # First run on this Mac: everything pinned here joins the list.
            # Nothing counts as unpinned.
            added, removed = set(now_pinned), set()
        else:
            added = set(now_pinned) - set(before)
            removed = set(before) - set(now_pinned)
        big_drop = before is not None and len(before) > 3 and len(now_pinned) < len(before) / 2
        if big_drop and not accept:
            log(f'held: {len(before)} pinned tabs last time, {len(now_pinned)} now. If that is right, '
                'run: scripts/pinned-sync.sh --accept')
            state['held'] = {'before': len(before), 'now': len(now_pinned), 'at': now}
            added, removed = set(), set()
            now_pinned = before  # keep the old snapshot until confirmed
        else:
            state.pop('held', None)
        for k in added:
            e = now_pinned[k]
            entries[k] = {**e, 'pinned': True, 'ts': now, 'device': device, 'from': name}
            changed = True
        for k in removed:
            e = before[k]
            entries[k] = {**e, 'pinned': False, 'ts': now, 'device': device, 'from': name}
            changed = True
        # Titles and order change all the time; keep them fresh without
        # counting as a change (no new ts).
        for k, e in now_pinned.items():
            if k in entries and entries[k].get('pinned') and entries[k].get('device') == device:
                if entries[k].get('title') != e['title'] or entries[k].get('order') != e['order']:
                    entries[k].update(title=e['title'], order=e['order'])
                    changed = True
        if added or removed:
            log(f'{len(added)} pinned, {len(removed)} unpinned on this Mac')
        state['snapshot'] = now_pinned

    for k in [k for k, e in entries.items() if not e.get('pinned') and now - e.get('ts', 0) > TOMBSTONE_DAYS * 86400]:
        del entries[k]
        changed = True

    if changed or not os.path.exists(SHARED):
        save(SHARED, {'version': 1, 'entries': entries})
        for p in extras:
            os.remove(p)
    write_css(device, entries)
    state['last_run'] = now
    save(STATE, state)


def status():
    state = load(STATE, {})
    entries, _ = read_shared()
    print(f"This Mac: {state.get('name', '?')} (id {state.get('device', 'not set up yet')})")
    if state.get('last_run'):
        print(f"Last sync: {time.strftime('%F %T', time.localtime(state['last_run']))}")
    if state.get('held'):
        h = state['held']
        print(f"\n⚠ Held: pinned tabs dropped from {h['before']} to {h['now']}. "
              'Run scripts/pinned-sync.sh --accept if that is right.')
    print(f'\nShared list: {SHARED}')
    by_ws = {}
    for e in entries.values():
        by_ws.setdefault(e['ws'], []).append(e)
    for ws in sorted(by_ws):
        items = sorted(by_ws[ws], key=lambda e: (not e.get('pinned'), e.get('order', 0)))
        pinned = [e for e in items if e.get('pinned')]
        print(f'\n{ws}: {len(pinned)} pinned')
        for e in items:
            mark = '📌' if e.get('pinned') else '  (unpinned)'
            when = time.strftime('%b %d %H:%M', time.localtime(e.get('ts', 0)))
            print(f"  {mark} {e.get('title', '')[:60]}  — {e.get('from', '?')}, {when}")
            print(f"     {e['url']}")
    mine = local_pinned()
    print(f"\nThis Mac's backup folder: {'not found' if mine is None else f'{len(mine)} pinned tabs'}")


def summary():
    state = load(STATE, {})
    entries, _ = read_shared()
    pinned = [e for e in entries.values() if e.get('pinned')]
    macs = sorted({e.get('from', '?') for e in entries.values()})
    last = state.get('last_run')
    print(f"This Mac: {state.get('name', '?')}")
    print(f"Last sync: {time.strftime('%b %d, %H:%M:%S', time.localtime(last)) if last else 'never'}")
    print(f"Shared: {len(pinned)} pinned tabs in {len({e['ws'] for e in pinned})} workspaces, from {', '.join(macs) or 'no Mac yet'}")
    if state.get('held'):
        h = state['held']
        print(f"⚠ Held: pinned tabs dropped from {h['before']} to {h['now']}. Run scripts/pinned-sync.sh --accept if that's right.")


if __name__ == '__main__':
    args = sys.argv[1:]
    if '--summary' in args:
        summary()
    elif '--status' in args:
        status()
    else:
        try:
            run(accept='--accept' in args)
        except Exception as e:  # keep the job alive; say what went wrong
            log('error:', repr(e))
            sys.exit(1)
