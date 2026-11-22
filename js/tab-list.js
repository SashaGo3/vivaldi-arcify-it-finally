// Tab list (regular, not pinned) improvements:
//
// - Shorter titles: drops the site name at the end ("… - Jira",
//   "… - Google Search"); the favicon already says which site it is.
// - Duplicates: never closed on their own. They're dimmed, and Clear
//   closes the older copies.
// - Old tabs: tabs you haven't looked at for a while are dimmed and moved
//   to the bottom of the list, and a "Clear" button at the top of the
//   list closes them (plus duplicates, blank tabs and tabs that failed to
//   load). Shift+click Clear: every workspace in this window. Closed tabs
//   come back with Undo, and are saved in the "Cleared tabs" bookmark folder.
// - Unload: tabs idle for a while are unloaded to free memory first.
// - Keep: Alt+click a tab so it's never unloaded or cleared (Alt+click again
//   to undo).
// - Stuck tabs: a new tab Vivaldi never starts loading is reopened.
//
// Vivaldi resets tab.lastAccessed on restart, so the mod keeps its own
// "last seen" time per URL in chrome.storage.local.

(() => {
  // Run once per window, even if the script is loaded twice.
  if (window.__vmTabList) return;
  window.__vmTabList = true;

  const CONFIG = window.ARCIFY_CONFIG || {};
  const HOUR = 3600e3;
  const OLD_AFTER_MS = (CONFIG.oldTabHours ?? 5) * HOUR;
  const UNLOAD_AFTER_MS = (CONFIG.unloadTabHours ?? 1) * HOUR; // 0: never
  const BY_SITE = CONFIG.oldTabHoursBySite || {}; // { "atlassian.net": 24, "google.com/search": 1 }
  const SAVE_CLEARED = CONFIG.saveClearedTabs ?? true;
  const STORE = 'tabLastSeen.v1'; // { [url]: timestamp }
  const KEEP_STORE = 'tabKeep.v1'; // { [url]: true }
  const LOG = '[tab-list]';

  // ── Shorter titles ──
  // Site names that don't appear in the host name.
  const SITE_NAMES = new Set([
    'jira', 'confluence', 'play console help', 'google play console',
    'google docs', 'google sheets', 'google slides', 'google drive',
    'google calendar', 'gmail', 'youtube', 'outlook', 'microsoft teams',
    'stack overflow', 'wikipedia', 'medium', 'reddit', 'claude',
  ]);
  const SEP = /\s+[-–—|·•]\s+/;

  const hostOf = (wrapper) => {
    const src = wrapper.querySelector('.favicon img')?.src || '';
    try {
      const page = new URL(src).searchParams.get('pageUrl');
      return page ? new URL(page).hostname.toLowerCase() : '';
    } catch { return ''; }
  };

  const isSiteName = (seg, host) => {
    const s = seg.toLowerCase().trim();
    if (SITE_NAMES.has(s)) return true;
    const words = s.split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
    return words.length > 0 && words.some((w) => host.includes(w));
  };

  function shortTitle(title, host) {
    let parts = title.split(SEP);
    while (parts.length > 1 && isSiteName(parts[parts.length - 1], host)) parts.pop();
    const out = title.slice(0, title.indexOf(parts[parts.length - 1]) + parts[parts.length - 1].length);
    return out.length >= 3 ? out : title;
  }

  function updateTitles() {
    for (const el of document.querySelectorAll(
      '#tabs-tabbar-container .tab-position:not(.is-pinned) .tab-header .title')) {
      const full = el.textContent;
      if (el.dataset.full === full) continue;
      el.dataset.full = full;
      const short = shortTitle(full, hostOf(el.closest('.tab-wrapper') || el));
      if (short === full) delete el.dataset.short;
      else el.dataset.short = short;
    }
  }

  // ── Last seen, old tabs ──
  let lastSeen = {};
  let kept = {};
  let myWindowId;
  // Same page = same URL without the #fragment and tracking parameters
  // (Jira links from Slack add atlOrigin, focusedCommentId, …).
  const TRACKING = /^(utm_.*|atlOrigin|focusedCommentId|search_id|xpis|fbclid|gclid|mc_cid|mc_eid|ref_src|si)$/;
  const normalize = (url) => {
    try {
      const u = new URL(url);
      u.hash = '';
      for (const k of [...u.searchParams.keys()]) {
        if (TRACKING.test(k) || (k === 'page' && u.searchParams.get(k).includes('atlassian'))) u.searchParams.delete(k);
      }
      return u.toString();
    } catch { return url || ''; }
  };
  const persist = () => {
    chrome.storage.local.get(STORE, (r) => {
      const stored = r?.[STORE] || {};
      for (const [u, t] of Object.entries(stored)) if (!(u in lastSeen) || lastSeen[u] < t) lastSeen[u] = t;
      chrome.tabs.query({}, (tabs) => {
        const open = new Set(tabs.map((t) => normalize(t.url)));
        for (const u of Object.keys(lastSeen)) if (!open.has(u)) delete lastSeen[u];
        for (const u of Object.keys(kept)) if (!open.has(u)) delete kept[u];
        chrome.storage.local.set({ [STORE]: lastSeen, [KEEP_STORE]: kept });
      });
    });
  };
  const seen = (tab) => {
    if (tab?.url) { lastSeen[normalize(tab.url)] = Date.now(); persist(); }
  };

  const ext = (tab) => { try { return JSON.parse(tab.vivExtData || '{}'); } catch { return {}; } };
  const workspaceOf = (tab) => ext(tab).workspaceId ?? null;

  // Regular tabs in this window: the current workspace, or all of them.
  const listTabs = (allWorkspaces = false) =>
    new Promise((resolve) =>
      chrome.tabs.query({ windowId: myWindowId }, (tabs) => {
        const active = tabs.find((t) => t.active);
        const ws = workspaceOf(active);
        resolve({ active, tabs: tabs.filter((t) => !t.pinned && (allWorkspaces || workspaceOf(t) === ws)) });
      }));

  // How long a tab can sit unopened before it's old: oldTabHoursBySite
  // matches a host ("atlassian.net" also matches "x.atlassian.net"), or part
  // of the address when the key has a "/" ("google.com/search").
  const limitFor = (url) => {
    let host = '';
    try { host = new URL(url).hostname.replace(/^www\./, ''); } catch {}
    for (const [k, h] of Object.entries(BY_SITE)) {
      const hit = k.includes('/') ? url.includes(k) : host === k || host.endsWith('.' + k);
      if (hit) return h * HOUR;
    }
    return OLD_AFTER_MS;
  };

  // Tabs with nothing in them: blank pages and new-tab / start pages.
  const BLANK = /^(about:blank|chrome:\/\/newtab|chrome:\/\/vivaldi-webui\/startpage|vivaldi:\/\/(startpage|newtab))/;
  const failed = new Set(); // tab ids whose page didn't load (network error)

  const isKept = (t) => !!kept[normalize(t.url)];

  // Tabs the Clear button would close: old ones, older copies of
  // duplicates, and empty or failed ones.
  async function clearable(allWorkspaces = false) {
    const { active, tabs } = await listTabs(allWorkspaces);
    const now = Date.now();
    const old = new Set();
    const junk = new Set();
    const byUrl = new Map();
    for (const t of tabs) {
      if (t.active || t.audible || isKept(t)) continue;
      const u = normalize(t.url);
      if (BLANK.test(t.url || t.pendingUrl || '') || failed.has(t.id)) { junk.add(t.id); continue; }
      const at = lastSeen[u] ?? now;
      if (now - at > limitFor(u)) old.add(t.id);
      byUrl.set(u, [...(byUrl.get(u) || []), t]);
    }
    const dupes = new Set();
    for (const group of byUrl.values()) {
      if (group.length < 2) continue;
      // keep the active one, otherwise the last one in the list
      const keep = group.find((t) => t.id === active?.id) || group[group.length - 1];
      for (const t of group) if (t !== keep) dupes.add(t.id);
    }
    return { tabs, old, dupes, junk };
  }

  // ── Unload idle tabs (frees memory; the tab stays in the list) ──
  function unloadIdle(tabs) {
    if (!UNLOAD_AFTER_MS || closing) return;
    const now = Date.now();
    for (const t of tabs) {
      if (t.active || t.audible || t.discarded || t.status === 'loading' || isKept(t)) continue;
      if (!/^https?:/.test(t.url || '')) continue;
      const at = lastSeen[normalize(t.url)] ?? now;
      if (now - at > UNLOAD_AFTER_MS) {
        chrome.tabs.discard(t.id, () => void chrome.runtime.lastError);
        console.log(LOG, 'unloaded idle tab', t.id);
      }
    }
  }

  // An unloaded tab you open should load again by itself, but now and then
  // it stays blank until you switch away and back. If it's still unloaded
  // (or hasn't started loading) a moment later, reload it.
  function wakeUp(id) {
    setTimeout(() => chrome.tabs.get(id, (t) => {
      if (chrome.runtime.lastError || !t || !t.active) return;
      if (t.discarded || t.status === 'unloaded') {
        chrome.tabs.reload(id);
        console.log(LOG, 'reloaded a tab that stayed blank', id);
      }
    }), 1200);
  }

  // ── Keep: Alt+click a tab ──
  // Not on the tab's ×: Alt+click there is Vivaldi's "close other tabs".
  const tabAt = (e) => e.altKey && e.button === 0 && !e.target.closest?.('.close, .vm-stack-close') &&
    e.target.closest?.('#tabs-tabbar-container .tab-position:not(.is-pinned) .tab-wrapper[data-id]');
  // Swallow the click too, so Alt+click doesn't also switch to the tab.
  const swallow = (e) => { if (tabAt(e)) { e.preventDefault(); e.stopPropagation(); } };
  function onTabMouseDown(e) {
    const w = tabAt(e);
    if (!w) return;
    e.preventDefault();
    e.stopPropagation();
    const id = Number(w.dataset.id.replace('tab-', ''));
    chrome.tabs.get(id, (t) => {
      if (chrome.runtime.lastError || !t) return;
      const u = normalize(t.url);
      if (kept[u]) delete kept[u]; else kept[u] = true;
      console.log(LOG, kept[u] ? 'keeping' : 'no longer keeping', id);
      persist();
      refresh();
    });
  }

  // ── Cleared tabs are saved as bookmarks ("Cleared tabs" folder) ──
  const ARCHIVE = 'Cleared tabs';
  const ARCHIVE_KEEP = 30; // newest clears to keep
  const bm = (fn, ...args) => new Promise((r) => chrome.bookmarks[fn](...args, (x) => { void chrome.runtime.lastError; r(x); }));
  async function archive(tabs) {
    if (!SAVE_CLEARED || !chrome.bookmarks || !tabs.length) return null;
    try {
      const [root] = await bm('getTree');
      const top = root.children[0];
      let folder = (top.children || []).find((c) => !c.url && c.title === ARCHIVE);
      if (!folder) folder = await bm('create', { parentId: top.id, title: ARCHIVE });
      const when = new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const sub = await bm('create', { parentId: folder.id, index: 0, title: `${when} · ${tabs.length} tabs` });
      for (const t of tabs) await bm('create', { parentId: sub.id, title: t.title || t.url, url: t.url });
      const subs = (await bm('getChildren', folder.id)).filter((c) => !c.url);
      for (const c of subs.slice(ARCHIVE_KEEP)) await bm('removeTree', c.id);
      return sub.id;
    } catch (e) {
      console.warn(LOG, 'could not save cleared tabs', e);
      return null;
    }
  }

  // ── Tabs Clear would close sink to the bottom of the list ──
  // Only loose tabs: moving a tab out of the middle of a stack would split it.
  function sinkClearable(tabs, ids) {
    if (closing || !document.hasFocus()) return; // only while you're using this window
    const loose = tabs.filter((t) => !ext(t).group).sort((a, b) => a.index - b.index);
    const lastKeep = loose.map((t) => ids.has(t.id)).lastIndexOf(false);
    const move = loose.slice(0, lastKeep).filter((t) => ids.has(t.id)).map((t) => t.id);
    if (!move.length) return;
    chrome.tabs.move(move, { index: -1 }, () => void chrome.runtime.lastError);
    console.log(LOG, 'moved', move.length, 'old tab(s) to the bottom');
  }

  // ── Clear button (in the separator at the top of the tab list) ──
  let undoIds = 0; // how many tabs the last Clear closed
  let undoFolder = null; // the bookmark folder it saved them in
  let undoTimer;

  function button() {
    const sep = document.querySelector('#tabs-tabbar-container .tab-strip > .separator');
    if (!sep) return null;
    let b = sep.querySelector('.vm-clear');
    if (!b) {
      b = document.createElement('button');
      b.className = 'vm-clear';
      b.addEventListener('click', (e) => onClear(e.shiftKey));
      b.addEventListener('mousedown', (e) => e.stopPropagation());
      sep.appendChild(b);
    }
    return b;
  }

  async function onClear(allWorkspaces) {
    const b = button();
    if (b?.dataset.mode === 'undo') {
      clearTimeout(undoTimer);
      for (let i = 0; i < undoIds; i++) await new Promise((r) => chrome.sessions.restore(r));
      if (undoFolder) chrome.bookmarks.removeTree(undoFolder, () => void chrome.runtime.lastError);
      undoIds = 0;
      undoFolder = null;
      b.dataset.mode = '';
      return refresh();
    }
    const { tabs, old, dupes, junk } = await clearable(allWorkspaces);
    const ids = [...new Set([...old, ...dupes, ...junk])];
    if (!ids.length) return;
    const closing = tabs.filter((t) => ids.includes(t.id));
    chrome.tabs.remove(ids);
    console.log(LOG, 'cleared', ids.length, 'tabs', allWorkspaces ? '(all workspaces)' : '');
    undoIds = ids.length;
    if (b) {
      b.dataset.mode = 'undo';
      b.textContent = `Closed ${ids.length} · Undo`;
      b.hidden = false;
    }
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => { undoIds = 0; undoFolder = null; if (b) b.dataset.mode = ''; refresh(); }, 8000);
    // Blank and failed tabs aren't worth a bookmark.
    undoFolder = null;
    const folder = await archive(closing.filter((t) => !junk.has(t.id)));
    if (undoIds) undoFolder = folder; // not undone while saving
    else if (folder) chrome.bookmarks.removeTree(folder, () => void chrome.runtime.lastError);
  }

  // Once the window starts closing (or Vivaldi quits), change nothing.
  let closing = false;
  for (const ev of ['beforeunload', 'pagehide']) addEventListener(ev, () => { closing = true; });

  let refreshSeq = 0;
  async function refresh() {
    if (closing) return;
    updateTitles();
    const seq = ++refreshSeq;
    const { tabs, old, dupes, junk } = await clearable();
    if (seq !== refreshSeq) return; // a newer refresh is running; it will draw
    listTabs(true).then((r) => unloadIdle(r.tabs)); // every workspace
    const byId = new Map(tabs.map((t) => [t.id, t]));
    sinkClearable(tabs, new Set([...old, ...dupes, ...junk]));
    const b = button();
    for (const w of document.querySelectorAll(
      '#tabs-tabbar-container .tab-position:not(.is-pinned) .tab-wrapper[data-id]')) {
      const id = Number(w.dataset.id.replace('tab-', ''));
      const t = byId.get(id);
      const u = t && normalize(t.url);
      const keep = t && isKept(t);
      // Data attributes, not classes: Vivaldi rewrites className on render.
      const v = [old.has(id) && 'old', dupes.has(id) && 'dupe', junk.has(id) && 'junk',
        keep && 'kept'].filter(Boolean).join(' ');
      if ((w.dataset.vm || '') !== v) w.dataset.vm = v;
      // A dot marks kept tabs.
      const header = w.querySelector('.tab-header');
      if (!header) continue;
      const badge = keep ? '●' : '';
      if ((header.dataset.vmBadge || '') !== badge) {
        if (badge) header.dataset.vmBadge = badge; else delete header.dataset.vmBadge;
      }
    }
    if (!b || b.dataset.mode === 'undo') return;
    const n = new Set([...old, ...dupes, ...junk]).size;
    b.hidden = n === 0;
    // Only touch the DOM when it changes: the observer below watches it.
    if (b.textContent !== `Clear ${n}`) b.textContent = `Clear ${n}`;
    const parts = [
      old.size && `${old.size} not opened for ${OLD_AFTER_MS / HOUR}h+`,
      dupes.size && `${dupes.size} duplicate(s)`,
      junk.size && `${junk.size} empty or failed`,
    ].filter(Boolean);
    const title = `Close ${parts.join(', ')}.\nShift+click: all workspaces. Alt+click a tab to keep it.`;
    if (b.title !== title) b.title = title;
  }

  // ── New tabs: watched for getting stuck (below) ──
  // Tabs Vivaldi restores (at startup, or a window from Trash) also arrive
  // as new tabs; they're left alone. Two signs of a restore: the first 30 s
  // after start, and tabs arriving in a burst (more than 3 within 2 s; then
  // 10 s of quiet before it's over).
  const startedAt = Date.now();
  let burst = [];
  let restoringUntil = 0;
  const restoring = () => {
    const now = Date.now();
    burst = burst.filter((t) => now - t < 2000);
    burst.push(now);
    if (burst.length > 3) restoringUntil = now + 10e3;
    return now - startedAt < 30e3 || now < restoringUntil;
  };
  function onCreated(tab) {
    if (tab.windowId !== myWindowId) return;
    if (restoring()) return;
    watch.set(tab.id, Date.now());
  }

  // ── Stuck new tabs: reopen them ──
  // Vivaldi sometimes creates a tab for a link from another app (a launcher)
  // but never starts a page process for it: the tab stays "loading" with no
  // title and "0 bytes" of RAM, and Reload doesn't help. A new tab with the
  // same address loads fine, so swap one in.
  const STUCK_MS = 10e3;
  const watch = new Map();   // tabId → time it was created
  const retried = new Map(); // url → time we last reopened it (once a minute)
  function watchdog() {
    if (closing) return;
    const now = Date.now();
    for (const [id, since] of watch) {
      if (now - since < STUCK_MS) continue;
      watch.delete(id);
      chrome.tabs.get(id, (tab) => {
        if (chrome.runtime.lastError || !tab) return;
        const url = tab.url || tab.pendingUrl || '';
        if (tab.status !== 'loading' || tab.title || tab.discarded || !/^https?:/.test(url)) return;
        if (now - (retried.get(url) || 0) < 60e3) return;
        retried.set(url, now);
        chrome.tabs.create({ windowId: tab.windowId, index: tab.index, url, active: tab.active }, (fresh) => {
          if (chrome.runtime.lastError || !fresh) return;
          // Keep it in the stuck tab's workspace (Vivaldi's own "Move to
          // workspace" call; changing vivExtData doesn't move a tab).
          if (workspaceOf(tab) !== null && workspaceOf(fresh) !== workspaceOf(tab)) {
            vivaldi.tabsPrivate.move({ tabIds: [fresh.id], target: tab.id, tweaks: ['do-not-reparent'], workspaceId: workspaceOf(tab) })
              .catch((e) => console.warn(LOG, 'could not move reopened tab', e));
          }
          chrome.tabs.remove(tab.id);
          console.log(LOG, 'reopened stuck tab', tab.id, 'as', fresh.id, url);
        });
      });
    }
  }

  function start() {
    chrome.windows.getCurrent((win) => {
      myWindowId = win.id;
      chrome.storage.local.get([STORE, KEEP_STORE], (r) => {
        lastSeen = r?.[STORE] || {};
        kept = r?.[KEEP_STORE] || {};
        // Tabs the mod hasn't seen yet count as seen now (nothing is "old"
        // right after installing).
        chrome.tabs.query({}, (tabs) => {
          for (const t of tabs) { const u = normalize(t.url); if (!(u in lastSeen)) lastSeen[u] = Date.now(); }
          persist();
          refresh();
        });
      });
    });
    chrome.tabs.onActivated.addListener(({ tabId }) => chrome.tabs.get(tabId, (t) => {
      seen(t);
      refresh();
      if (t?.discarded) wakeUp(tabId);
    }));
    chrome.tabs.onCreated.addListener(onCreated);
    chrome.tabs.onUpdated.addListener((id, change, tab) => {
      if (change.url || change.status === 'loading') failed.delete(id);
      if (change.url && tab.active) seen(tab);
    });
    chrome.tabs.onRemoved.addListener((id) => { watch.delete(id); failed.delete(id); setTimeout(refresh, 100); });
    // Pages that failed to load (no network, unknown host, …).
    chrome.webNavigation?.onErrorOccurred?.addListener((d) => {
      if (d.frameId === 0 && !/ERR_ABORTED/.test(d.error || '')) { failed.add(d.tabId); setTimeout(refresh, 100); }
    });
    document.addEventListener('mousedown', onTabMouseDown, true);
    document.addEventListener('mouseup', swallow, true);
    document.addEventListener('click', swallow, true);
    setInterval(() => { if (watch.size) watchdog(); }, 2e3);
    // The active tab counts as seen while you use it.
    setInterval(() => chrome.tabs.query({ active: true, windowId: myWindowId }, ([t]) => {
      if (document.hasFocus()) seen(t);
    }), 60e3);
    // Titles change, and Vivaldi re-renders the list.
    new MutationObserver(() => { clearTimeout(start.t); start.t = setTimeout(refresh, 150); })
      .observe(document.getElementById('tabs-tabbar-container') || document.body,
        { subtree: true, childList: true, characterData: true });
    setInterval(refresh, 30e3);
  }

  const wait = setInterval(() => {
    if (document.getElementById('browser') && window.chrome?.tabs) {
      clearInterval(wait);
      start();
    }
  }, 300);
})();
