/* ==========================================================================
   Guided product tour: spotlight + glass card, keyboard friendly.
   Steps can switch the view first (via `before`), then spotlight a target.
   ========================================================================== */

const $ = (s) => document.querySelector(s);

export function createTour({ steps, onFinish }) {
  const root = $("#tour");
  const spot = $("#tourSpot");
  const card = $("#tourCard");
  const title = $("#tourTitle");
  const body = $("#tourBody");
  const label = $("#tourStepLabel");
  const dots = $("#tourDots");
  const btnNext = $("#tourNext");
  const btnBack = $("#tourBack");
  const btnSkip = $("#tourSkip");
  let i = 0;
  let active = false;
  let lastFocus = null;

  function place(target) {
    const pad = 10;
    const vw = window.innerWidth, vh = window.innerHeight;
    if (!target) {
      spot.style.cssText = `left:${vw / 2}px;top:${vh / 2}px;width:0;height:0;`;
      card.style.left = `${Math.max(12, (vw - card.offsetWidth) / 2)}px`;
      card.style.top = `${Math.max(12, (vh - card.offsetHeight) / 2)}px`;
      return;
    }
    const r = target.getBoundingClientRect();
    const top = Math.max(6, r.top - pad);
    const left = Math.max(6, r.left - pad);
    const width = Math.min(vw - 12, r.width + pad * 2);
    const height = Math.min(vh - 12, r.height + pad * 2);
    spot.style.cssText = `left:${left}px;top:${top}px;width:${width}px;height:${height}px;`;

    const cw = card.offsetWidth, ch = card.offsetHeight, gap = 16;
    let cy;
    if (top + height + gap + ch <= vh - 12) cy = top + height + gap; // below
    else if (top - gap - ch >= 12) cy = top - gap - ch; // above
    else cy = Math.max(12, vh - ch - 12); // overlay bottom
    let cx = left + width / 2 - cw / 2;
    cx = Math.min(Math.max(12, cx), vw - cw - 12);
    card.style.left = `${cx}px`;
    card.style.top = `${cy}px`;
  }

  async function show(n) {
    i = Math.max(0, Math.min(steps.length - 1, n));
    const step = steps[i];
    if (step.before) await step.before();
    const target = step.target ? document.querySelector(step.target) : null;
    if (target) {
      target.scrollIntoView({ block: "center", behavior: document.documentElement.classList.contains("reduce-motion") || matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      await new Promise((r) => setTimeout(r, 380));
    }
    title.textContent = step.title;
    body.textContent = step.body;
    label.textContent = `${i + 1} of ${steps.length}`;
    dots.innerHTML = steps.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("");
    btnBack.hidden = i === 0;
    btnNext.textContent = i === steps.length - 1 ? "Finish" : "Next";
    place(target && target.offsetParent !== null ? target : null);
    btnNext.focus({ preventScroll: true });
  }

  function onKey(e) {
    if (!active) return;
    if (e.key === "Escape") { e.preventDefault(); end(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); next(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); if (i > 0) show(i - 1); }
    else if (e.key === "Tab") {
      // Keep focus inside the card.
      const f = [...card.querySelectorAll("button:not([hidden])")];
      const first = f[0], lastEl = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
    }
  }
  function onResize() {
    if (!active) return;
    const step = steps[i];
    const target = step.target ? document.querySelector(step.target) : null;
    place(target);
  }
  function next() { if (i >= steps.length - 1) end(true); else show(i + 1); }
  function end(completed = false) {
    if (!active) return;
    active = false;
    root.hidden = true;
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("scroll", onResize, true);
    onFinish?.(completed);
    lastFocus?.focus?.({ preventScroll: true });
  }

  btnNext.onclick = next;
  btnBack.onclick = () => show(i - 1);
  btnSkip.onclick = () => end(false);

  return {
    start() {
      if (active) return;
      active = true;
      lastFocus = document.activeElement;
      root.hidden = false;
      document.addEventListener("keydown", onKey, true);
      window.addEventListener("resize", onResize);
      window.addEventListener("scroll", onResize, true);
      show(0);
    },
    end,
    get active() { return active; },
  };
}
