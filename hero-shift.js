(() => {
  "use strict";

  // Duplicate script tags share this page's controller, including deferred startup.
  if (window.__shifterHeroShift) return;
  window.__shifterHeroShift = true;

  function start() {
    const hero = document.querySelector("#top[data-hero-shift]");
    const bridge = hero?.nextElementSibling;
    const art = hero?.querySelector(".hero-shift-art[data-shift-stage]");
    if (!art ||
        !bridge?.matches("#proof[data-shift-bridge]") ||
        typeof window.matchMedia !== "function" ||
        typeof window.requestAnimationFrame !== "function" ||
        typeof window.cancelAnimationFrame !== "function") return;

    let motion;
    try {
      // A positive match also fails safely in browsers that don't know this query.
      motion = window.matchMedia("(prefers-reduced-motion: no-preference)");
    } catch (_) { return; }
    if (!motion) return;

    let pending = null;
    let generation = 0;
    const photo = art.querySelector("img.hero-glass-photo");
    let imageReady = !photo;
    let imageSettled = !photo;
    let decoding = false;

    // The initial image settles once. A failed image leaves the static scene;
    // no polling, retries or independent animation clock are needed.
    function settleImage(ready) {
      if (imageSettled) return;
      imageSettled = true;
      imageReady = ready;
      photo.removeEventListener("load", imageLoaded);
      photo.removeEventListener("error", imageFailed);
      sync();
    }

    function imageFailed() { settleImage(false); }

    function imageLoaded() {
      if (imageSettled || decoding || !photo.complete) return;
      if (!(photo.naturalWidth > 0)) { imageFailed(); return; }
      if (typeof photo.decode !== "function") { settleImage(true); return; }
      decoding = true;
      try {
        photo.decode().then(
          () => settleImage(photo.complete && photo.naturalWidth > 0),
          imageFailed
        );
      } catch (_) { imageFailed(); }
    }

    function reset() {
      hero.removeAttribute("data-shift-ready");
      hero.removeAttribute("data-shift-paused");
      hero.style.removeProperty("--shift-scroll");
      bridge.style.removeProperty("--shift-scroll");
    }

    function cancel() {
      generation += 1;
      if (pending === null) return;
      const id = pending;
      pending = null;
      try { window.cancelAnimationFrame(id); } catch (_) {
        // The generation check still makes an undelivered callback inert.
      }
    }

    function schedule() {
      if (!imageReady || !motion.matches || document.hidden || pending !== null) return;
      const ticket = ++generation;
      try {
        pending = window.requestAnimationFrame(() => {
          // Check before clearing pending: an obsolete callback may outlive a new one.
          if (ticket !== generation) return;
          pending = null;
          if (!motion.matches) { reset(); return; }
          if (!imageReady || document.hidden) return;
          try {
            const rect = hero.getBoundingClientRect();
            if (!rect || !Number.isFinite(rect.top) ||
                !Number.isFinite(rect.height) || rect.height <= 0) {
              reset();
              return;
            }
            const progress = String(Math.min(1, Math.max(0, -rect.top / rect.height)));
            hero.style.setProperty("--shift-scroll", progress);
            bridge.style.setProperty("--shift-scroll", progress);
            // CSS owns finite arrival; readiness never precedes either progress write.
            if (!hero.hasAttribute("data-shift-ready")) hero.setAttribute("data-shift-ready", "");
          } catch (_) { reset(); }
        });
      } catch (_) { cancel(); reset(); }
    }

    function sync() {
      cancel();
      if (!motion.matches) reset();
      else if (document.hidden) {
        // Preserve animation identity and elapsed time if the tab hides mid-arrival.
        if (hero.hasAttribute("data-shift-ready")) hero.setAttribute("data-shift-paused", "");
      } else {
        hero.removeAttribute("data-shift-paused");
        schedule();
      }
    }

    // Never enable motion without a live preference subscription.
    try {
      if (typeof motion.addEventListener === "function") motion.addEventListener("change", sync);
      else if (typeof motion.addListener === "function") motion.addListener(sync);
      else return;
    } catch (_) { return; }
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    document.addEventListener("visibilitychange", sync);
    sync();
    if (photo) {
      // Subscribe before checking complete so cached loads cannot be missed.
      photo.addEventListener("load", imageLoaded);
      photo.addEventListener("error", imageFailed);
      imageLoaded();
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
