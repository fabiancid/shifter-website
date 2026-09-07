(() => {
  "use strict";

  function start() {
    const scenes = [...document.querySelectorAll("[data-scroll-scene]")];
    if (!scenes.length || typeof window.IntersectionObserver !== "function" ||
        typeof window.matchMedia !== "function" || typeof window.requestAnimationFrame !== "function" ||
        typeof window.cancelAnimationFrame !== "function") return;

    const known = new Set(scenes);
    const active = new Set();
    let preference;
    let observer;
    let frame = null;
    let failed = false;

    const canRun = () => !failed && !preference.matches && !document.hidden;

    function cancelFrame() {
      if (frame === null) return;
      window.cancelAnimationFrame(frame);
      frame = null;
    }

    function settle() {
      cancelFrame();
      scenes.forEach(scene => {
        scene.removeAttribute("data-scroll-ready");
        scene.style.removeProperty("--scene-progress");
      });
    }

    function render() {
      frame = null;
      if (!canRun()) return;

      const viewportHeight = window.innerHeight;
      // Batch layout reads before writing any style. Each scene owns its
      // progress; CSS supplies the fully readable, settled value without JS.
      const updates = [...active].map(scene => {
        const rect = scene.getBoundingClientRect();
        const distance = rect.height + viewportHeight * 0.25;
        const value = (viewportHeight * 0.85 - rect.top) / distance;
        const progress = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
        return [scene, progress];
      });

      updates.forEach(([scene, progress]) => {
        scene.style.setProperty("--scene-progress", String(progress));
        scene.setAttribute("data-scroll-ready", "");
      });
    }

    function schedule() {
      if (frame !== null || !active.size || !canRun()) return;
      frame = window.requestAnimationFrame(render);
    }

    function syncPreference() {
      if (preference.matches) settle();
      else schedule();
    }

    function syncVisibility() {
      if (document.hidden) cancelFrame();
      else schedule();
    }

    try {
      preference = window.matchMedia("(prefers-reduced-motion: reduce)");
      if (!preference || (typeof preference.addEventListener !== "function" &&
          typeof preference.addListener !== "function")) return;

      observer = new window.IntersectionObserver(entries => {
        if (failed) return;
        entries.forEach(entry => {
          if (!known.has(entry.target)) return;
          if (entry.isIntersecting) active.add(entry.target);
          else active.delete(entry.target);
        });
        if (active.size) schedule();
        else cancelFrame();
      }, { threshold: 0 });

      scenes.forEach(scene => observer.observe(scene));
      if (typeof preference.addEventListener === "function") {
        preference.addEventListener("change", syncPreference);
      } else {
        preference.addListener(syncPreference);
      }
      window.addEventListener("scroll", schedule, { passive: true });
      window.addEventListener("resize", schedule, { passive: true });
      document.addEventListener("visibilitychange", syncVisibility);
    } catch {
      // A partial browser API failure must leave the original content usable.
      failed = true;
      observer?.disconnect();
      active.clear();
      settle();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
