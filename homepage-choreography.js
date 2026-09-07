(function () {
  'use strict';

  function initialize() {
    const root = document.documentElement;
    let reveals = [];
    let sheets = [];
    let layers = [];
    const scenes = [];
    const snapshotSteps = [];
    let preference;
    let frame = null;
    let generation = 0;
    let failed = false;
    let pageHidden = false;

    function cancelFrame() {
      const pending = frame;
      frame = null;
      generation += 1;
      if (pending !== null) {
        try { window.cancelAnimationFrame(pending); }
        catch (_) { failed = true; }
      }
    }

    function settle() {
      // Open the readable CSS fallback first, even if later cleanup fails.
      try { root.removeAttribute('data-story-motion'); } catch (_) {}
      cancelFrame();
      reveals.forEach(node => {
        try { node.removeAttribute('data-story-visible'); } catch (_) {}
      });
      sheets.forEach(sheet => {
        try { sheet.style.removeProperty('--stack-depth'); } catch (_) {}
      });
      scenes.forEach(({ scene }) => {
        try { scene.style.removeProperty('--scene-progress'); } catch (_) {}
      });
      snapshotSteps.forEach(({ scenes }) => scenes.forEach(scene => {
        try { scene.style.removeProperty('--snapshot-progress'); } catch (_) {}
      }));
    }

    function fail() {
      failed = true;
      settle();
    }

    function guarded(action) {
      return function () {
        if (failed) return;
        try { action(); } catch (_) { fail(); }
      };
    }

    function canRender() {
      return !failed && !pageHidden && !document.hidden && !preference.matches;
    }

    function readTop(node) {
      const top = node.getBoundingClientRect().top;
      if (!Number.isFinite(top)) throw new Error('Invalid story geometry');
      return top;
    }

    function render() {
      const height = window.innerHeight;
      if (!Number.isFinite(height) || height <= 0) throw new Error('Invalid viewport');

      // Read the stable parents/wrappers together before changing any styles.
      // Above-viewport content stays readable, including on deep-link loads.
      const visibility = reveals.map(node => readTop(node) < height);
      const depths = layers.map(({ next }) => {
        if (!next) return 0;
        const top = readTop(next);
        const computedTop = parseFloat(window.getComputedStyle(next).top);
        const stickyTop = Number.isFinite(computedTop) ? computedTop : 150;
        return Math.max(0, Math.min(1, (height - top) / Math.max(1, height - stickyTop)));
      });
      const progress = scenes.map(({ card }) =>
        Math.max(0, Math.min(1, (height * 0.92 - readTop(card)) / (height * 0.72))));
      const snapshotProgress = snapshotSteps.map(({ step }) =>
        Math.max(0, Math.min(1, (height * 0.92 - readTop(step)) / (height * 0.72))));

      reveals.forEach((node, index) => {
        if (visibility[index]) node.setAttribute('data-story-visible', '');
        else node.removeAttribute('data-story-visible');
      });
      layers.forEach(({ sheet }, index) => {
        sheet.style.setProperty('--stack-depth', String(depths[index]));
      });
      scenes.forEach(({ scene }, index) => {
        scene.style.setProperty('--scene-progress', String(progress[index]));
      });
      snapshotSteps.forEach(({ scenes }, index) => scenes.forEach(scene => {
        scene.style.setProperty('--snapshot-progress', String(snapshotProgress[index]));
      }));
      // Attribute presence is the enhancement gate; HTML/CSS remain static
      // until every value in the first frame has been written successfully.
      root.setAttribute('data-story-motion', 'ready');
    }

    const schedule = guarded(function () {
      if (!canRender() || frame !== null) return;
      const current = ++generation;
      frame = window.requestAnimationFrame(function () {
        // Canceled callbacks must not overwrite newer work after resuming.
        if (current !== generation) return;
        frame = null;
        try {
          if (canRender()) render();
        } catch (_) { fail(); }
      });
    });

    try {
      reveals = Array.from(document.querySelectorAll('[data-story-reveal]'));
      document.querySelectorAll('[data-story-stack]').forEach(stack => {
        const cards = Array.from(stack.querySelectorAll('[data-story-card]'));
        cards.forEach((card, index) => {
          const sheet = card.querySelector('[data-story-sheet]');
          if (sheet) layers.push({ sheet, next: cards[index + 1] });
          // A nested card/stack owns its descendants, not the enclosing card.
          if (card.parentElement.closest('[data-story-stack], [data-story-card]') !== stack) return;
          card.querySelectorAll('[data-story-scene]').forEach(scene => {
            if (scene.closest('[data-story-card]') === card &&
                scene.closest('[data-story-stack]') === stack) scenes.push({ scene, card });
          });
        });
      });
      sheets = layers.map(layer => layer.sheet);
      const snapshotRoot = document.getElementById('snapshot-start');
      const snapshotOwner = '#snapshot-start, [data-snapshot-step], [data-snapshot-scene]';
      if (snapshotRoot && !snapshotRoot.matches('[data-snapshot-step], [data-snapshot-scene]')) {
        // Stable rows are independent of folder stacks. Nested owners and art
        // cannot supply geometry or lend their descendants to an enclosing row.
        snapshotRoot.querySelectorAll('[data-snapshot-step]').forEach(step => {
          if (step.matches('#snapshot-start, [data-snapshot-scene]') ||
              step.parentElement.closest(snapshotOwner) !== snapshotRoot) return;
          const ownedScenes = Array.from(step.querySelectorAll('[data-snapshot-scene]')).filter(scene =>
            !scene.matches('#snapshot-start, [data-snapshot-step]') && scene.parentElement.closest(snapshotOwner) === step);
          if (ownedScenes.length) snapshotSteps.push({ step, scenes: ownedScenes });
        });
      }
      if (!reveals.length && !layers.length && !scenes.length && !snapshotSteps.length) return;
      if (typeof window.matchMedia !== 'function' ||
          typeof window.requestAnimationFrame !== 'function' ||
          typeof window.cancelAnimationFrame !== 'function' ||
          typeof window.getComputedStyle !== 'function') return;

      preference = window.matchMedia('(prefers-reduced-motion: reduce)');
      const onPreference = guarded(function () {
        if (preference.matches) settle();
        else schedule();
      });
      if (typeof preference.addEventListener === 'function') {
        preference.addEventListener('change', onPreference);
      } else if (typeof preference.addListener === 'function') {
        preference.addListener(onPreference);
      } else return;

      window.addEventListener('scroll', schedule, { passive: true });
      window.addEventListener('resize', schedule, { passive: true });
      document.addEventListener('visibilitychange', guarded(function () {
        if (document.hidden) {
          cancelFrame();
          if (failed) settle();
        } else schedule();
      }));
      window.addEventListener('pagehide', guarded(function () {
        pageHidden = true;
        settle();
      }));
      window.addEventListener('pageshow', guarded(function () {
        pageHidden = false;
        schedule();
      }));
      schedule();
    } catch (_) { fail(); }
  }

  // Intended for a deferred script; also safe when included before the markup.
  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else initialize();
  } catch (_) { /* Static HTML is the fallback when initialization is unavailable. */ }
}());
