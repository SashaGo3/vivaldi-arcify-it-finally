// Copy URL: a small button at the right end of the address field, shown on
// hover. Click it to copy the current page's address; Shift+click copies
// a link, "[Page title](address)", for Slack, Jira or Markdown. A check mark
// shows for a moment. Styles: arc-layout.css (.vm-copy-url).

(() => {
  if (window.__vmCopyUrl) return;
  window.__vmCopyUrl = true;

  const LOG = '[copy-url]';
  const ICON = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">' +
    '<rect x="5.5" y="5.5" width="8" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
    '<path d="M10.5 3.5v-.5a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3v5A1.5 1.5 0 0 0 4 9.5h.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
  const CHECK = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">' +
    '<path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const HINT = 'Copy address (Shift+click: copy as link)';

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // The UI window may not have clipboard permission: the old way works.
      const ta = Object.assign(document.createElement('textarea'), { value: text });
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  }

  function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const b = e.currentTarget;
    const asLink = e.shiftKey;
    chrome.windows.getCurrent((win) => chrome.tabs.query({ active: true, windowId: win.id }, async ([t]) => {
      const url = t?.url || t?.pendingUrl;
      if (!url) return;
      const title = (t.title || url).replace(/[[\]]/g, '\\$&');
      await copy(asLink ? `[${title}](${url})` : url);
      console.log(LOG, 'copied', asLink ? 'link' : 'address', url);
      b.innerHTML = CHECK;
      b.dataset.done = '';
      b.title = asLink ? 'Copied link' : 'Copied';
      clearTimeout(b.t);
      b.t = setTimeout(() => { b.innerHTML = ICON; delete b.dataset.done; b.title = HINT; }, 1500);
    }));
  }

  function attach() {
    for (const field of document.querySelectorAll('.UrlBar-AddressField')) {
      if (field.querySelector(':scope > .vm-copy-url')) continue;
      const b = document.createElement('button');
      b.className = 'vm-copy-url';
      b.type = 'button';
      b.title = HINT;
      b.setAttribute('aria-label', 'Copy address');
      b.innerHTML = ICON;
      // Don't let the field take focus (that would start editing).
      b.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
      b.addEventListener('click', onClick);
      field.appendChild(b);
    }
  }

  const wait = setInterval(() => {
    if (document.getElementById('browser') && window.chrome?.tabs) {
      clearInterval(wait);
      attach();
      // Vivaldi re-creates the field when toolbars change.
      new MutationObserver(() => { clearTimeout(attach.t); attach.t = setTimeout(attach, 200); })
        .observe(document.getElementById('browser'), { childList: true, subtree: true });
    }
  }, 300);
})();
