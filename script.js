const SHIFTER_DOMAIN_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const SHIFTER_IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const LEAD_CAPTURE_ATTEMPT_TIMEOUT_MS = 8000;

const fetchLeadAttempt = async (fetchImpl, requestBody, dependencies = {}) => {
  const AbortControllerImpl = dependencies.AbortControllerImpl || window.AbortController;
  const setTimeoutImpl =
    dependencies.setTimeoutImpl || window.setTimeout.bind(window);
  const clearTimeoutImpl =
    dependencies.clearTimeoutImpl || window.clearTimeout.bind(window);
  const controller = new AbortControllerImpl();
  const timeoutId = setTimeoutImpl(
    () => controller.abort(),
    LEAD_CAPTURE_ATTEMPT_TIMEOUT_MS,
  );

  try {
    const response = await fetchImpl("/api/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestBody,
      keepalive: true,
      signal: controller.signal,
    });

    if (response && response.status === 202) {
      try {
        return { response, body: await response.json() };
      } catch (error) {
        if (controller.signal.aborted) throw error;
        return { response, bodyError: true };
      }
    }

    return { response };
  } finally {
    clearTimeoutImpl(timeoutId);
  }
};

const normalizePublicWebsite = (raw) => {
  if (typeof raw !== "string") {
    return { ok: false, error: "required" };
  }

  const value = raw.trim();

  if (!value) {
    return { ok: false, error: "required" };
  }

  if (raw.length > 200) {
    return { ok: false, error: "too_long" };
  }

  if (/\s/.test(value) || /[\u0000-\u001f\u007f\\]/.test(value)) {
    return { ok: false, error: "format" };
  }

  const scheme = value.match(/^[a-z][a-z0-9+.-]*:/i);

  if (scheme && !/^https?:\/\//i.test(value)) {
    return { ok: false, error: "format" };
  }

  let parsed;

  try {
    parsed = new URL(scheme ? value : `https://${value}`);
  } catch (error) {
    return { ok: false, error: "format" };
  }

  const hostname = parsed.hostname.toLowerCase();
  const labels = hostname.split(".");
  const invalidHostname =
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    Boolean(parsed.username || parsed.password) ||
    (hostname.startsWith("[") && hostname.endsWith("]")) ||
    SHIFTER_IPV4_PATTERN.test(hostname) ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    !hostname.includes(".") ||
    hostname.length > 253 ||
    labels.some(
      (label) =>
        !label ||
        label.length > 63 ||
        !SHIFTER_DOMAIN_LABEL_PATTERN.test(label),
    );

  return invalidHostname
    ? { ok: false, error: "format" }
    : { ok: true, value: parsed.origin };
};

const siteHeader = document.querySelector("[data-header]");

if (siteHeader) {
  const updateHeaderState = () => {
    siteHeader.classList.toggle("is-scrolled", window.scrollY > 8);
  };

  updateHeaderState();
  window.addEventListener("scroll", updateHeaderState, { passive: true });
}

const navToggle = document.querySelector("[data-nav-toggle]");
const nav = document.querySelector("[data-site-nav]");

if (navToggle && nav) {
  const mobileNav = window.matchMedia("(max-width: 900px)");
  if (!nav.id) nav.id = "site-navigation";
  navToggle.setAttribute("aria-controls", nav.id);

  const setNavOpen = (isOpen, restoreFocus = false) => {
    nav.classList.toggle("is-open", isOpen);
    navToggle.setAttribute("aria-expanded", String(isOpen));
    navToggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
    if (restoreFocus) navToggle.focus({ preventScroll: true });
  };
  const isInsideNav = (target) =>
    target instanceof Node && (nav.contains(target) || navToggle.contains(target));

  navToggle.addEventListener("click", () => {
    if (mobileNav.matches) {
      const isOpen = nav.classList.contains("is-open");
      setNavOpen(!isOpen, isOpen && nav.contains(document.activeElement));
    }
  });

  nav.addEventListener("click", (event) => {
    if (mobileNav.matches && event.target instanceof Element && event.target.closest("a[href]")) {
      // Keep native hash/link navigation, but do not leave focus in the hidden menu.
      setNavOpen(false, nav.contains(document.activeElement));
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && mobileNav.matches && nav.classList.contains("is-open")) {
      event.preventDefault();
      setNavOpen(false, isInsideNav(document.activeElement));
    }
  });
  document.addEventListener("click", (event) => {
    if (mobileNav.matches && !isInsideNav(event.target)) {
      setNavOpen(false, nav.contains(document.activeElement));
    }
  });
  document.addEventListener("focusin", (event) => {
    // A disclosure uses normal Tab order; leaving it closes it without a trap.
    if (mobileNav.matches && !isInsideNav(event.target)) setNavOpen(false);
  });
  mobileNav.addEventListener("change", () => {
    const active = document.activeElement;
    setNavOpen(false, mobileNav.matches && nav.contains(active));
    if (!mobileNav.matches && active === navToggle) {
      nav.querySelector("a[href]")?.focus({ preventScroll: true });
    }
  });
  setNavOpen(false);
}

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const heroDash = document.querySelector("[data-dash]");

