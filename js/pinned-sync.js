// Pinned tab sync, the Vivaldi side. Works with scripts/pinned-sync.py
// (a background job, installed by scripts/pinned-sync.sh).
//
// 1. Backup: your pinned tabs are kept in the bookmark folder
//    "Other Bookmarks > Pinned tabs (synced)", one subfolder per workspace,
//    in order. Open it to get a pinned tab back by hand.
// 2. Sync: the background job compares that folder with
//    <shared folder>/pinned-tabs.json (iCloud Drive by default) and hands the result back
//    here through a small CSS file (vm-pinned-sync.css in the CSS folder).
//    This mod then applies changes made on your other Macs:
//    - pinned there: if a tab with that address is already open in the
//      workspace (same address, or same page without the query), it's
//      pinned; only otherwise a new pinned tab is opened. No duplicates.
//    - unpinned there: the tab is unpinned here. Tabs are never closed.
//
// Workspaces are matched by name. A pinned tab keeps the address it had when
// you pinned it, so browsing inside it doesn't count as a change.
// On with "syncPinnedTabs": true in your config (setup.sh asks).

(() => {
  if (window.__vmPinnedSync) return;
  window.__vmPinnedSync = true;

  const CONFIG = window.ARCIFY_CONFIG || {};
  if (CONFIG.syncPinnedTabs !== true) return;

  const LOG = '[pinned-sync]';
  const FOLDER = 'Pinned tabs (synced)';
  const NO_WS = 'No workspace';
  const PIN_URLS = 'pinnedSync.pinUrls.v1'; // { [tab ext_id]: url when pinned }
  const APPLIED = 'pinnedSync.applied.v1';  // { [entry key]: ts applied }
  const MAX_OPEN = 60; // per pass: more than this looks like a mistake; stop

  const ext = (t) => { try { return JSON.parse(t.vivExtData || '{}'); } catch { return {}; } };
  const wsOf = (t) => ext(t).workspaceId ?? null;
  const TRACKING = /^(utm_.*|atlOrigin|focusedCommentId|search_id|xpis|fbclid|gclid|mc_cid|mc_eid|ref_src|si)$/;
  const normalize = (url) => {
    try {
      const u = new URL(url);
      u.hash = '';
      for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
      return u.toString();
    } catch { return url || ''; }
  };
  const page = (url) => { try { const u = new URL(url); return u.origin + u.pathname; } catch { return url; } };
  const web = (url) => /^https?:/.test(url || '');
  const key = (ws, url) => `${ws}␟${url}`;

  const p = (fn) => new Promise((r) => fn((x) => { void chrome.runtime.lastError; r(x); }));
  const store = {
    get: async (k) => (await p((cb) => chrome.storage.local.get(k, cb)))?.[k] || {},
    set: (k, v) => chrome.storage.local.set({ [k]: v }),
  };
  const workspaces = () => p((cb) => vivaldi.prefs.get('vivaldi.workspaces.list', cb))
    .then((v) => (v?.value ?? v) || []);
  const allTabs = () => p((cb) => chrome.tabs.query({ windowType: 'normal' }, cb));

  // Only one window does the work (they all run this script).
  let myWindowId;
  const iLead = async () => {
    const wins = await p((cb) => chrome.windows.getAll({ windowTypes: ['normal'] }, cb));
    return wins.length && Math.min(...wins.map((w) => w.id)) === myWindowId;
  };

  // ── 1. Mirror pinned tabs into the bookmark folder ──
  let pinUrls = {};
  let lastCount = -1;
  let drop = null; // { count, since }: a big drop we're waiting on
  const bm = (fn, ...args) => p((cb) => chrome.bookmarks[fn](...args, cb));

  async function folder() {
    const [root] = await bm('getTree');
    const other = root.children.find((c) => c.id === '2') || root.children[1] || root.children[0];
    let f = (other.children || []).find((c) => !c.url && c.title === FOLDER);
    if (!f) f = await bm('create', { parentId: other.id, title: FOLDER });
    return f;
  }

  // One update at a time; a request during one runs once it's done.
  let mirroring = null;
  let again = false;
  function mirror() {
    if (mirroring) { again = true; return mirroring; }
    mirroring = mirrorOnce().finally(() => {
      mirroring = null;
      if (again) { again = false; mirror(); }
    });
    return mirroring;
  }

  let closing = false;
  for (const ev of ['beforeunload', 'pagehide']) addEventListener(ev, () => { closing = true; });

  async function mirrorOnce() {
    if (closing || !(await iLead())) return;
    const tabs = (await allTabs()).filter((t) => t.pinned).sort((a, b) => a.windowId - b.windowId || a.index - b.index);
    // Losing (nearly) every pinned tab at once is a closed window or a start
    // that went wrong, not something to back up or sync.
    // No pinned tabs at all (a window that didn't come back): never back that up.
    if (tabs.length === 0 && lastCount !== 0) return;
    // If the lower count stays for 5 minutes, you meant it: accept it.
    if (lastCount > 3 && tabs.length < lastCount / 2) {
      if (!drop || drop.count !== tabs.length) drop = { count: tabs.length, since: Date.now() };
      if (Date.now() - drop.since < 5 * 60e3) {
        console.warn(LOG, `pinned tabs dropped from ${lastCount} to ${tabs.length}; not updating the backup yet`);
        setTimeout(soon, 60e3);
        return;
      }
    }
    drop = null;
    if (lastCount < 0) {
      // First run since Vivaldi started: compare with what the backup holds.
      const f0 = await folder();
      let n = 0;
      for (const sub of await bm('getChildren', f0.id)) if (!sub.url) n += (await bm('getChildren', sub.id)).length;
      lastCount = n;

    }
    const names = new Map((await workspaces()).map((w) => [w.id, w.name]));
    // Remember each pinned tab's address from when it was pinned.
    const live = new Set();
    for (const t of tabs) {
      const id = ext(t).ext_id;
      if (!id) continue;
      live.add(id);
      if (!pinUrls[id] && web(t.url)) pinUrls[id] = normalize(t.url);
    }
    for (const id of Object.keys(pinUrls)) if (!live.has(id)) delete pinUrls[id];
    store.set(PIN_URLS, pinUrls);

    const want = new Map(); // workspace name → [{ title, url }]
    const seen = new Set();
    for (const t of tabs) {
      const url = pinUrls[ext(t).ext_id] || normalize(t.url);
      if (!web(url)) continue;
      const ws = names.get(wsOf(t)) || NO_WS;
      if (seen.has(key(ws, url))) continue;
      seen.add(key(ws, url));
      if (!want.has(ws)) want.set(ws, []);
      want.get(ws).push({ title: t.title || url, url });
    }
    if (!want.size && lastCount <= 0 && tabs.length === 0) return; // nothing loaded yet
    lastCount = tabs.length;

    const f = await folder();
    let subs = await bm('getChildren', f.id);
    // One subfolder per workspace: drop extra copies.
    const firsts = new Map();
    for (const s of subs) {
      if (s.url) continue;
      if (firsts.has(s.title)) await bm('removeTree', s.id);
      else firsts.set(s.title, s);
    }
    subs = [...firsts.values()];
    for (const [ws, items] of want) {
      const sub = subs.find((s) => s.title === ws);
      const have = sub ? await bm('getChildren', sub.id) : [];
      const same = have.length === items.length && have.every((b, i) => b.url === items[i].url && b.title === items[i].title);
      if (same) continue;
      if (sub) await bm('removeTree', sub.id);
      const n = await bm('create', { parentId: f.id, title: ws });
      for (const it of items) await bm('create', { parentId: n.id, title: it.title, url: it.url });
    }
    for (const s of subs) if (!s.url && !want.has(s.title)) await bm('removeTree', s.id);
  }

  // ── 2. Apply changes from other Macs ──
  // The background job writes them into vm-pinned-sync.css as CSS variables.
  function readData() {
    const css = getComputedStyle(document.documentElement);
    const me = css.getPropertyValue('--vm-pinned-device').trim().replace(/^"|"$/g, '');
    const raw = css.getPropertyValue('--vm-pinned-sync').trim().replace(/^"|"$/g, '');
    if (!me || !raw) return null;
    try {
      const json = new TextDecoder().decode(Uint8Array.from(atob(raw), (c) => c.charCodeAt(0)));
      return { me, entries: JSON.parse(json).entries || {} };
    } catch (e) {
      console.warn(LOG, 'bad sync data', e);
      return null;
    }
  }

  // Load the CSS folder again so a new vm-pinned-sync.css shows up. A second
  // <link> is added and the old one removed once it has loaded: no flash.
  function reloadCss() {
    return new Promise((resolve) => {
      const old = document.querySelector('link[href^="chrome://vivaldi-data/css-mods/css"]');
      if (!old) return resolve();
      const n = old.cloneNode();
      n.href = 'chrome://vivaldi-data/css-mods/css?' + Date.now();
      n.onload = n.onerror = () => { old.remove(); resolve(); };
      old.after(n);
    });
  }

  let applying = false;
  async function apply() {
    if (closing || applying || !(await iLead())) return;
    applying = true;
    try {
      await reloadCss();
      const data = readData();
      if (!data) return;
      const applied = await store.get(APPLIED);
      const byName = new Map((await workspaces()).map((w) => [w.name, w.id]));
      const changes = Object.entries(data.entries)
        .filter(([k, e]) => e.device !== data.me && e.ts > (applied[k] || 0))
        .sort((a, b) => a[1].ts - b[1].ts);
      if (!changes.length) return;
      let tabs = (await allTabs()).filter((t) => t.windowId === myWindowId);
      let opened = 0;
      for (const [k, e] of changes) {
        const wsId = e.ws === NO_WS ? null : byName.get(e.ws);
        if (wsId === undefined) continue; // that workspace isn't on this Mac (yet)
        const inWs = tabs.filter((t) => wsOf(t) === wsId);
        const match = inWs.find((t) => pinUrls[ext(t).ext_id] === e.url || normalize(t.url) === e.url) ||
          inWs.find((t) => page(t.url) === page(e.url));
        if (e.pinned) {
          if (match) {
            if (!match.pinned) {
              await p((cb) => chrome.tabs.update(match.id, { pinned: true }, cb));
              console.log(LOG, 'pinned the open tab', e.url, 'in', e.ws);
            }
          } else {
            if (++opened > MAX_OPEN) { console.warn(LOG, `more than ${MAX_OPEN} tabs to open; stopping`); break; }
            // Vivaldi opens it in the current workspace and ignores `pinned`
            // on create: move it (Vivaldi's own "Move to workspace" call),
            // then pin it.
            const t = await p((cb) => chrome.tabs.create({ windowId: myWindowId, url: e.url, active: false }, cb));
            if (!t) continue;
            await vivaldi.tabsPrivate.move({ tabIds: [t.id], target: 'last', tweaks: ['do-not-reparent'], workspaceId: wsId ?? 'window' });
            await p((cb) => chrome.tabs.update(t.id, { pinned: true }, cb));
            tabs.push({ ...t, pinned: true, vivExtData: JSON.stringify({ ...ext(t), workspaceId: wsId ?? undefined }) });
            console.log(LOG, 'opened pinned tab', e.url, 'in', e.ws);
          }
        } else if (match?.pinned) {
          await p((cb) => chrome.tabs.update(match.id, { pinned: false }, cb));
          console.log(LOG, 'unpinned', e.url, 'in', e.ws, '(unpinned on another Mac)');
        }
        applied[k] = e.ts;
      }
      store.set(APPLIED, applied);
      soon();
    } catch (e) {
      console.warn(LOG, e);
    } finally {
      applying = false;
    }
  }

  let t;
  const soon = () => { clearTimeout(t); t = setTimeout(() => mirror().catch((e) => console.warn(LOG, e)), 2000); };

  function start() {
    chrome.windows.getCurrent(async (win) => {
      myWindowId = win.id;
      pinUrls = await store.get(PIN_URLS);
      // Let Vivaldi finish restoring tabs before the first backup.
      setTimeout(soon, 8000);
      setTimeout(apply, 12000);
      setInterval(apply, 30e3);
    });
    chrome.tabs.onUpdated.addListener((id, c, tab) => {
      if ('pinned' in c || (tab.pinned && (c.title || c.url || c.vivExtData))) soon();
    });
    chrome.tabs.onMoved.addListener(soon);
    chrome.tabs.onRemoved.addListener(soon);
    chrome.tabs.onCreated.addListener((tab) => { if (tab.pinned) soon(); });
  }

  const wait = setInterval(() => {
    if (document.getElementById('browser') && window.chrome?.tabs && window.vivaldi?.prefs) {
      clearInterval(wait);
      start();
    }
  }, 300);
})();
