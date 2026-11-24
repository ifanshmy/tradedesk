/* ==========================================================================
   TradeDesk 3 — application controller
   ========================================================================== */
import { APP_VERSION } from "./version.js";
import { createField } from "./field.js";
import { interactive, setInteractiveHTML, countTo } from "./itext.js";
import { createTour } from "./tour.js";

/* ------------------------------------------------------------------ utils */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const icon = (name, cls = "") => `<svg class="ico ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

const CUR_SYM = { MYR: "RM", USD: "$", SGD: "S$", HKD: "HK$", CNH: "CN¥", "%": "" };
const num = (v) => (Number.isFinite(+v) ? +v : 0);
function fmt(v, cur, dp = 2) {
  const n = num(v);
  if (cur === "%") return `${n.toFixed(1)}%`;
  const s = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const p = cur ? (CUR_SYM[cur] ?? cur) : "";
  return `${n < 0 ? "−" : ""}${p}${p && p.length > 1 && !p.endsWith("$") ? " " : ""}${s}`;
}
const signed = (v, cur, dp = 2) => (num(v) > 0 ? "+" : "") + fmt(v, cur, dp);
const pct = (v) => `${num(v) > 0 ? "+" : ""}${num(v).toFixed(2)}%`;
const cls = (v) => (num(v) > 0 ? "up" : num(v) < 0 ? "down" : "");
const qty = (v) => num(v).toLocaleString("en-US", { maximumFractionDigits: 4 });
const today = () => new Date().toLocaleDateString("en-CA");
const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const greetingWord = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; };
const firstName = (u) => String(u?.display_name || u?.username || "trader").trim().split(/\s+/)[0];

/* ------------------------------------------------------------------ config */
const CONFIG = window.TD_CONFIG || {};
const API_BASE = String(CONFIG.apiBase || "").trim().replace(/\/+$/, "");
const ON_STATIC_HOST = /\.github\.io$/i.test(location.hostname);
const API_CONFIGURED = Boolean(API_BASE) || !ON_STATIC_HOST;
const SESSION_KEY = "td_session_v3";
const THEME_KEY = "td_theme_v3";

/* ------------------------------------------------------------------ avatars & palette */
const AVATARS = [
  { id: "av-1", label: "Racer" },
  { id: "av-2", label: "Cyclist" },
  { id: "av-3", label: "Heritage" },
  { id: "av-4", label: "Rider" },
  { id: "av-5", label: "Elder" },
  { id: "av-6", label: "Mentor" },
  { id: "av-7", label: "Officer" },
  { id: "av-8", label: "Shuttler" },
];
const avatarSrc = (id) => `assets/img/avatars/${resolveAvatar(id)}.webp`;
function resolveAvatar(id) {
  if (AVATARS.some((a) => a.id === id)) return id;
  // Legacy avatar ids from v1/v2 map deterministically onto the new set.
  let h = 0;
  for (const c of String(id || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATARS[h % AVATARS.length].id;
}

const PALETTE = [
  { c: "#0f1013", n: "Ink" }, { c: "#ff5b2e", n: "Ember" }, { c: "#0b9488", n: "Teal" }, { c: "#2f6bf2", n: "Blue" },
  { c: "#f2a900", n: "Amber" }, { c: "#8b5cf6", n: "Violet" }, { c: "#e25d8f", n: "Rose" }, { c: "#64748b", n: "Slate" },
];
// Colours saved by earlier versions map onto the current palette.
const LEGACY_COLOR = {
  "#f97316": "#ff5b2e", "#06b6d4": "#2f6bf2", "#a855f7": "#8b5cf6", "#ec4899": "#e25d8f", "#3b82f6": "#2f6bf2",
  "#10b981": "#0b9488", "#c084fc": "#8b5cf6", "#b8b5ff": "#8b5cf6",
  "#b4532a": "#ff5b2e", "#5f7155": "#0b9488", "#c9973f": "#f2a900", "#7a4e2d": "#64748b", "#b7735e": "#e25d8f",
  "#56707a": "#2f6bf2", "#7d7a3a": "#0b9488", "#3b2f2a": "#0f1013",
};
const earthColor = (c, fallback = "#ff5b2e") => {
  const k = String(c || "").toLowerCase();
  if (LEGACY_COLOR[k]) return LEGACY_COLOR[k];
  return /^#[0-9a-f]{6}$/.test(k) ? k : fallback;
};
// Known brokers get their own logo and brand colour.
const BRANDS = {
  moomoo: { label: "Moomoo", color: "#f86800", logo: "assets/img/brokers/moomoo.webp", full: true },
  webull: { label: "Webull", color: "#2860f0", logo: "assets/img/brokers/webull.webp" },
  mplus: { label: "Mplus Online", color: "#e8231b", logo: "assets/img/brokers/mplus.webp" },
};
const brandOf = (a) => BRANDS[String(a?.broker || "").toLowerCase()] || null;
const accountColor = (a) => brandOf(a)?.color || earthColor(a?.color);
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const chartPalette = () => [1, 2, 3, 4, 5, 6, 7, 8].map((i) => cssVar(`--chart-${i}`));

/* ------------------------------------------------------------------ state */
const state = {
  token: "",
  mode: "user", // user | admin
  user: null,
  summary: null,
  periods: null,
  detailPeriods: null,
  accounts: [],
  statements: [],
  txs: [],
  activeStatementId: null,
  view: "overview",
  overviewPeriod: "monthly",
  detailPeriod: "monthly",
  allocMode: "symbol",
  charts: {},
  exportData: null,
  exportMonth: null,
  justRegistered: false,
  resetToken: null,
  busy: false,
};

let bgField = null;
let tour = null;

/* ------------------------------------------------------------------ API */
class ApiError extends Error {
  constructor(message, status, data) { super(message); this.status = status; this.data = data; }
}
async function api(path, opts = {}) {
  if (!API_CONFIGURED) throw new ApiError("This site isn’t connected to a TradeDesk server yet.", 0);
  const headers = { ...(opts.headers || {}) };
  const isForm = opts.body instanceof FormData;
  if (!isForm && opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (state.token && !opts.noAuth) headers.Authorization = `Bearer ${state.token}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeout ?? 45000);
  let res;
  try {
    res = await fetch(API_BASE + path, {
      method: opts.method || "GET",
      headers,
      body: opts.body === undefined ? undefined : isForm ? opts.body : JSON.stringify(opts.body),
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") throw new ApiError("The server took too long to respond. Please try again.", 0);
    throw new ApiError("Can’t reach the TradeDesk server. If it was asleep it may take ~30 seconds to wake. Please try again.", 0);
  }
  clearTimeout(timer);
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!res.ok) {
    let msg = typeof data.detail === "string" ? data.detail : Array.isArray(data.detail) ? data.detail.map((d) => d.msg).join(", ") : "";
    if (!msg) msg = res.status >= 500 ? "Something went wrong on the server. Please try again." : `Request failed (${res.status}).`;
    if (res.status === 401 && state.token && !opts.noAuth && !opts.quiet401) {
      handleExpiredSession();
    }
    throw new ApiError(msg, res.status, data);
  }
  return data;
}

/* ------------------------------------------------------------------ feedback */
function toast(message, type = "info", ms = 5000) {
  const box = $("#toasts");
  if (!message || !box) return;
  while (box.children.length >= 4) box.firstElementChild.remove();
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  el.setAttribute("role", type === "error" ? "alert" : "status");
  const ico = type === "error" ? "alert" : type === "success" ? "check" : "info";
  el.innerHTML = `${icon(ico)}<span>${esc(message)}</span><button type="button" aria-label="Dismiss">${icon("x", "ico--sm")}</button>`;
  const remove = () => { el.classList.add("out"); setTimeout(() => el.remove(), 200); };
  el.querySelector("button").onclick = remove;
  box.appendChild(el);
  setTimeout(remove, ms);
}

function setLoading(btn, on, label) {
  if (!btn) return;
  if (on) {
    btn.dataset.html = btn.innerHTML;
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.innerHTML = `<span class="spin" aria-hidden="true"></span><span>${esc(label || "Working…")}</span>`;
  } else {
    btn.disabled = false;
    btn.removeAttribute("aria-busy");
    if (btn.dataset.html) btn.innerHTML = btn.dataset.html;
  }
}

function formError(form, message) {
  const el = $(".form-error", form);
  if (!el) { if (message) toast(message, "error"); return; }
  el.hidden = !message;
  el.textContent = message || "";
}

function confirmDialog({ title, body, ok = "Delete" }) {
  const dlg = $("#confirmDlg");
  $("#confirmTitle").textContent = title;
  $("#confirmBody").textContent = body;
  $("#confirmOk").textContent = ok;
  dlg.returnValue = "";
  dlg.showModal();
  return new Promise((resolve) => {
    dlg.addEventListener("close", () => resolve(dlg.returnValue === "ok"), { once: true });
  });
}

