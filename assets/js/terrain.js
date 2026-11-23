/* ==========================================================================
   Interactive topographic background.
   A slowly drifting noise "landscape" drawn as contour lines (marching
   squares). The pointer raises a soft hill, so contour rings gather around
   the cursor. Every 4th line is an "index contour", like a real topo map.
   - Runs ~30fps, paused when the tab is hidden or the canvas is off.
   - DPR capped at 1.5; grid resolution scales with viewport.
   - prefers-reduced-motion: renders one still frame and stays static.
   ========================================================================== */

// ---- Simplex noise 3D (Stefan Gustavson, public domain), compact form ----
const G3 = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
const perm = new Uint8Array(512);
(function seed() {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = 1337;
  for (let i = 255; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
})();
const F3 = 1 / 3, G3c = 1 / 6;
function noise3(x, y, z) {
  const s = (x + y + z) * F3;
  const i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s);
  const t = (i + j + k) * G3c;
  const x0 = x - i + t, y0 = y - j + t, z0 = z - k + t;
  let i1, j1, k1, i2, j2, k2;
  if (x0 >= y0) {
    if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
    else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
  } else {
    if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
    else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
    else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
  }
  const x1 = x0 - i1 + G3c, y1 = y0 - j1 + G3c, z1 = z0 - k1 + G3c;
  const x2 = x0 - i2 + 2 * G3c, y2 = y0 - j2 + 2 * G3c, z2 = z0 - k2 + 2 * G3c;
  const x3 = x0 - 1 + 0.5, y3 = y0 - 1 + 0.5, z3 = z0 - 1 + 0.5;
  const ii = i & 255, jj = j & 255, kk = k & 255;
  const corner = (gi, cx, cy, cz) => {
    let tt = 0.6 - cx * cx - cy * cy - cz * cz;
    if (tt < 0) return 0;
    const g = G3[gi % 12];
    tt *= tt;
    return tt * tt * (g[0] * cx + g[1] * cy + g[2] * cz);
  };
  return 32 * (
    corner(perm[ii + perm[jj + perm[kk]]], x0, y0, z0) +
    corner(perm[ii + i1 + perm[jj + j1 + perm[kk + k1]]], x1, y1, z1) +
    corner(perm[ii + i2 + perm[jj + j2 + perm[kk + k2]]], x2, y2, z2) +
    corner(perm[ii + 1 + perm[jj + 1 + perm[kk + 1]]], x3, y3, z3)
  );
}

