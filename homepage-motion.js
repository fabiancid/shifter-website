(() => {
  "use strict";

  function start() {
    const targets = [...document.querySelectorAll("[data-motion-reveal]")];
    if (!targets.length || typeof window.IntersectionObserver !== "function" || typeof window.matchMedia !== "function") return;

    const root = document.documentElement;
    const pending = new Set(targets);
    let preference;
    let observer;

    function syncPreference() {
      if (preference.matches) {
        // Cancel entrances immediately. Keep observed/seen bookkeeping separate
        // from animation classes so changing preferences cannot replay a reveal.
        root.classList.remove("motion-enabled");
        targets.forEach(target => target.classList.remove("is-in-view"));
      } else if (pending.size) {
        root.classList.add("motion-enabled");
      }
    }

    try {
      preference = window.matchMedia("(prefers-reduced-motion: reduce)");
      observer = new window.IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting || !pending.delete(entry.target)) return;
          observer.unobserve(entry.target);
          if (!preference.matches) entry.target.classList.add("is-in-view");
          // Reduced-motion intersections also count as seen: those elements
          // remain settled if motion is enabled later in the same visit.
          if (!pending.size) observer.disconnect();
        });
      }, { threshold: 0.08 });

      targets.forEach(target => observer.observe(target));
      if (typeof preference.addEventListener === "function") {
        preference.addEventListener("change", syncPreference);
      } else if (typeof preference.addListener === "function") {
        preference.addListener(syncPreference);
      }
      syncPreference();
    } catch {
      // Enhancement is optional: unsupported or broken browser APIs leave the
      // original visible markup and native semantics in place.
      observer?.disconnect();
      root.classList.remove("motion-enabled");
      targets.forEach(target => target.classList.remove("is-in-view"));
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
