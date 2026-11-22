// Site stacks: when a workspace has several regular tabs from one site
// (3 by default), they go into a tab stack named after the site. New tabs
// from that site join the stack.
//
// - Only loose tabs are stacked: tabs already in a stack you made stay there.
// - A tab in one of these stacks that moves on to another site leaves the
//   stack (once you've switched away from it).
// - Unstack one of these stacks yourself and the mod leaves that site alone
//   for 12 hours.
// - Config: "groupBySite": false turns it off; "groupBySiteMin": 3 is how
//   many tabs it takes.
//
// Uses Vivaldi's own stack calls (vivaldi.tabsPrivate.move with
// "create-new-group", then setGroupProperties for the name), the same ones
// "Stack tabs by host" uses.

(() => {
  if (window.__vmSiteStacks) return;
  window.__vmSiteStacks = true;

  const CONFIG = window.ARCIFY_CONFIG || {};
  if (CONFIG.groupBySite === false) return;
  const MIN = Math.max(2, CONFIG.groupBySiteMin ?? 3);
  const STORE = 'siteStacks.v1'; // { groups: { [groupId]: { key, ids } }, snoozed: { [key]: until } }
  const SNOOZE_MS = 12 * 3600e3;
  const LOG = '[site-stacks]';

  let state = { groups: {}, snoozed: {} };
  let myWindowId;
  let busy = false;

  const tp = () => window.vivaldi?.tabsPrivate;
  const ext = (t) => { try { return JSON.parse(t.vivExtData || '{}'); } catch { return {}; } };

  // The site a tab belongs to: its host without "www.". Google keeps
  // different apps on one host, so docs.google.com/document and
  // docs.google.com/spreadsheets are different sites.
  function siteOf(url) {
    let u;
    try { u = new URL(url); } catch { return null; }
    if (!/^https?:$/.test(u.protocol)) return null;
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'docs.google.com') {
      const app = u.pathname.split('/')[1];
      return { key: `${host}/${app}`, label: { document: 'Docs', spreadsheets: 'Sheets', presentation: 'Slides', forms: 'Forms' }[app] || 'Google Docs' };
    }
    return { key: host, label: labelFor(host), long: labelFor(host, true) };
  }

  // "github.com" → "GitHub"-ish: the main part of the name, capitalised.
  // Company subdomains: "acme.atlassian.net" → "Jira" ("Acme Jira" when the
  // workspace has more than one, see below).
  const KNOWN = { 'atlassian.net': 'Jira', 'slack.com': 'Slack', 'github.com': 'GitHub', 'youtube.com': 'YouTube' };
  function labelFor(host, long = false) {
    for (const [d, name] of Object.entries(KNOWN)) {
      if (host === d) return name;
      if (host.endsWith('.' + d)) return long ? `${cap(host.slice(0, -d.length - 1).split('.').pop())} ${name}` : name;
    }
    const parts = host.split('.');
    // "bbc.co.uk": skip the "co" before a country ending.
    const cc = parts.length > 2 && parts[parts.length - 1].length === 2 && parts[parts.length - 2].length <= 3;
    const main = parts[parts.length - (cc ? 3 : 2)] || host;
    // Google's apps live on subdomains: mail, calendar, drive, …
    if (main === 'google' && parts.length > 2) return cap(parts[0]);
    return cap(main);
  }
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

  const save = () => chrome.storage.local.set({ [STORE]: state });

  let closing = false;
  for (const ev of ['beforeunload', 'pagehide']) addEventListener(ev, () => { closing = true; });

  async function group() {
    if (closing || busy || !tp()?.move) return;
    // Vivaldi makes no stacks while Settings > Tabs > Tab Stacking is "None".
    const mode = await new Promise((r) => vivaldi.prefs.get('vivaldi.tabs.stacking.mode', (p) => r(p?.value ?? p)));
    if (mode === 0 || mode === 'off') {
      if (!group.warned) console.warn(LOG, 'tab stacking is off in Settings > Tabs; not stacking');
      group.warned = true;
      return;
    }
    busy = true;
    try {
      const all = await new Promise((r) => chrome.tabs.query({ windowId: myWindowId }, r));
      const active = all.find((t) => t.active);
      const ws = ext(active).workspaceId ?? null;
      const tabs = all.filter((t) => !t.pinned && (ext(t).workspaceId ?? null) === ws);
      const now = Date.now();
      for (const [k, until] of Object.entries(state.snoozed)) if (until < now) delete state.snoozed[k];

      // Our stacks that are gone: if their tabs are still open and loose,
      // you unstacked them, so leave that site alone for a while.
      const present = new Set(all.map((t) => ext(t).group).filter(Boolean));
      const byId = new Map(all.map((t) => [t.id, t]));
      for (const [g, info] of Object.entries(state.groups)) {
        if (present.has(g)) continue;
        const loose = info.ids.filter((id) => byId.has(id) && !ext(byId.get(id)).group);
        if (loose.length >= 2) {
          state.snoozed[info.key] = now + SNOOZE_MS;
          console.log(LOG, 'you unstacked', info.key, '- leaving it for 12h');
        }
        delete state.groups[g];
      }

      const bySite = new Map();
      for (const t of tabs) {
        const s = siteOf(t.url || t.pendingUrl);
        if (!s) continue;
        if (!bySite.has(s.key)) bySite.set(s.key, { label: s.label, long: s.long, tabs: [] });
        bySite.get(s.key).tabs.push(t);
      }
      // Two sites with the same short name (two Jira companies): use the long one.
      const count = new Map();
      for (const v of bySite.values()) count.set(v.label, (count.get(v.label) || 0) + 1);
      for (const v of bySite.values()) if (count.get(v.label) > 1 && v.long) v.label = v.long;

      // Tabs in our stacks that went to another site leave the stack.
      const left = new Set();
      for (const t of tabs) {
        const g = ext(t).group;
        const info = g && state.groups[g];
        if (!info || t.active || t.status === 'loading') continue;
        const s = siteOf(t.url || t.pendingUrl);
        if (!s || s.key === info.key) continue;
        await tp().move({ tabIds: [t.id], target: 'last', tweaks: ['ungroup', 'untile'] });
        info.ids = info.ids.filter((id) => id !== t.id);
        left.add(t.id);
        console.log(LOG, 'tab', t.id, 'left', info.key, 'for', s.key);
      }

      for (const [key, { label, long, tabs: site }] of bySite) {
        if (state.snoozed[key]) continue;
        const loose = site.filter((t) => !ext(t).group);
        const ours = site.map((t) => ext(t).group).find((g) => g && state.groups[g]?.key === key);
        // Rename our stack if its name is out of date ("Acme Jira" → "Jira"),
        // but never a name you gave it.
        const named = ours && site.find((t) => ext(t).group === ours);
        const current = named && ext(named).fixedGroupTitle;
        if (named && !loose.length && current !== label && (current === state.groups[ours].title || current === long)) {
          await tp().setGroupProperties?.({ groupExtId: ours, groupTitle: label });
          state.groups[ours].title = label;
          console.log(LOG, 'renamed stack', key, 'to', label);
        }
        if (!loose.length) continue;
        if (!ours && loose.length < MIN) continue;
        // Everything already in our stack (even tabs that moved on to another
        // site), plus the loose tabs, in list order.
        const members = ours ? tabs.filter((t) => ext(t).group === ours && !left.has(t.id)) : [];
        const ids = [...members, ...loose].sort((a, b) => a.index - b.index).map((t) => t.id);
        const r = await tp().move({ tabIds: ids, target: ids[0], tweaks: ['do-not-reparent', 'create-new-group'] });
        if (!r?.group) { console.warn(LOG, 'could not stack', key, r); continue; }
        await tp().setGroupProperties?.({ groupExtId: r.group, groupTitle: label });
        if (ours && ours !== r.group) delete state.groups[ours];
        state.groups[r.group] = { key, ids, title: label };
        console.log(LOG, 'stacked', ids.length, 'tabs of', key, 'as', label);
      }
      save();
    } catch (e) {
      console.warn(LOG, e);
    } finally {
      busy = false;
    }
  }

  let t;
  const soon = (ms = 1500) => { clearTimeout(t); t = setTimeout(group, ms); };

  function start() {
    chrome.windows.getCurrent((win) => {
      myWindowId = win.id;
      chrome.storage.local.get(STORE, (r) => {
        state = { groups: {}, snoozed: {}, ...(r?.[STORE] || {}) };
        soon(3000);
      });
    });
    // A page finished loading (its site is known), or you switched workspace.
    chrome.tabs.onUpdated.addListener((id, change, tab) => {
      if (tab.windowId === myWindowId && change.status === 'complete') soon();
    });
    chrome.tabs.onActivated.addListener(({ windowId }) => { if (windowId === myWindowId) soon(); });
  }

  const wait = setInterval(() => {
    if (document.getElementById('browser') && window.chrome?.tabs) {
      clearInterval(wait);
      start();
    }
  }, 300);
})();