export function createTerrain(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { start() {}, stop() {}, refreshColors() {} };

  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const coarse = matchMedia("(pointer: coarse)").matches;
  let w = 0, h = 0, dpr = 1, cell = 16, cols = 0, rows = 0;
  let field = new Float32Array(0);
  let raf = 0, running = false, last = 0, t = Math.random() * 100;
  const pointer = { x: -9999, y: -9999, tx: -9999, ty: -9999, strength: 0, target: 0 };
  let rgb = "122, 78, 45", alpha = 0.14;

  function refreshColors() {
    const cs = getComputedStyle(document.documentElement);
    rgb = cs.getPropertyValue("--terrain-line").trim() || rgb;
    alpha = parseFloat(cs.getPropertyValue("--terrain-alpha")) || alpha;
    if (!running || reduce.matches) draw();
  }

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.25 : 1.5);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    cell = w < 700 ? 20 : 16;
    cols = Math.ceil(w / cell) + 2;
    rows = Math.ceil(h / cell) + 2;
    field = new Float32Array(cols * rows);
    if (!running || reduce.matches) draw();
  }

  function sample() {
    const sc = 0.0021;
    const px = pointer.x, py = pointer.y, ps = pointer.strength;
    const sigma = Math.min(w, h) * 0.16;
    const inv2s2 = 1 / (2 * sigma * sigma);
    let k = 0;
    for (let r = 0; r < rows; r++) {
      const y = (r - 1) * cell;
      for (let c = 0; c < cols; c++) {
        const x = (c - 1) * cell;
        let v = noise3(x * sc, y * sc, t) * 0.72 + noise3(x * sc * 2.3, y * sc * 2.3, t * 1.6 + 40) * 0.28;
        if (ps > 0.001) {
          const dx = x - px, dy = y - py;
          v += ps * 0.95 * Math.exp(-(dx * dx + dy * dy) * inv2s2);
        }
        field[k++] = v;
      }
    }
  }

  // Marching squares over the sampled field, batching segments per level.
  function draw() {
    if (!w) return;
    sample();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = "round";
    const levels = 14;
    for (let L = 0; L < levels; L++) {
      const iso = -0.85 + (L * 1.9) / (levels - 1);
      const index = L % 4 === 0;
      ctx.beginPath();
      for (let r = 0; r < rows - 1; r++) {
        const y0 = (r - 1) * cell;
        for (let c = 0; c < cols - 1; c++) {
          const i = r * cols + c;
          const a = field[i], b = field[i + 1], d = field[i + cols], e = field[i + cols + 1];
          let idx = 0;
          if (a > iso) idx |= 8;
          if (b > iso) idx |= 4;
          if (e > iso) idx |= 2;
          if (d > iso) idx |= 1;
          if (idx === 0 || idx === 15) continue;
          const x0 = (c - 1) * cell;
          const top = x0 + cell * ((iso - a) / (b - a));
          const right = y0 + cell * ((iso - b) / (e - b));
          const bottom = x0 + cell * ((iso - d) / (e - d));
          const left = y0 + cell * ((iso - a) / (d - a));
          const seg = (x1, y1, x2, y2) => { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); };
          switch (idx) {
            case 1: case 14: seg(x0, left, bottom, y0 + cell); break;
            case 2: case 13: seg(bottom, y0 + cell, x0 + cell, right); break;
            case 3: case 12: seg(x0, left, x0 + cell, right); break;
            case 4: case 11: seg(top, y0, x0 + cell, right); break;
            case 5: seg(x0, left, top, y0); seg(bottom, y0 + cell, x0 + cell, right); break;
            case 6: case 9: seg(top, y0, bottom, y0 + cell); break;
            case 7: case 8: seg(x0, left, top, y0); break;
            case 10: seg(top, y0, x0 + cell, right); seg(x0, left, bottom, y0 + cell); break;
          }
        }
      }
      ctx.strokeStyle = `rgba(${rgb}, ${index ? alpha * 1.9 : alpha})`;
      ctx.lineWidth = index ? 1.25 : 0.8;
      ctx.stroke();
    }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (now - last < 33) return; // ~30fps is plenty for a slow landscape
    const dt = Math.min(0.1, (now - last) / 1000 || 0.033);
    last = now;
    t += dt * 0.045;
    // Ease the pointer and its hill strength; never snap.
    pointer.x += (pointer.tx - pointer.x) * 0.12;
    pointer.y += (pointer.ty - pointer.y) * 0.12;
    pointer.strength += (pointer.target - pointer.strength) * 0.06;
    draw();
  }

  function onMove(e) {
    pointer.tx = e.clientX;
    pointer.ty = e.clientY;
    if (pointer.x < -9000) { pointer.x = pointer.tx; pointer.y = pointer.ty; }
    pointer.target = 1;
  }
  function onLeave() { pointer.target = 0; }

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
  document.addEventListener("pointerleave", onLeave);
  window.addEventListener("blur", onLeave);
  document.addEventListener("visibilitychange", () => {
    if (!running || reduce.matches) return;
    if (document.hidden) cancelAnimationFrame(raf);
    else { last = performance.now(); raf = requestAnimationFrame(frame); }
  });
  reduce.addEventListener?.("change", () => { if (running) { cancelAnimationFrame(raf); running = false; start(); } });

  resize();
  refreshColors();
  return { start, stop, refreshColors };
}
