(() => {
  "use strict";

  const names = { chatgpt: "ChatGPT", gemini: "Gemini", claude: "Claude", perplexity: "Perplexity" };

  function enhance(root) {
    // Validate the whole contract before changing the static fallback.
    const owned = selector => [...root.querySelectorAll(selector)]
      .filter(node => node.closest("[data-search-demo]") === root);
    const controls = owned("[data-demo-controls]")[0];
    const toggle = controls?.querySelector("button[data-demo-toggle]");
    const label = toggle?.querySelector("[data-demo-toggle-label]");
    const buttons = controls ? [...controls.querySelectorAll("button[data-demo-select]")] : [];
    const panels = owned("[data-demo-panel]").map(node => ({
      node,
      name: node.dataset.demoPanel,
      typed: node.querySelector("[data-demo-typed]"),
      lines: [...node.querySelectorAll("[data-demo-line]")],
    }));
    if (!controls || !toggle || !label || panels.length !== 4 || buttons.length !== 4 ||
        new Set(panels.map(panel => panel.name)).size !== 4 ||
        new Set(buttons.map(button => button.dataset.demoSelect)).size !== 4 ||
        buttons.some(button => !Object.hasOwn(names, button.dataset.demoSelect)) ||
        panels.some(panel => !Object.hasOwn(names, panel.name) || !panel.typed?.textContent.trim() ||
          !panel.lines.length || panel.lines.some(line => line.contains(panel.typed) || panel.typed.contains(line)))) return;

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!media || typeof media.matches !== "boolean" ||
        (typeof media.addEventListener !== "function" && typeof media.addListener !== "function")) return;
    const now = typeof window.performance?.now === "function"
      ? () => window.performance.now() : () => window.Date.now();
    const announcement = owned("[data-demo-announcement]")[0];
    const resultMode = root.dataset.demoMode === "result";
    panels.forEach(panel => { panel.prompt = panel.typed.textContent; panel.characters = Array.from(panel.prompt); });

    let index = 0;
    let completed = 0;
    let character = 0;
    let line = 0;
    let inView = false;
    let focused = document.hasFocus();
    let requested = !media.matches;
    let started = false;
    let finished = false;
    let pending = null;
    const canPlay = () => requested && !finished && !media.matches && inView && focused && !document.hidden;

    function renderPlayback() {
      const playing = canPlay();
      root.dataset.demoPlaying = String(playing);
      const text = finished ? "Replay demo" : playing ? "Pause demo" : "Play demo";
      label.textContent = text;
      toggle.setAttribute("aria-label", text);
      toggle.disabled = media.matches;
    }

    function select(next) {
      index = next;
      panels.forEach((panel, i) => { panel.node.hidden = i !== index; });
      root.dataset.demoPlatform = panels[index].name;
      buttons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.demoSelect === panels[index].name)));
    }

    function showFull() {
      const panel = panels[index];
      panel.typed.textContent = panel.prompt;
      panel.lines.forEach(node => node.setAttribute("data-revealed", "true"));
      root.dataset.demoPhase = "complete";
    }

    function suspend() {
      if (!pending || pending.id === null) return;
      window.clearTimeout(pending.id);
      pending.remaining = Math.max(0, pending.due - now());
      pending.id = null;
    }

    function cancel() {
      suspend();
      pending = null;
    }

    function arm() {
      if (!pending || pending.id !== null || !canPlay()) return;
      const task = pending;
      task.due = now() + task.remaining;
      task.id = window.setTimeout(() => {
        // Ignore a cancelled callback even if it was already queued by the browser.
        if (pending !== task || task.id === null) return;
        task.id = null;
        task.remaining = 0;
        if (!canPlay()) { renderPlayback(); return; }
        pending = null;
        task.callback();
      }, task.remaining);
    }

    function later(callback, delay) {
      pending = { callback, remaining: delay, due: 0, id: null };
      arm();
    }

    function completePanel() {
      root.dataset.demoPhase = "complete";
      completed++;
      if (completed === panels.length) {
        finished = true;
        requested = false;
        renderPlayback();
      } else {
        later(() => beginPanel((index + 1) % panels.length), resultMode ? 5000 : 4000);
      }
    }

    function reveal() {
      const panel = panels[index];
      root.dataset.demoPhase = "answer";
      panel.lines[line++].setAttribute("data-revealed", "true");
      // Let every block, including the last one, finish animating in answer.
      later(line < panel.lines.length ? reveal : completePanel, 450);
    }

    function search() {
      root.dataset.demoPhase = "searching";
      later(reveal, 1500);
    }

    function send() {
      // The composer animation uses this phase and demoPlaying to pause with us.
      root.dataset.demoPhase = "sending";
      later(search, 600);
    }

    function type() {
      const panel = panels[index];
      panel.typed.textContent = panel.characters.slice(0, ++character).join("");
      if (character < panel.characters.length) {
        later(type, 38);
      } else {
        root.dataset.demoPhase = "composed";
        later(send, 900);
      }
    }

    function beginPanel(next) {
      select(next);
      if (resultMode) {
        showFull();
        completePanel();
        return;
      }
      character = 0;
      line = 0;
      panels[index].typed.textContent = "";
      panels[index].lines.forEach(node => node.removeAttribute("data-revealed"));
      root.dataset.demoPhase = "typing";
      later(type, 38);
    }

    function sync() {
      if (!canPlay()) {
        suspend();
      } else {
        if (!started) {
          started = true;
          completed = 0;
          beginPanel(index);
        }
        arm();
      }
      renderPlayback();
    }

    // Set up browser capabilities before revealing any controls.
    const observer = new window.IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.target !== root) return;
        inView = entry.isIntersecting && entry.intersectionRatio >= 0.3;
        sync();
      });
    }, { threshold: [0, 0.3] });
    if (typeof observer.observe !== "function" || typeof observer.disconnect !== "function") return;
    try {
      observer.observe(root);
      const changeMotion = () => {
        if (media.matches) {
          cancel();
          requested = false;
          started = false;
          finished = false;
          showFull();
        }
        sync();
      };
      if (typeof media.addEventListener === "function") media.addEventListener("change", changeMotion);
      else media.addListener(changeMotion);
    } catch {
      observer.disconnect();
      return;
    }

    buttons.forEach(button => button.addEventListener("click", () => {
      cancel();
      requested = false;
      started = false;
      finished = false;
      select(panels.findIndex(panel => panel.name === button.dataset.demoSelect));
      showFull();
      renderPlayback();
      if (announcement) announcement.textContent = `${names[panels[index].name]} example selected.`;
    }));
    toggle.addEventListener("click", () => {
      if (media.matches) return;
      if (canPlay()) {
        requested = false;
      } else {
        if (finished) { finished = false; started = false; index = 0; }
        requested = true;
      }
      sync();
    });
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("blur", () => { focused = false; sync(); });
    window.addEventListener("focus", () => { focused = true; sync(); });
    select(0);
    showFull();
    renderPlayback();
    controls.hidden = false;
  }

  function start() {
    if (typeof window.IntersectionObserver !== "function" || typeof window.matchMedia !== "function" ||
        typeof window.setTimeout !== "function" || typeof window.clearTimeout !== "function" ||
        typeof document.hasFocus !== "function" || typeof document.hidden !== "boolean") return;
    document.querySelectorAll("[data-search-demo]").forEach(root => {
      try { enhance(root); } catch { /* Keep unsupported or malformed demos static. */ }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
