// Fade the tab list's edges when there are more tabs to scroll to
// (see arc-layout.css). Sets data-fade="top bottom" on .tab-strip; a data
// attribute survives React re-renders, a class would not.

(() => {
  function update(strip) {
    const max = strip.scrollHeight - strip.clientHeight;
    const parts = [];
    if (strip.scrollTop > 2) parts.push('top');
    if (strip.scrollTop < max - 2) parts.push('bottom');
    const v = parts.join(' ');
    if ((strip.dataset.fade || '') !== v) strip.dataset.fade = v;
  }
  const all = () => document.querySelectorAll('#tabs-tabbar-container .tab-strip').forEach(update);

  document.addEventListener('scroll', (e) => {
    if (e.target?.classList?.contains('tab-strip')) update(e.target);
  }, true);
  // Tabs opened/closed and window resizes change whether it can scroll.
  setInterval(all, 700);
  window.addEventListener('resize', all);
})();
