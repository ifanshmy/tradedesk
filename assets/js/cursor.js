// Cursor effect: a magnetic highlight. Over a button, link, tab or switch it wraps the control's shape and
// leans a little toward the pointer; over a text field it becomes a slim caret; elsewhere it is a small dot.
// The native cursor stays visible. Off on touch screens, with reduced motion, or from the profile menu.
import { isReducedMotion, onMotionChange } from "./motion.js";

const KEY = "td_cursor_v1";
const SNAP = "a, button, [role=button], [role=tab], [role=radio], [role=switch], [role=menuitem], summary, select, label.check";
const TEXT = "input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]), textarea";
const MAX_W = 640, MAX_H = 80; // larger targets (whole cards) keep the dot instead of being wrapped

let el = null, raf = 0, running = false, down = false, shown = false;
let px = -100, py = -100, target = null, radius = 10, textMode = false;
const cur = { x: -100, y: -100, w: 8, h: 8, r: 4 };

export function isCursorEnabled() {
  try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
}
export function setCursorEnabled(on) {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch {}
  sync();
}
const supported = () => matchMedia("(pointer: fine)").matches && !isReducedMotion() && isCursorEnabled();

function pick(t) {
  textMode = !!t?.closest(TEXT);
  const s = textMode ? null : t?.closest(SNAP);
  if (!s) { target = null; return; }
  if (s === target) return;
  const b = s.getBoundingClientRect();
  if (b.width > 0 && b.width <= MAX_W && b.height <= MAX_H) {
    target = s;
    radius = parseFloat(getComputedStyle(s).borderTopLeftRadius) || 10;
  } else {
    target = null;
  }
}

function onMove(e) {
  if (e.pointerType && e.pointerType !== "mouse") return;
  px = e.clientX; py = e.clientY;
  if (!shown) { shown = true; cur.x = px - 4; cur.y = py - 4; el.classList.remove("is-hidden"); }
  pick(e.target instanceof Element ? e.target : null);
}
const onDown = (e) => { if (e.pointerType === "mouse") down = true; };
const onUp = () => { down = false; };
const onLeave = () => { shown = false; el?.classList.add("is-hidden"); };

function frame() {
  let t, mode;
  if (target && target.isConnected) {
    const b = target.getBoundingClientRect();
    const pad = 4;
    const mx = Math.max(-1, Math.min(1, (px - (b.left + b.width / 2)) / (b.width / 2))) * 4;
    const my = Math.max(-1, Math.min(1, (py - (b.top + b.height / 2)) / (b.height / 2))) * 3;
    const h = b.height + pad * 2;
    t = { x: b.left - pad + mx, y: b.top - pad + my, w: b.width + pad * 2, h, r: Math.min(radius + pad, h / 2) };
    mode = "snap";
  } else if (textMode) {
    t = { x: px - 1, y: py - 11, w: 2, h: 22, r: 1 };
    mode = "text";
  } else {
    const s = down ? 5 : 8;
    t = { x: px - s / 2, y: py - s / 2, w: s, h: s, r: s / 2 };
    mode = "dot";
  }
  const k = mode === "snap" ? 0.24 : 0.38;
  for (const key of ["x", "y", "w", "h", "r"]) cur[key] += (t[key] - cur[key]) * k;
  el.dataset.mode = mode;
  el.style.transform = `translate3d(${cur.x.toFixed(1)}px, ${cur.y.toFixed(1)}px, 0) scale(${down && mode === "snap" ? 0.97 : 1})`;
  el.style.width = `${cur.w.toFixed(1)}px`;
  el.style.height = `${cur.h.toFixed(1)}px`;
  el.style.borderRadius = `${cur.r.toFixed(1)}px`;
  raf = requestAnimationFrame(frame);
}

function start() {
  if (running) return;
  running = true;
  el = document.createElement("div");
  el.className = "cursor-lens is-hidden";
  el.setAttribute("aria-hidden", "true");
  document.body.append(el);
  addEventListener("pointermove", onMove, { passive: true });
  addEventListener("pointerdown", onDown, { passive: true });
  addEventListener("pointerup", onUp, { passive: true });
  document.documentElement.addEventListener("mouseleave", onLeave);
  raf = requestAnimationFrame(frame);
}
function stop() {
  if (!running) return;
  running = false;
  cancelAnimationFrame(raf);
  removeEventListener("pointermove", onMove);
  removeEventListener("pointerdown", onDown);
  removeEventListener("pointerup", onUp);
  document.documentElement.removeEventListener("mouseleave", onLeave);
  el?.remove(); el = null; target = null; shown = false;
}
function sync() { supported() ? start() : stop(); }

export function initCursor() {
  onMotionChange(sync);
  sync();
}
