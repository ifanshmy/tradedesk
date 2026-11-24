/* ==========================================================================
   Interactive text.
   1. Proximity type: letters near the pointer shift weight (variable font),
      lift slightly and warm to the accent colour. Touch: a tap sends a wave.
   2. Count-up numbers that animate from their previous value.
   Screen readers get the plain text; the per-letter spans are aria-hidden.
   ========================================================================== */

import { isReducedMotion as reduce } from "./motion.js";
const coarse = matchMedia("(pointer: coarse)").matches;
const tracked = new Set();
let ptrX = -9999, ptrY = -9999, scheduled = false;

function splitInto(el) {
  const text = el.textContent.replace(/\s+/g, " ").trim();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const frag = document.createDocumentFragment();
    const parts = node.textContent.split(/(\s+)/);
    for (const part of parts) {
      if (!part) continue;
      if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(" ")); continue; }
      const word = document.createElement("span");
      word.className = "wrd";
      word.setAttribute("aria-hidden", "true");
      for (const ch of part) {
        // Punctuation rides with the previous letter so kerning stays natural.
        if (/[.,!?;:'"’”)\]]/.test(ch) && word.lastChild) { word.lastChild.textContent += ch; continue; }
        const l = document.createElement("span");
        l.className = "ltr";
        l.textContent = ch;
        word.appendChild(l);
      }
      frag.appendChild(word);
    }
    node.replaceWith(frag);
  }
  const sr = document.createElement("span");
  sr.className = "sr-only";
  sr.textContent = text;
  el.prepend(sr);
  el._letters = [...el.querySelectorAll(".ltr")];
  el._base = parseFloat(getComputedStyle(el).fontWeight) || 700;
  el._dirty = true;
}

function measure(el) {
  el._rects = el._letters.map((l) => {
    const r = l.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  });
  el._box = el.getBoundingClientRect();
  el._dirty = false;
}

function reset(el) {
  if (!el._active) return;
  el._active = false;
  for (const l of el._letters) { l.style.removeProperty("--w"); l.style.removeProperty("--ly"); l.style.removeProperty("--lc"); }
}

function update() {
  scheduled = false;
  for (const el of tracked) {
    if (!el.isConnected || el.offsetParent === null) continue;
    if (el._dirty) measure(el);
    const b = el._box, pad = 120;
    if (ptrX < b.left - pad || ptrX > b.right + pad || ptrY < b.top - pad || ptrY > b.bottom + pad) { reset(el); continue; }
    el._active = true;
    const R = Math.max(90, Math.min(160, b.height * 1.6));
    const target = el._base >= 650 ? 300 : 800;
    el._letters.forEach((l, i) => {
      const [cx, cy] = el._rects[i];
      const f = Math.max(0, 1 - Math.hypot(ptrX - cx, ptrY - cy) / R);
      const e = f * f * (3 - 2 * f);
      if (e < 0.02) { l.style.removeProperty("--w"); l.style.removeProperty("--ly"); l.style.removeProperty("--lc"); return; }
      l.style.setProperty("--w", Math.round(el._base + (target - el._base) * e));
      l.style.setProperty("--ly", `${(-e * 4).toFixed(2)}px`);
      if (e > 0.35) l.style.setProperty("--lc", "var(--accent)"); else l.style.removeProperty("--lc");
    });
  }
}

function wave(el) {
  if (reduce()) return;
  const target = el._base >= 650 ? 300 : 800;
  el._letters.forEach((l, i) => {
    setTimeout(() => {
      l.style.setProperty("--w", target);
      l.style.setProperty("--lc", "var(--accent)");
      l.style.setProperty("--ly", "-3px");
      setTimeout(() => { l.style.removeProperty("--w"); l.style.removeProperty("--lc"); l.style.removeProperty("--ly"); }, 260);
    }, i * 28);
  });
}

function markDirty() { for (const el of tracked) el._dirty = true; }

let listening = false;
function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    ptrX = e.clientX; ptrY = e.clientY;
    if (!scheduled) { scheduled = true; requestAnimationFrame(update); }
  }, { passive: true });
  document.addEventListener("pointerleave", () => { ptrX = ptrY = -9999; for (const el of tracked) reset(el); });
  window.addEventListener("scroll", markDirty, { passive: true, capture: true });
  window.addEventListener("resize", markDirty);
  document.fonts?.ready.then(markDirty);
}

/** Make an element's text interactive. Call again after changing its content. */
export function interactive(el) {
  if (!el) return;
  splitInto(el);
  tracked.add(el);
  if (coarse) el.addEventListener("pointerdown", () => wave(el), { passive: true });
  listen();
}

/** Replace an interactive element's content (HTML) and re-split it. */
export function setInteractiveHTML(el, html) {
  if (el._html === html) return;
  el._html = html;
  el.innerHTML = html;
  interactive(el);
}

/** Animate a number from its previous value to `to`; `render(v)` returns the HTML to show. */
export function countTo(el, to, render, ms = 900) {
  if (!el) return;
  const from = Number.isFinite(el._val) ? el._val : 0;
  el._val = to;
  cancelAnimationFrame(el._raf);
  if (reduce() || from === to || !Number.isFinite(to)) { el.innerHTML = render(to); return; }
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - t0) / ms);
    const e = 1 - Math.pow(1 - p, 3);
    el.innerHTML = render(from + (to - from) * e);
    if (p < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
}
