/* ==========================================================================
   Sound effects — synthesized with the Web Audio API (no audio files).
   Short, quiet, musical cues. Off-switch in the profile menu (remembered).
   Browsers only allow audio after a user gesture, so the AudioContext is
   created lazily on the first interaction.
   ========================================================================== */

const KEY = "td_sound_v1";
let ctx = null;
let master = null;
let enabled = true;
try { enabled = localStorage.getItem(KEY) !== "0"; } catch {}

function audio() {
  if (!enabled || document.hidden) return null;
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

/** One enveloped oscillator note. */
function note({ freq, to = null, type = "sine", start = 0, dur = 0.14, vol = 0.07, attack = 0.006 }) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** A short filtered noise burst (soft "whoosh"). */
function whoosh({ start = 0, dur = 0.18, vol = 0.05, from = 900, to = 2600 }) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + start;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 1.4;
  f.frequency.setValueAtTime(from, t0);
  f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

let lastTap = 0;
export const sfx = {
  /** Generic button press: a soft, short tick. */
  tap() {
    const now = performance.now();
    if (now - lastTap < 45) return;
    lastTap = now;
    note({ freq: 1250, to: 900, type: "triangle", dur: 0.05, vol: 0.035, attack: 0.002 });
  },
  /** Moving between pages. */
  nav() { whoosh({ dur: 0.2, vol: 0.04 }); note({ freq: 660, to: 880, type: "sine", dur: 0.12, vol: 0.03, start: 0.02 }); },
  /** Hovering an option (picker). */
  hover() { note({ freq: 1600, type: "sine", dur: 0.04, vol: 0.018, attack: 0.002 }); },
  /** Choosing something. */
  select() { note({ freq: 880, type: "triangle", dur: 0.08, vol: 0.05 }); note({ freq: 1320, type: "sine", dur: 0.12, vol: 0.035, start: 0.05 }); },
  /** Success: rising major third. */
  success() { note({ freq: 784, type: "sine", dur: 0.16, vol: 0.06 }); note({ freq: 988, type: "sine", dur: 0.24, vol: 0.055, start: 0.09 }); },
  /** Error: low, soft double thud. */
  error() { note({ freq: 220, to: 160, type: "triangle", dur: 0.16, vol: 0.07 }); note({ freq: 196, to: 140, type: "triangle", dur: 0.2, vol: 0.06, start: 0.12 }); },
  /** Dialog/menu opens. */
  open() { note({ freq: 520, to: 780, type: "sine", dur: 0.12, vol: 0.035 }); },
  /** Toggle switched on/off. */
  toggle(on) { note({ freq: on ? 700 : 520, to: on ? 1040 : 380, type: "sine", dur: 0.1, vol: 0.045 }); },
  /** Welcome chime after the loader (C major arpeggio). */
  welcome() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note({ freq: f, type: "sine", dur: 0.5, vol: 0.045, start: i * 0.085 })); },
  /** Tour step. */
  step() { note({ freq: 990, type: "sine", dur: 0.09, vol: 0.035 }); },
};

export function isSoundEnabled() { return enabled; }
export function setSoundEnabled(on) {
  enabled = !!on;
  try { localStorage.setItem(KEY, enabled ? "1" : "0"); } catch {}
  if (enabled) sfx.toggle(true);
}