/* ------------------------------------------------------------------ theme */
const darkQuery = matchMedia("(prefers-color-scheme: dark)");
function themePref() { return store.get(THEME_KEY, "light"); }
function applyTheme(pref) {
  store.set(THEME_KEY, pref);
  const dark = pref === "dark" || (pref === "system" && darkQuery.matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  $('meta[name="theme-color"]')?.setAttribute("content", dark ? "#1d1916" : "#f6f1e9");
  $$("[data-theme-val]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.themeVal === pref)));
  bgField?.refreshColors();
  if (state.summary) renderCharts();
}
darkQuery.addEventListener?.("change", () => { if (themePref() === "system") applyTheme("system"); });

/* ------------------------------------------------------------------ server status */
async function checkServer() {
  const el = $("#serverStatus");
  const text = $(".server-status-text", el);
  const set = (s, t) => { el.dataset.state = s; text.textContent = t; };
  if (!API_CONFIGURED) {
    set("unconfigured", "Not connected to a server. Set the API URL in config.js.");
    $$("#authPage form button[type=submit]").forEach((b) => (b.disabled = true));
    return;
  }
  set("checking", "Connecting to server…");
  const slow = setTimeout(() => set("checking", "Waking the server up… this can take ~30 seconds."), 3500);
  try {
    await api("/api/health", { noAuth: true, timeout: 70000 });
    set("online", "Server online");
  } catch {
    set("offline", "Server unreachable. Try again shortly.");
  } finally {
    clearTimeout(slow);
  }
}

/* ------------------------------------------------------------------ session */
function saveSession() { store.set(SESSION_KEY, JSON.stringify({ token: state.token, mode: state.mode })); }
function loadSession() { try { return JSON.parse(store.get(SESSION_KEY, "null")); } catch { return null; } }
function clearSession() {
  store.del(SESSION_KEY);
  state.token = "";
  state.user = null;
  state.summary = null;
}
let expiring = false;
function handleExpiredSession() {
  if (expiring) return;
  expiring = true;
  clearSession();
  showAuth();
  toast("Your session has ended. Please sign in again.", "info");
  setTimeout(() => (expiring = false), 1000);
}

/* ------------------------------------------------------------------ page switching */
function showAuth() {
  $("#authPage").hidden = false;
  $("#appPage").hidden = true;
  $("#adminPage").hidden = true;
  $("#welcome").hidden = true;
  bgField?.stop();
  tour?.end();
  closeUserMenu();
  document.title = "TradeDesk · Sign in";
  checkServer();
}

function showApp() {
  $("#authPage").hidden = true;
  $("#adminPage").hidden = true;
  $("#appPage").hidden = false;
  bgField?.start();
}

function showAdmin() {
  $("#authPage").hidden = true;
  $("#appPage").hidden = true;
  $("#adminPage").hidden = false;
  bgField?.start();
  document.title = "TradeDesk · Admin";
}

/* ------------------------------------------------------------------ auth UI */
function setAuthMode(mode) {
  $$("[data-auth-mode]").forEach((b) => {
    const on = b.dataset.authMode === mode;
    b.classList.toggle("on", on);
    b.setAttribute("aria-selected", String(on));
  });
  $("#loginForm").hidden = mode !== "login";
  $("#registerForm").hidden = mode !== "register";
  $("#adminLoginForm").hidden = mode !== "admin";
  $("#resetForm").hidden = mode !== "reset";
  $(".auth-tabs").hidden = mode === "reset";
  const copy = {
    login: ["Welcome back", "Sign in to your trading workspace."],
    register: ["Create your account", "It takes a minute. Your data stays private to you."],
    admin: ["Admin console", "Administrators only."],
    reset: ["Choose a new password", "Pick something you haven’t used before. You’ll sign in with it next."],
  }[mode];
  $("#authHeading").textContent = copy[0];
  $("#authSub").textContent = copy[1];
  $$("#authPage .form-error").forEach((e) => (e.hidden = true));
  const first = $(`#${{ login: "loginForm", register: "registerForm", admin: "adminLoginForm", reset: "resetForm" }[mode]} input`);
  first?.focus({ preventScroll: true });
}

function renderAvatarPicker(container, input, selected) {
  const sel = resolveAvatar(selected);
  input.value = sel;
  container.innerHTML = AVATARS.map((a) => `
    <button type="button" class="avatar-opt" role="radio" aria-checked="${a.id === sel}" aria-label="${a.label}" data-av="${a.id}" tabindex="${a.id === sel ? 0 : -1}">
      <img src="assets/img/avatars/${a.id}.webp" alt="" width="64" height="64" loading="lazy" />
    </button>`).join("");
  const opts = $$(".avatar-opt", container);
  const choose = (btn, focus) => {
    input.value = btn.dataset.av;
    opts.forEach((o) => { const on = o === btn; o.setAttribute("aria-checked", String(on)); o.tabIndex = on ? 0 : -1; });
    if (focus) btn.focus();
  };
  opts.forEach((btn, i) => {
    btn.onclick = () => choose(btn);
    btn.onkeydown = (e) => {
      const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (d) { e.preventDefault(); choose(opts[(i + d + opts.length) % opts.length], true); }
    };
  });
}

async function onLogin(e) {
  e.preventDefault();
  const form = e.target;
  const btn = $("button[type=submit]", form);
  const body = Object.fromEntries(new FormData(form));
  if (!body.username?.trim() || !body.password) return formError(form, "Please enter your username and password.");
  formError(form, "");
  setLoading(btn, true, "Signing in…");
  try {
    const res = await api("/api/auth/login", { method: "POST", body: { username: body.username.trim(), password: body.password }, noAuth: true, timeout: 70000 });
    state.token = res.token;
    state.mode = "user";
    state.user = res.user;
    state.justRegistered = false;
    saveSession();
    form.reset();
    await enterWorkspace({ firstTime: false });
  } catch (err) {
    formError(form, err.message);
  } finally {
    setLoading(btn, false);
  }
}

async function onRegister(e) {
  e.preventDefault();
  const form = e.target;
  const btn = $("button[type=submit]", form);
  const body = Object.fromEntries(new FormData(form));
  body.username = (body.username || "").trim().toLowerCase();
  if (!/^[a-z0-9_.-]{3,32}$/.test(body.username)) return formError(form, "Username must be 3–32 characters: letters, numbers, dot, dash or underscore.");
  if (!body.display_name?.trim()) return formError(form, "Please add a display name.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email || "")) return formError(form, "Please enter a valid email address.");
  if ((body.password || "").length < 8) return formError(form, "Password must be at least 8 characters.");
  formError(form, "");
  setLoading(btn, true, "Creating account…");
  try {
    const res = await api("/api/auth/register", { method: "POST", body, noAuth: true, timeout: 70000 });
    state.token = res.token;
    state.mode = "user";
    state.user = res.user;
    state.justRegistered = true;
    saveSession();
    form.reset();
    await enterWorkspace({ firstTime: true });
  } catch (err) {
    formError(form, err.message);
  } finally {
    setLoading(btn, false);
  }
}

async function onAdminLogin(e) {
  e.preventDefault();
  const form = e.target;
  const btn = $("button[type=submit]", form);
  const body = Object.fromEntries(new FormData(form));
  if (!body.username?.trim() || !body.password) return formError(form, "Please enter your admin username and password.");
  formError(form, "");
  setLoading(btn, true, "Checking…");
  try {
    const res = await api("/api/auth/admin-login", { method: "POST", body: { username: body.username.trim(), password: body.password }, noAuth: true, timeout: 70000 });
    state.token = res.token;
    state.mode = "admin";
    state.user = res.admin;
    saveSession();
    form.reset();
    await enterAdmin();
  } catch (err) {
    formError(form, err.message);
  } finally {
    setLoading(btn, false);
  }
}

async function onForgot(e) {
  e.preventDefault();
  const form = e.target;
  const btn = $("button[type=submit]", form);
  const out = $("#forgotResult");
  const identifier = $("#forgotIdent").value.trim();
  if (!identifier) return;
  setLoading(btn, true, "Sending…");
  try {
    const res = await api("/api/auth/forgot-password", { method: "POST", body: { identifier }, noAuth: true });
    out.textContent = res.message;
  } catch (err) {
    out.textContent = err.message;
  } finally {
    out.hidden = false;
    setLoading(btn, false);
  }
}

function resetTokenFromHash() {
  const m = location.hash.match(/^#\/reset\?token=([\w-]{20,200})/);
  return m ? m[1] : null;
}

function clearResetHash() {
  state.resetToken = null;
  history.replaceState(null, "", location.pathname + location.search);
}

async function onReset(e) {
  e.preventDefault();
  const form = e.target;
  const btn = $("button[type=submit]", form);
  const pw = $("#resetPassword").value, pw2 = $("#resetPassword2").value;
  if (pw.length < 8) return formError(form, "Password must be at least 8 characters.");
  if (pw !== pw2) return formError(form, "The two passwords don’t match.");
  formError(form, "");
  setLoading(btn, true, "Saving…");
  try {
    const res = await api("/api/auth/reset-password", { method: "POST", body: { token: state.resetToken, password: pw }, noAuth: true, timeout: 70000 });
    form.reset();
    clearResetHash();
    setAuthMode("login");
    toast(res.message || "Password changed. Please sign in.", "success", 7000);
  } catch (err) {
    formError(form, err.message);
  } finally {
    setLoading(btn, false);
  }
}

async function logout() {
  try { await api("/api/auth/logout", { method: "POST", quiet401: true }); } catch {}
  clearSession();
  showAuth();
  setAuthMode("login");
  toast("You’re signed out. See you soon.", "success");
}

/* ------------------------------------------------------------------ welcome loader */
async function welcomeSequence({ firstTime, load }) {
  const wrap = $("#welcome");
  const bar = $("#welcomeBar");
  const ring = $(".welcome-ring");
  const steps = $$(".welcome-steps li");
  const sub = $("#welcomeSub");
  const name = state.user?.display_name || state.user?.username || "trader";
  $("#welcomeEyebrow").textContent = greetingWord();
  $("#welcomeLead").textContent = firstTime ? "Welcome to TradeDesk," : "Welcome back,";
  const nameEl = $("#welcomeName");
  let k = 0;
  const words = name.trim().split(/\s+/).map((w) => `<span class="word">${[...w].map((ch) =>
    `<span class="ch" style="animation-delay:${280 + k++ * 38}ms">${esc(ch)}</span>`).join("")}</span>`);
  nameEl.innerHTML = `<span class="sr-only">${esc(name)}</span><span aria-hidden="true">${words.join(" ")}</span>`;
  sub.textContent = firstTime ? "Setting up your workspace" : "Preparing your workspace";
  steps.forEach((s) => s.classList.remove("done"));
  let p = 0;
  const setP = (v) => {
    p = v;
    bar.style.setProperty("--p", v.toFixed(3));
    ring.style.setProperty("--ring", String(100 - v * 100));
  };
  setP(0.04);
  wrap.hidden = false;
  wrap.classList.remove("out");
  requestAnimationFrame(() => wrap.classList.add("in"));
  // Honest progress: creep toward 0.7 while loading, snap to 1 when data is actually rendered.
  const creep = setInterval(() => setP(p + (0.7 - p) * 0.08), 120);
  const minShow = sleep(reduceMotion() ? 300 : 1700);
  try {
    await load((stepIndex) => {
      steps[stepIndex]?.classList.add("done");
      setP(Math.max(p, 0.3 + stepIndex * 0.22));
    });
    clearInterval(creep);
    steps.forEach((s) => s.classList.add("done"));
    setP(1);
    await minShow;
    await sleep(320);
  } catch (err) {
    clearInterval(creep);
    wrap.classList.remove("in");
    wrap.hidden = true;
    throw err;
  }
  wrap.classList.add("out");
  wrap.classList.remove("in");
  await sleep(reduceMotion() ? 0 : 480);
  wrap.hidden = true;
}

async function enterWorkspace({ firstTime }) {
  showApp();
  renderUserChrome();
  navigateFromHash(true);
  try {
    await welcomeSequence({
      firstTime,
      load: async (step) => {
        await refreshData({ onStep: step, silent: true });
      },
    });
  } catch (err) {
    toast(err.message || "Could not load your workspace.", "error", 8000);
  }
  playReveal();
  maybeStartTour();
}

async function enterAdmin() {
  showAdmin();
  try {
    await welcomeSequence({ firstTime: false, load: async (step) => { step(0); await loadAdmin(); step(1); step(2); } });
  } catch (err) {
    toast(err.message, "error");
  }
  $("#adminPage .page").classList.add("is-in");
}

/* ------------------------------------------------------------------ app chrome */
function renderUserChrome() {
  const u = state.user || {};
  const src = avatarSrc(u.avatar);
  $("#navAvatar").src = src;
  $("#menuAvatar").src = src;
  $("#menuName").textContent = u.display_name || u.username || "Trader";
  $("#menuEmail").textContent = u.email || `@${u.username || ""}`;
  $("#menuAdmin").hidden = !u.is_admin;
  updateGreeting();
}

function updateGreeting() {
  const now = new Date();
  setInteractiveHTML($("#greeting"), `${greetingWord()}, <em>${esc(firstName(state.user))}</em>`);
  $("#todayLabel").textContent = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  $("#clock").textContent = now.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short" }) + " · " +
    now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function moveNavPill() {
  const nav = $("#primaryNav");
  const active = $('a[aria-current="page"]', nav);
  const pill = $(".nav-pill", nav);
  if (!active || !pill || nav.offsetParent === null) return;
  pill.style.width = `${active.offsetWidth}px`;
  pill.style.transform = `translateX(${active.offsetLeft}px)`;
}

const VIEWS = ["overview", "performance", "statements", "journal"];
function navigateFromHash(initial = false) {
  const v = (location.hash.match(/^#\/(\w+)/) || [])[1];
  switchView(VIEWS.includes(v) ? v : "overview", { initial });
}

function switchView(view, { initial = false } = {}) {
  state.view = view;
  $$("#primaryNav a").forEach((a) => {
    if (a.dataset.view === view) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  $$(".view").forEach((sec) => {
    const on = sec.id === `view-${view}`;
    sec.hidden = !on;
    if (!on) sec.classList.remove("is-in");
  });
  const sec = $(`#view-${view}`);
  document.title = `TradeDesk · ${sec?.dataset.title || "Overview"}`;
  requestAnimationFrame(moveNavPill);
  if (!initial && state.summary) {
    if (view === "performance") renderPerformance();
    if (view === "statements") renderStatementReport();
    if (view === "overview") renderCharts();
    playReveal();
    if (!tour?.active) window.scrollTo({ top: 0, behavior: reduceMotion() ? "auto" : "smooth" });
  }
}

function playReveal() {
  const sec = $(`#view-${state.view}`);
  if (!sec) return;
  $$(".reveal", sec).forEach((el, i) => el.style.setProperty("--i", i));
  sec.classList.remove("is-in");
  void sec.offsetWidth;
  sec.classList.add("is-in");
}

function openUserMenu() {
  const menu = $("#userMenu");
  menu.hidden = false;
  $("#btnUserMenu").setAttribute("aria-expanded", "true");
  $("button", menu)?.focus({ preventScroll: true });
}
function closeUserMenu() {
  const menu = $("#userMenu");
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  $("#btnUserMenu").setAttribute("aria-expanded", "false");
}

/* ------------------------------------------------------------------ data */
async function refreshData({ onStep, silent = false } = {}) {
  const btn = $("#btnRefresh");
  if (!silent) { btn.classList.add("is-spinning"); $("#main").classList.add("is-busy"); }
  try {
    const data = await api("/api/dashboard");
    onStep?.(0);
    state.user = { ...state.user, ...data.user, is_admin: state.user?.is_admin ?? data.user?.is_admin };
    state.summary = data.summary || {};
    state.accounts = data.accounts || [];
    state.statements = data.statements || [];
    state.txs = data.transactions || [];
    state.periods = data.periods || {};
    state.detailPeriods = null;
    if (!state.statements.some((s) => s.id === state.activeStatementId)) state.activeStatementId = state.statements[0]?.id ?? null;
    renderUserChrome();
    populateAccountSelects();
    const safe = (fn) => { try { fn(); } catch (e) { console.error(e); } };
    safe(renderHero);
    safe(renderKpis);
    safe(renderAccounts);
    safe(renderGoals);
    safe(renderHoldings);
    safe(renderLatestStatement);
    onStep?.(1);
    safe(renderStatementTabs);
    safe(renderStatementReport);
    safe(renderClosedTrades);
    safe(renderTransactions);
    safe(renderCharts);
    safe(renderPerformance);
    onStep?.(2);
  } finally {
    btn.classList.remove("is-spinning");
    $("#main").classList.remove("is-busy");
  }
}

function populateAccountSelects() {
  const opts = state.accounts.map((a) => `<option value="${esc(a.id)}">${esc(a.name)} · ${esc(a.currency)}</option>`).join("");
  $$("[data-account-select], #jnlAccount").forEach((el) => {
    const prev = el.value;
    el.innerHTML = opts || `<option value="">No accounts yet</option>`;
    if (state.accounts.some((a) => a.id === prev)) el.value = prev;
  });
  $$("[data-account-filter]").forEach((el) => {
    const prev = el.value;
    el.innerHTML = `<option value="">All accounts</option>${opts}`;
    el.value = state.accounts.some((a) => a.id === prev) ? prev : "";
  });
}

/* ------------------------------------------------------------------ overview renderers */
function moneyFigure(v, cur) {
  const n = num(v);
  const s = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `<span class="cur">${esc(CUR_SYM[cur] ?? cur)}</span>${n < 0 ? "−" : ""}${s}`;
}

function renderHero() {
  const s = state.summary, t = s.totals || {}, b = s.base_currency || "MYR";
  $("#heroBase").textContent = b;
  countTo($("#heroNav"), num(t.equity), (v) => moneyFigure(v, b), 1100);
  const ret = num(t.total_return);
  $("#heroDelta").innerHTML = `
    <span class="chip ${ret >= 0 ? "chip--up" : "chip--down"}">${icon(ret >= 0 ? "up" : "down", "ico--sm")}${pct(t.total_return_pct)}</span>
    <span><b class="money ${cls(ret)}">${signed(ret, b)}</b> net return on ${fmt(t.net_deposits, b)} capital</span>`;
  $("#heroPortfolio").textContent = fmt(t.market_value, b);
  $("#heroCash").textContent = fmt(t.cash, b);
  $("#heroDeposits").textContent = fmt(t.net_deposits, b);
}

const lastCounts = new Map();
function kpiTile({ label, value, sub, ico, tone = "", meter = null, valueCls = "", count = null }) {
  const data = count ? ` data-count="${num(count.v)}" data-kind="${count.kind}" data-cur="${esc(count.cur || "")}" data-key="${esc(label)}"` : "";
  return `<article class="kpi glass reveal">
    <div class="kpi-top"><span class="label">${label}</span><span class="kpi-icon ${tone}">${icon(ico)}</span></div>
    <div class="kpi-value money ${valueCls}"${data}>${value}</div>
    <div class="kpi-sub">${sub}</div>
    ${meter !== null ? `<div class="kpi-meter"><span style="--v:${Math.max(0, Math.min(1, meter)).toFixed(3)}"></span></div>` : ""}
  </article>`;
}

function runCountUps(root) {
  $$("[data-count]", root).forEach((el) => {
    const key = el.dataset.key, cur = el.dataset.cur || null, kind = el.dataset.kind, to = Number(el.dataset.count);
    el._val = lastCounts.has(key) ? lastCounts.get(key) : 0;
    lastCounts.set(key, to);
    const render = kind === "signed" ? (v) => signed(v, cur) : kind === "pct" ? (v) => `${num(v).toFixed(1)}%` : kind === "int" ? (v) => Math.round(v).toLocaleString("en-US") : (v) => fmt(v, cur);
    countTo(el, to, render);
  });
}

function renderKpis() {
  const s = state.summary, t = s.totals || {}, b = s.base_currency || "MYR";
  const realised = num(t.realized) + num(t.dividends);
  const eq = num(t.equity);
  $("#kpiGrid").innerHTML = [
    kpiTile({ label: "Net return", value: signed(t.total_return, b), valueCls: cls(t.total_return), sub: `${pct(t.total_return_pct)} vs capital`, ico: "trend", count: { v: t.total_return, kind: "signed", cur: b } }),
    kpiTile({ label: "Realised + dividends", value: signed(realised, b), valueCls: cls(realised), sub: `Dividends ${fmt(t.dividends, b)} · Fees ${fmt(t.fees, b)}`, ico: "layers", tone: "kpi-icon--sage", count: { v: realised, kind: "signed", cur: b } }),
    kpiTile({ label: "Win rate", value: `${num(t.win_rate).toFixed(1)}%`, sub: `${num(t.closed_trades)} closed · PF ${esc(t.profit_factor ?? 0)}`, ico: "target", meter: num(t.win_rate) / 100, count: { v: t.win_rate, kind: "pct" } }),
    kpiTile({ label: "Cash reserve", value: fmt(t.cash, b), sub: `${eq > 0 ? ((num(t.cash) / eq) * 100).toFixed(1) : "0.0"}% of NAV`, ico: "wallet", tone: "kpi-icon--sage", meter: eq > 0 ? num(t.cash) / eq : 0, count: { v: t.cash, kind: "money", cur: b } }),
  ].join("");
  runCountUps($("#kpiGrid"));
}

function accountNavSeries(acc) {
  const stmts = state.statements.filter((s) => s.account_id === acc.id).sort((a, b) => String(a.month).localeCompare(String(b.month)));
  if (stmts.length >= 2) return stmts.map((s) => num(s.ending_nav));
  if (stmts.length === 1) return [num(stmts[0].starting_nav) || num(stmts[0].ending_nav), num(stmts[0].ending_nav)];
  const eq = num(acc.equity), dep = num(acc.net_deposits);
  return dep > 0 && eq > 0 ? [dep, eq] : [eq, eq];
}

function sparkSvg(values, color, id) {
  const W = 300, H = 64, px = 4, py = 8;
  if (!values.length || values.every((v) => v === values[0])) {
    // No history yet: a quiet dashed baseline instead of a solid band.
    return `<svg class="acc-spark acc-spark--flat" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <line x1="${px}" y1="${H / 2}" x2="${W - px}" y2="${H / 2}" stroke="${color}" stroke-width="2" stroke-dasharray="4 6" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
  }
  const v = values.length >= 2 ? values : [values[0] || 0, values[0] || 0];
  const min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
  const pts = v.map((y, i) => [px + (i / (v.length - 1)) * (W - px * 2), max === min ? H / 2 : py + (1 - (y - min) / span) * (H - py * 2)]);
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], cx = (x0 + x1) / 2;
    d += ` C${cx.toFixed(1)} ${y0.toFixed(1)},${cx.toFixed(1)} ${y1.toFixed(1)},${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  return `<svg class="acc-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".3"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <path d="${d} L${last[0].toFixed(1)} ${H} L${pts[0][0].toFixed(1)} ${H}Z" fill="url(#${id})"/>
    <path d="${d}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

function maskAccount(no) {
  const s = String(no || "").replace(/\s+/g, "");
  return s.length > 4 ? `•••• ${s.slice(-4)}` : s;
}

function accountLogo(a, color) {
  const brand = brandOf(a);
  if (brand) {
    return `<span class="acc-logo ${brand.full ? "acc-logo--full" : "acc-logo--pad"}"><img src="${brand.logo}" alt="${esc(brand.label)} logo" width="48" height="48" loading="lazy" /></span>`;
  }
  return `<span class="acc-logo acc-logo--mono" style="background:${color}" aria-hidden="true">${esc((a.name || "?").trim().charAt(0).toUpperCase())}</span>`;
}

function renderAccounts() {
  const s = state.summary;
  const base = s.base_currency || "MYR";
  const cards = (s.accounts || []).map((a, idx) => {
    const color = accountColor(a);
    const brand = brandOf(a);
    const curs = a.currencies_list || [a.currency];
    const st = a.latest_statement;
    const wr = a.win_rate === null || a.win_rate === undefined ? "—" : `${num(a.win_rate).toFixed(0)}%`;
    const ret = num(a.total_return);
    return `<article class="acc glass" style="--acc:${color}">
      ${brand ? `<img class="acc-watermark" src="${brand.logo}" alt="" aria-hidden="true" />` : ""}
      <div class="acc-head">
        ${accountLogo(a, color)}
        <div class="acc-title">
          <div class="acc-name">${esc(a.name)}</div>
          <div class="acc-sub"><span>${esc(brand?.label || String(a.broker || "Broker").replace(/^./, (c) => c.toUpperCase()))}</span>${a.account_number ? `<i class="dotsep"></i><span>${esc(maskAccount(a.account_number))}</span>` : ""}</div>
        </div>
        ${a.url ? `<a class="btn btn--ghost btn--sm acc-open" href="${esc(a.url)}" target="_blank" rel="noopener" aria-label="Open ${esc(a.name)} website">${icon("external")}<span class="hide-xs">Open</span></a>` : ""}
      </div>
      <div class="acc-balance">
        <div class="acc-nav money">${fmt(a.equity, a.currency)}</div>
        <div class="acc-ret">
          <span class="chip ${ret >= 0 ? "chip--up" : "chip--down"}">${icon(ret >= 0 ? "up" : "down", "ico--sm")}${pct(a.total_return_pct)}</span>
          <span class="money ${cls(ret)}">${signed(ret, a.currency)}</span>
          ${a.currency !== base ? `<span>· <span class="money">${fmt(a.equity_base, base)}</span></span>` : ""}
        </div>
      </div>
      ${sparkSvg(accountNavSeries(a), color, `sp${idx}`)}
      <div class="acc-metrics">
        <div><span>Portfolio</span><b class="money">${fmt(a.market_value, a.currency)}</b></div>
        <div><span>Cash</span><b class="money">${fmt(a.cash, a.currency)}</b></div>
        <div><span>Win rate</span><b>${wr} <small class="muted">(${num(a.closed_trades)})</small></b></div>
      </div>
      <div class="acc-foot">
        <div class="acc-ccys">${curs.map((c) => `<span class="chip ${c === a.currency ? "primary" : ""}">${esc(c)}</span>`).join("")}</div>
        <div class="acc-stmt">${icon("file", "ico--sm")}${st ? `<span>Latest statement <b>${esc(st.period)}</b> · <span class="money ${cls(st.nav_change)}">${signed(st.nav_change, a.currency)}</span></span>` : `<span>No statement yet. Drop one in to sync.</span>`}</div>
        <div class="acc-actions">
          <button type="button" class="icon-btn icon-btn--sm" data-acc-upload="${esc(a.id)}" aria-label="Upload statement to ${esc(a.name)}" data-tip="Upload statement">${icon("upload")}</button>
          <button type="button" class="icon-btn icon-btn--sm" data-acc-log="${esc(a.id)}" aria-label="Log entry for ${esc(a.name)}" data-tip="Log entry">${icon("plus")}</button>
          <span class="grow"></span>
          <button type="button" class="icon-btn icon-btn--sm" data-acc-edit="${esc(a.id)}" aria-label="Edit ${esc(a.name)}" data-tip="Edit">${icon("edit")}</button>
          <button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-acc-del="${esc(a.id)}" aria-label="Delete ${esc(a.name)}" data-tip="Delete">${icon("trash")}</button>
        </div>
      </div>
    </article>`;
  }).join("");
  $("#accountsGrid").innerHTML = cards + `
    <button type="button" class="acc-add" data-action="add-account">
      <span class="plus">${icon("plus")}</span><strong>Add an account</strong><span>Moomoo, Mplus, Webull or any broker</span>
      <span class="acc-add-brands" aria-hidden="true">${Object.values(BRANDS).map((b) => `<img src="${b.logo}" alt="" />`).join("")}</span>
    </button>`;
}

function renderGoals() {
  const goals = state.summary.goals || [];
  const kinds = { nav: "Tracks NAV", realized_pnl: "Tracks realised P&L", total_return: "Tracks net return", win_rate: "Tracks win rate", cash: "Tracks cash", none: "Manual" };
  if (!goals.length) {
    $("#goalsGrid").innerHTML = `<div class="empty">${icon("target")}<strong>No goals yet</strong><span>Set a NAV, profit or win-rate target and TradeDesk tracks it for you.</span></div>`;
    return;
  }
  $("#goalsGrid").innerHTML = goals.map((g) => {
    const p = Math.max(0, Math.min(100, num(g.progress_pct)));
    return `<article class="goal" style="--g:${earthColor(g.color)}">
      <div class="goal-top">
        <div><div class="goal-title">${esc(g.title)}</div><div class="goal-kind">${esc(kinds[g.auto_metric] || "Goal")} · ${esc(g.period || "")}</div></div>
        <div class="goal-ring" role="img" aria-label="${p.toFixed(0)} percent complete">
          <svg viewBox="0 0 52 52"><circle class="track" cx="26" cy="26" r="21"/><circle class="val" cx="26" cy="26" r="21" pathLength="100" style="stroke-dashoffset:${(100 - p).toFixed(1)}"/></svg>
          <b>${p.toFixed(0)}%</b>
        </div>
      </div>
      <div class="goal-nums"><strong class="money">${fmt(g.current_amount, g.currency)}</strong>of <span class="money">${fmt(g.target_amount, g.currency)}</span></div>
      <div class="goal-foot"><span class="goal-note">${esc(g.notes || "")}</span><button type="button" class="icon-btn icon-btn--sm" data-goal-edit="${esc(g.id)}" aria-label="Edit goal ${esc(g.title)}">${icon("edit")}</button></div>
    </article>`;
  }).join("") + (goals.length < 6 ? `<button type="button" class="goal-add" data-action="add-goal">${icon("plus")}<span>Add a goal</span><small>NAV, profit, win rate or cash</small></button>` : "");
}

function emptyRow(cols, title, text, ico = "layers") {
  return `<tr><td colspan="${cols}" class="empty"><div class="empty">${icon(ico)}<strong>${esc(title)}</strong><span>${esc(text)}</span></div></td></tr>`;
}

function renderHoldings() {
  const f = $("#holdAccountFilter").value;
  const base = state.summary.base_currency || "MYR";
  const rows = (state.summary.holdings || []).filter((h) => !f || h.account_id === f);
  $("#holdingsTable tbody").innerHTML = rows.length ? rows.map((h) => `
    <tr>
      <td class="sym">${esc(h.display_symbol || h.symbol)}</td>
      <td>${esc(h.account)}</td>
      <td>${esc(h.market)} <span class="muted">${esc(h.currency)}</span></td>
      <td class="r">${qty(h.qty)}</td>
      <td class="r money">${h.avg_cost === null || h.avg_cost === undefined ? `<span class="muted" title="Held before your first uploaded statement">—</span>` : fmt(h.avg_cost, h.currency, 4)}</td>
      <td class="r">${fmt(h.price, h.currency, 4)}</td>
      <td class="r money">${fmt(h.market_value, h.currency)}</td>
      <td class="r money">${fmt(h.market_value_base, base)}</td>
      <td class="r">${num(h.weight).toFixed(1)}%</td>
    </tr>`).join("") : emptyRow(9, "No open positions", "Holdings appear here from your statements and journal entries.");
}

function renderLatestStatement() {
  const box = $("#latestStmt");
  if (!state.statements.length) {
    box.innerHTML = `<p class="muted" style="margin:0;font-size:var(--fs-sm)">No statements yet. Your first upload fills in NAV, trades and positions automatically.</p>`;
    return;
  }
  const st = state.statements.find((s) => s.id === state.activeStatementId) || state.statements[0];
  const c = st.base_currency || "MYR";
  box.innerHTML = `
    <div class="stmt-mini">
      <div><span>${esc(st.period)} · start</span><b class="money">${fmt(st.starting_nav, c)}</b></div>
      <div><span>End NAV</span><b class="money">${fmt(st.ending_nav, c)}</b></div>
      <div><span>Change</span><b class="money ${cls(st.nav_change)}">${signed(st.nav_change, c)}</b></div>
      <div><span>Ending cash</span><b class="money">${fmt(st.cash_balance, c)}</b></div>
    </div>
    <div class="stmt-chips" aria-label="Uploaded statements">
      ${state.statements.slice(0, 8).map((s) => `<button type="button" class="stmt-chip ${s.id === st.id ? "on" : ""}" data-open-stmt="${esc(s.id)}">${esc(s.period)} · ${esc(s.account_name)}</button>`).join("")}
      ${state.statements.length > 8 ? `<a class="stmt-chip" href="#/statements">+${state.statements.length - 8} more</a>` : ""}
    </div>`;
}

/* ------------------------------------------------------------------ statements view */
function renderStatementTabs() {
  const bar = $("#statementTabs");
  bar.innerHTML = state.statements.map((s) => `
    <button type="button" class="tab" role="tab" aria-selected="${s.id === state.activeStatementId}" data-stmt-tab="${esc(s.id)}">${esc(s.period)} · ${esc(s.account_name)}</button>`).join("");
}

function statementTrades(st) {
  const p = st.payload || {};
  const raw = Array.isArray(p.trades) ? p.trades : [];
  if (raw.length) return raw;
  return state.txs.filter((t) => (t.type === "BUY" || t.type === "SELL") && Number(t.statement_id) === Number(st.id)).map((t) => ({
    date: t.date, time: t.time, side: t.type, symbol: t.symbol, display_symbol: t.display_symbol, market: t.market,
    currency: t.currency, price: t.price, qty: t.qty, amount: t.amount, fees: t.fees,
  }));
}

function renderStatementReport() {
  const box = $("#statementReport");
  if (!state.statements.length) {
    box.innerHTML = `<div class="card glass"><div class="empty">${icon("file")}<strong>No statements uploaded yet</strong><span>Drop a monthly PDF above. Locked PDFs are fine, we’ll ask for the password.</span></div></div>`;
    return;
  }
  const st = state.statements.find((s) => s.id === state.activeStatementId) || state.statements[0];
  const p = st.payload || {};
  const b = p.base_currency || st.base_currency || "MYR";
  const cc = p.cash_changes || {};
  const trades = statementTrades(st);
  const pos = p.ending_positions || [];
  const moves = p.stock_movements || [];
  const cash = p.cash_events || [];
  const changes = p.position_changes || [];
  box.innerHTML = `
  <div class="bento">
    <article class="card glass span-12">
      <header class="card-head">
        <div>
          <p class="eyebrow">${esc((p.broker || st.broker || "broker").toUpperCase())} statement</p>
          <h2 class="section-title">${esc(p.period || st.period)}</h2>
          <p class="meta-line">${esc(st.account_name || "")}${p.account_number ? ` · <code>${esc(maskAccount(p.account_number))}</code>` : ""}${p.preparation_date ? ` · prepared ${esc(p.preparation_date)}` : ""}</p>
        </div>
        <button type="button" class="btn btn--danger-ghost btn--sm" data-del-stmt="${esc(st.id)}">${icon("trash")}Delete statement</button>
      </header>
      <div class="stat-grid">
        <div class="stat"><span>Starting NAV</span><b class="money">${fmt(p.starting_nav ?? st.starting_nav, b)}</b></div>
        <div class="stat"><span>Ending NAV</span><b class="money">${fmt(p.ending_nav ?? st.ending_nav, b)}</b></div>
        <div class="stat"><span>NAV change</span><b class="money ${cls(p.nav_change ?? st.nav_change)}">${signed(p.nav_change ?? st.nav_change, b)}</b></div>
        <div class="stat"><span>Securities value</span><b class="money">${fmt(p.portfolio_value, b)}</b></div>
        <div class="stat"><span>Ending cash</span><b class="money">${fmt(p.cash_balance ?? st.cash_balance, b)}</b></div>
        <div class="stat"><span>Total fees</span><b class="money">${fmt(p.total_fees, b)}</b></div>
      </div>
    </article>
    <article class="card glass span-6">
      <header class="card-head"><h3 class="card-title">Changes in cash (${esc(b)})</h3></header>
      <table class="tbl tbl--kv"><tbody>
        ${[["Buys", cc.buy_amount], ["Buy fees", cc.buy_fee], ["Sells", cc.sell_amount], ["Sell fees", cc.sell_fee], ["Deposits", cc.deposit], ["Withdrawals", cc.withdrawal], ["Dividends / corporate actions", cc.corporate_action], ["IPO subscriptions", cc.ipo]]
          .map(([k, v]) => `<tr><td>${k}</td><td class="r money ${cls(v)}">${signed(v || 0, b)}</td></tr>`).join("")}
      </tbody></table>
    </article>
    <article class="card glass span-6">
      <header class="card-head"><h3 class="card-title">Changes in position value</h3></header>
      <div class="table-scroll"><table class="tbl"><thead><tr><th>Security</th><th>Ccy</th><th class="r">Change</th></tr></thead><tbody>
        ${changes.length ? changes.map((c) => `<tr><td class="sym">${esc(c.label)}</td><td>${esc(c.currency)}</td><td class="r money ${cls(c.change)}">${signed(c.change, c.currency)}</td></tr>`).join("") : emptyRow(3, "No changes", "No position value changes this period.")}
      </tbody></table></div>
    </article>
    <article class="card glass span-6">
      <header class="card-head"><h3 class="card-title">Ending positions (${pos.length})</h3></header>
      <div class="table-scroll"><table class="tbl"><thead><tr><th>Security</th><th>Mkt</th><th class="r">Qty</th><th class="r">Close</th><th class="r">Value</th><th class="r">Base</th></tr></thead><tbody>
        ${pos.length ? pos.map((e) => `<tr><td class="sym">${esc(e.display_symbol)}</td><td>${esc(e.market)}</td><td class="r">${qty(e.qty)}</td><td class="r">${fmt(e.closing_price, e.currency, 4)}</td><td class="r money">${fmt(e.market_value, e.currency)}</td><td class="r money">${fmt(e.base_value, b)}</td></tr>`).join("") : emptyRow(6, "No open positions", "Nothing held at period end.")}
      </tbody></table></div>
    </article>
    <article class="card glass span-6">
      <header class="card-head"><h3 class="card-title">Transfers &amp; cash events</h3></header>
      <div class="table-scroll"><table class="tbl"><thead><tr><th>Date</th><th>Type</th><th>Details</th><th class="r">Amount</th></tr></thead><tbody>
        ${moves.length || cash.length ? [
          ...moves.map((m) => `<tr><td>${esc(m.date)}</td><td><span class="tag tag--TRANSFER_IN">${esc(m.type)}</span></td><td><b>${esc(m.display_symbol)}</b> <span class="muted">${esc(m.comment)}</span></td><td class="r">+${qty(m.qty)} units</td></tr>`),
          ...cash.map((c) => `<tr><td>${esc(c.date)}</td><td><span class="tag tag--${num(c.amount) < 0 ? "WITHDRAW" : "DEPOSIT"}">${esc(c.raw_type)}</span></td><td class="note">${esc(c.comment || c.raw_type)}</td><td class="r money ${cls(c.amount)}">${signed(c.amount, b)}</td></tr>`),
        ].join("") : emptyRow(4, "Nothing here", "No transfers or cash events in this statement.")}
      </tbody></table></div>
    </article>
    <article class="card glass span-12">
      <header class="card-head"><h3 class="card-title">Executed trades (${trades.length})</h3></header>
      <div class="table-scroll"><table class="tbl"><thead><tr><th>Date</th><th>Side</th><th>Security</th><th>Mkt</th><th>Ccy</th><th class="r">Price</th><th class="r">Qty</th><th class="r">Gross</th><th class="r">Fees</th></tr></thead><tbody>
        ${trades.length ? trades.map((t) => {
          const sell = String(t.side || "").toUpperCase() === "SELL" || String(t.direction || "").toUpperCase().includes("SELL");
          const gross = Math.abs(t.amount != null ? num(t.amount) : num(t.qty) * num(t.price));
          return `<tr><td>${esc(t.date)} <span class="muted">${esc(t.time || "")}</span></td><td><span class="tag tag--${sell ? "SELL" : "BUY"}">${sell ? "SELL" : "BUY"}</span></td><td class="sym">${esc(t.display_symbol || t.symbol || "—")}</td><td>${esc(t.market || "—")}</td><td>${esc(t.currency || b)}</td><td class="r">${fmt(Math.abs(num(t.price)), null, 4)}</td><td class="r">${qty(Math.abs(num(t.qty)))}</td><td class="r money">${fmt(gross, t.currency || b)}</td><td class="r money">${fmt(Math.abs(num(t.fees)), t.currency || b)}</td></tr>`;
        }).join("") : emptyRow(9, "No trades", "No executions in this statement period.")}
      </tbody></table></div>
    </article>
  </div>`;
}

/* ------------------------------------------------------------------ journal */
function renderClosedTrades() {
  const rows = state.summary.closed_trades || [];
  $("#closedTable tbody").innerHTML = rows.length ? rows.map((c) => `
    <tr><td>${esc(c.date)}</td><td class="sym">${esc(c.symbol)}</td><td>${esc(c.currency)}</td><td class="r">${qty(Math.abs(num(c.qty)))}</td>
    <td class="r">${fmt(Math.abs(num(c.entry_avg)), c.currency, 4)}</td><td class="r">${fmt(Math.abs(num(c.exit_price)), c.currency, 4)}</td>
    <td class="r money">${fmt(Math.abs(num(c.fees)), c.currency)}</td><td class="r money ${cls(c.pnl)}"><b>${signed(c.pnl, c.currency)}</b></td><td class="r ${cls(c.return_pct)}">${pct(c.return_pct)}</td></tr>`).join("")
    : emptyRow(9, "No closed trades yet", "Sell a position and the realised result lands here.", "book");
}

function renderTransactions() {
  const q = ($("#txSearch").value || "").trim().toLowerCase();
  const rows = state.txs.filter((t) => !q || [t.symbol, t.display_symbol, t.type, t.notes, t.account, t.date].join(" ").toLowerCase().includes(q));
  $("#txTable tbody").innerHTML = rows.length ? rows.map((t) => {
    const trade = ["BUY", "SELL", "TRANSFER_IN"].includes(t.type);
    const gross = Math.abs(num(t.qty)) * num(t.price);
    const net = t.type === "BUY" ? gross + Math.abs(num(t.fees)) : t.type === "SELL" ? gross - Math.abs(num(t.fees)) : Math.abs(num(t.amount));
    return `<tr>
      <td>${esc(t.date)}${t.time ? ` <span class="muted">${esc(t.time)}</span>` : ""}</td>
      <td>${esc(t.account)}</td>
      <td><span class="tag tag--${esc(t.type)}">${esc(t.type)}</span></td>
      <td class="sym">${esc(t.display_symbol || t.symbol || "")}</td>
      <td>${esc(t.currency || "")}</td>
      <td class="r">${trade ? qty(Math.abs(num(t.qty))) : ""}</td>
      <td class="r">${trade && t.price ? fmt(Math.abs(num(t.price)), null, 4) : ""}</td>
      <td class="r money">${t.fees ? fmt(Math.abs(num(t.fees)), null) : ""}</td>
      <td class="r money">${fmt(net, t.currency)}</td>
      <td class="note" title="${esc(t.notes)}">${esc(t.notes)}</td>
      <td class="r"><span class="row-actions">
        <button type="button" class="icon-btn icon-btn--sm" data-tx-edit="${esc(t.id)}" aria-label="Edit entry">${icon("edit")}</button>
        <button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-tx-del="${esc(t.id)}" aria-label="Delete entry">${icon("trash")}</button>
      </span></td>
    </tr>`;
  }).join("") : emptyRow(11, q ? "No matches" : "No journal entries yet", q ? "Try a different search." : "Log a trade or upload a statement to get started.", "book");
}

async function reloadTransactions() {
  const aid = $("#txAccountFilter").value;
  try {
    state.txs = await api(`/api/transactions${aid ? `?account_id=${encodeURIComponent(aid)}` : ""}`);
    renderTransactions();
  } catch (err) { toast(err.message, "error"); }
}

/* ------------------------------------------------------------------ charts */
function chartTheme() {
  return { tick: cssVar("--muted"), grid: cssVar("--line"), ink: cssVar("--ink"), tooltipBg: cssVar("--tooltip"), tooltipInk: cssVar("--bg") };
}
function setupChartDefaults() {
  if (!window.Chart) return;
  Chart.defaults.font.family = "\"Plus Jakarta Sans\", system-ui, sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.pointStyle = "rectRounded";
  Chart.defaults.plugins.tooltip.cornerRadius = 10;
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.displayColors = true;
  Chart.defaults.plugins.tooltip.boxPadding = 4;
  Chart.defaults.animation.duration = reduceMotion() ? 0 : 700;
}
function drawChart(id, cfg) {
  state.charts[id]?.destroy();
  delete state.charts[id];
  const canvas = document.getElementById(id);
  if (!canvas || !window.Chart || canvas.offsetParent === null) return;
  const th = chartTheme();
  cfg.options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    ...cfg.options,
    plugins: {
      tooltip: { backgroundColor: th.tooltipBg, titleColor: th.tooltipInk, bodyColor: th.tooltipInk },
      legend: { labels: { color: th.tick } },
      ...(cfg.options?.plugins || {}),
    },
  };
  state.charts[id] = new Chart(canvas, cfg);
}
function gradient(ctx, color, h = 260) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, color + "55");
  g.addColorStop(1, color + "00");
  return g;
}

function renderCharts() {
  if (!state.summary || !window.Chart) return;
  const th = chartTheme();
  const pal = chartPalette();
  const area = cssVar("--chart-area");
  const base = state.summary.base_currency || "MYR";
  const monthly = state.periods?.monthly || [];

  // Hero sparkline
  let series = monthly.map((m) => num(m.ending_nav));
  if (series.length < 2) {
    const st = state.statements[0];
    series = st ? [num(st.starting_nav), num(st.ending_nav)] : [num(state.summary.totals?.equity), num(state.summary.totals?.equity)];
  }
  const heroCanvas = $("#heroSpark");
  if (heroCanvas && heroCanvas.offsetParent !== null) {
    drawChart("heroSpark", {
      type: "line",
      data: { labels: series.map((_, i) => monthly[i]?.period || ""), datasets: [{ data: series, borderColor: area, borderWidth: 2.4, pointRadius: 0, pointHoverRadius: 4, tension: 0.4, fill: true, backgroundColor: (c) => gradient(c.chart.ctx, area, 92) }] },
      options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => fmt(c.parsed.y, base) } } }, scales: { x: { display: false }, y: { display: false } } },
    });
  }

  // Performance progression (NAV line on left axis, P&L bars on right axis)
  const list = state.periods?.[state.overviewPeriod] || [];
  drawChart("overviewPerfChart", {
    data: {
      labels: list.map((x) => x.period),
      datasets: [
        { type: "line", label: "Ending NAV", data: list.map((x) => x.ending_nav), borderColor: pal[0], backgroundColor: (c) => gradient(c.chart.ctx, area, 300), fill: true, tension: 0.35, borderWidth: 2.5, pointRadius: 3, pointBackgroundColor: area, yAxisID: "y", order: 1 },
        { type: "bar", label: "Realised P&L + div", data: list.map((x) => x.net_pnl), backgroundColor: list.map((x) => (num(x.net_pnl) >= 0 ? pal[2] : cssVar("--down"))), borderRadius: 6, maxBarThickness: 28, yAxisID: "y1", order: 2 },
      ],
    },
    options: {
      plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt(c.parsed.y, base)}` } } },
      scales: {
        x: { ticks: { color: th.tick }, grid: { display: false }, border: { display: false } },
        y: { position: "left", ticks: { color: th.tick, callback: (v) => fmt(v, base, 0) }, grid: { color: th.grid }, border: { display: false } },
        y1: { position: "right", ticks: { color: th.tick, callback: (v) => fmt(v, base, 0) }, grid: { display: false }, border: { display: false } },
      },
    },
  });

  // Allocation donut
  const s = state.summary;
  const groups = {};
  if (state.allocMode === "symbol") {
    (s.holdings || []).forEach((h) => (groups[h.display_symbol || h.symbol] = (groups[h.display_symbol || h.symbol] || 0) + num(h.market_value_base)));
    if (num(s.totals?.cash) > 0) groups.Cash = num(s.totals.cash);
  } else if (state.allocMode === "account") {
    (s.accounts || []).forEach((a) => { if (num(a.equity_base) > 0) groups[a.name] = num(a.equity_base); });
  } else {
    (s.holdings || []).forEach((h) => (groups[h.currency] = (groups[h.currency] || 0) + num(h.market_value_base)));
    if (num(s.totals?.cash) > 0) groups[`${base} cash`] = num(s.totals.cash);
  }
  let entries = Object.entries(groups).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (entries.length > 8) {
    const rest = entries.slice(7).reduce((acc, [, v]) => acc + v, 0);
    entries = [...entries.slice(0, 7), ["Other", rest]];
  }
  const total = entries.reduce((acc, [, v]) => acc + v, 0);
  $("#allocTotal").textContent = fmt(total, base, 0);
  $("#allocLegend").innerHTML = entries.length ? entries.map(([k, v], i) =>
    `<li><i style="background:${pal[i % pal.length]}"></i><span>${esc(k)}</span><b>${total ? ((v / total) * 100).toFixed(1) : 0}%</b></li>`).join("")
    : `<li class="muted">Nothing to allocate yet</li>`;
  drawChart("allocChart", {
    type: "doughnut",
    data: { labels: entries.map(([k]) => k), datasets: [{ data: entries.map(([, v]) => +v.toFixed(2)), backgroundColor: entries.map((_, i) => pal[i % pal.length]), borderColor: cssVar("--bg"), borderWidth: 3, hoverOffset: 6 }] },
    options: { cutout: "72%", interaction: { mode: "nearest" }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.label}: ${fmt(c.parsed, base)}` } } } },
  });

  if (state.view === "performance") renderPerformance();
}

async function renderPerformance() {
  if (!state.summary) return;
  const aid = $("#perfAccountFilter").value;
  let periods = state.periods;
  if (aid) {
    if (!state.detailPeriods || state.detailPeriods._aid !== aid) {
      try { state.detailPeriods = { ...(await api(`/api/performance/periods?account_id=${encodeURIComponent(aid)}`)), _aid: aid }; }
      catch (err) { toast(err.message, "error"); return; }
    }
    periods = state.detailPeriods;
  }
  const list = periods?.[state.detailPeriod] || [];
  const base = periods?.base_currency || state.summary.base_currency || "MYR";
  const th = chartTheme();
  const pal = chartPalette();
  const area = cssVar("--chart-area");
  $("#periodTableTitle").textContent = { monthly: "Monthly breakdown", quarterly: "Quarterly breakdown", yearly: "Yearly breakdown" }[state.detailPeriod];
  drawChart("periodPnlChart", {
    type: "bar",
    data: { labels: list.map((x) => x.period), datasets: [{ label: "Realised P&L + dividends", data: list.map((x) => x.net_pnl), backgroundColor: list.map((x) => (num(x.net_pnl) >= 0 ? pal[2] : cssVar("--down"))), borderRadius: 6, maxBarThickness: 34 }] },
    options: {
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => fmt(c.parsed.y, base) } } },
      scales: { x: { ticks: { color: th.tick }, grid: { display: false }, border: { display: false } }, y: { ticks: { color: th.tick, callback: (v) => fmt(v, base, 0) }, grid: { color: th.grid }, border: { display: false } } },
    },
  });
  drawChart("periodNavChart", {
    type: "line",
    data: {
      labels: list.map((x) => x.period),
      datasets: [
        { label: "Starting NAV", data: list.map((x) => x.starting_nav), borderColor: pal[6], borderDash: [5, 5], borderWidth: 2, pointRadius: 2, tension: 0.3 },
        { label: "Ending NAV", data: list.map((x) => x.ending_nav), borderColor: pal[0], backgroundColor: (c) => gradient(c.chart.ctx, area), fill: true, borderWidth: 2.5, pointRadius: 3, tension: 0.3 },
      ],
    },
    options: {
      plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt(c.parsed.y, base)}` } } },
      scales: { x: { ticks: { color: th.tick }, grid: { display: false }, border: { display: false } }, y: { ticks: { color: th.tick, callback: (v) => fmt(v, base, 0) }, grid: { color: th.grid }, border: { display: false } } },
    },
  });
  $("#periodTable tbody").innerHTML = list.length ? list.map((r) => `
    <tr><td><b>${esc(r.period)}</b></td><td class="r money">${fmt(r.starting_nav, base)}</td><td class="r money"><b>${fmt(r.ending_nav, base)}</b></td>
    <td class="r money ${cls(r.nav_change)}">${signed(r.nav_change, base)}</td><td class="r money ${cls(r.realized_pnl)}">${signed(r.realized_pnl, base)}</td>
    <td class="r money">${fmt(r.dividends, base)}</td><td class="r money">${fmt(r.fees, base)}</td><td class="r money">${signed(num(r.deposits) - num(r.withdrawals), base)}</td>
    <td class="r money">${fmt(r.buy_volume, base)}</td><td class="r money">${fmt(r.sell_volume, base)}</td><td class="r">${num(r.trades_count)}</td>
    <td class="r">${r.win_rate === null || r.win_rate === undefined ? "—" : `${num(r.win_rate).toFixed(1)}%`}</td></tr>`).join("")
    : emptyRow(12, "No periods yet", "Upload statements or log trades to build your history.", "trend");
}

/* ------------------------------------------------------------------ dialogs: account */
const BROKER_DEFAULTS = {
  moomoo: { name: "Moomoo", url: "https://www.moomoo.com/my/", color: "#f86800", curs: ["MYR", "USD", "SGD", "HKD", "CNH"] },
  mplus: { name: "Mplus", url: "https://www.mplusonline.com.my/", color: "#e8231b", curs: ["MYR", "USD"] },
  webull: { name: "Webull", url: "https://app.webull.com/", color: "#2860f0", curs: ["USD", "MYR"] },
  other: { name: "", url: "", color: "#0f1013", curs: ["MYR", "USD"] },
};
function renderSwatches(selected) {
  const box = $("#accSwatches");
  const sel = earthColor(selected);
  $("#accColor").value = sel;
  box.innerHTML = PALETTE.map((e) => `<button type="button" class="swatch" role="radio" aria-checked="${e.c === sel}" aria-label="${e.n}" data-c="${e.c}" style="background:${e.c}"></button>`).join("");
  $$(".swatch", box).forEach((b) => (b.onclick = () => {
    $("#accColor").value = b.dataset.c;
    $$(".swatch", box).forEach((x) => x.setAttribute("aria-checked", String(x === b)));
  }));
}
function openAccountDialog(acc = null) {
  const f = $("#accountForm");
  f.reset();
  $("#accountDlgTitle").textContent = acc ? `Edit ${acc.name}` : "Add account";
  f.id.value = acc?.id || "";
  f.broker.value = acc?.broker || "moomoo";
  const d = BROKER_DEFAULTS[f.broker.value] || BROKER_DEFAULTS.other;
  f.name.value = acc?.name ?? d.name;
  f.currency.value = acc?.currency || "MYR";
  f.account_number.value = acc?.account_number || "";
  f.url.value = acc?.url ?? d.url;
  const curs = new Set(acc?.currencies_list || d.curs);
  $$("#accCurrencies input").forEach((cb) => (cb.checked = curs.has(cb.value)));
  renderSwatches(acc?.color || d.color);
  $("#btnDeleteAccount").hidden = !acc;
  $("#accountDlg").showModal();
}
async function saveAccount(e) {
  e.preventDefault();
  const f = e.target;
  const btn = $("button[type=submit]", f);
  const currencies = $$("#accCurrencies input:checked").map((c) => c.value);
  if (!currencies.includes(f.currency.value)) currencies.unshift(f.currency.value);
  const body = { name: f.name.value.trim(), broker: f.broker.value, currency: f.currency.value, currencies, account_number: f.account_number.value.trim(), url: f.url.value.trim(), color: f.color.value };
  if (!body.name) { f.name.setAttribute("aria-invalid", "true"); f.name.focus(); return; }
  f.name.removeAttribute("aria-invalid");
  setLoading(btn, true, "Saving…");
  try {
    const id = f.id.value;
    await api(id ? `/api/accounts/${encodeURIComponent(id)}` : "/api/accounts", { method: id ? "PUT" : "POST", body });
    $("#accountDlg").close();
    toast(id ? "Account updated" : "Account added", "success");
    await refreshData();
  } catch (err) { toast(err.message, "error"); }
  finally { setLoading(btn, false); }
}
async function deleteAccount(acc) {
  const ok = await confirmDialog({ title: `Delete ${acc.name}?`, body: "This removes the account card together with its statements and journal entries. This can’t be undone.", ok: "Delete account" });
  if (!ok) return;
  try {
    await api(`/api/accounts/${encodeURIComponent(acc.id)}`, { method: "DELETE" });
    $("#accountDlg").open && $("#accountDlg").close();
    toast(`${acc.name} deleted`, "success");
    await refreshData();
  } catch (err) { toast(err.message, "error"); }
}

/* ------------------------------------------------------------------ dialogs: goals */
function openGoalDialog(goal = null) {
  const f = $("#goalForm");
  f.reset();
  $("#goalDlgTitle").textContent = goal ? "Edit goal" : "New goal";
  f.id.value = goal?.id || "";
  f.title.value = goal?.title || "";
  f.auto_metric.value = goal?.auto_metric || "nav";
  f.period.value = goal?.period || String(new Date().getFullYear());
  f.target_amount.value = goal?.target_amount ?? "";
  f.current_amount.value = goal?.current_amount ?? 0;
  f.currency.value = goal?.currency || state.summary?.base_currency || "MYR";
  f.notes.value = goal?.notes || "";
  f.color.value = earthColor(goal?.color);
  syncGoalFields();
  $("#btnDeleteGoal").hidden = !goal;
  $("#btnDeleteGoal").onclick = () => goal && deleteGoal(goal);
  $("#goalDlg").showModal();
}
function syncGoalFields() {
  const m = $("#goalMetric").value;
  $("#goalCurrentWrap").hidden = m !== "none";
  if (m === "win_rate") $("#goalCurrency").value = "%";
  else if ($("#goalCurrency").value === "%") $("#goalCurrency").value = state.summary?.base_currency || "MYR";
}
async function saveGoal(e) {
  e.preventDefault();
  const f = e.target;
  const btn = $("button[type=submit]", f);
  const body = Object.fromEntries(new FormData(f));
  const id = body.id;
  delete body.id;
  body.target_amount = num(body.target_amount);
  body.current_amount = num(body.current_amount);
  body.category = body.auto_metric === "none" ? "custom" : body.auto_metric;
  if (!body.title.trim() || body.target_amount <= 0) { toast("Please give the goal a name and a target above zero.", "error"); return; }
  setLoading(btn, true, "Saving…");
  try {
    await api(id ? `/api/goals/${encodeURIComponent(id)}` : "/api/goals", { method: id ? "PUT" : "POST", body });
    $("#goalDlg").close();
    toast("Goal saved", "success");
    await refreshData();
  } catch (err) { toast(err.message, "error"); }
  finally { setLoading(btn, false); }
}
async function deleteGoal(goal) {
  const ok = await confirmDialog({ title: "Delete this goal?", body: `“${goal.title}” will be removed.`, ok: "Delete goal" });
  if (!ok) return;
  try {
    await api(`/api/goals/${encodeURIComponent(goal.id)}`, { method: "DELETE" });
    $("#goalDlg").open && $("#goalDlg").close();
    toast("Goal deleted", "success");
    await refreshData();
  } catch (err) { toast(err.message, "error"); }
}

/* ------------------------------------------------------------------ dialogs: journal */
function setJournalType(type) {
  $("#jnlType").value = type;
  $$("#jnlTypeSeg button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.type === type)));
  const trade = type === "BUY" || type === "SELL";
  $('[data-jnl="trade"]').hidden = !trade;
  $('[data-jnl="cash"]').hidden = trade;
  $('[data-jnl="sym"]').hidden = !(trade || type === "DIVIDEND");
}
function syncJournalCurrencies(selected) {
  const acc = state.accounts.find((a) => a.id === $("#jnlAccount").value);
  const curs = acc?.currencies_list || ["MYR", "USD", "SGD", "HKD", "CNH"];
  $("#jnlCurrency").innerHTML = curs.map((c) => `<option>${esc(c)}</option>`).join("");
  $("#jnlCurrency").value = curs.includes(selected) ? selected : acc?.currency || curs[0];
}
function openJournalDialog(tx = {}) {
  if (!state.accounts.length) { toast("Add a brokerage account first.", "info"); openAccountDialog(); return; }
  const f = $("#journalForm");
  f.reset();
  formError(f, "");
  $("#journalDlgTitle").textContent = tx.id ? "Edit entry" : "Log entry";
  f.id.value = tx.id || "";
  f.account_id.value = tx.account_id || state.accounts[0].id;
  syncJournalCurrencies(tx.currency);
  f.date.value = tx.date || today();
  f.symbol.value = tx.symbol || "";
  f.market.value = tx.market || "";
  f.qty.value = tx.qty || "";
  f.price.value = tx.price || "";
  f.fees.value = tx.fees ?? 0;
  f.amount.value = tx.amount || "";
  f.notes.value = tx.notes || "";
  setJournalType(tx.type && tx.type !== "TRANSFER_IN" ? tx.type : "BUY");
  $("#journalDlg").showModal();
}
async function saveJournal(e) {
  e.preventDefault();
  const f = e.target;
  const btn = $("button[type=submit]", f);
  const body = Object.fromEntries(new FormData(f));
  const id = body.id;
  delete body.id;
  ["qty", "price", "fees", "amount"].forEach((k) => (body[k] = num(body[k])));
  body.symbol = (body.symbol || "").trim().toUpperCase();
  const trade = body.type === "BUY" || body.type === "SELL";
  if (trade && (!body.symbol || body.qty <= 0 || body.price <= 0)) return formError(f, "A buy or sell needs a symbol, a quantity and a price.");
  if (!trade && body.amount <= 0) return formError(f, "Please enter an amount above zero.");
  if (trade) body.amount = 0;
  formError(f, "");
  setLoading(btn, true, "Saving…");
  try {
    await api(id ? `/api/transactions/${encodeURIComponent(id)}` : "/api/transactions", { method: id ? "PUT" : "POST", body });
    $("#journalDlg").close();
    toast("Journal entry saved", "success");
    await refreshData();
  } catch (err) { formError(f, err.message); }
  finally { setLoading(btn, false); }
}

/* ------------------------------------------------------------------ dialogs: profile */
function openProfileDialog() {
  const f = $("#profileForm");
  const u = state.user || {};
  f.reset();
  formError(f, "");
  f.display_name.value = u.display_name || "";
  f.email.value = u.email || "";
  f.base_currency.value = u.base_currency || "MYR";
  renderAvatarPicker($("#profileAvatarPicker"), $("#profileAvatarInput"), u.avatar);
  $("#profileDlg").showModal();
}
async function saveProfile(e) {
  e.preventDefault();
  const f = e.target;
  const btn = $("button[type=submit]", f);
  const body = Object.fromEntries(new FormData(f));
  if (!body.password) { delete body.password; delete body.current_password; }
  else if ((body.password || "").length < 8) return formError(f, "New password must be at least 8 characters.");
  else if (!body.current_password) return formError(f, "Enter your current password to set a new one.");
  formError(f, "");
  setLoading(btn, true, "Saving…");
  try {
    const updated = await api("/api/users/me", { method: "PUT", body });
    state.user = { ...state.user, ...updated };
    $("#profileDlg").close();
    renderUserChrome();
    toast("Profile updated", "success");
    if (state.mode === "user") await refreshData();
  } catch (err) { formError(f, err.message); }
  finally { setLoading(btn, false); }
}

/* ------------------------------------------------------------------ export */
async function openExport() {
  try {
    const res = await api("/api/export/monthly-csv");
    const months = res.months || [];
    if (!months.length) { toast("Nothing to export yet.", "info"); return; }
    state.exportData = res;
    state.exportMonth = months[months.length - 1].month;
    renderExport();
    $("#exportDlg").showModal();
  } catch (err) { toast(err.message, "error"); }
}
function renderExport() {
  const months = state.exportData.months;
  const m = months.find((x) => x.month === state.exportMonth) || months[0];
  $("#exportTabs").innerHTML = months.map((x) => `<button type="button" class="tab" role="tab" aria-selected="${x.month === m.month}" data-exp="${esc(x.month)}">${esc(x.period || x.month)}</button>`).join("");
  $("#exportPreview").innerHTML = `<b>${esc(m.filename)}</b><br/><span class="muted">${num(m.statements_count)} statement summary row(s) · ${num(m.transactions_count)} journal entr${num(m.transactions_count) === 1 ? "y" : "ies"}</span>`;
  $("#btnExportOne").textContent = `Download ${m.month}`;
}
function downloadText(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* ------------------------------------------------------------------ uploads + PDF password card */
async function isEncryptedPdf(file) {
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") return false;
  try {
    const buf = await file.arrayBuffer();
    const text = new TextDecoder("latin1").decode(new Uint8Array(buf));
    return /\/Encrypt\s*(\d+\s+\d+\s+R|<<)/.test(text);
  } catch { return false; }
}

/** Shows the password card for `entries` [{file, reason}] → Promise<{passwords}|{skip:true}|null> */
function askPasswords(entries) {
  const dlg = $("#pdfPasswordDlg");
  const list = $("#pdfPwFiles");
  const sameWrap = $("#pdfPwSameWrap");
  const same = $("#pdfPwSame");
  const retry = entries.some((e) => e.reason === "incorrect");
  $("#pdfPwTitle").textContent = entries.length > 1 ? `Unlock ${entries.length} protected statements` : "Unlock protected statement";
  $("#pdfPwLede").textContent = retry
    ? "One or more passwords didn’t work. Please check and try again."
    : entries.length > 1
      ? "These PDFs are password-protected. Enter the passwords once and we’ll unlock and read them."
      : "This PDF is password-protected. Enter its password and we’ll unlock and read it.";
  sameWrap.hidden = entries.length < 2;
  same.checked = false;
  list.classList.remove("same");
  list.innerHTML = entries.map((e, i) => `
    <div class="pw-file ${e.reason === "incorrect" ? "err" : ""}">
      <span class="pw-file-icon">${icon("file-lock")}</span>
      <div class="pw-file-name"><span title="${esc(e.file.name)}">${esc(e.file.name)}</span><small>${fmtSize(e.file.size)}</small></div>
      <div class="pw-wrap">
        <input type="password" id="pdfpw${i}" data-i="${i}" autocomplete="off" aria-label="Password for ${esc(e.file.name)}" placeholder="${entries.length > 1 && i === 0 ? "Password" : "Password"}" ${e.reason === "incorrect" ? 'aria-invalid="true"' : ""} />
        <button type="button" class="pw-eye" data-toggle-pw="pdfpw${i}" aria-label="Show password">${icon("eye")}</button>
      </div>
      ${e.reason === "incorrect" ? `<p class="pw-file-msg">That password didn’t unlock this file.</p>` : ""}
    </div>`).join("");
  bindPwEyes(list);
  same.onchange = () => {
    list.classList.toggle("same", same.checked);
    const first = $("input", list);
    first.placeholder = same.checked ? "Password for all files" : "Password";
    first.focus();
  };
  dlg.returnValue = "";
  if (!dlg.open) dlg.showModal();
  setTimeout(() => $("input", list)?.focus(), 60);

  return new Promise((resolve) => {
    const form = $("#pdfPasswordForm");
    let settled = false;
    const done = (v) => { if (settled) return; settled = true; cleanup(); resolve(v); };
    const onSubmit = (ev) => {
      ev.preventDefault();
      const inputs = $$("input[type=password], input[type=text]", list).filter((x) => x.id.startsWith("pdfpw"));
      const visible = same.checked ? [inputs[0]] : inputs;
      const empty = visible.filter((x) => !x.value);
      visible.forEach((x) => x.setAttribute("aria-invalid", String(!x.value)));
      if (empty.length) { empty[0].focus(); return; }
      const passwords = {};
      entries.forEach((e, i) => (passwords[e.file.name] = same.checked ? inputs[0].value : inputs[i].value));
      dlg.close();
      done({ passwords });
    };
    const onSkip = () => { dlg.close(); done({ skip: true }); };
    // A stale `close` event from a previous round can arrive after the dialog reopened; ignore it.
    const onClose = () => { if (!dlg.open) done(null); };
    function cleanup() {
      form.removeEventListener("submit", onSubmit);
      $("#pdfPwSkip").removeEventListener("click", onSkip);
      dlg.removeEventListener("close", onClose);
      $$("input", list).forEach((x) => (x.value = "")); // never keep passwords around
    }
    form.addEventListener("submit", onSubmit);
    $("#pdfPwSkip").addEventListener("click", onSkip);
    dlg.addEventListener("close", onClose);
  });
}

async function handleFiles(fileList, accountId) {
  let files = [...fileList].filter((f) => /\.(pdf|txt)$/i.test(f.name) || f.type === "application/pdf");
  if (!files.length) { toast("Please choose PDF statement files.", "error"); return; }
  if (!state.accounts.length) { toast("Add a brokerage account before uploading statements.", "info"); openAccountDialog(); return; }
  if (files.length > 12) { toast("Uploading the first 12 files. Add the rest in a second batch.", "info"); files = files.slice(0, 12); }
  const tooBig = files.filter((f) => f.size > 15 * 1048576);
  if (tooBig.length) { toast(`${tooBig.map((f) => f.name).join(", ")} is over 15 MB and was skipped.`, "error"); files = files.filter((f) => !tooBig.includes(f)); }
  if (!files.length) return;

  const locked = [];
  for (const f of files) if (await isEncryptedPdf(f)) locked.push(f);
  let passwords = {};
  if (locked.length) {
    const answer = await askPasswords(locked.map((file) => ({ file, reason: "required" })));
    if (!answer) return; // cancelled
    if (answer.skip) files = files.filter((f) => !locked.includes(f));
    else passwords = answer.passwords;
  }
  await uploadBatch(files, accountId, passwords);
}

async function uploadBatch(files, accountId, passwords, round = 0) {
  if (!files.length) { toast("Nothing left to upload.", "info"); return; }
  const dlg = $("#parsingDlg");
  $("#parsingStatus").textContent = `Extracting NAV, trades, cash movements and positions from ${files.length} file${files.length > 1 ? "s" : ""}.`;
  dlg.showModal();
  const fd = new FormData();
  fd.append("account_id", accountId || "");
  fd.append("passwords", JSON.stringify(passwords || {}));
  files.forEach((f) => fd.append("files", f, f.name));
  let res;
  try {
    res = await api("/api/statements/upload", { method: "POST", body: fd, timeout: 120000 });
  } catch (err) {
    dlg.close();
    const errs = err.data?.errors || [];
    if (errs.length) errs.forEach((e) => toast(`${e.filename}: ${e.error}`, "error", 8000));
    else toast(err.message, "error", 8000);
    return;
  }
  dlg.close();
  (res.errors || []).forEach((e) => toast(`${e.filename}: ${e.error}`, "error", 8000));
  if (res.uploaded_count) {
    const periods = (res.results || []).map((r) => r.period).filter(Boolean).join(", ");
    toast(`Read ${res.uploaded_count} statement${res.uploaded_count > 1 ? "s" : ""}${periods ? `: ${periods}` : ""}`, "success");
    state.activeStatementId = res.statement_id;
    await refreshData();
  }
  const locked = res.locked || [];
  if (locked.length && round < 5) {
    const byName = new Map(files.map((f) => [f.name, f]));
    const entries = locked.map((l) => ({ file: byName.get(l.filename), reason: l.reason })).filter((e) => e.file);
    const answer = await askPasswords(entries);
    if (!answer || answer.skip) { toast(`Skipped ${entries.length} locked file${entries.length > 1 ? "s" : ""}.`, "info"); return; }
    await uploadBatch(entries.map((e) => e.file), accountId, answer.passwords, round + 1);
  }
}

function bindDropzone(zone) {
  const key = zone.dataset.dropzone;
  const input = $(`[data-file-input="${key}"]`);
  const select = key === "quick" ? $("#quickAccountSelect") : $("#stmtAccountSelect");
  const open = () => input.click();
  zone.addEventListener("click", (e) => { if (e.target !== input) open(); });
  zone.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  input.addEventListener("change", async () => {
    const files = [...input.files];
    input.value = "";
    if (files.length) await handleFiles(files, select.value);
  });
  let depth = 0;
  zone.addEventListener("dragenter", (e) => { e.preventDefault(); depth++; zone.classList.add("drag"); });
  zone.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
  zone.addEventListener("dragleave", () => { depth = Math.max(0, depth - 1); if (!depth) zone.classList.remove("drag"); });
  zone.addEventListener("drop", async (e) => {
    e.preventDefault();
    depth = 0;
    zone.classList.remove("drag");
    if (e.dataTransfer?.files?.length) await handleFiles(e.dataTransfer.files, select.value);
  });
}

/* ------------------------------------------------------------------ admin */
async function loadAdmin() {
  const data = await api("/api/admin/overview");
  const users = data.users || [];
  const st = data.stats || {};
  $("#adminStats").innerHTML = [
    kpiTile({ label: "Users", value: num(st.total_users), sub: "Registered workspaces", ico: "user" }),
    kpiTile({ label: "Accounts", value: num(st.total_accounts), sub: "Brokerage cards", ico: "wallet", tone: "kpi-icon--sage" }),
    kpiTile({ label: "Statements", value: num(st.total_statements), sub: "Uploaded PDFs", ico: "file" }),
    kpiTile({ label: "Journal entries", value: num(st.total_transactions), sub: "All users", ico: "book", tone: "kpi-icon--sage" }),
  ].join("").replaceAll(" reveal", "");
  $("#adminUsers").innerHTML = users.length ? users.map((u) => `
    <article class="admin-user">
      <div class="admin-user-top"><img src="${avatarSrc(u.avatar)}" alt="" width="46" height="46" loading="lazy" />
        <div style="min-width:0"><strong>${esc(u.display_name || u.username)}</strong><span>@${esc(u.username)} · ${esc(u.email || "no email")}</span></div></div>
      <div class="admin-meta">
        <div><span>Last login</span><b>${esc(u.last_login || "—")}</b></div>
        <div><span>Joined</span><b>${esc(u.created_at || "—")}</b></div>
        <div><span>Accounts · entries</span><b>${num(u.accounts_count)} · ${num(u.transactions_count)}</b></div>
        <div><span>Last statement</span><b>${esc(u.last_statement_period || "—")}</b></div>
      </div>
      <div class="admin-user-foot">
        ${u.is_admin ? `<span class="chip chip--accent">${icon("shield", "ico--sm")}Admin</span>` : `<span class="chip">${esc(u.base_currency || "MYR")}</span>`}
        ${u.is_admin ? "" : `<button type="button" class="btn btn--danger-ghost btn--sm" data-admin-del="${esc(u.id)}" data-name="${esc(u.display_name || u.username)}">${icon("trash")}Remove</button>`}
      </div>
    </article>`).join("") : `<div class="empty">${icon("user")}<strong>No users yet</strong></div>`;
  const sug = data.suggestions || [];
  $("#adminSuggestions").innerHTML = sug.length ? sug.map((s) => `
    <article class="suggestion">
      <div class="suggestion-head"><span class="chip">${esc(s.category || "Note")}</span><span>${esc(s.created_at || "")}</span></div>
      <p><b>${esc(s.author || "Admin")}</b> · ${esc(s.message)}</p>
      <div style="text-align:right"><button type="button" class="btn btn--danger-ghost btn--sm" data-sug-del="${esc(s.id)}">${icon("trash")}Delete</button></div>
    </article>`).join("") : `<div class="empty">${icon("info")}<strong>No notes yet</strong></div>`;
}

/* ------------------------------------------------------------------ tour */
const TOUR_STEPS = [
  { title: "Welcome to TradeDesk", body: "A quick 60-second tour of your new trading journal. Use the arrow keys or the buttons below, and press Esc to skip any time." },
  { target: "#primaryNav", title: "Everything lives up top", body: "Switch between Overview, Performance, Statements and Journal from this bar. It stays with you as you scroll." },
  { target: "#tourNav", before: () => go("overview"), title: "Your net asset value", body: "Your total NAV across every account, converted to your base currency, with net return against the capital you’ve put in." },
  { target: "#kpiGrid", title: "The numbers that matter", body: "Net return, realised profit with dividends, win rate and cash reserve, all updated automatically from your statements and journal." },
  { target: "#tourAccounts", title: "One card per broker", body: "Each brokerage account gets its own card with balance, trend and quick actions. Add as many as you trade with." },
  { target: "#tourReader", title: "Drop in your statement", body: "Drag your monthly PDF here. TradeDesk reads NAV, trades, fees and positions for you. If the PDF is password-protected, a card will ask for the password once." },
  { target: "#tourGoals", title: "Goals that track themselves", body: "Link a goal to NAV, profit, win rate or cash and its progress ring fills itself in." },
  { target: "#btnLogTrade", title: "Log a trade anytime", body: "Record buys, sells, deposits, dividends and fees by hand, with a note on why you took the trade." },
  { target: "#btnPrivacy", title: "Privacy blur", body: "Sharing your screen? One click blurs every balance." },
  { target: "#btnUserMenu", title: "Make it yours", body: "Change your avatar, profile, theme or replay this tour from your account menu. Happy trading!" },
];
function go(view) {
  if (state.view !== view) location.hash = `#/${view}`;
  return sleep(state.view !== view ? 260 : 0);
}
function maybeStartTour() {
  const uid = state.user?.id;
  if (!uid || store.get(`td_tour_done:${uid}`)) return;
  const isNew = state.justRegistered || (!state.statements.length && !state.txs.length);
  if (isNew) setTimeout(() => tour.start(), reduceMotion() ? 100 : 700);
}

/* ------------------------------------------------------------------ events */
function bindPwEyes(root = document) {
  $$(".pw-eye", root).forEach((btn) => {
    btn.onclick = () => {
      const input = document.getElementById(btn.dataset.togglePw);
      if (!input) return;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
      btn.innerHTML = icon(show ? "eye-off" : "eye");
    };
  });
}

function bindEvents() {
  // Auth
  $$("[data-auth-mode]").forEach((b) => (b.onclick = () => setAuthMode(b.dataset.authMode)));
  $("#loginForm").addEventListener("submit", onLogin);
  $("#registerForm").addEventListener("submit", onRegister);
  $("#adminLoginForm").addEventListener("submit", onAdminLogin);
  $("#btnForgotPassword").onclick = () => {
    $("#forgotIdent").value = $("#loginUsername").value.trim();
    $("#forgotResult").hidden = true;
    $("#forgotDlg").showModal();
  };
  $("#forgotForm").addEventListener("submit", onForgot);
  $("#resetForm").addEventListener("submit", onReset);
  $("#resetCancel").onclick = () => { clearResetHash(); setAuthMode("login"); };
  // Gentle parallax on the sign-in photo (pointer devices only).
  const photo = $(".auth-photo img");
  if (!matchMedia("(pointer: coarse)").matches) {
    $("#authPage").addEventListener("pointermove", (e) => {
      if (reduceMotion()) return;
      const x = (e.clientX / innerWidth - 0.5) * -14, y = (e.clientY / innerHeight - 0.5) * -10;
      photo.style.setProperty("--px", `${x.toFixed(1)}px`);
      photo.style.setProperty("--py", `${y.toFixed(1)}px`);
    });
  }
  bindPwEyes();

  // Dialog close buttons
  document.addEventListener("click", (e) => {
    const c = e.target.closest("[data-close]");
    if (c) c.closest("dialog")?.close();
  });
  // Click on the backdrop closes non-critical dialogs.
  $$("dialog.dlg").forEach((d) => d.addEventListener("click", (e) => {
    if (e.target === d && d.id !== "parsingDlg" && d.id !== "pdfPasswordDlg") d.close();
  }));
  $("#parsingDlg").addEventListener("cancel", (e) => e.preventDefault());

  // Nav
  window.addEventListener("hashchange", () => {
    const token = resetTokenFromHash();
    if (token) { state.resetToken = token; showAuth(); setAuthMode("reset"); return; }
    if (!$("#appPage").hidden) navigateFromHash();
  });
  window.addEventListener("resize", () => requestAnimationFrame(moveNavPill));
  document.fonts?.ready.then(moveNavPill);

  // Topbar
  $("#btnPrivacy").onclick = () => {
    const on = document.body.classList.toggle("private");
    store.set("td_private", on ? "1" : "");
    $("#btnPrivacy").setAttribute("aria-pressed", String(on));
    $("#btnPrivacy").setAttribute("aria-label", on ? "Show balances" : "Hide balances");
    $("#btnPrivacy").dataset.tip = on ? "Show balances" : "Hide balances";
    $("#btnPrivacy").innerHTML = icon(on ? "eye-off" : "eye");
  };
  if (store.get("td_private")) $("#btnPrivacy").click();
  $("#btnExport").onclick = openExport;
  $("#btnRefresh").onclick = async () => { try { await refreshData(); toast("Up to date", "success", 2500); } catch (err) { toast(err.message, "error"); } };
  $("#btnLogTrade").onclick = () => openJournalDialog({ type: "BUY" });
  $("#btnUserMenu").onclick = (e) => { e.stopPropagation(); $("#userMenu").hidden ? openUserMenu() : closeUserMenu(); };
  document.addEventListener("click", (e) => { if (!e.target.closest("#userMenu, #btnUserMenu")) closeUserMenu(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#userMenu").hidden) { closeUserMenu(); $("#btnUserMenu").focus(); } });
  $("#menuProfile").onclick = () => { closeUserMenu(); openProfileDialog(); };
  $("#menuTour").onclick = () => { closeUserMenu(); tour.start(); };
  $("#menuExport").onclick = () => { closeUserMenu(); openExport(); };
  $("#menuAdmin").onclick = async () => {
    closeUserMenu();
    state.mode = "admin";
    saveSession();
    await enterAdmin();
  };
  $("#menuLogout").onclick = () => { closeUserMenu(); logout(); };
  $$("[data-theme-val]").forEach((b) => (b.onclick = () => applyTheme(b.dataset.themeVal)));

  // Delegated actions inside the app
  $("#appPage").addEventListener("click", async (e) => {
    const t = e.target.closest("button, a");
    if (!t) return;
    const d = t.dataset;
    if (d.action === "add-account") openAccountDialog();
    else if (d.action === "add-goal") openGoalDialog();
    else if (d.action === "log-trade") openJournalDialog({ type: "BUY" });
    else if (d.accEdit) openAccountDialog(state.accounts.find((a) => a.id === d.accEdit));
    else if (d.accDel) { const a = state.accounts.find((x) => x.id === d.accDel); if (a) deleteAccount(a); }
    else if (d.accLog) openJournalDialog({ account_id: d.accLog, type: "BUY" });
    else if (d.accUpload) { $("#stmtAccountSelect").value = d.accUpload; location.hash = "#/statements"; }
    else if (d.goalEdit) openGoalDialog((state.summary.goals || []).find((g) => String(g.id) === d.goalEdit));
    else if (d.openStmt) { state.activeStatementId = Number(d.openStmt); renderLatestStatement(); renderStatementTabs(); location.hash = "#/statements"; renderStatementReport(); }
    else if (d.stmtTab) { state.activeStatementId = Number(d.stmtTab); renderStatementTabs(); renderStatementReport(); renderLatestStatement(); }
    else if (d.delStmt) {
      const st = state.statements.find((s) => String(s.id) === d.delStmt);
      const ok = await confirmDialog({ title: `Delete ${st?.period || "this"} statement?`, body: "Its imported trades and cash entries are removed from the ledger too.", ok: "Delete statement" });
      if (!ok) return;
      try { await api(`/api/statements/${encodeURIComponent(d.delStmt)}`, { method: "DELETE" }); state.activeStatementId = null; toast("Statement deleted", "success"); await refreshData(); }
      catch (err) { toast(err.message, "error"); }
    } else if (d.txEdit) openJournalDialog(state.txs.find((x) => String(x.id) === d.txEdit));
    else if (d.txDel) {
      const ok = await confirmDialog({ title: "Delete this entry?", body: "The journal entry will be removed and your totals recalculated.", ok: "Delete entry" });
      if (!ok) return;
      try { await api(`/api/transactions/${encodeURIComponent(d.txDel)}`, { method: "DELETE" }); toast("Entry deleted", "success"); await refreshData(); }
      catch (err) { toast(err.message, "error"); }
    } else if (d.scroll) {
      const g = $("#accountsGrid");
      g.scrollBy({ left: Number(d.scroll) * (g.clientWidth * 0.8), behavior: reduceMotion() ? "auto" : "smooth" });
    }
  });

  // Account dialog
  $("#accountForm").addEventListener("submit", saveAccount);
  $("#accBroker").onchange = () => {
    const f = $("#accountForm");
    if (f.id.value) return;
    const d = BROKER_DEFAULTS[f.broker.value];
    if (d.name) f.name.value = d.name;
    f.url.value = d.url;
    renderSwatches(d.color);
    $$("#accCurrencies input").forEach((cb) => (cb.checked = d.curs.includes(cb.value)));
  };
  $("#btnDeleteAccount").onclick = () => { const a = state.accounts.find((x) => x.id === $("#accountForm").id.value); if (a) deleteAccount(a); };

  // Goals
  $("#btnAddGoal").onclick = () => openGoalDialog();
  $("#goalForm").addEventListener("submit", saveGoal);
  $("#goalMetric").onchange = syncGoalFields;

  // Journal
  $$("#jnlTypeSeg button").forEach((b) => (b.onclick = () => setJournalType(b.dataset.type)));
  $("#jnlAccount").onchange = () => syncJournalCurrencies();
  $("#journalForm").addEventListener("submit", saveJournal);
  $("#txSearch").addEventListener("input", renderTransactions);
  $("#txAccountFilter").onchange = reloadTransactions;
  $("#btnImportCsv").onclick = () => $("#csvFileInput").click();
  $("#csvFileInput").onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const res = await api("/api/import", { method: "POST", body: { csv: await file.text() } });
      toast(`Imported ${res.imported} entr${res.imported === 1 ? "y" : "ies"}`, "success");
      (res.errors || []).slice(0, 3).forEach((m) => toast(m, "error", 7000));
      await refreshData();
    } catch (err) { toast(err.message, "error"); }
  };

  // Profile
  $("#profileForm").addEventListener("submit", saveProfile);

  // Overview / performance controls
  const segs = (sel, attr, fn) => $$(`${sel} button`).forEach((b) => (b.onclick = () => {
    $$(`${sel} button`).forEach((x) => x.classList.toggle("on", x === b));
    fn(b.dataset[attr]);
  }));
  segs("#overviewPeriodSeg", "p", (v) => { state.overviewPeriod = v; renderCharts(); });
  segs("#allocSeg", "a", (v) => { state.allocMode = v; renderCharts(); });
  segs("#detailPeriodSeg", "dp", (v) => { state.detailPeriod = v; renderPerformance(); });
  $("#perfAccountFilter").onchange = renderPerformance;
  $("#holdAccountFilter").onchange = renderHoldings;

  // Uploads
  $$("[data-dropzone]").forEach(bindDropzone);
  // Don't let a missed drop navigate the browser away to the PDF.
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => { if (!e.target.closest("[data-dropzone]")) e.preventDefault(); });

  // Export
  $("#exportTabs").addEventListener("click", (e) => { const b = e.target.closest("[data-exp]"); if (b) { state.exportMonth = b.dataset.exp; renderExport(); } });
  $("#btnExportOne").onclick = () => {
    const m = state.exportData.months.find((x) => x.month === state.exportMonth);
    if (m) { downloadText(m.filename, m.csv); toast(`Downloaded ${m.filename}`, "success"); }
  };
  $("#btnExportAll").onclick = () => {
    const months = state.exportData.months;
    months.forEach((m, i) => setTimeout(() => downloadText(m.filename, m.csv), i * 250));
    toast(`Downloading ${months.length} file${months.length > 1 ? "s" : ""}`, "success");
  };

  // Admin
  $("#btnAdminRefresh").onclick = async () => { try { await loadAdmin(); toast("Refreshed", "success", 2000); } catch (err) { toast(err.message, "error"); } };
  $("#btnAdminLogout").onclick = logout;
  $("#btnAdminToApp").onclick = async () => { state.mode = "user"; saveSession(); await enterWorkspace({ firstTime: false }); };
  $("#adminPage").addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.adminDel) {
      const ok = await confirmDialog({ title: `Remove ${b.dataset.name}?`, body: "Their account, statements and journal are permanently deleted.", ok: "Remove user" });
      if (!ok) return;
      try { await api(`/api/admin/users/${encodeURIComponent(b.dataset.adminDel)}`, { method: "DELETE" }); toast("User removed", "success"); await loadAdmin(); }
      catch (err) { toast(err.message, "error"); }
    } else if (b.dataset.sugDel) {
      try { await api(`/api/admin/suggestions/${encodeURIComponent(b.dataset.sugDel)}`, { method: "DELETE" }); await loadAdmin(); }
      catch (err) { toast(err.message, "error"); }
    }
  });
  $("#adminSuggestionForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    try { await api("/api/admin/suggestions", { method: "POST", body }); e.target.message.value = ""; toast("Note added", "success"); await loadAdmin(); }
    catch (err) { toast(err.message, "error"); }
  });
}

