const navToggle = document.querySelector("[data-nav-toggle]");
const nav = document.querySelector("[data-site-nav]");

if (navToggle && nav) {
  navToggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
    navToggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
  });

  nav.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      nav.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
      navToggle.setAttribute("aria-label", "Open navigation");
    }
  });
}

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const revealSelector = [
  ".hero-routing-copy",
  ".hero-routing-visual",
  ".section-heading",
  ".mirror-copy > *",
  ".founder-attention-queue",
  ".flow-panel",
  ".install-heading",
  ".operating-stack",
  ".operating-assets-reference-wrap",
  ".asset-card",
  ".install-closing-line",
  ".timeline-intro > *",
  ".roadmap-step",
  ".timeline-closing-line",
  ".fit-columns article",
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

const stagedSections = Array.from(document.querySelectorAll("[data-scroll-stage]"));

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const updateScrollStages = () => {
  stagedSections.forEach((section) => {
    const rect = section.getBoundingClientRect();
    const progress = clamp((window.innerHeight * 0.72 - rect.top) / Math.max(rect.height, 1), 0, 1);
    const stage = Math.min(3, Math.floor(progress * 4));

    section.style.setProperty("--scroll-progress", progress.toFixed(3));
    section.classList.toggle("is-stage-1", stage >= 1);
    section.classList.toggle("is-stage-2", stage >= 2);
    section.classList.toggle("is-stage-3", stage >= 3);
  });
};

let scrollStageFrame;

const requestScrollStageUpdate = () => {
  if (scrollStageFrame) {
    return;
  }

  scrollStageFrame = window.requestAnimationFrame(() => {
    scrollStageFrame = undefined;
    updateScrollStages();
  });
};

if (stagedSections.length) {
  updateScrollStages();

  if (!prefersReducedMotion) {
    window.addEventListener("scroll", requestScrollStageUpdate, { passive: true });
    window.addEventListener("resize", requestScrollStageUpdate);
  }
}

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
