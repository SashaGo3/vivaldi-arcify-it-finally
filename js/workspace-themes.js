// Per-workspace themes for Vivaldi.
//
// Vivaldi has no per-workspace theme. Command Chains ("Switch to Theme…" +
// "Switch to Workspace N") only work when you use that shortcut. Automation,
// link routes or clicking a tab in another workspace keep the old theme.
//
// This mod watches the active tab and applies the theme saved for its
// workspace. To choose a workspace's theme, go to that workspace and pick a
// theme the normal way (Settings → Themes, or Quick Commands). The mod saves
// your choice.
//
// Runs inside Vivaldi's UI page (window.html), so it has the vivaldi.* APIs
// that normal extensions don't. Installed by scripts/install-js.sh.

(() => {
  // Starting values (workspace name → theme name) from your config file
  // (setup.sh writes it to arcify_mods/00-config.js). Choices you make later in
  // Vivaldi override these.
  const DEFAULTS = Object.fromEntries(
    (window.ARCIFY_CONFIG?.workspaces || [])
      .filter((w) => w.name && w.theme)
      .map((w) => [w.name, w.theme]));

  // Theme for new workspaces and for tabs outside any workspace, until you
  // pick one there.
  const DEFAULT_THEME = window.ARCIFY_CONFIG?.defaultTheme ?? 'Graphite';
  let defaultThemeId;

  const LOG = '[workspace-themes]';
  const STORE = 'workspaceThemes.v2'; // chrome.storage.local: { [workspaceId]: themeId }
  const NONE = 'none'; // key for tabs that are in no workspace

  // vivaldi.prefs.get gives { value, defaultValue, store }; return the value.
  const prefGet = (path) =>
    new Promise((resolve) => {
      const done = (r) => resolve(r && typeof r === 'object' && 'store' in r ? r.value : r);
      const p = vivaldi.prefs.get(path, done);
      if (p && typeof p.then === 'function') p.then(done);
    });

  // localStorage is null in window.html, so keep the map in memory and
  // persist it to chrome.storage.local.
  let map = {};
  const load = () => map;
  const save = (m) => { map = m; chrome.storage.local.set({ [STORE]: m }); };
  const restore = () =>
    new Promise((resolve) =>
      chrome.storage.local.get(STORE, (r) => { map = r?.[STORE] || {}; resolve(); }));

  const workspaceKey = (tab) => {
    try {
      return String(JSON.parse(tab.vivExtData || '{}').workspaceId ?? NONE);
    } catch {
      return NONE;
    }
  };

  async function seedDefaults() {
    const map = load();
    const workspaces = (await prefGet('vivaldi.workspaces.list')) || [];
    const themes = ((await prefGet('vivaldi.themes.system')) || [])
      .concat((await prefGet('vivaldi.themes.user')) || []);
    for (const [wsName, themeName] of Object.entries(DEFAULTS)) {
      const ws = workspaces.find((w) => w.name === wsName);
      const theme = themes.find((t) => t?.name === themeName);
      if (ws && theme && !(String(ws.id) in map)) map[String(ws.id)] = theme.id;
    }
    defaultThemeId = themes.find((t) => t?.name === DEFAULT_THEME)?.id;
    save(map);
  }

  let myWindowId;
  let currentKey;       // workspace of this window's active tab
  let expectedTheme;    // theme we just set, so we don't save it as a choice
  let pendingSave;      // timer for saving a manual pick

  async function sync(tab) {
    if (!tab || !tab.active || tab.windowId !== myWindowId) return;
    const key = workspaceKey(tab);
    if (key === currentKey) return;
    currentKey = key;
    clearTimeout(pendingSave);

    const themeId = load()[key] ?? defaultThemeId;
    if (!themeId || (await prefGet('vivaldi.themes.current')) === themeId) return;
    expectedTheme = themeId;
    vivaldi.prefs.set({ path: 'vivaldi.themes.current', value: themeId });
    console.log(LOG, 'workspace', key, '→ theme', themeId);
  }

  // Expose the theme name to CSS: #browser[data-theme-name="Polska"] { … }
  async function tagTheme(themeId) {
    const themes = ((await prefGet('vivaldi.themes.system')) || [])
      .concat((await prefGet('vivaldi.themes.user')) || []);
    const name = themes.find((t) => t?.id === themeId)?.name ?? '';
    document.getElementById('browser')?.setAttribute('data-theme-name', name);
  }

  // You changed the theme yourself: remember it for this workspace.
  // The event passes just the pref path (a string).
  async function onPrefChanged(change) {
    const path = typeof change === 'string' ? change : change?.path;
    if (path !== 'vivaldi.themes.current') return;
    const value = await prefGet(path);
    tagTheme(value);
    if (value === expectedTheme) { expectedTheme = undefined; return; }
    if (!document.hasFocus() || currentKey === undefined) return; // only the window you're using
    // Wait before saving: a command chain like "Switch to Theme" + "Switch to
    // Workspace" changes the theme just before the workspace. That isn't a
    // pick for the workspace you're leaving.
    const key = currentKey;
    clearTimeout(pendingSave);
    pendingSave = setTimeout(async () => {
      if (currentKey !== key || (await prefGet('vivaldi.themes.current')) !== value) return;
      const map = load();
      map[key] = value;
      save(map);
      console.log(LOG, 'saved theme', value, 'for workspace', key);
    }, 1500);
  }

  const syncActive = () =>
    chrome.tabs.query({ active: true, windowId: myWindowId }, ([tab]) => sync(tab));

  async function start() {
    await restore();
    await seedDefaults();
    tagTheme(await prefGet('vivaldi.themes.current'));
    // #browser gets re-rendered sometimes; keep the tag on it.
    setInterval(async () => {
      const b = document.getElementById('browser');
      if (b && !b.hasAttribute('data-theme-name')) tagTheme(await prefGet('vivaldi.themes.current'));
    }, 2000);
    chrome.windows.getCurrent((win) => { myWindowId = win.id; syncActive(); });

    // Tab switch, which includes switching workspace.
    chrome.tabs.onActivated.addListener(({ tabId }) => chrome.tabs.get(tabId, sync));
    // Active tab moved into another workspace (e.g. by a link route).
    chrome.tabs.onUpdated.addListener((_id, change, tab) => {
      if ('vivExtData' in change) sync(tab);
    });
    // Another window came to front; it may be in a different workspace.
    chrome.windows.onFocusChanged.addListener((winId) => {
      if (winId === myWindowId) { currentKey = undefined; syncActive(); }
    });
    vivaldi.prefs.onChanged.addListener(onPrefChanged);
    // Safety net: link routes and automation can switch workspace without
    // the events above arriving in a useful order. Cheap check every second.
    setInterval(syncActive, 1000);

    console.log(LOG, 'loaded', load());
  }

  // window.html loads before Vivaldi's UI is ready; wait for it.
  const wait = setInterval(() => {
    if (document.getElementById('browser') && window.vivaldi?.prefs) {
      clearInterval(wait);
      start();
    }
  }, 300);
})();
