(() => {
  "use strict";

  function start() {
    let roots = [];
    let fine;
    let reduced;
    let observer;
    let frame = null;
    let focused = true;
    let failed = false;
    const visible = new Set();
    const pending = new Map();

    const canRun = () => !failed && focused && document.hidden === false &&
      fine?.matches === true && reduced?.matches === false;

    function clear(root) {
      root.removeAttribute("data-presence-ready");
      root.style.removeProperty("--hero-x");
      root.style.removeProperty("--hero-y");
    }

    function cancelFrame() {
      const previous = frame;
      frame = null;
      if (previous && previous.id !== null) window.cancelAnimationFrame(previous.id);
    }

    function reset(root) {
      pending.delete(root);
      if (!pending.size) cancelFrame();
      clear(root);
    }

    function settle() {
      pending.clear();
      cancelFrame();
      roots.forEach(clear);
    }

    function fail() {
      failed = true;
      pending.clear();
      visible.clear();
      // Cleanup must still reach every root if another browser API fails.
      try { cancelFrame(); } catch {}
      try { observer?.disconnect(); } catch {}
      roots.forEach(root => {
        try { root.removeAttribute("data-presence-ready"); } catch {}
        try { root.style.removeProperty("--hero-x"); } catch {}
        try { root.style.removeProperty("--hero-y"); } catch {}
      });
    }

    function guard(callback) {
      return (...args) => {
        if (failed) return;
        try { callback(...args); } catch { fail(); }
      };
    }

    function render() {
      if (!canRun()) { settle(); return; }
      // One shared frame: finish every rectangle read before any DOM write.
      const updates = [...pending].map(([root, position]) => {
        if (!visible.has(root)) return [root, null];
        const rect = root.getBoundingClientRect();
        if (!rect || ![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) ||
            rect.width <= 0 || rect.height <= 0) return [root, null];
        const x = (position.x - rect.left) / rect.width * 2 - 1;
        const y = (position.y - rect.top) / rect.height * 2 - 1;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return [root, null];
        return [root, { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) }];
      });
      pending.clear();
      updates.forEach(([root, position]) => {
        if (!position) { clear(root); return; }
        root.style.setProperty("--hero-x", String(position.x));
        root.style.setProperty("--hero-y", String(position.y));
        root.setAttribute("data-presence-ready", "");
      });
    }

    function schedule() {
      if (frame !== null || !pending.size || !canRun()) return;
      const ticket = { id: null };
      frame = ticket;
      ticket.id = window.requestAnimationFrame(guard(() => {
        // A cancelled callback must not render or consume a newer frame.
        if (frame !== ticket) return;
        if (ticket.id === null) throw new Error("Synchronous animation frame");
        frame = null;
        render();
      }));
      if (!Number.isInteger(ticket.id) || ticket.id < 0) throw new Error("Invalid animation frame");
    }

    const sync = guard(() => { if (!canRun()) settle(); });

    try {
      roots = [...document.querySelectorAll("[data-hero-presence]")];
      if (!roots.length || typeof window.IntersectionObserver !== "function" ||
          typeof window.matchMedia !== "function" || typeof window.requestAnimationFrame !== "function" ||
          typeof window.cancelAnimationFrame !== "function") return;

      fine = window.matchMedia("(hover: hover) and (pointer: fine)");
      reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
      for (const media of [fine, reduced]) {
        if (!media || typeof media.matches !== "boolean" ||
            (typeof media.addEventListener !== "function" && typeof media.addListener !== "function")) return;
      }

      const known = new Set(roots);
      observer = new window.IntersectionObserver(guard(entries => {
        entries.forEach(entry => {
          if (!known.has(entry.target)) return;
          if (entry.isIntersecting === true && Number.isFinite(entry.intersectionRatio) &&
              entry.intersectionRatio >= 0 && entry.intersectionRatio <= 1) {
            visible.add(entry.target);
          } else {
            visible.delete(entry.target);
            reset(entry.target);
          }
        });
      }), { threshold: 0 });
      if (typeof observer.observe !== "function" || typeof observer.disconnect !== "function") {
        fail();
        return;
      }

      for (const media of [fine, reduced]) {
        if (typeof media.addEventListener === "function") media.addEventListener("change", sync);
        else media.addListener(sync);
      }
      window.addEventListener("blur", guard(() => { focused = false; settle(); }));
      window.addEventListener("focus", guard(() => { focused = true; }));
      document.addEventListener("visibilitychange", sync);

      roots.forEach(root => {
        observer.observe(root);
        // A hybrid device can switch from mouse to touch before any movement.
        const contact = guard(event => {
          if (event.pointerType !== "mouse" && event.pointerType !== "pen") reset(root);
        });
        root.addEventListener("pointerenter", contact, { passive: true });
        root.addEventListener("pointerdown", contact, { passive: true });
        root.addEventListener("pointermove", guard(event => {
          if (!canRun() || !visible.has(root)) return;
          // Hybrid devices can report fine-pointer capability while emitting touch events.
          if ((event.pointerType !== "mouse" && event.pointerType !== "pen") ||
              !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) {
            reset(root);
            return;
          }
          pending.set(root, { x: event.clientX, y: event.clientY });
          schedule();
        }), { passive: true });
        root.addEventListener("pointerleave", guard(() => reset(root)), { passive: true });
        root.addEventListener("pointercancel", guard(() => reset(root)), { passive: true });
      });
    } catch { fail(); }
  }

  try {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
  } catch {
    // The unenhanced hero is the fallback when browser APIs are unavailable.
  }
})();