if (heroDash && !prefersReducedMotion) {
  const countTarget = heroDash.querySelector("[data-count]");
  const rankRows = Array.from(heroDash.querySelectorAll("[data-rank-row]"));
  const youRow = heroDash.querySelector(".dash-you");
  const scoreValue = countTarget ? parseInt(countTarget.textContent, 10) || 0 : 0;

  const countStart = 700;
  const countDuration = 950;
  const timelineEnd = 2930;

  const cues = [
    { at: 800, run: () => heroDash.classList.add("chart-in") },
    { at: 1500, run: () => rankRows[0] && rankRows[0].classList.add("row-in") },
    { at: 1700, run: () => rankRows[1] && rankRows[1].classList.add("row-in") },
    { at: 1900, run: () => rankRows[2] && rankRows[2].classList.add("row-in") },
    { at: 2450, run: () => youRow && youRow.classList.add("you-in") },
  ];

  heroDash.classList.add("dash-live");

  if (countTarget) {
    countTarget.textContent = "0";
  }

  let dashStart = null;
  let dashStarted = false;

  const dashStep = (now) => {
    if (dashStart === null) {
      dashStart = now;
    }

    const t = now - dashStart;

    cues.forEach((cue) => {
      if (!cue.done && t >= cue.at) {
        cue.done = true;
        cue.run();
      }
    });

    if (countTarget) {
      const progress = Math.min(1, Math.max(0, (t - countStart) / countDuration));
      const eased = 1 - Math.pow(1 - progress, 3);
      countTarget.textContent = String(Math.round(scoreValue * eased));
    }

    if (t < timelineEnd) {
      window.requestAnimationFrame(dashStep);
      return;
    }

    cues.forEach((cue) => {
      if (!cue.done) {
        cue.done = true;
        cue.run();
      }
    });

    if (countTarget) {
      countTarget.textContent = String(scoreValue);
    }
  };

  const startDash = () => {
    if (dashStarted) {
      return;
    }

    dashStarted = true;
    window.requestAnimationFrame(dashStep);
  };

  if ("IntersectionObserver" in window) {
    const dashObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            dashObserver.disconnect();
            startDash();
          }
        });
      },
      { threshold: 0.25 },
    );

    dashObserver.observe(heroDash);
  } else {
    startDash();
  }
}

