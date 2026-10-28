const InkEngine = (() => {
  const module = { exports: {} };
  ('use strict');

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const ENGINE = 'perfect-freehand-1.2.3';
  function pressure(p, e) {
    return Math.pow(
      clamp(
        (p - (e.pressureMin ?? 0)) / Math.max(0.05, (e.pressureMax ?? 1) - (e.pressureMin ?? 0)),
        0,
        1
      ),
      e.pressureGamma ?? 1
    );
  }
  // Spatial resampling makes streamline respond consistently across event rates.
  const sampleCache = new WeakMap();
  function samples(points, spacing = 0.7) {
    if (points.length < 2) return points.map((p) => ({ ...p }));
    let state = sampleCache.get(points),
      resume =
        state &&
        state.count <= points.length &&
        state.last === points[state.count - 1] &&
        state.requested === spacing;
    let length = resume ? state.length : 0;
    for (let i = resume ? state.count : 1; i < points.length; i++)
      length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    const step = Math.max(spacing, length / 20000);
    if (!resume || state.step !== step) {
      state = {
        count: 1,
        last: points[0],
        length: 0,
        requested: spacing,
        step,
        out: [{ ...points[0] }],
        remaining: step
      };
      resume = false;
    }
    for (let i = state.count; i < points.length; i++) {
      let a = points[i - 1],
        b = points[i],
        d = Math.hypot(b.x - a.x, b.y - a.y);
      while (d >= state.remaining && d > 1e-9) {
        const t = state.remaining / d,
          p = {
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t,
            p: a.p + (b.p - a.p) * t,
            t: a.t + (b.t - a.t) * t
          };
        state.out.push(p);
        a = p;
        d -= state.remaining;
        state.remaining = step;
      }
      state.remaining -= d;
    }
    state.count = points.length;
    state.last = points.at(-1);
    state.length = length;
    sampleCache.set(points, state);
    const out = state.out.slice(),
      last = points.at(-1);
    if (Math.hypot(last.x - out.at(-1).x, last.y - out.at(-1).y) > 1e-6) out.push({ ...last });
    return out;
  }
  // Adaptive low-pass filter: attenuate slow jitter, increase cutoff with speed.
  // Convex blending preserves bounds; endpoints stay attached to the pen.
  function stabilize(points, strength) {
    const n = points.length;
    if (n < 5 || strength <= 0.005) return points.map((p) => ({ ...p }));
    const amount = clamp(strength, 0, 1),
      forwardX = new Float64Array(n),
      forwardY = new Float64Array(n);
    const turn = new Float32Array(n);
    const alpha = new Float32Array(n);
    const base = 0.26 + 0.7 * Math.pow(1 - amount, 1.2);
    forwardX[0] = points[0].x;
    forwardY[0] = points[0].y;
    alpha[0] = 1;
    for (let i = 1; i < n; i++) {
      const p = points[i],
        a = points[Math.max(0, i - 3)],
        b = points[Math.min(n - 1, i + 3)];
      const ux = p.x - a.x,
        uy = p.y - a.y,
        vx = b.x - p.x,
        vy = b.y - p.y;
      const den = Math.hypot(ux, uy) * Math.hypot(vx, vy);
      const curvature = den > 1e-7 ? clamp(1 - (ux * vx + uy * vy) / den, 0, 2) : 0;
      turn[i] = curvature;
      const response = clamp(base + 0.75 * Math.min(1, curvature), 0, 1);
      alpha[i] = response;
      forwardX[i] = forwardX[i - 1] + response * (p.x - forwardX[i - 1]);
      forwardY[i] = forwardY[i - 1] + response * (p.y - forwardY[i - 1]);
    }
    let x = forwardX[n - 1],
      y = forwardY[n - 1];
    const out = new Array(n);
    out[n - 1] = { ...points[n - 1] };
    for (let i = n - 2; i >= 0; i--) {
      const p = points[i],
        a = alpha[i];
      x += a * (forwardX[i] - x);
      y += a * (forwardY[i] - y);
      const blend = amount * (1 - 0.94 * Math.min(1, turn[i]));
      out[i] = { ...p, x: p.x + (x - p.x) * blend, y: p.y + (y - p.y) * blend };
    }
    // The writing tip and the initial direction stay exactly under the stylus.
    for (const i of [0, 1, n - 2, n - 1]) out[i] = { ...points[i] };
    return out;
  }
  function protectCorners(raw, filtered, amount = 0) {
    if (!amount) return filtered;
    return filtered.map((p, i) => {
      if (i < 2 || i > raw.length - 3) return p;
      const a = raw[i - 2],
        b = raw[i],
        c = raw[i + 2],
        ux = b.x - a.x,
        uy = b.y - a.y,
        vx = c.x - b.x,
        vy = c.y - b.y,
        den = Math.hypot(ux, uy) * Math.hypot(vx, vy);
      if (den < 1e-8) return p;
      const turn = 1 - clamp((ux * vx + uy * vy) / den, -1, 1),
        w = clamp((turn - 0.15) * amount, 0, 0.85);
      return { ...p, x: p.x * (1 - w) + b.x * w, y: p.y * (1 - w) + b.y * w };
    });
  }
  function outline(e) {
    const raw = samples(e.points),
      xs = e.adaptiveInk ? raw.map((p) => p.x) : [],
      ys = e.adaptiveInk ? raw.map((p) => p.y) : [],
      extent = e.adaptiveInk
        ? Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys)
        : 100,
      factor = e.adaptiveInk ? clamp(extent / 100, 0.15, 1) : 1,
      filtered = stabilize(raw, (e.streamline ?? 0.25) * factor, e.points),
      input = protectCorners(raw, filtered, e.cornerProtection || 0).map((p) => [
        p.x,
        p.y,
        e.pressure ? pressure(p.p, e) : 0.5
      ]);
    return Freehand.getStroke(input, {
      size: e.pressure ? e.width / 2 : e.width,
      thinning: e.pressure ? 1 : 0,
      smoothing: (e.smoothing ?? 0.55) * factor,
      streamline: (e.streamline ?? 0.25) * 0.5 * factor,
      simulatePressure: false,
      easing: e.pressure ? (t) => (e.minWidth ?? 0.2) + (1 - (e.minWidth ?? 0.2)) * t : (t) => t,
      last: true,
      start: { cap: true },
      end: { cap: true }
    });
  }
  function path(e) {
    if (!e.points.length) return '';
    const pts = outline(e);
    if (!pts.length) return '';
    const f = (n) => Number(n.toFixed(3));
    const first = pts[0];
    let d = `M ${f(first[0])} ${f(first[1])} Q`;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i],
        b = pts[(i + 1) % pts.length];
      d += ` ${f(a[0])} ${f(a[1])} ${f((a[0] + b[0]) / 2)} ${f((a[1] + b[1]) / 2)}`;
    }
    return d + ' Z';
  }
  module.exports = { protectCorners, ENGINE, pressure, samples, stabilize, outline, path };

  return module.exports;
})();