/* ------------------------------------------------------------------ boot */
async function boot() {
  $$("[data-version]").forEach((el) => (el.textContent = `v${APP_VERSION}`));
  $("#year").textContent = new Date().getFullYear();
  setupChartDefaults();
  bgField = createField($("#fieldBg"));
  tour = createTour({
    steps: TOUR_STEPS,
    onFinish: () => { if (state.user?.id) store.set(`td_tour_done:${state.user.id}`, "1"); },
  });
  applyTheme(themePref());
  renderAvatarPicker($("#registerAvatarPicker"), $("#registerAvatarInput"), "av-1");
  bindEvents();
  $$("[data-itext]").forEach(interactive);
  updateGreeting();
  setInterval(updateGreeting, 15000);
  console.info(`TradeDesk v${APP_VERSION}`);

  const resetToken = resetTokenFromHash();
  if (resetToken) {
    state.resetToken = resetToken;
    showAuth();
    setAuthMode("reset");
    return;
  }

  const saved = loadSession();
  if (saved?.token && API_CONFIGURED) {
    state.token = saved.token;
    state.mode = saved.mode === "admin" ? "admin" : "user";
    try {
      state.user = await api("/api/auth/me", { quiet401: true, timeout: 70000 });
      if (state.mode === "admin" && state.user.is_admin) await enterAdmin();
      else { state.mode = "user"; await enterWorkspace({ firstTime: false }); }
      return;
    } catch (err) {
      if (err.status === 401) clearSession();
      else { toast(err.message, "error", 8000); }
    }
  }
  showAuth();
  setAuthMode("login");
}

boot();