// Snapshot progressive profiling: capture the minimum viable lead first,
// then offer optional context without blocking delivery or analytics.
(() => {
  const normalizeWebsite = normalizePublicWebsite;
  const normalizeEmail = (raw) => {
    if (typeof raw !== "string") return { ok: false, error: "required" };
    const value = raw.trim();
    if (!value) return { ok: false, error: "required" };
    if (value.length > 254) return { ok: false, error: "too_long" };
    if (/\s|[\u0000-\u001f\u007f]/.test(value)) {
      return { ok: false, error: "format" };
    }
    const parts = value.split("@");
    if (parts.length !== 2 || !parts[0]) {
      return { ok: false, error: "format" };
    }
    const hostname = parts[1].toLowerCase();
    const labels = hostname.split(".");
    const invalidDomain =
      SHIFTER_IPV4_PATTERN.test(hostname) ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      !hostname.includes(".") ||
      hostname.length > 253 ||
      labels.some(
        (label) =>
          !label ||
          label.length > 63 ||
          !SHIFTER_DOMAIN_LABEL_PATTERN.test(label),
      );
    return invalidDomain
      ? { ok: false, error: "format" }
      : { ok: true, value };
  };
  const normalizeOptional = (raw, maxLength) => {
    if (typeof raw !== "string") return { ok: false, error: "format" };
    if (/[\u0000-\u001f\u007f]/.test(raw)) {
      return { ok: false, error: "format" };
    }
    const value = raw.trim().replace(/\s+/g, " ");
    return value.length <= maxLength
      ? { ok: true, value }
      : { ok: false, error: "too_long" };
  };
  const normalizeCompetitors = (raw) => {
    const result = normalizeOptional(raw, 300);
    if (!result.ok) return result;
    const entries = result.value
      .split(/[;,]/)
      .filter((entry) => entry.trim() !== "");
    return entries.length <= 3
      ? result
      : { ok: false, error: "too_many" };
  };
  const normalizeDetails = (raw) => normalizeOptional(raw, 600);
  const createLeadReference = (randomUUID) =>
    `shifter-snapshot-${randomUUID()}`;
  const createSubmittedAt = (now) =>
    (now || (() => new Date()))().toISOString();
  const buildInitialPayload = ({
    website,
    email,
    leadReference,
    submittedAt,
    company = "",
  }) =>
    Object.freeze({
      version: 3,
      phase: "request",
      website,
      email,
      leadReference,
      submittedAt,
      company,
    });
  const buildContextPayload = ({
    website,
    email,
    leadReference,
    contextSubmittedAt,
    firstName,
    sellsBuyer,
    competitors,
  }) =>
    Object.freeze({
      version: 3,
      phase: "context",
      website,
      email,
      leadReference,
      contextSubmittedAt,
      firstName,
      sellsBuyer,
      competitors,
      company: "",
    });
  const buildPayload = ({ website, email, details, company }) =>
    Object.freeze({
      website,
      email,
      details,
      source: "homepage snapshot form",
      company,
    });
  const randomUUIDFallback = () => {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
      return [
        hex.slice(0, 4).join(""),
        hex.slice(4, 6).join(""),
        hex.slice(6, 8).join(""),
        hex.slice(8, 10).join(""),
        hex.slice(10, 16).join(""),
      ].join("-");
    }
    throw new Error("Secure UUID generation is unavailable");
  };
  const captureLead = async (payload, dependencies = {}) => {
    const fetchImpl = dependencies.fetchImpl || window.fetch;
    const wait = dependencies.wait || ((ms) => new Promise(
      (resolve) => window.setTimeout(resolve, ms),
    ));
    const requestBody = JSON.stringify(payload);
    let attempts = 0;

    while (attempts < 2) {
      attempts += 1;
      let attempt;
      try {
        attempt = await fetchLeadAttempt(fetchImpl, requestBody, dependencies);
      } catch (error) {
        if (attempts < 2) {
          await wait(250);
          continue;
        }
        return { kind: "failed", status: 0, attempts };
      }
      const response = attempt.response;

      if (response.status >= 500 && response.status <= 599 && attempts < 2) {
        await wait(250);
        continue;
      }
      if (response.status !== 202) {
        return { kind: "failed", status: response.status || 0, attempts };
      }
      if (attempt.bodyError) {
        return { kind: "failed", status: 0, attempts };
      }
      const body = attempt.body;
      if (body?.accepted === true) {
        if (
          payload.version === 3 &&
          body.leadReference !== payload.leadReference
        ) {
          return { kind: "failed", status: 0, attempts };
        }
        return {
          kind: "accepted",
          attempts,
          ...(payload.version === 3
            ? { leadReference: body.leadReference }
            : {}),
        };
      }
      if (body?.accepted === false) return { kind: "ignored", attempts };
      return { kind: "failed", status: 0, attempts };
    }
  };

  const controllers = new WeakMap();
  const init = (form, overrides = {}) => {
    if (controllers.has(form)) return controllers.get(form);
    const dependencies = {
      fetchImpl: overrides.fetchImpl || window.fetch.bind(window),
      wait: overrides.wait || ((ms) => new Promise(
        (resolve) => window.setTimeout(resolve, ms),
      )),
      analytics: overrides.analytics || (() => window.shifterAnalytics),
      randomUUID: overrides.randomUUID || randomUUIDFallback,
      now: overrides.now || (() => new Date()),
    };
    const status = form.querySelector("[data-snap-status]");
    const step2 = form.querySelector("[data-snap-step2]");
    const website = form.querySelector('[name="website"]');
    const email = form.querySelector('[name="email"]');
    const company = form.querySelector('[name="company"]');
    const requestButton = form.querySelector("[data-snap-send]");
    const firstStepButton = form.querySelector("[data-snap-submit]");
    const done = document.querySelector("[data-snap-done]");
    const doneHeading = done?.querySelector("[data-snap-done-heading]");
    const enrichment = done?.querySelector("[data-snap-enrichment]");
    const contextStatus = done?.querySelector("[data-snap-context-status]");
    const contextButton = done?.querySelector("[data-snap-context-submit]");
    const skipButton = done?.querySelector("[data-snap-skip]");
    const finalMessage = done?.querySelector("[data-snap-final]");
    const firstName = enrichment?.querySelector('[name="firstName"]');
    const sellsBuyer = enrichment?.querySelector('[name="sellsBuyer"]');
    const competitors = enrichment?.querySelector('[name="competitors"]');
    let leadReference = null;
    let initialPayload = null;
    let contextPayload = null;
    let initialInFlight = null;
    let contextInFlight = null;
    let lastInitialPromise = Promise.resolve(null);
    let lastContextPromise = Promise.resolve(null);
    let analyticsEmitted = false;
    let initialAccepted = false;

    const controller = Object.freeze({
      getPayload: () => initialPayload,
      getInitialPayload: () => initialPayload,
      getContextPayload: () => contextPayload,
      getSubmitPromise: () => lastInitialPromise,
      getInitialPromise: () => lastInitialPromise,
      getContextPromise: () => lastContextPromise,
    });
    controllers.set(form, controller);

    const showStatus = (message) => {
      if (!status) return;
      status.textContent = message;
      status.hidden = message === "";
    };
    const showContextStatus = (message) => {
      if (!contextStatus) return;
      contextStatus.textContent = message;
      contextStatus.hidden = message === "";
    };
    const focusWithoutScroll = (target) => {
      if (target && typeof target.focus === "function") {
        target.focus({ preventScroll: true });
      }
    };
    const showQueued = () => {
      form.hidden = true;
      if (done) done.hidden = false;
      focusWithoutScroll(doneHeading || enrichment);
    };
    const restoreInitialButton = () => {
      requestButton.disabled = false;
      requestButton.textContent = "Request my Snapshot";
    };
    const restoreContextButton = () => {
      if (!contextButton) return;
      contextButton.disabled = false;
      contextButton.textContent = "Sharpen my Snapshot";
    };
    const finalizeWithoutContext = () => {
      if (!enrichment) return;
      enrichment.hidden = true;
      if (finalMessage) finalMessage.hidden = false;
      showContextStatus("");
      focusWithoutScroll(finalMessage);
    };
    const finalizeWithContext = () => {
      if (!enrichment) return;
      enrichment.hidden = true;
      if (finalMessage) {
        finalMessage.textContent =
          "Thanks — your context is attached, and we’ll sharpen your Snapshot for the right market.";
        finalMessage.hidden = false;
      }
      showContextStatus("");
      focusWithoutScroll(finalMessage);
    };
    const emitAnalytics = () => {
      if (analyticsEmitted) return;
      try {
        const analytics = dependencies.analytics();
        if (!analytics || typeof analytics.track !== "function") return;
        analyticsEmitted = true;
        analytics.track("generate_lead", {
          form_id: "shifter-snapshot",
          form_name: "Shifter visibility snapshot",
        });
      } catch (error) {
        // Optional analytics never interrupts the accepted capture state.
      }
    };
    const submitInitial = () => {
      if (initialInFlight || !initialPayload) return initialInFlight;
      requestButton.disabled = true;
      requestButton.textContent = "Requesting…";
      showStatus("");
      const frozenPayload = initialPayload;
      const promise = captureLead(frozenPayload, dependencies)
        .then((result) => {
          if (result.kind === "accepted") {
            initialAccepted = true;
            showQueued();
            emitAnalytics();
          } else {
            restoreInitialButton();
            if (result.kind === "ignored") {
              initialPayload = null;
              showStatus("");
            } else {
              showStatus(
                "We couldn't queue your Snapshot. Please check your details and try again.",
              );
            }
          }
          return result;
        })
        .finally(() => {
          if (initialInFlight === promise) initialInFlight = null;
        });
      initialInFlight = promise;
      lastInitialPromise = promise;
      return promise;
    };
    const submitContext = () => {
      if (contextInFlight || !initialPayload || !initialAccepted || !enrichment) {
        return contextInFlight;
      }
      if (!contextPayload) {
        const firstNameResult = normalizeOptional(firstName?.value || "", 80);
        const sellsBuyerResult = normalizeOptional(sellsBuyer?.value || "", 600);
        const competitorsResult = normalizeCompetitors(competitors?.value || "");
        if (!firstNameResult.ok || !sellsBuyerResult.ok || !competitorsResult.ok) {
          showContextStatus(
            "Keep each optional answer within its limits and list no more than three competitors, then try again.",
          );
          const invalidField = !firstNameResult.ok
            ? firstName
            : !sellsBuyerResult.ok
              ? sellsBuyer
              : competitors;
          focusWithoutScroll(invalidField);
          return Promise.resolve({ kind: "failed", status: 400, attempts: 0 });
        }
        contextPayload = buildContextPayload({
          website: initialPayload.website,
          email: initialPayload.email,
          leadReference,
          contextSubmittedAt: createSubmittedAt(dependencies.now),
          firstName: firstNameResult.value,
          sellsBuyer: sellsBuyerResult.value,
          competitors: competitorsResult.value,
        });
      }
      contextButton.disabled = true;
      contextButton.textContent = "Sharpening…";
      if (skipButton) skipButton.disabled = true;
      showContextStatus("");
      const frozenPayload = contextPayload;
      const promise = captureLead(frozenPayload, dependencies)
        .then((result) => {
          if (result.kind === "accepted") {
            finalizeWithContext();
          } else {
            restoreContextButton();
            if (skipButton) skipButton.disabled = false;
            showContextStatus(
              "Your Snapshot request is already queued. We couldn't add the optional context. Please try again.",
            );
          }
          return result;
        })
        .finally(() => {
          if (contextInFlight === promise) contextInFlight = null;
        });
      contextInFlight = promise;
      lastContextPromise = promise;
      return promise;
    };

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (initialInFlight || initialAccepted) return;
      if (step2.hidden) {
        const websiteResult = normalizeWebsite(website.value);
        if (!websiteResult.ok) {
          showStatus("Enter a public website, such as acme.com.");
          website.focus();
          return;
        }
        website.value = websiteResult.value;
        showStatus("");
        step2.hidden = false;
        firstStepButton.hidden = true;
        email.focus();
        return;
      }
      const websiteResult = normalizeWebsite(website.value);
      const emailResult = normalizeEmail(email.value);
      if (!websiteResult.ok) {
        showStatus("Enter a public website, such as acme.com.");
        website.focus();
        return;
      }
      if (!emailResult.ok) {
        showStatus("Add a valid work email so we know where to send it.");
        email.focus();
        return;
      }
      website.value = websiteResult.value;
      email.value = emailResult.value;
      if (!leadReference) {
        leadReference = createLeadReference(dependencies.randomUUID);
      }
      if (!initialPayload) {
        initialPayload = buildInitialPayload({
          website: websiteResult.value,
          email: emailResult.value,
          leadReference,
          submittedAt: createSubmittedAt(dependencies.now),
          company: company?.value || "",
        });
      }
      submitInitial();
    });

    enrichment?.addEventListener("submit", (event) => {
      event.preventDefault();
      submitContext();
    });
    skipButton?.addEventListener("click", (event) => {
      event.preventDefault();
      if (!contextInFlight) finalizeWithoutContext();
    });

    return controller;
  };

  window.shifterSnapshotForm = Object.freeze({
    normalizeWebsite,
    normalizeEmail,
    normalizeDetails,
    buildPayload,
    buildInitialPayload,
    buildContextPayload,
    createLeadReference,
    createSubmittedAt,
    captureLead,
    init,
    getController: (form) => controllers.get(form) || null,
  });

  const snapshotForm = document.querySelector("[data-snap-form]");
  if (snapshotForm) init(snapshotForm);
})();

