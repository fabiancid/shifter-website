(() => {
  "use strict";

  const MEASUREMENT_ID = "G-NXP0K1W8Y0";
  const CONSENT_KEY = "shifter_analytics_consent";
  const CONSENT_VERSION = 2;
  const GOOGLE_TAG_SELECTOR = "script[data-shifter-ga4]";
  const VERCEL_INSIGHTS_SELECTOR = "script[data-shifter-vercel-insights]";
  let googleTagRequested = false;
  let vercelInsightsRequested = false;
  let pageViewSent = false;

  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    function gtag() {
      window.dataLayer.push(arguments);
    };

  window.gtag("consent", "default", {
    ad_storage: "denied",
    analytics_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    functionality_storage: "granted",
    personalization_storage: "denied",
    security_storage: "granted",
    wait_for_update: 500,
  });

  const readConsent = () => {
    try {
      const raw = window.localStorage.getItem(CONSENT_KEY);
      if (!raw) return null;
      const value = JSON.parse(raw);
      if (value.version !== CONSENT_VERSION) return null;
      return value.status === "granted" || value.status === "denied" ? value.status : null;
    } catch (error) {
      return null;
    }
  };

  const writeConsent = (status) => {
    try {
      window.localStorage.setItem(
        CONSENT_KEY,
        JSON.stringify({ status, version: CONSENT_VERSION, updatedAt: new Date().toISOString() }),
      );
    } catch (error) {
      // Consent still applies for the current page even if storage is unavailable.
    }
  };

  const clearAnalyticsCookies = () => {
    const names = document.cookie
      .split(";")
      .map((part) => part.split("=")[0].trim())
      .filter((name) => /^_ga(?:_|$)|^_gid$|^_gat/.test(name));

    names.forEach((name) => {
      const encodedName = encodeURIComponent(name);
      const expired = "=; Max-Age=0; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      document.cookie = `${encodedName}${expired}`;
      document.cookie = `${encodedName}${expired}; domain=shifter.co`;
      document.cookie = `${encodedName}${expired}; domain=.shifter.co`;
    });
  };

  const loadGoogleTag = () => {
    if (googleTagRequested || document.querySelector(GOOGLE_TAG_SELECTOR)) return;
    googleTagRequested = true;

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
    script.dataset.shifterGa4 = "true";
    document.head.appendChild(script);

    window.gtag("js", new Date());
    window.gtag("config", MEASUREMENT_ID, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      send_page_view: false,
      transport_type: "beacon",
    });

    if (!pageViewSent) {
      pageViewSent = true;
      const sanitizeUrl = (value) => {
        try {
          const parsed = new URL(value, window.location.origin);
          return `${parsed.origin}${parsed.pathname}`;
        } catch (error) {
          return "";
        }
      };
      const pageView = {
        page_title: document.title,
        page_location: sanitizeUrl(window.location.href),
      };
      const referrer = sanitizeUrl(document.referrer);
      if (referrer) pageView.page_referrer = referrer;
      window.gtag("event", "page_view", pageView);
    }
  };

  const loadVercelInsights = () => {
    if (
      vercelInsightsRequested ||
      document.querySelector(VERCEL_INSIGHTS_SELECTOR) ||
      /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)
    ) {
      return;
    }

    vercelInsightsRequested = true;
    const script = document.createElement("script");
    script.defer = true;
    script.src = "/_vercel/insights/script.js";
    script.dataset.shifterVercelInsights = "true";
    document.head.appendChild(script);
  };

  const applyConsent = (status, { persist = true } = {}) => {
    const granted = status === "granted";

    if (persist) writeConsent(granted ? "granted" : "denied");

    window.gtag("consent", "update", {
      ad_storage: "denied",
      analytics_storage: granted ? "granted" : "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      personalization_storage: "denied",
    });

    if (granted) {
      loadGoogleTag();
      loadVercelInsights();
    } else {
      clearAnalyticsCookies();
    }

    window.dispatchEvent(
      new CustomEvent("shifter:analytics-consent", { detail: { status: granted ? "granted" : "denied" } }),
    );
  };

  const track = (eventName, parameters = {}) => {
    if (readConsent() !== "granted") return false;
    loadGoogleTag();
    loadVercelInsights();
    window.gtag("event", eventName, parameters);
    return true;
  };

  const injectStyles = () => {
    if (document.querySelector("style[data-shifter-consent-styles]")) return;

    const style = document.createElement("style");
    style.dataset.shifterConsentStyles = "true";
    style.textContent = `
      .shifter-consent {
        position: fixed;
        right: 18px;
        bottom: 18px;
        left: 18px;
        z-index: 2147483000;
        max-width: 720px;
        margin: 0 auto;
        padding: 18px;
        border: 1px solid rgba(255,255,255,.18);
        border-radius: 18px;
        background: #111;
        color: #fff;
        box-shadow: 0 20px 60px rgba(0,0,0,.28);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .shifter-consent[hidden] { display: none !important; }
      .shifter-consent__title { margin: 0 0 6px; font-size: 1rem; font-weight: 800; letter-spacing: -.01em; }
      .shifter-consent__copy { margin: 0; color: rgba(255,255,255,.76); font-size: .9rem; line-height: 1.5; }
      .shifter-consent__copy a { color: #fff; text-decoration: underline; text-underline-offset: 3px; }
      .shifter-consent__actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
      .shifter-consent__button {
        appearance: none;
        min-height: 42px;
        padding: 0 16px;
        border: 1px solid rgba(255,255,255,.28);
        border-radius: 999px;
        background: transparent;
        color: #fff;
        cursor: pointer;
        font: inherit;
        font-size: .88rem;
        font-weight: 750;
      }
      .shifter-consent__button:hover, .shifter-consent__button:focus-visible { border-color: #fff; outline: none; }
      .shifter-consent__button--accept { border-color: #ff4b22; background: #ff4b22; color: #111; }
      .shifter-consent__button--accept:hover, .shifter-consent__button--accept:focus-visible { border-color: #ff6b47; background: #ff6b47; }
      .shifter-consent-settings {
        position: fixed;
        left: 12px;
        bottom: 12px;
        z-index: 2147482000;
        padding: 8px 11px;
        border: 1px solid rgba(17,17,17,.22);
        border-radius: 999px;
        background: rgba(255,255,255,.94);
        color: #111;
        box-shadow: 0 8px 24px rgba(0,0,0,.1);
        cursor: pointer;
        font: 700 12px/1.2 Inter, ui-sans-serif, system-ui, sans-serif;
        backdrop-filter: blur(12px);
      }
      .shifter-consent-settings[hidden] { display: none !important; }
      .shifter-consent-settings--inline {
        position: static;
        padding: 0;
        border: 0;
        border-radius: 0;
        background: none;
        box-shadow: none;
        backdrop-filter: none;
        color: inherit;
        font: inherit;
        line-height: inherit;
        transition: color 180ms ease;
      }
      .shifter-consent-settings--inline:hover,
      .shifter-consent-settings--inline:focus-visible { color: #0b1020; }
      @media (max-width: 560px) {
        .shifter-consent { right: 10px; bottom: 10px; left: 10px; padding: 16px; border-radius: 15px; }
        .shifter-consent__actions { flex-direction: column-reverse; }
        .shifter-consent__button { width: 100%; }
      }
    `;
    document.head.appendChild(style);
  };

  let banner = null;
  let settingsButton = null;

  const closeBanner = () => {
    if (banner) banner.hidden = true;
    if (settingsButton) settingsButton.hidden = false;
  };

  const showBanner = ({ allowClose = false } = {}) => {
    if (!banner) return;
    banner.hidden = false;
    if (settingsButton) settingsButton.hidden = true;
    const closeButton = banner.querySelector("[data-consent-close]");
    if (closeButton) closeButton.hidden = !allowClose;
    const firstButton = banner.querySelector("[data-consent-accept]");
    if (firstButton) firstButton.focus({ preventScroll: true });
  };

  const buildControls = () => {
    injectStyles();

    banner = document.createElement("section");
    banner.className = "shifter-consent";
    banner.hidden = true;
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-modal", "false");
    banner.setAttribute("aria-labelledby", "shifter-consent-title");
    banner.innerHTML = `
      <h2 class="shifter-consent__title" id="shifter-consent-title">Optional analytics</h2>
      <p class="shifter-consent__copy">
        We use Google Analytics and Vercel Web Analytics only if you allow it, to understand page visits, successful snapshot requests, and checkout starts. We do not send form contents or payment details to Analytics. Read our <a href="/cookie-policy.html">Cookie Policy</a> and <a href="/privacy-policy.html">Privacy Policy</a>.
      </p>
      <div class="shifter-consent__actions">
        <button class="shifter-consent__button" type="button" data-consent-reject>Use necessary only</button>
        <button class="shifter-consent__button" type="button" data-consent-close hidden>Keep current choice</button>
        <button class="shifter-consent__button shifter-consent__button--accept" type="button" data-consent-accept>Allow analytics</button>
      </div>
    `;

    settingsButton = document.createElement("button");
    settingsButton.className = "shifter-consent-settings";
    settingsButton.type = "button";
    settingsButton.hidden = true;
    settingsButton.textContent = "Cookie settings";
    settingsButton.setAttribute("aria-label", "Review cookie and analytics settings");

    banner.querySelector("[data-consent-accept]").addEventListener("click", () => {
      applyConsent("granted");
      closeBanner();
    });

    banner.querySelector("[data-consent-reject]").addEventListener("click", () => {
      applyConsent("denied");
      closeBanner();
    });

    banner.querySelector("[data-consent-close]").addEventListener("click", closeBanner);
    settingsButton.addEventListener("click", () => showBanner({ allowClose: true }));

    // The settings control used to float bottom-left for the life of the
    // session, sitting on top of body copy and — on phones — directly over the
    // "Get the snapshot first" CTA. The footer's legal row is where people look
    // for it anyway, so it goes there and only falls back to floating if a page
    // has no footer nav.
    // Ordered fallback, not a comma selector: querySelector resolves a list by
    // document order, and .footer-nav precedes .footer-legal-nav in the markup.
    const legalNav =
      document.querySelector(".footer-legal-nav") ||
      document.querySelector(".footer-nav") ||
      document.querySelector(".legal-footer__inner");
    if (legalNav) {
      settingsButton.classList.add("shifter-consent-settings--inline");
      legalNav.append(settingsButton);
      document.body.append(banner);
    } else {
      document.body.append(banner, settingsButton);
    }
  };

  const init = () => {
    buildControls();

    // Register checkout tracking before either analytics provider is loaded.
    // The selector covers both static retainer CTAs and the dynamic /start plan CTA.
    window.addEventListener(
      "click",
      (event) => {
        const target =
          event.target instanceof Element
            ? event.target.closest("[data-stripe-checkout='live'], [data-cta-standard]")
            : null;
        if (!target) return;
        track("begin_checkout", {
          currency: "USD",
          value: 4000,
          items: [{ item_id: "shifter-ai-visibility-retainer", item_name: "Shifter AI Visibility Retainer" }],
        });
      },
      { capture: true },
    );

    const stored = readConsent();
    if (stored === "granted") {
      applyConsent("granted", { persist: false });
      settingsButton.hidden = false;
    } else if (stored === "denied") {
      applyConsent("denied", { persist: false });
      settingsButton.hidden = false;
    } else {
      showBanner();
    }
  };

  window.shifterAnalytics = {
    measurementId: MEASUREMENT_ID,
    getConsent: readConsent,
    setConsent: (status) => applyConsent(status === "granted" ? "granted" : "denied"),
    track,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
