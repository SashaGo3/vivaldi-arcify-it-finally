// Pinned tabs as an Arc-style grid (see pinned-grid.css).
//
// Vivaldi places each pinned tile absolutely at a fixed 46px size, leaving
// empty space on the right. CSS turns the group into a grid of equal columns.
// This script:
//  - sets the column count from the tab bar width;
//  - lets tiles fill the grid in DOM order (= tab order). It does NOT read
//    Vivaldi's --PositionX/Y, because Vivaldi animates those through garbage
//    values while pinning/unpinning (tiles jumped a slot right, then scattered);
//  - animates tiles from their old spot to the new one (FLIP), so pin, unpin,
//    close and resize glide instead of jumping; new tiles fade in;
//  - puts a one-word site label under each tile (data-label → CSS ::after).

(() => {
  // Column count: as many tiles of at least MIN_TILE px (plus GAP) as fit.
  // 56px leaves room for labels like "Calendar" or "Confluence".
  const MIN_TILE = 56;
  const GAP = 6;
  const EDGE = 6;
  const MOVE_MS = 260;
  const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

  const rects = new Map();  // tab id → last DOMRect, for FLIP
  const labels = new Map(); // tab id → label

  // ── one-word label from the tab's URL ──
  const GENERIC = new Set(['google', 'apple', 'microsoft', 'amazon', 'live', 'office', 'cloud', 'zoho', 'vivaldi', 'notion']);
  const NAMES = { appstoreconnect: 'App Store', github: 'GitHub', mail: 'Gmail', play: 'Play', youtube: 'YouTube', chatgpt: 'ChatGPT', linkedin: 'LinkedIn' };
  function wordFor(url) {
    try {
      const u = new URL(url);
      if (!/^https?:$/.test(u.protocol)) return '';
      const host = u.hostname.replace(/^www\./, '');
      if (/^[\d.]+$|^\[/.test(host) || host === 'localhost') return 'Local';
      const parts = host.split('.');
      // example.com.ua / example.co.uk: skip the second-level TLD.
      if (parts.length > 2 && /^(com|co|org|net|gov|edu|ac)$/.test(parts[parts.length - 2])) parts.pop();
      const site = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
      const sub = parts.length > 2 ? parts[0] : '';
      let word = site;
      if (site === 'atlassian') word = u.pathname.startsWith('/wiki') ? 'confluence' : 'jira';
      else if (GENERIC.has(site) && sub) {
        // console.firebase.google.com → firebase; mail.google.com → mail
        const before = parts[parts.length - 3];
        if (!['app', 'web', 'my', 'console', 'accounts'].includes(before)) word = before;
      }
      word = NAMES[word] || word.charAt(0).toUpperCase() + word.slice(1);
      return word;
    } catch {
      return '';
    }
  }
  const tabIdOf = (wrapper) => parseInt((wrapper?.dataset.id || '').replace('tab-', ''), 10);

  // The label lives on .tab-header (its ::after is free; .tab-wrapper::after
  // is Vivaldi's own indicator).
  function applyLabel(tile, id) {
    const header = tile.querySelector('.tab-header');
    if (!header) return;
    const have = labels.get(id);
    if (have !== undefined) {
      if (header.dataset.label !== have) header.dataset.label = have;
      return;
    }
    labels.set(id, '');
    chrome.tabs.get(id, (tab) => {
      if (chrome.runtime.lastError || !tab) return;
      labels.set(id, renamedTitle(tab) || wordFor(tab.url || tab.pendingUrl || ''));
      update();
    });
  }
  // A tab renamed in Vivaldi (Rename… in the tab menu) keeps the name in
  // vivExtData.fixedTitle. Show that instead of the site word.
  function renamedTitle(tab) {
    try {
      return (JSON.parse(tab.vivExtData || '{}').fixedTitle || '').trim();
    } catch {
      return '';
    }
  }
  chrome.tabs.onUpdated.addListener((id, change) => {
    if (change.url || 'vivExtData' in change) { labels.delete(id); update(); }
  });

  // ── FLIP: animate from the old position to the new one ──
  function flip(tile, id, isNew) {
    const wrapper = tile.querySelector('.tab-wrapper');
    if (!wrapper) return;
    const now = tile.getBoundingClientRect();
    const before = rects.get(id);
    rects.set(id, now);
    if (isNew) {
      wrapper.animate(
        [{ opacity: 0, transform: 'scale(0.7)' }, { opacity: 1, transform: 'scale(1)' }],
        { duration: MOVE_MS, easing: EASE });
      return;
    }
    if (!before) return;
    const dx = before.left - now.left;
    const dy = before.top - now.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    wrapper.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
      { duration: MOVE_MS, easing: EASE });
  }

  function layout(group) {
    const tiles = [...group.querySelectorAll('.tab-position.is-pinned')];
    if (!tiles.length) return;
    const barW = group.parentElement?.getBoundingClientRect().width || group.getBoundingClientRect().width;
    const cols = Math.max(1, Math.floor((barW - 2 * EDGE + GAP) / (MIN_TILE + GAP)));
    if (group.style.getPropertyValue('--pinned-cols') !== String(cols)) {
      group.style.setProperty('--pinned-cols', String(cols));
    }
    const firstRun = rects.size === 0;
    const seen = new Set();
    for (const tile of tiles) {
      // Remove placement left by older versions of this script.
      if (tile.style.gridArea || tile.style.order) { tile.style.gridArea = ''; tile.style.order = ''; }
      const id = tabIdOf(tile.querySelector('.tab-wrapper'));
      if (!id) continue;
      seen.add(id);
      applyLabel(tile, id);
      flip(tile, id, !firstRun && !rects.has(id));
    }
    for (const id of rects.keys()) if (!seen.has(id)) rects.delete(id);
  }

  let queued = false;
  function update() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      document.querySelectorAll('#tabs-tabbar-container .pinned-group').forEach(layout);
    });
  }

  // React to DOM changes (pin/unpin/move/close) and tab bar resizes.
  const observer = new MutationObserver((records) => {
    // Ignore our own animations and label writes.
    if (records.every((r) => r.type === 'attributes' && r.attributeName === 'data-label')) return;
    update();
  });
  const resize = new ResizeObserver(update);
  let bar = null;
  setInterval(() => {
    const now = document.getElementById('tabs-tabbar-container');
    if (!now || now === bar) return;
    observer.disconnect();
    resize.disconnect();
    bar = now;
    observer.observe(bar, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-id'] });
    resize.observe(bar);
    update();
  }, 1000);
})();