// engine banner watchdog: if the CSS animation isn't advancing (an OS
// accessibility flag, a browser extension, or a stray style layer can freeze
// it), take over and drive the same scroll from JS — the strip is never static
const marqueeTrack = document.querySelector(".engine-track");

if (marqueeTrack) {
  const MARQUEE_SPEED = 35; // px per second, matches the 28s CSS loop

  let marqueeVerified = false;
  let marqueeFallbackOn = false;

  const startMarqueeFallback = () => {
    if (marqueeFallbackOn) {
      return;
    }

    marqueeFallbackOn = true;

    // take over from wherever the frozen animation left the track
    let x = 0;

    try {
      const matrix = getComputedStyle(marqueeTrack).transform;

      if (matrix && matrix !== "none") {
        x = Math.abs(new DOMMatrixReadOnly(matrix).m41);
      }
    } catch (error) {
      x = 0;
    }

    marqueeTrack.style.animation = "none";
    let last = null;

    const step = (now) => {
      if (last !== null) {
        // clamp the frame delta so a background-tab pause doesn't jump the strip
        const dt = Math.min((now - last) / 1000, 0.1);
        const half = marqueeTrack.scrollWidth / 2;

        if (half > 0) {
          x = (x + dt * MARQUEE_SPEED) % half;
          marqueeTrack.style.transform = `translate3d(${-x}px, 0, 0)`;
        }
      }

      last = now;
      window.requestAnimationFrame(step);
    };

    window.requestAnimationFrame(step);
  };

  const checkMarquee = () => {
    if (marqueeVerified || marqueeFallbackOn || document.hidden) {
      return;
    }

    const before = getComputedStyle(marqueeTrack).transform;

    setTimeout(() => {
      if (marqueeVerified || marqueeFallbackOn || document.hidden) {
        return; // hidden tabs freeze the timeline; re-checked on visibility
      }

      const after = getComputedStyle(marqueeTrack).transform;

      if (after === before) {
        startMarqueeFallback();
      } else {
        marqueeVerified = true;
      }
    }, 900);
  };

  window.setTimeout(checkMarquee, 1200);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      window.setTimeout(checkMarquee, 600);
    }
  });
}

const revealSelector = [
  ".report-inner > *",
  ".proof-head > *",
  ".answer-compare",
  ".ac-caption",
  ".evidence-stats",
  ".timeline-intro > *",
  ".roadmap-step",
  ".split-heading > *",
  ".snapshot-contents",
  ".pricing-plan",
  ".pricing-deflect",
  ".console-caption",
  ".hero-console",
  ".faq-heading > *",
  ".faq-row",
  ".founder-card",
  ".fit-cta-panel",
].join(",");

document.querySelectorAll(".hero, .section").forEach((section) => {
  section.querySelectorAll(revealSelector).forEach((item, index) => {
    item.classList.add("reveal-item");
    item.style.setProperty("--reveal-delay", `${Math.min(index % 5, 4) * 70}ms`);
  });
});

const revealItems = document.querySelectorAll(".reveal-item");

if ("IntersectionObserver" in window && !prefersReducedMotion) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    {
      rootMargin: "0px 0px -12% 0px",
      threshold: 0.12,
    },
  );

  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const timeline = document.querySelector("[data-timeline]");

