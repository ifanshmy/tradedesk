/* ==========================================================================
   Interactive dot-field background.
   A quiet matrix of dots with a slow diagonal light wave ("market pulse").
   Near the pointer, dots swell, push outward like a lens and warm to the
   accent colour. Clicking sends out a ripple.
   - ~30fps, paused when the tab is hidden or the field is stopped.
   - DPR capped (1.5 desktop / 1.25 touch).
   - prefers-reduced-motion: one still frame, no animation.
   ========================================================================== */

export function createField(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { start() {}, stop() {}, refreshColors() {} };

  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const coarse = matchMedia("(pointer: coarse)").matches;
  let w = 0, h = 0, dpr = 1, gap = 26;
  let xs = new Float32Array(0), ys = new Float32Array(0);
  let raf = 0, running = false, last = 0, t = 0;
  const ptr = { x: -9999, y: -9999, tx: -9999, ty: -9999, s: 0, ts: 0 };
  const ripples = [];
  let base = [15, 16, 19], hot = [255, 91, 46], alpha = 0.13;

  const parse = (v, d) => (v ? v.split(",").map((n) => parseFloat(n)) : d);
  function refreshColors() {
    const cs = getComputedStyle(document.documentElement);
    base = parse(cs.getPropertyValue("--dot").trim(), base);
    hot = parse(cs.getPropertyValue("--dot-hot").trim(), hot);
    alpha = parseFloat(cs.getPropertyValue("--dot-alpha")) || alpha;
    if (!running || reduce.matches) draw();
  }

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.25 : 1.5);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    gap = w < 700 ? 30 : 26;
    const cols = Math.ceil(w / gap) + 1, rows = Math.ceil(h / gap) + 1;
    const ox = (w - (cols - 1) * gap) / 2, oy = (h - (rows - 1) * gap) / 2;
    xs = new Float32Array(cols * rows);
    ys = new Float32Array(cols * rows);
    let k = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { xs[k] = ox + c * gap; ys[k] = oy + r * gap; k++; }
    if (!running || reduce.matches) draw();
  }

  function draw() {
    if (!w) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const sigma = Math.min(170, Math.max(110, Math.min(w, h) * 0.16));
    const inv = 1 / (2 * sigma * sigma);
    const ps = ptr.s;
    const TAU = Math.PI * 2;
    for (let i = 0; i < xs.length; i++) {
      let x = xs[i], y = ys[i];
      // Slow diagonal light wave.
      const wave = Math.pow((Math.sin(t * 0.9 - (x * 0.0045 + y * 0.0028)) + 1) / 2, 4);
      // Pointer lens.
      let f = 0;
      if (ps > 0.01) {
        const dx = x - ptr.x, dy = y - ptr.y;
        const d2 = dx * dx + dy * dy;
        f = ps * Math.exp(-d2 * inv);
        if (f > 0.004) {
          const d = Math.sqrt(d2) || 1;
          const push = f * 16;
          x += (dx / d) * push;
          y += (dy / d) * push;
        }
      }
      // Ripples.
      let rp = 0;
      for (const rr of ripples) {
        const dd = Math.abs(Math.hypot(xs[i] - rr.x, ys[i] - rr.y) - rr.r);
        if (dd < 34) rp = Math.max(rp, (1 - dd / 34) * rr.life);
      }
      const heat = Math.min(1, f + rp);
      const radius = 1 + wave * 0.6 + heat * 2.4;
      const a = Math.min(1, alpha * (1 + wave * 1.6) + heat * 0.55);
      const r = base[0] + (hot[0] - base[0]) * heat;
      const g = base[1] + (hot[1] - base[1]) * heat;
      const b = base[2] + (hot[2] - base[2]) * heat;
      ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, TAU);
      ctx.fill();
    }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (now - last < 33) return;
    const dt = Math.min(0.1, (now - last) / 1000 || 0.033);
    last = now;
    t += dt;
    ptr.x += (ptr.tx - ptr.x) * 0.16;
    ptr.y += (ptr.ty - ptr.y) * 0.16;
    ptr.s += (ptr.ts - ptr.s) * 0.08;
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rr = ripples[i];
      rr.r += 520 * dt;
      rr.life -= dt * 0.9;
      if (rr.life <= 0) ripples.splice(i, 1);
    }
    draw();
  }

  function onMove(e) {
    ptr.tx = e.clientX;
    ptr.ty = e.clientY;
    if (ptr.x < -9000) { ptr.x = ptr.tx; ptr.y = ptr.ty; }
    ptr.ts = 1;
  }
  function onLeave() { ptr.ts = 0; }
  function onDown(e) {
    if (!running || reduce.matches) return;
    if (ripples.length > 4) ripples.shift();
    ripples.push({ x: e.clientX, y: e.clientY, r: 0, life: 1 });
  }

  function start() {
    canvas.classList.add("on");
    if (running) return;
    running = true;
    if (reduce.matches) { draw(); return; }
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    canvas.classList.remove("on");
  }

  window.addEventListener("resize", () => { clearTimeout(resize._t); resize._t = setTimeout(resize, 120); });
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerdown", onDown, { passive: true });
  document.addEventListener("pointerleave", onLeave);
  window.addEventListener("blur", onLeave);
  document.addEventListener("visibilitychange", () => {
    if (!running || reduce.matches) return;
    if (document.hidden) cancelAnimationFrame(raf);
    else { last = performance.now(); raf = requestAnimationFrame(frame); }
  });

  resize();
  refreshColors();
  return { start, stop, refreshColors };
}
