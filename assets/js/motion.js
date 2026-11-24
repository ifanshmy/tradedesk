// Motion preference: the system "reduce motion" setting OR the in-app "Reduce motion" switch.
// The switch is remembered per browser and mirrored as <html class="reduce-motion"> for CSS.
const KEY = "td_motion_v1";
const media = matchMedia("(prefers-reduced-motion: reduce)");

export function userReducedMotion() {
  try { return localStorage.getItem(KEY) === "reduce"; } catch { return false; }
}

export function isReducedMotion() {
  return media.matches || userReducedMotion();
}

export function setReducedMotion(on) {
  try { localStorage.setItem(KEY, on ? "reduce" : "full"); } catch {}
  document.documentElement.classList.toggle("reduce-motion", !!on);
  dispatchEvent(new CustomEvent("td-motion", { detail: isReducedMotion() }));
}

export function onMotionChange(fn) {
  addEventListener("td-motion", fn);
  media.addEventListener?.("change", fn);
}