if (timeline) {
  const timelineSteps = Array.from(timeline.querySelectorAll("[data-timeline-step]"));
  let timelineFrame;

  const setTimelineStep = (index) => {
    timelineSteps.forEach((step, stepIndex) => {
      step.classList.toggle("is-active", stepIndex === index);
      step.classList.toggle("is-past", stepIndex < index);
      step.classList.toggle("is-revealed", stepIndex <= index);
    });
  };

  const updateTimeline = () => {
    timelineFrame = undefined;

    const rail = timeline.querySelector(".roadmap-rail");
    const railRect = rail ? rail.getBoundingClientRect() : timeline.getBoundingClientRect();
    const anchor = window.innerHeight * 0.42;
    const railProgress = clamp((anchor - railRect.top) / Math.max(railRect.height, 1), 0, 1);
    timeline.style.setProperty("--roadmap-progress", `${railProgress * 100}%`);

    const activeIndex = timelineSteps.reduce(
      (best, step, index) => {
        const dot = step.querySelector(".roadmap-dot");
        const rect = (dot || step).getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        const distance = Math.abs(center - anchor);

        if (distance < best.distance) {
          return { index, distance };
        }

        return best;
      },
      { index: 0, distance: Number.POSITIVE_INFINITY },
    ).index;

    setTimelineStep(activeIndex);
  };

  const requestTimelineUpdate = () => {
    if (timelineFrame) {
      return;
    }

    timelineFrame = window.requestAnimationFrame(updateTimeline);
  };

  if (prefersReducedMotion) {
    timeline.style.setProperty("--roadmap-progress", "100%");
    timelineSteps.forEach((step, index) => {
      const isFinalStep = index === timelineSteps.length - 1;

      step.classList.add("is-revealed");
      step.classList.toggle("is-active", isFinalStep);
      step.classList.toggle("is-past", !isFinalStep);
    });
  } else {
    setTimelineStep(0);
    updateTimeline();

    window.addEventListener("scroll", requestTimelineUpdate, { passive: true });
    window.addEventListener("resize", requestTimelineUpdate);
  }
}

// creative pass: stat count-up, pointer-reactive exhibits, magnetic CTAs,
// hero parallax. Pointer work is gated to real hover devices; everything is
// null-guarded so either page can omit any of it.
(() => {
  document.querySelectorAll(".evidence-stats").forEach((group) => {
    const strongs = Array.from(group.querySelectorAll("strong"));

    if (!strongs.length || !("IntersectionObserver" in window)) {
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          io.disconnect();

          strongs.forEach((el, i) => {
            const node = el.firstChild;
            const target = parseInt(node && node.nodeValue, 10);

            if (!Number.isFinite(target)) {
              return;
            }

            const start = performance.now() + i * 130;
            const dur = 900;

            const step = (now) => {
              const t = Math.min(1, Math.max(0, (now - start) / dur));
              const eased = 1 - Math.pow(1 - t, 3);
              node.nodeValue = String(Math.round(target * eased));

              if (t < 1) {
                window.requestAnimationFrame(step);
              } else if (i === strongs.length - 1) {
                el.classList.add("stat-pulsed");
              }
            };

            window.requestAnimationFrame(step);
          });
        });
      },
      { threshold: 0.5 },
    );

    io.observe(group);
  });

  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    return;
  }

  // The editorial homepage owns its motion inside the artwork only.
  const heroSection = document.querySelector("body:not(.signal-system) .hero");

  if (heroSection) {
    heroSection.addEventListener(
      "pointermove",
      (e) => {
        const r = heroSection.getBoundingClientRect();
        heroSection.style.setProperty("--hpx", (((e.clientX - r.left) / r.width - 0.5) * 2).toFixed(3));
        heroSection.style.setProperty("--hpy", (((e.clientY - r.top) / r.height - 0.5) * 2).toFixed(3));
      },
      { passive: true },
    );

    heroSection.addEventListener("pointerleave", () => {
      heroSection.style.setProperty("--hpx", "0");
      heroSection.style.setProperty("--hpy", "0");
    });
  }

  document.querySelectorAll("[data-tilt]").forEach((card) => {
    const sheen = document.createElement("span");
    sheen.className = "tilt-sheen";
    sheen.setAttribute("aria-hidden", "true");
    card.appendChild(sheen);

    const cur = { x: 0, y: 0 };
    const goal = { x: 0, y: 0 };
    let raf = null;
    let hovering = false;

    const render = () => {
      raf = null;
      cur.x += (goal.x - cur.x) * 0.16;
      cur.y += (goal.y - cur.y) * 0.16;
      card.style.setProperty("--tilt-x", cur.x.toFixed(3) + "deg");
      card.style.setProperty("--tilt-y", cur.y.toFixed(3) + "deg");

      if (Math.abs(cur.x - goal.x) > 0.01 || Math.abs(cur.y - goal.y) > 0.01) {
        raf = window.requestAnimationFrame(render);
      } else if (!hovering) {
        card.classList.remove("is-tilting");
        card.style.removeProperty("--tilt-x");
        card.style.removeProperty("--tilt-y");
        cur.x = 0;
        cur.y = 0;
      }
    };

    const schedule = () => {
      if (raf === null) {
        raf = window.requestAnimationFrame(render);
      }
    };

    card.addEventListener("pointerenter", () => {
      hovering = true;
      card.classList.add("is-tilting");
    });

    card.addEventListener(
      "pointermove",
      (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        goal.y = (px - 0.5) * 4.6;
        goal.x = (0.5 - py) * 3.6;
        card.style.setProperty("--sheen-x", (px * 100).toFixed(1) + "%");
        card.style.setProperty("--sheen-y", (py * 100).toFixed(1) + "%");
        card.style.setProperty("--sheen-o", "1");
        schedule();
      },
      { passive: true },
    );

    card.addEventListener("pointerleave", () => {
      hovering = false;
      goal.x = 0;
      goal.y = 0;
      card.style.setProperty("--sheen-o", "0");
      schedule();
    });
  });

  document.querySelectorAll(".hero-cta, .cta-primary, .price-cta, .header-cta").forEach((btn) => {
    if (btn.matches("body.signal-system .hero-cta")) return;
    btn.classList.add("is-magnet");

    btn.addEventListener(
      "pointermove",
      (e) => {
        const r = btn.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
        const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
        btn.style.setProperty("--mag-x", (dx * 4).toFixed(2) + "px");
        btn.style.setProperty("--mag-y", (dy * 3).toFixed(2) + "px");
      },
      { passive: true },
    );

    btn.addEventListener("pointerleave", () => {
      btn.style.setProperty("--mag-x", "0px");
      btn.style.setProperty("--mag-y", "0px");
    });
  });
})();

