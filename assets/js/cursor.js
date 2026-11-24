// Cursor effect: an accent ring that trails the pointer, grows over clickable things, narrows over text
// fields and bursts on click. The native cursor stays visible. Off on touch screens and reduced motion;
// the user can turn it off from the profile menu (remembered per browser).
const KEY = "td_cursor_v1";
const INTERACTIVE = "a, button, [role=button], [role=radio], [role=tab], [role=switch], [role=menuitem], summary, label, select, .acc, .avatar-opt";
const TEXTY = "input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea";

let ring = null, dot = null, raf = 0, running = false;
let x = -100, y = -100, rx = -100, ry = -100;

export function isCursorEnabled() {
  try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
}
export function setCursorEnabled(on) {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch {}
  on ? start() : stop();
}
const supported = () => matchMedia("(pointer: fine)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches;

function onMove(e) {
  if (e.pointerType && e.pointerType !== "mouse") return;
  x = e.clientX; y = e.clientY;
  dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  ring.classList.remove("is-hidden"); dot.classList.remove("is-hidden");
  const t = e.target instanceof Element ? e.target : null;
  ring.classList.toggle("is-text", !!t?.closest(TEXTY));
  ring.classList.toggle("is-link", !!t?.closest(INTERACTIVE) && !t?.closest(TEXTY));
}
function onDown(e) {
  if (e.pointerType !== "mouse") return;
  ring.classList.add("is-down");
  const b = document.createElement("span");
  b.className = "cursor-burst";
  b.style.left = `${e.clientX}px`; b.style.top = `${e.clientY}px`;
  document.body.append(b);
  b.addEventListener("animationend", () => b.remove(), { once: true });
}
const onUp = () => ring.classList.remove("is-down");
const onLeave = () => { ring.classList.add("is-hidden"); dot.classList.add("is-hidden"); };

function loop() {
  rx += (x - rx) * 0.2; ry += (y - ry) * 0.2;
  ring.style.transform = `translate3d(${rx.toFixed(1)}px, ${ry.toFixed(1)}px, 0)`;
  raf = requestAnimationFrame(loop);
}

function start() {
  if (running || !supported() || !isCursorEnabled()) return;
  running = true;
  ring = document.createElement("div"); ring.className = "cursor-fx cursor-ring is-hidden";
  dot = document.createElement("div"); dot.className = "cursor-fx cursor-dot is-hidden";
  ring.setAttribute("aria-hidden", "true"); dot.setAttribute("aria-hidden", "true");
  document.body.append(ring, dot);
  addEventListener("pointermove", onMove, { passive: true });
  addEventListener("pointerdown", onDown, { passive: true });
  addEventListener("pointerup", onUp, { passive: true });
  document.documentElement.addEventListener("mouseleave", onLeave);
  raf = requestAnimationFrame(loop);
}
function stop() {
  if (!running) return;
  running = false;
  cancelAnimationFrame(raf);
  removeEventListener("pointermove", onMove);
  removeEventListener("pointerdown", onDown);
  removeEventListener("pointerup", onUp);
  document.documentElement.removeEventListener("mouseleave", onLeave);
  ring?.remove(); dot?.remove(); ring = dot = null;
}
export function initCursor() { start(); }
