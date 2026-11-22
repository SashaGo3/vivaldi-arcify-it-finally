// Tab stack look (accordion mode). Vivaldi puts each stack's expand /
// collapse row *under* the stack. This turns that row into the stack's
// header, Arc-folder style:
//
//   open stack:    ┌ [icon] Jira    7  ×  ⌄ ┐  ← the arrow row, moved to the top
//                  │ tab                      │    and made a full tab row
//                  └ tab ─────────────────────┘
//   closed stack:  [icon] Jira      7     ›     ← the arrow sits in the stack row
//
// The header is a full row (easy to click), so rows below an open stack
// move down by the difference, and rows below a closed one move up into
// the space of its arrow row (--vm-dy on each row).
// The × to close every tab in the stack sits on the stack icon: hover the
// icon (like a tab's ×), click, then click "Close 7" to confirm.
// Styles: tab-list.css ("Tab stacks").

(() => {
  if (window.__vmStackUi) return;
  window.__vmStackUi = true;

  const LOG = '[stack-ui]';
  const ext = (t) => { try { return JSON.parse(t.vivExtData || '{}'); } catch { return {}; } };
  const idOf = (pos) => Number(pos?.querySelector('.tab-wrapper[data-id]')?.dataset.id.replace('tab-', ''));
  const y = (pos) => parseFloat(pos.style.getPropertyValue('--PositionY')) || 0;
  const titles = new Map(); // tab id → stack name, so we don't ask every time

  // The rows of the stack an arrow row belongs to: the tab rows right before it.
  function stackRows(arrow) {
    const rows = [];
    for (let el = arrow.previousElementSibling; el; el = el.previousElementSibling) {
      const pos = el.matches('.tab-position') ? el : el.querySelector(':scope > .tab-position');
      const w = pos?.querySelector(':scope > .tab-wrapper');
      if (!w || !(w.classList.contains('in-accordion') || w.classList.contains('accordion'))) break;
      rows.unshift(pos);
      if (w.classList.contains('accordion') || w.querySelector('.tab-first-in-group')) break;
    }
    return rows;
  }

  // ── Close a whole stack ──
  const X = '<svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const membersOf = (id) => new Promise((resolve) => chrome.tabs.get(id, (t) => {
    const g = !chrome.runtime.lastError && t && ext(t).group;
    if (!g) return resolve([]);
    chrome.tabs.query({ windowId: t.windowId }, (all) => resolve(all.filter((x) => ext(x).group === g)));
  }));
  function disarm(b) {
    clearTimeout(b.t);
    delete b.dataset.armed;
    b.innerHTML = X;
    b.title = 'Close all tabs in this stack';
  }
  async function onClose(e) {
    e.preventDefault();
    e.stopPropagation();
    const b = e.currentTarget;
    const members = await membersOf(Number(b.dataset.tab));
    if (!members.length) return;
    if (!('armed' in b.dataset)) {
      b.dataset.armed = '';
      b.textContent = `Close ${members.length}`;
      b.title = 'Click again to close them all';
      b.t = setTimeout(() => disarm(b), 3000);
      return;
    }
    disarm(b);
    chrome.tabs.remove(members.map((t) => t.id));
    console.log(LOG, 'closed stack of', members.length, 'tabs');
  }
  const stop = (e) => e.stopPropagation();
  function closeButton(host) {
    let b = host.querySelector(':scope > .vm-stack-close');
    if (!b) {
      b = document.createElement('button');
      b.className = 'vm-stack-close';
      b.type = 'button';
      b.setAttribute('aria-label', 'Close all tabs in this stack');
      disarm(b);
      // Keep the click from opening, collapsing or selecting the stack.
      for (const ev of ['mousedown', 'pointerdown', 'mouseup', 'pointerup']) b.addEventListener(ev, stop);
      b.addEventListener('click', onClose);
      host.appendChild(b);
    }
    return b;
  }

  function setVar(el, name, value) {
    if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value);
  }
  // Name and count in the header (real elements: Vivaldi uses the row's
  // ::before / ::after itself).
  function label(arrow) {
    let l = arrow.querySelector(':scope > .vm-stack-label');
    if (l && !l.querySelector('.vm-stack-icon')) { l.remove(); l = null; } // older layout
    if (!l) {
      l = document.createElement('span');
      l.className = 'vm-stack-label';
      l.innerHTML = '<img class="vm-stack-icon" alt=""><span class="vm-stack-name"></span><span class="vm-stack-count"></span>';
      arrow.prepend(l);
    }
    return l;
  }
  const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };

  function setData(el, name, value) {
    if (value == null) { if (name in el.dataset) delete el.dataset[name]; }
    else if (el.dataset[name] !== value) el.dataset[name] = value;
  }

  function render() {
    const strip = document.querySelector('#tabs-tabbar-container .tab-strip');
    if (!strip) return;
    // Layout: walk the rows top to bottom. An open stack's header is a full
    // row instead of Vivaldi's short one, so its tabs and every row below
    // move down; `shift` is how far, so far.
    const stackOf = new Map(); // row → { arrow, open }
    const arrows = [...strip.querySelectorAll(':scope > .tab-position.accordion-toggle-arrow')];
    for (const arrow of arrows) {
      const open = arrow.classList.contains('expanded');
      for (const r of stackRows(arrow)) stackOf.set(r, { arrow, open });
    }
    let shift = 0;
    for (const el of strip.children) {
      const pos = el.matches('.tab-position') ? el : el.querySelector(':scope > .tab-position');
      if (!pos) continue;
      if (pos.classList.contains('accordion-toggle-arrow')) {
        const own = parseFloat(pos.style.getPropertyValue('--Height')) || 19;
        // Open: the header is a full row, not Vivaldi's short one. Closed: the
        // arrow sits inside the stack row, so its own row's space goes away.
        if (pos.classList.contains('expanded')) shift += (parseFloat(pos.style.getPropertyValue('--vm-row')) || 33) - own;
        else shift -= own;
        continue;
      }
      const s = stackOf.get(pos);
      const rowH = parseFloat(pos.style.getPropertyValue('--Height')) || 33;
      setVar(pos, '--vm-dy', `${shift + (s?.open ? rowH : 0)}px`);
      // The header goes where the stack's first row is (open: above its tabs).
      if (s && stackRows(s.arrow)[0] === pos) {
        setVar(s.arrow, '--vm-top', `${y(pos) + shift}px`);
        setVar(s.arrow, '--vm-row', `${rowH}px`);
        const tab = pos.querySelector('.tab');
        if (tab) setVar(s.arrow, '--vm-right', `${Math.round(tab.getBoundingClientRect().right - strip.getBoundingClientRect().left)}px`);
      }
    }
    setVar(strip, '--vm-extra', `${shift}px`);

    for (const arrow of arrows) {
      const rows = stackRows(arrow);
      if (!rows.length) continue;
      const open = arrow.classList.contains('expanded');
      const first = idOf(rows[0]);
      const l = label(arrow);
      const [icon, name, count] = l.children;
      setText(count, open ? String(rows.length) : '');
      // The site icon, copied from the first tab (Vivaldi sets it with
      // srcset, sometimes src).
      const img = rows[0].querySelector('.favicon img');
      for (const a of ['src', 'srcset']) {
        const v = img?.getAttribute(a);
        if (v && icon.getAttribute(a) !== v) icon.setAttribute(a, v);
      }
      if (titles.has(first)) setText(name, titles.get(first));
      else if (first) {
        titles.set(first, '');
        chrome.tabs.get(first, (t) => {
          if (chrome.runtime.lastError || !t) return;
          titles.set(first, ext(t).fixedGroupTitle || 'Stack');
          setText(name, titles.get(first));
        });
      }
      const b = closeButton(arrow);
      b.dataset.tab = String(first);
    }
    // Closed stacks get the × in their row too.
    for (const header of strip.querySelectorAll('.tab.tab-accordion .tab-header')) {
      closeButton(header).dataset.tab = String(idOf(header.closest('.tab-position')));
    }
    if (!('vmStackUi' in strip.dataset)) strip.dataset.vmStackUi = '';
  }

  // Stack names change rarely; forget them when tabs change.
  const forget = () => titles.clear();

  const wait = setInterval(() => {
    const browser = document.getElementById('browser');
    if (!browser || !window.chrome?.tabs) return;
    clearInterval(wait);
    window.__vmStackRender = render; // for debugging from the console
    render();
    // One update per batch of changes, after Vivaldi's own work (a task,
    // not a microtask, so it can never keep Vivaldi busy). Stops when the
    // window closes.
    let queued = false;
    let closing = false;
    for (const ev of ['beforeunload', 'pagehide']) addEventListener(ev, () => { closing = true; mo.disconnect(); });
    const mo = new MutationObserver(() => {
      if (queued || closing) return;
      queued = true;
      setTimeout(() => { queued = false; if (!closing) render(); }, 0);
    });
    mo.observe(browser, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style'] });
    chrome.tabs.onUpdated.addListener((id, change) => { if (change.vivExtData) forget(); });
    chrome.tabs.onRemoved.addListener(forget);
  }, 300);
})();