// before/after answer compare: both cards generate like a real answer —
// thinking beat, then the text streams in with a cursor, competitor rows
// surface as the stream reaches them, Shifter lands first and glows. The
// markup default (and every failure path) is the fully answered state.
(() => {
  const compare = document.querySelector("[data-compare]");

  if (!compare || !("IntersectionObserver" in window)) {
    return;
  }

  const beforeCard = compare.querySelector(".ac-card:not(.ac-card-after)");
  const afterCard = compare.querySelector(".ac-card-after");

  if (!beforeCard || !afterCard) {
    return;
  }

  const leavesOf = (card) => Array.from(card.querySelectorAll("[data-stream]"));
  const fullText = new Map();

  const settle = () => {
    compare.classList.remove("ac-live");
    compare.classList.add("ac-bridge-on");

    [beforeCard, afterCard].forEach((card) => {
      card.classList.remove("ac-thinking");
      card.classList.add("ac-streamed");
      leavesOf(card).forEach((el) => {
        if (fullText.has(el)) {
          el.textContent = fullText.get(el);
        }
      });
      card.querySelectorAll(".ac-row").forEach((r) => r.classList.add("ac-shown"));
    });

    const cursor = compare.querySelector(".ac-cursor");

    if (cursor) {
      cursor.remove();
    }
  };

  try {
    [beforeCard, afterCard].forEach((card) => {
      leavesOf(card).forEach((el) => {
        fullText.set(el, el.textContent);
        el.textContent = "";
      });
    });

    compare.classList.add("ac-live");

    const cursor = document.createElement("span");
    cursor.className = "ac-cursor";
    cursor.setAttribute("aria-hidden", "true");
    cursor.textContent = "▍";

    const streamCard = (card, onDone) => {
      const targets = leavesOf(card);
      card.classList.add("ac-thinking");

      let ti = 0;
      let ci = 0;
      let gate = null;
      let streamNode = null;

      const step = (now) => {
        try {
          if (gate === null) {
            gate = now + 700; // thinking beat
          }

          if (now >= gate) {
            if (ti === 0 && ci === 0) {
              card.classList.remove("ac-thinking");
            }

            const el = targets[ti];
            const full = fullText.get(el) || "";

            if (ci === 0) {
              const row = el.closest(".ac-row");

              if (row) {
                row.classList.add("ac-shown");
              }

              // cursor rides inline inside the leaf: [textNode, cursor]
              el.textContent = "";
              streamNode = document.createTextNode("");
              el.appendChild(streamNode);
              el.appendChild(cursor);
            }

            // token-ish chunks with deterministic jitter
            ci = Math.min(full.length, ci + 2 + ((ti * 31 + ci * 7) % 3));
            streamNode.nodeValue = full.slice(0, ci);
            gate = now + 26 + ((ci * 13) % 24);

            if (ci >= full.length) {
              ti += 1;
              ci = 0;
              gate = now + 130 + ((ti * 53) % 170);
            }
          }

          if (ti < targets.length) {
            window.requestAnimationFrame(step);
          } else {
            cursor.remove();
            card.classList.add("ac-streamed");

            if (onDone) {
              onDone();
            }
          }
        } catch (error) {
          settle();
        }
      };

      window.requestAnimationFrame(step);
    };

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          io.disconnect();

          streamCard(beforeCard, () => {
            compare.classList.add("ac-bridge-on");
            setTimeout(() => streamCard(afterCard), 450);
          });
        });
      },
      { threshold: 0.35 },
    );

    io.observe(compare);

    // stuck-proof: if the generation hasn't finished well after it should
    // have, land the answered state
    setTimeout(() => {
      if (!afterCard.classList.contains("ac-streamed")) {
        settle();
      }
    }, 20000);
  } catch (error) {
    settle();
  }
})();

