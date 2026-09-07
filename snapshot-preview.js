(() => {
  'use strict';

  function initialize(root) {
    if (root.hasAttribute('data-preview-initialized')) return;

    const navs = root.querySelectorAll('[data-preview-tabs]');
    const tabs = [...root.querySelectorAll('[data-preview-tab]')];
    const panels = [...root.querySelectorAll('[data-preview-panel]')];
    if (navs.length !== 1 || tabs.length !== 3 || panels.length !== 3) return;
    const nav = navs[0];
    const mapped = tabs.map(tab => {
      const href = tab.getAttribute('href');
      if (tab.tagName !== 'A' || !nav.contains(tab) || !href || !href.startsWith('#')) return null;
      return panels.find(panel => panel.id && `#${panel.id}` === href);
    });
    if (mapped.some(panel => !panel) || new Set(mapped).size !== panels.length) return;

    // Validate every reference before mutating anything: malformed markup keeps
    // its ordinary anchor navigation and all report sections remain readable.
    const elements = [...tabs, ...panels];
    const ids = elements.map(element => element.id);
    if (ids.some(id => !id || /\s/.test(id)) || new Set(ids).size !== ids.length) return;
    const pageIDs = [...document.querySelectorAll('[id]')];
    if (ids.some(id => pageIDs.filter(element => element.id === id).length !== 1)) return;

    function activate(index, focus = false) {
      tabs.forEach((tab, i) => {
        tab.setAttribute('aria-selected', String(i === index));
        tab.tabIndex = i === index ? 0 : -1;
        mapped[i].hidden = i !== index;
      });
      if (focus) tabs[index].focus();
    }

    function hashIndex() {
      return mapped.findIndex(panel => `#${panel.id}` === window.location.hash);
    }

    nav.setAttribute('role', 'tablist');
    tabs.forEach((tab, index) => {
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', mapped[index].id);
      mapped[index].setAttribute('role', 'tabpanel');
      mapped[index].setAttribute('aria-labelledby', tab.id);
      mapped[index].tabIndex = 0;

      tab.addEventListener('click', event => {
        if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        event.preventDefault();
        activate(index, true);
      });

      tab.addEventListener('keydown', event => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        let next;
        switch (event.key) {
          case 'ArrowLeft': next = (index + tabs.length - 1) % tabs.length; break;
          case 'ArrowRight': next = (index + 1) % tabs.length; break;
          case 'Home': next = 0; break;
          case 'End': next = tabs.length - 1; break;
          default: return;
        }
        event.preventDefault();
        activate(next, true);
      });
    });

    activate(Math.max(0, hashIndex()));
    window.addEventListener('hashchange', () => {
      const index = hashIndex();
      if (index !== -1) activate(index);
    });
    root.setAttribute('data-preview-initialized', '');
  }

  function start() {
    document.querySelectorAll('[data-snapshot-preview]').forEach(initialize);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
