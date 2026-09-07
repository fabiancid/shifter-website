(() => {
  "use strict";

  function start() {
    const root = document.querySelector("[data-report-story]");
    const visual = root?.querySelector("[data-report-visual]");
    const sceneArea = visual?.querySelector(".snapshot-scenes");
    const header = document.querySelector(".site-header");
    if (!root || !visual || !sceneArea || !header || !["0", "1", "2"].every(index =>
      root.querySelector(`[data-report-step="${index}"]`) &&
      sceneArea.querySelector(`[data-report-detail="${index}"]`))) return;
    const details = ["0", "1", "2"].map(index => sceneArea.querySelector(`[data-report-detail="${index}"]`));
    if (["IntersectionObserver", "ResizeObserver", "matchMedia", "requestAnimationFrame", "cancelAnimationFrame"]
      .some(name => typeof window[name] !== "function")) return;

    let preference;
    let intersection;
    let sizes;
    let frame = null;
    let visible = false;
    let measurePending = false;
    let failed = false;
    let pendingHash = window.location.hash;
    const cleanups = [];
    const properties = ["--report-progress", "--report-top", "--report-travel", "--report-height", "--report-mix-1", "--report-mix-2"];
    const scenes = new Map([["#preview-questions", 0], ["#preview-sources", 0.5], ["#preview-actions", 1]]);
    const clamp = value => Math.max(0, Math.min(1, value));
    const canRun = () => !failed && !document.hidden && !preference.matches;

    function cancelFrame() {
      if (frame === null) return;
      const pending = frame;
      frame = null;
      window.cancelAnimationFrame(pending);
    }

    function settle() {
      // Readiness owns *all* sticky geometry. Remove it before other cleanup,
      // including when a browser API fails partway through enhancement.
      root.removeAttribute("data-report-ready");
      root.removeAttribute("data-report-active");
      properties.forEach(name => root.style.removeProperty(name));
      pendingHash = null;
      measurePending = false;
      cancelFrame();
    }

    function fail() {
      failed = true;
      // One failed cleanup must not prevent the others from restoring flow.
      for (const cleanup of [settle, () => intersection?.disconnect(), () => sizes?.disconnect(), ...cleanups]) {
        try { cleanup(); } catch { /* A broken browser API cannot keep the paper pinned. */ }
      }
    }

    function setProperty(name, value) {
      if (root.style.getPropertyValue(name) !== value) root.style.setProperty(name, value);
    }

    function render() {
      frame = null;
      measurePending = false;
      try {
        if (!canRun()) return;
        const width = window.innerWidth;
        const height = window.innerHeight;
        const headerHeight = header.getBoundingClientRect().height;
        if (![width, height, headerHeight].every(Number.isFinite) ||
            width < 760 || height < 600 || headerHeight < 0) {
          settle();
          return;
        }

        // Measure the prospective enhanced CSS in this same frame, whether
        // starting in static flow or already pinned. CSS owns the stage size
        // and card typography; rejection (including exceptions) removes
        // readiness synchronously before paint, restoring natural static flow.
        if (!root.hasAttribute("data-report-ready")) root.setAttribute("data-report-ready", "");
        const visualHeight = visual.getBoundingClientRect().height;
        const availableHeight = sceneArea.clientHeight;
        // Layout/overflow sizes include every scene, even an invisible or
        // scaled one. The fixed stage box alone cannot reveal content growth.
        const sceneHeights = details.map(scene => [scene.offsetHeight, scene.scrollHeight]);
        const rect = root.getBoundingClientRect();
        if (![visualHeight, availableHeight, rect.top].every(Number.isFinite) ||
            visualHeight <= 0 || availableHeight <= 0 ||
            !sceneHeights.every(sizes => sizes.every(size => Number.isFinite(size) && size > 0 && size <= availableHeight)) ||
            visualHeight + headerHeight + 48 > height) {
          settle();
          return;
        }

        const stickyTop = headerHeight + 24;
        const travel = 1.5 * height;
        const sceneProgress = scenes.get(pendingHash);
        const progress = sceneProgress ?? clamp((stickyTop - rect.top) / travel);
        const scrollTop = sceneProgress === undefined ? null : window.scrollY + rect.top - stickyTop + travel * sceneProgress;
        if (scrollTop !== null && !Number.isFinite(scrollTop)) {
          settle();
          return;
        }
        const activeIndex = progress < 1 / 3 ? 0 : progress < 2 / 3 ? 1 : 2;
        setProperty("--report-progress", String(progress));
        setProperty("--report-mix-1", String(clamp((progress - 0.22) / 0.18)));
        setProperty("--report-mix-2", String(clamp((progress - 0.60) / 0.18)));
        setProperty("--report-top", `${stickyTop}px`);
        setProperty("--report-travel", `${travel}px`);
        // Private geometry input: travel ends while the entire paper is still
        // inside its containing block, rather than one paper-height too soon.
        setProperty("--report-height", `${visualHeight}px`);
        if (root.dataset.reportActive !== String(activeIndex)) root.dataset.reportActive = String(activeIndex);
        // Establish the full track before navigating. Consume this request so
        // scroll, resize, fonts and restoration never force a scene snap.
        pendingHash = null;
        if (scrollTop !== null) window.scrollTo({ top: scrollTop, behavior: "instant" });
      } catch { fail(); }
    }

    function schedule(measure = false) {
      try {
        if (!canRun()) return;
        if (measure) measurePending = true;
        if (frame !== null || (!measurePending && (!visible || !root.hasAttribute("data-report-ready")))) return;
        frame = window.requestAnimationFrame(render);
      } catch { fail(); }
    }

    const measure = () => schedule(true);
    const scroll = () => schedule();

    function navigate() {
      pendingHash = preference.matches ? null : window.location.hash;
      measure();
    }

    function activateCurrentScene(event) {
      if (event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
          !canRun() || !root.hasAttribute("data-report-ready")) return;
      const link = event.target?.closest?.("a[href]");
      if (!link || link.hasAttribute("download") || link.href !== window.location.href || !scenes.has(window.location.hash)) return;
      const target = link.getAttribute("target") ?? document.querySelector("base[target]")?.getAttribute("target");
      if (target && target.toLowerCase() !== "_self") return;
      // Repeating the current fragment has no hashchange. Keep native anchor
      // navigation intact and map this explicit activation on the next frame.
      navigate();
    }

    function syncPreference() {
      try {
        if (preference.matches) settle();
        else measure();
      } catch { fail(); }
    }

    function syncVisibility() {
      try {
        if (document.hidden) cancelFrame();
        else measure();
      } catch { fail(); }
    }

    function listen(target, type, callback, options) {
      cleanups.push(() => target.removeEventListener(type, callback, options));
      target.addEventListener(type, callback, options);
    }

    try {
      preference = window.matchMedia("(prefers-reduced-motion: reduce)");
      if (!preference) return;
      if (preference.matches) pendingHash = null;
      const modern = typeof preference.addEventListener === "function" && typeof preference.removeEventListener === "function";
      const legacy = typeof preference.addListener === "function" && typeof preference.removeListener === "function";
      if (!modern && !legacy) return;

      intersection = new window.IntersectionObserver(entries => {
        if (failed) return;
        try {
          for (const entry of entries) if (entry.target === root) visible = entry.isIntersecting;
          if (visible) measure();
          else if (!measurePending) cancelFrame();
        } catch { fail(); }
      }, { threshold: 0 });
      sizes = new window.ResizeObserver(measure);
      intersection.observe(root);
      sizes.observe(visual);
      sizes.observe(header);
      sizes.observe(sceneArea);
      details.forEach(scene => sizes.observe(scene));
      // Upstream layout can move the scene without resizing either component.
      // Body observation may deliver once after our spacer changes. Idempotent
      // writes then settle it; rejected probes restore the same static boxes
      // before observer delivery. Never observe the stretched narrative itself.
      sizes.observe(document.body);

      if (modern) listen(preference, "change", syncPreference);
      else {
        cleanups.push(() => preference.removeListener(syncPreference));
        preference.addListener(syncPreference);
      }
      listen(window, "scroll", scroll, { passive: true });
      listen(window, "resize", measure, { passive: true });
      listen(window, "hashchange", navigate);
      listen(document, "click", activateCurrentScene);
      listen(window, "pageshow", measure);
      listen(window, "load", measure);
      listen(document, "visibilitychange", syncVisibility);
      if (document.fonts) {
        if (typeof document.fonts.addEventListener === "function") listen(document.fonts, "loadingdone", measure);
        document.fonts.ready?.then(measure).catch(fail);
      }
      // Deep links and restored scroll positions must not wait for scrolling
      // or intersection delivery to establish the track and current focus.
      measure();
    } catch { fail(); }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