// /start flow: validate the business context, match one declared scope, and
// render only its safe next step. Nothing is captured until final completion.
(() => {
  const START_ROUTES = Object.freeze({
    single: "standard",
    multiple: "scoped",
    unsure: "snapshot",
  });
  const START_ROUTE_VALUES = new Set(Object.values(START_ROUTES));
  const LEAD_REFERENCE_PATTERN =
    /^shifter-start-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const STRIPE_CHECKOUT_URL = "https://buy.stripe.com/14A00kb6l8FL3ZCgwv8Zq01";
  const CAL_URL = "https://cal.com/fabiancid/discoverycall";
  const normalizeWebsite = normalizePublicWebsite;

  const normalizeBusinessDescription = (raw) => {
    if (typeof raw !== "string") return { ok: false, error: "required" };
    const value = raw.trim().replace(/\s+/g, " ");
    if (!value) return { ok: false, error: "required" };
    if (value.length < 5) return { ok: false, error: "too_short" };
    if (value.length > 160) return { ok: false, error: "too_long" };
    return { ok: true, value };
  };

  const validateScope = (raw) =>
    Object.hasOwn(START_ROUTES, raw)
      ? { ok: true, value: raw }
      : { ok: false, error: "required" };

  const routeForScope = (scope) =>
    Object.hasOwn(START_ROUTES, scope) ? START_ROUTES[scope] : null;
  const createLeadReference = (randomUUID) => `shifter-start-${randomUUID()}`;
  const createSubmittedAt = (now) => now().toISOString();
  const validateLeadReference = (raw) =>
    typeof raw === "string" && LEAD_REFERENCE_PATTERN.test(raw);
  const validateSubmittedAt = (raw) => {
    if (typeof raw !== "string") return false;
    const parsed = new Date(raw);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === raw;
  };

  const buildLeadPayload = (normalized, metadata) =>
    Object.freeze({
      version: 2,
      website: normalized.website,
      businessDescription: normalized.businessDescription,
      scope: normalized.scope,
      leadReference: metadata.leadReference,
      submittedAt: metadata.submittedAt,
      contact_email: normalized.contact_email || "",
    });

  const buildStripeUrl = (leadReference) => {
    const url = new URL(STRIPE_CHECKOUT_URL);
    url.searchParams.set("client_reference_id", leadReference);
    return url.toString();
  };

  const buildScopedCallUrl = (leadReference) => {
    const url = new URL(CAL_URL);
    url.searchParams.set(
      "notes",
      `Start form reference: ${leadReference} · route: scoped`,
    );
    return url.toString();
  };

  const captureLead = async (payload, dependencies = {}) => {
    const fetchImpl = dependencies.fetchImpl || window.fetch;
    const wait =
      dependencies.wait ||
      ((milliseconds) =>
        new Promise((resolve) => {
          setTimeout(resolve, milliseconds);
        }));
    const retries = Number.isInteger(dependencies.retries)
      ? Math.max(0, dependencies.retries)
      : 1;
    const requestBody = JSON.stringify(payload);
    const maximumAttempts = retries + 1;
    let attempts = 0;

    while (attempts < maximumAttempts) {
      attempts += 1;
      let attempt;

      try {
        attempt = await fetchLeadAttempt(fetchImpl, requestBody, dependencies);
      } catch (error) {
        if (attempts < maximumAttempts) {
          await wait(250);
          continue;
        }

        return { kind: "failed", status: 0, attempts };
      }
      const response = attempt.response;

      const status =
        response && typeof response.status === "number"
          ? response.status
          : 0;

      if (
        status >= 500 &&
        status <= 599 &&
        attempts < maximumAttempts
      ) {
        await wait(250);
        continue;
      }

      if (status !== 202) {
        return { kind: "failed", status, attempts };
      }
      if (attempt.bodyError) {
        return { kind: "failed", status: 0, attempts };
      }
      const body = attempt.body;

      if (body && body.accepted === false) {
        return { kind: "ignored", attempts };
      }

      if (
        body &&
        body.accepted === true &&
        START_ROUTE_VALUES.has(body.route) &&
        body.leadReference === payload.leadReference
      ) {
        return {
          kind: "accepted",
          route: body.route,
          leadReference: body.leadReference,
          attempts,
        };
      }

      return { kind: "failed", status: 0, attempts };
    }

    return { kind: "failed", status: 0, attempts };
  };

  const START_ERRORS = Object.freeze({
    website: {
      required: "Enter your website.",
      too_long: "Keep the website under 200 characters.",
      format: "Enter a public domain or an http(s) website, such as acme.com.",
    },
    businessDescription: {
      required: "Describe what you sell and who buys it.",
      too_short: "Use at least 5 characters.",
      too_long: "Keep the description to 160 characters.",
    },
    scope: {
      required: "Choose the option that best fits.",
    },
  });
  const controllers = new WeakMap();

  const init = (root, overrides = {}) => {
    if (controllers.has(root)) return controllers.get(root);

    const dependencies = {
      fetchImpl: overrides.fetchImpl || window.fetch.bind(window),
      randomUUID:
        overrides.randomUUID ||
        window.crypto.randomUUID.bind(window.crypto),
      now: overrides.now || (() => new Date()),
      // `analytics` is an accessor so consent state is resolved at success time.
      analytics: overrides.analytics || (() => window.shifterAnalytics),
      wait:
        overrides.wait ||
        ((ms) =>
          new Promise((resolve) => window.setTimeout(resolve, ms))),
      matchMedia: overrides.matchMedia || window.matchMedia.bind(window),
      scrollTo: overrides.scrollTo || window.scrollTo.bind(window),
    };
    const form = root.querySelector("[data-start-form]");
    const progress = root.querySelector("[data-start-progress]");
    const live = root.querySelector("[data-start-live]");
    const businessStep = root.querySelector('[data-start-step="business"]');
    const scopeStep = root.querySelector('[data-start-step="scope"]');
    const website = form.querySelector('[name="website"]');
    const businessDescription = form.querySelector(
      '[name="businessDescription"]',
    );
    const contactEmail = form.querySelector('[name="contact_email"]');
    const scopeFieldset = form.querySelector("fieldset");
    const scopeRadios = Array.from(
      form.querySelectorAll('[name="scope"]'),
    );
    const finalButton = form.querySelector("[data-start-submit]");
    const backButton = form.querySelector("[data-start-back]");
    const result = root.querySelector("[data-start-result]");
    const resultBody = root.querySelector("[data-start-result-body]");
    const capture = root.querySelector("[data-start-capture]");
    const captureMessage = root.querySelector(
      "[data-start-capture-message]",
    );
    const retryButton = root.querySelector("[data-start-retry]");
    const errors = {
      website: form.querySelector('[data-error-for="website"]'),
      businessDescription: form.querySelector(
        '[data-error-for="businessDescription"]',
      ),
      scope: form.querySelector('[data-error-for="scope"]'),
    };
    const answers = {
      website: "",
      businessDescription: "",
      scope: "",
      contact_email: "",
    };
    const leadReference = createLeadReference(dependencies.randomUUID);
    let state = "business";
    let completionStarted = false;
    let inFlightPromise = null;
    let lastCompletionPromise = Promise.resolve(null);
    let frozenPayload = null;
    let activeRoute = null;
    let captureState = "idle";
    let analyticsEmitted = false;

    const controller = Object.freeze({
      getState: () => state,
      getPayload: () => frozenPayload,
      getCompletionPromise: () => lastCompletionPromise,
    });
    controllers.set(root, controller);

    const fieldFor = (name) =>
      name === "scope"
        ? scopeFieldset
        : name === "website"
          ? website
          : businessDescription;

    const showError = (name, code) => {
      const error = errors[name];
      error.textContent = START_ERRORS[name][code];
      error.hidden = false;
      fieldFor(name).setAttribute("aria-invalid", "true");
    };

    const clearError = (name) => {
      errors[name].hidden = true;
      fieldFor(name).removeAttribute("aria-invalid");
    };

    const selectedScope = () => {
      const selected = scopeRadios.find((radio) => radio.checked);
      return selected ? selected.value : "";
    };

    const scrollPage = () => {
      const reducedMotion = dependencies.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      dependencies.scrollTo({
        top: 0,
        behavior: reducedMotion ? "auto" : "smooth",
      });
    };

    const showStep = (nextState) => {
      state = nextState;
      const businessIsActive = nextState === "business";
      businessStep.hidden = !businessIsActive;
      scopeStep.hidden = businessIsActive;
      const message = businessIsActive ? "Step 1 of 2" : "Step 2 of 2";
      progress.textContent = message;
      live.textContent = message;
      const heading = (
        businessIsActive ? businessStep : scopeStep
      ).querySelector("[data-step-heading]");
      heading.focus({ preventScroll: true });
      scrollPage();
    };

    const validateBusiness = () => {
      const websiteResult = normalizeWebsite(website.value);
      const descriptionResult = normalizeBusinessDescription(
        businessDescription.value,
      );

      if (websiteResult.ok) {
        clearError("website");
      } else {
        showError("website", websiteResult.error);
      }

      if (descriptionResult.ok) {
        clearError("businessDescription");
      } else {
        showError("businessDescription", descriptionResult.error);
      }

      if (!websiteResult.ok || !descriptionResult.ok) {
        (websiteResult.ok ? businessDescription : website).focus();
        return false;
      }

      answers.website = websiteResult.value;
      answers.businessDescription = descriptionResult.value;
      website.value = websiteResult.value;
      businessDescription.value = descriptionResult.value;
      return true;
    };

    const setResultUrls = (route, reference) => {
      const stripe = resultBody.querySelector("[data-cta-standard]");
      if (stripe) stripe.href = buildStripeUrl(reference);

      const enterprise = resultBody.querySelector("[data-cta-enterprise]");
      if (enterprise && route === "scoped") {
        enterprise.href = buildScopedCallUrl(reference);
      }
    };

    const replaceResultBody = (route) => {
      if (!START_ROUTE_VALUES.has(route)) return false;
      const template = root.querySelector(
        `[data-result-template="${route}"]`,
      );
      if (!template || !frozenPayload) return false;
      resultBody.replaceChildren(template.content.cloneNode(true));
      setResultUrls(route, frozenPayload.leadReference);
      activeRoute = route;
      return true;
    };

    const renderResult = (route) => {
      replaceResultBody(route);
      form.hidden = true;
      result.hidden = false;
      state = "result";
      live.textContent = "Your next step is ready.";
      resultBody
        .querySelector("[data-result-heading]")
        .focus({ preventScroll: true });
      scrollPage();
    };

    const setCaptureState = (nextState) => {
      captureState = nextState;
      retryButton.hidden = true;

      if (nextState === "saving") {
        capture.hidden = false;
        captureMessage.textContent = "Saving your answers…";
        return;
      }

      if (nextState === "failed") {
        capture.hidden = false;
        captureMessage.textContent =
          "We could not save your answers. Your next step is still available below.";
        retryButton.hidden = false;
        return;
      }

      capture.hidden = true;
      captureMessage.textContent = "";
    };

    const emitAcceptedAnalytics = () => {
      if (analyticsEmitted) return;

      try {
        const analytics = dependencies.analytics();
        if (!analytics || typeof analytics.track !== "function") return;
        analyticsEmitted = true;
        analytics.track("generate_lead", {
          form_id: "shifter-start",
          form_name: "Shifter start plan",
        });
      } catch (error) {
        // Optional analytics must never interrupt the saved visitor result.
      }
    };

    const saveFrozenPayload = () => {
      if (inFlightPromise) return inFlightPromise;

      setCaptureState("saving");
      const savePromise = captureLead(frozenPayload, {
        fetchImpl: dependencies.fetchImpl,
        wait: dependencies.wait,
        retries: 1,
      })
        .then((captureResult) => {
          if (captureResult.kind === "accepted") {
            setCaptureState("saved");
            if (captureResult.route !== activeRoute) {
              replaceResultBody(captureResult.route);
            }
            emitAcceptedAnalytics();
          } else if (captureResult.kind === "ignored") {
            setCaptureState("ignored");
          } else {
            setCaptureState("failed");
          }

          return captureResult;
        })
        .finally(() => {
          if (inFlightPromise === savePromise) {
            inFlightPromise = null;
          }
        });

      inFlightPromise = savePromise;
      lastCompletionPromise = savePromise;
      return savePromise;
    };

    form.addEventListener("submit", (event) => {
      event.preventDefault();

      if (completionStarted) return;

      if (state === "business") {
        if (validateBusiness()) {
          showStep("scope");
        }
        return;
      }

      if (state !== "scope") return;

      const scopeResult = validateScope(selectedScope());

      if (!scopeResult.ok) {
        showError("scope", scopeResult.error);
        scopeRadios[0].focus();
        return;
      }

      clearError("scope");
      answers.scope = scopeResult.value;
      answers.contact_email = contactEmail.value;
      completionStarted = true;
      finalButton.disabled = true;
      const submittedAt = createSubmittedAt(dependencies.now);
      frozenPayload = buildLeadPayload(answers, {
        leadReference,
        submittedAt,
      });
      const route = routeForScope(answers.scope);
      renderResult(route);
      saveFrozenPayload();
    });

    [website, businessDescription].forEach((field) => {
      field.addEventListener("input", () => {
        const validation =
          field === website
            ? normalizeWebsite(field.value)
            : normalizeBusinessDescription(field.value);

        if (validation.ok) {
          clearError(field.name);
        }
      });

      field.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || event.isComposing) return;
        event.preventDefault();
        form.requestSubmit();
      });
    });

    scopeRadios.forEach((radio) => {
      radio.addEventListener("change", () => {
        if (validateScope(selectedScope()).ok) {
          clearError("scope");
        }
      });
    });

    backButton.addEventListener("click", () => {
      if (state === "scope") {
        showStep("business");
      }
    });

    retryButton.addEventListener("click", () => {
      if (captureState === "failed") {
        saveFrozenPayload();
      }
    });

    form.hidden = false;
    businessStep.hidden = false;
    scopeStep.hidden = true;
    progress.textContent = "Step 1 of 2";
    return controller;
  };

  window.shifterStartForm = Object.freeze({
    normalizeWebsite,
    normalizeBusinessDescription,
    validateScope,
    validateLeadReference,
    validateSubmittedAt,
    routeForScope,
    createLeadReference,
    createSubmittedAt,
    buildLeadPayload,
    buildStripeUrl,
    buildScopedCallUrl,
    captureLead,
    init,
  });

  const startRoot = document.querySelector("[data-start]");
  if (startRoot) init(startRoot);
})();
