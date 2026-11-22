// Cmd+[ as a real Back button, like Arc.
//
// A link that opens in a new tab starts with no history, so Back (Cmd+[)
// does nothing there. With this mod, Back on such a tab closes it and
// switches to the tab that opened it. On any page that has history, Back
// works as usual.
//
// How: on macOS the browser core handles Cmd+[ itself; Vivaldi's UI (where
// this mod runs) never hears about it. So the mod adds a tiny script to each
// page that watches for Cmd+[ when the page can't go back, and tells the
// mod, which closes the tab. The script goes in as soon as the page starts
// showing; before that, Cmd+[ on it does nothing, as before. Pages that use
// Cmd+[ themselves (editors that call preventDefault) are left alone.

(() => {
  if (window.__vmBackClosesTab) return;
  window.__vmBackClosesTab = true;

  const LOG = '[back-closes-tab]';

  // Runs in each page (isolated from the page's own scripts).
  const PAGE_SCRIPT = `(() => {
    if (window.__vmBack) return;
    window.__vmBack = true;
    addEventListener('keydown', (e) => {
      if (!e.metaKey || e.shiftKey || e.altKey || e.ctrlKey || e.code !== 'BracketLeft' || e.repeat) return;
      if (window.navigation?.canGoBack ?? history.length > 1) return;
      // Let the page's own handlers go first.
      setTimeout(() => { if (!e.defaultPrevented) chrome.runtime.sendMessage({ vmBack: 1 }); });
    }, false);
  })();`;

  // Vivaldi's webviews ignore addContentScripts, and refuse executeScript
  // until the new page exists. So start trying as soon as a page starts
  // loading and retry every 250 ms (up to ~10 s) until it goes in. The
  // script guards against running twice.
  const tries = new Map(); // tabId → timer
  function inject(tabId, left = 40) {
    clearTimeout(tries.get(tabId));
    tries.delete(tabId);
    const view = [...document.querySelectorAll('webview')]
      .find((w) => w.getAttribute('tab_id') == tabId);
    if (typeof view?.executeScript !== 'function') return;
    const retry = () => {
      if (left > 0) tries.set(tabId, setTimeout(() => inject(tabId, left - 1), 250));
    };
    try {
      view.executeScript({ code: PAGE_SCRIPT }, (res) => {
        if (chrome.runtime.lastError || !res) retry();
      });
    } catch { retry(); } // page not ready yet
  }

  let myWindowId;
  chrome.runtime.onMessage.addListener((msg, sender) => {
    if (!msg?.vmBack || !sender.tab || sender.tab.windowId !== myWindowId) return;
    const tab = sender.tab;
    if (!tab.openerTabId || tab.pinned) return;
    chrome.tabs.get(tab.openerTabId, (opener) => {
      if (chrome.runtime.lastError || !opener) return;
      chrome.tabs.update(opener.id, { active: true });
      chrome.tabs.remove(tab.id);
      console.log(LOG, 'closed tab', tab.id, '→ back to', opener.id);
    });
  });

  const wait = setInterval(() => {
    if (!document.getElementById('browser') || !window.chrome?.tabs) return;
    clearInterval(wait);
    chrome.windows.getCurrent((win) => { myWindowId = win.id; });
    chrome.tabs.onUpdated.addListener((id, change, tab) => {
      if (tab.windowId === myWindowId && (change.status === 'loading' || change.status === 'complete')) inject(id);
    });
    chrome.tabs.onRemoved.addListener((id) => { clearTimeout(tries.get(id)); tries.delete(id); });
    // Pages already open when the window loaded.
    chrome.tabs.query({ status: 'complete' }, (tabs) => tabs.forEach((t) => inject(t.id)));
  }, 300);
})();
