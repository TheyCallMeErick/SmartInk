const Geometry = (() => {
  const module = { exports: {} };
  ('use strict');
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function pointBounds(points) {
    let x = Infinity,
      y = Infinity,
      r = -Infinity,
      b = -Infinity;
    for (const p of points) {
      x = Math.min(x, p.x);
      y = Math.min(y, p.y);
      r = Math.max(r, p.x);
      b = Math.max(b, p.y);
    }
    return Number.isFinite(x) ? { x, y, w: r - x, h: b - y } : null;
  }
  function expand(b, p) {
    return { x: b.x - p, y: b.y - p, w: b.w + 2 * p, h: b.h + 2 * p };
  }
  function overlaps(a, b) {
    return (
      !!a && !!b && a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y
    );
  }
  function contains(b, p) {
    return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  }
  function segmentDistance(p, a, b) {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  }
  function arrowPoints(e) {
    const l = distance({ x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 }) || 1,
      ux = (e.x1 - e.x2) / l,
      uy = (e.y1 - e.y2) / l,
      h = e.headLength;
    return [
      { x: e.x1, y: e.y1 },
      { x: e.x2, y: e.y2 },
      { x: e.x2 + ux * h - uy * h * 0.55, y: e.y2 + uy * h + ux * h * 0.55 },
      { x: e.x2 + ux * h + uy * h * 0.55, y: e.y2 + uy * h - ux * h * 0.55 }
    ];
  }
  function outline(e, n = 96) {
    if (e.type === 'path') return VectorOps.flatten(e);
    if (e.type === 'region') return e.geometry.flat(2).map(([x, y]) => ({ x, y }));
    if (['image', 'text'].includes(e.type)) {
      const c = imageCorners(e);
      return [...c, c[0]];
    }
    if (e.type === 'stroke') return e.points;
    if ((e.type === 'line' || e.type === 'arrow') && e.connector) return connectorOutline(e);
    if (e.type === 'line')
      return [
        { x: e.x1, y: e.y1 },
        { x: e.x2, y: e.y2 }
      ];
    if (e.type === 'arrow') {
      const p = arrowPoints(e);
      return [p[0], p[1], p[2], p[1], p[3]];
    }
    if (e.type === 'circle' || e.type === 'ellipse') {
      const rx = e.r ?? e.rx,
        ry = e.r ?? e.ry,
        a = e.angle || 0,
        c = Math.cos(a),
        s = Math.sin(a);
      return Array.from({ length: n + 1 }, (_, i) => {
        const t = (i / n) * Math.PI * 2,
          x = rx * Math.cos(t),
          y = ry * Math.sin(t);
        return { x: e.cx + x * c - y * s, y: e.cy + x * s + y * c };
      });
    }
    return [...e.corners, e.corners[0]];
  }
  function elementBounds(e) {
    let b;
    if (e.type === 'ellipse') {
      const a = e.angle || 0,
        dx = Math.hypot(e.rx * Math.cos(a), e.ry * Math.sin(a)),
        dy = Math.hypot(e.rx * Math.sin(a), e.ry * Math.cos(a));
      b = { x: e.cx - dx, y: e.cy - dy, w: 2 * dx, h: 2 * dy };
    } else b = pointBounds(outline(e));
    if (b && e.connector && e.label) {
      const p = connectorLabelPoint(e),
        half = e.label.length * 5;
      b = pointBounds([
        { x: b.x, y: b.y },
        { x: b.x + b.w, y: b.y + b.h },
        { x: p.x - half, y: p.y - 25 },
        { x: p.x + half, y: p.y + 2 }
      ]);
    }
    return b ? expand(b, e.width || 0) : null;
  }
  function bounds(elements) {
    const pts = [];
    for (const e of elements) {
      const b = elementBounds(e);
      if (b) pts.push({ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h });
    }
    return pointBounds(pts);
  }
  function hit(e, p, tolerance, interior = false) {
    if (erased(e, p)) return false;
    if (e.type === 'region') {
      if (interior && Visible.contains(e.geometry, p)) return true;
      return VectorOps.rings(e).some((r) =>
        r.some((q, i) => i && segmentDistance(p, r[i - 1], q) <= tolerance + e.width)
      );
    }
    if (e.type === 'path' && e.closed && interior && insidePolygon(p, outline(e))) return true;
    const b = elementBounds(e);
    if (!b || !contains(expand(b, tolerance), p)) return false;
    if (interior && ['circle', 'ellipse'].includes(e.type)) {
      const a = -(e.angle || 0),
        x = (p.x - e.cx) * Math.cos(a) - (p.y - e.cy) * Math.sin(a),
        y = (p.x - e.cx) * Math.sin(a) + (p.y - e.cy) * Math.cos(a);
      if ((x / (e.r ?? e.rx)) ** 2 + (y / (e.r ?? e.ry)) ** 2 <= 1) return true;
    }
    const pts = outline(e);
    if (interior && ['rectangle', 'triangle', 'polygon'].includes(e.type)) {
      let inside = false;
      for (let i = 0, j = e.corners.length - 1; i < e.corners.length; j = i++) {
        const a = e.corners[i],
          b = e.corners[j];
        if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
          inside = !inside;
      }
      if (inside) return true;
    }
    if (pts.length === 1) return distance(p, pts[0]) <= tolerance + e.width;
    return pts.some((q, i) => i && segmentDistance(p, pts[i - 1], q) <= tolerance + e.width);
  }
  function transform(e, { scale = 1, origin = { x: 0, y: 0 }, dx = 0, dy = 0, angle = 0 }) {
    const pt = (p) => {
      const q = rotatePoint(p, origin, angle);
      return {
        ...p,
        x: origin.x + (q.x - origin.x) * scale + dx,
        y: origin.y + (q.y - origin.y) * scale + dy
      };
    };
    const out = { ...e, width: clamp(e.width * scale, 0.1, 10000) };
    if (e.shapeFrame) out.shapeFrame = e.shapeFrame.map(pt);
    if (e.controls) out.controls = e.controls.map(pt);
    if (e.waypoints) out.waypoints = e.waypoints.map(pt);
    if (e.connector && e.route === 'elbow') {
      out.route = 'polyline';
      out.waypoints = connectorBody(e).slice(1, -1).map(pt);
      delete out.elbowX;
    }
    if (e.erasures)
      out.erasures = e.erasures.map((c) => {
        const a = pt({ x: c.x1, y: c.y1 }),
          b = pt({ x: c.x2, y: c.y2 });
        return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, r: c.r * scale };
      });
    if (['image', 'text'].includes(e.type)) {
      const p = pt({ x: e.cx, y: e.cy });
      out.cx = p.x;
      out.cy = p.y;
      out.imageW = e.imageW * scale;
      out.imageH = e.imageH * scale;
      out.angle = ((e.angle || 0) + angle) % (Math.PI * 2);
      if (e.type === 'text') out.fontSize = e.fontSize * scale;
    } else if (e.type === 'path')
      out.nodes = e.nodes.map((n) => ({
        ...pt(n),
        ...(n.in ? { in: pt(n.in) } : {}),
        ...(n.out ? { out: pt(n.out) } : {})
      }));
    else if (e.type === 'region')
      out.geometry = e.geometry.map((poly) =>
        poly.map((r) =>
          r.map(([x, y]) => {
            const p = pt({ x, y });
            return [p.x, p.y];
          })
        )
      );
    else if (e.type === 'stroke') out.points = e.points.map(pt);
    else if (e.type === 'circle' || e.type === 'ellipse') {
      const p = pt({ x: e.cx, y: e.cy });
      out.cx = p.x;
      out.cy = p.y;
      if (e.type === 'circle') out.r = e.r * scale;
      else {
        out.rx = e.rx * scale;
        out.ry = e.ry * scale;
        out.angle = ((e.angle || 0) + angle) % (Math.PI * 2);
      }
    } else if (e.type === 'line' || e.type === 'arrow') {
      const a = pt({ x: e.x1, y: e.y1 }),
        b = pt({ x: e.x2, y: e.y2 });
      out.x1 = a.x;
      out.y1 = a.y;
      out.x2 = b.x;
      out.y2 = b.y;
      if (e.type === 'arrow') out.headLength = e.headLength * scale;
    } else out.corners = e.corners.map(pt);
    return out;
  }
  function screenToWorld(p, camera, zoom) {
    const a = camera.angle || 0,
      c = Math.cos(a),
      s = Math.sin(a),
      x = (p.x - camera.x) / zoom,
      y = (p.y - camera.y) / zoom;
    return { x: c * x + s * y, y: -s * x + c * y };
  }
  function worldToScreen(p, camera, zoom) {
    const a = camera.angle || 0,
      c = Math.cos(a),
      s = Math.sin(a);
    return { x: (c * p.x - s * p.y) * zoom + camera.x, y: (s * p.x + c * p.y) * zoom + camera.y };
  }
  function zoomAt(camera, oldZoom, newZoom, anchor) {
    const p = screenToWorld(anchor, camera, oldZoom),
      q = worldToScreen(p, { x: 0, y: 0, angle: camera.angle || 0 }, newZoom);
    return { ...camera, x: anchor.x - q.x, y: anchor.y - q.y };
  }
  function resizeScale(start, current, origin) {
    const dx = start.x - origin.x,
      dy = start.y - origin.y;
    return clamp(
      ((current.x - origin.x) * dx + (current.y - origin.y) * dy) / (dx * dx + dy * dy || 1),
      0.05,
      20
    );
  }
  function pathLength(p) {
    let s = 0;
    for (let i = 1; i < p.length; i++) s += distance(p[i - 1], p[i]);
    return s;
  }
  function resample(points, n = 96) {
    if (!points.length) return [];
    if (points.length === 1) return [points[0]];
    const cum = [0];
    for (let i = 1; i < points.length; i++)
      cum.push(cum.at(-1) + distance(points[i - 1], points[i]));
    const total = cum.at(-1);
    if (!total) return [points[0]];
    let j = 1;
    const out = [];
    for (let i = 0; i < n; i++) {
      const target = (total * i) / (n - 1);
      while (j < cum.length - 1 && cum[j] < target) j++;
      const t = (target - cum[j - 1]) / (cum[j] - cum[j - 1] || 1),
        a = points[j - 1],
        b = points[j];
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    return out;
  }
  function simplify(p, eps) {
    if (p.length < 3) return p.slice();
    let d = 0,
      index = 0;
    for (let i = 1; i < p.length - 1; i++) {
      const t = segmentDistance(p[i], p[0], p.at(-1));
      if (t > d) {
        d = t;
        index = i;
      }
    }
    if (d <= eps) return [p[0], p.at(-1)];
    return simplify(p.slice(0, index + 1), eps)
      .slice(0, -1)
      .concat(simplify(p.slice(index), eps));
  }
  function hull(points) {
    const p = points.slice().sort((a, b) => a.x - b.x || a.y - b.y),
      cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const low = [],
      high = [];
    for (const v of p) {
      while (low.length > 1 && cross(low.at(-2), low.at(-1), v) <= 0) low.pop();
      low.push(v);
    }
    for (const v of p.slice().reverse()) {
      while (high.length > 1 && cross(high.at(-2), high.at(-1), v) <= 0) high.pop();
      high.push(v);
    }
    return low.slice(0, -1).concat(high.slice(0, -1));
  }
  function recognizeGroups(strokes, forced = null) {
    const groups = strokes.map((s) => s.points || s).filter((p) => p.length > 1);
    if (!groups.length || groups.length > 24) return [];
    const lengths = groups.map(pathLength),
      total = lengths.reduce((a, b) => a + b, 0);
    if (total < 10) return [];
    const sample = groups.flatMap((p, i) =>
        resample(p, Math.max(8, Math.min(160, Math.round((220 * lengths[i]) / total))))
      ),
      bb = pointBounds(sample),
      diag = Math.hypot(bb.w, bb.h);
    if (diag < 8) return [];
    const candidates = [];
    const targetDistance = (p, shape) => {
      const t = outline(shape, 72);
      let best = Infinity;
      for (let i = 1; i < t.length; i++) best = Math.min(best, segmentDistance(p, t[i - 1], t[i]));
      return best;
    };
    function assess(shape, bias = 0) {
      const contour = resample(outline(shape, 96), 100),
        perimeter = pathLength(outline(shape, 96));
      const err =
        Math.sqrt(
          sample.reduce((sum, p) => sum + targetDistance(p, shape) ** 2, 0) / sample.length
        ) / diag;
      const gaps = contour.map((q) => Math.min(...sample.map((p) => distance(q, p))));
      const coverage = Math.sqrt(gaps.reduce((s, v) => s + v * v, 0) / gaps.length) / diag;
      const gap = Math.max(...gaps) / diag,
        ratio = total / (perimeter || 1);
      const score = err + coverage * 0.7 + bias;
      let accepted = err < 0.06 && coverage < 0.065 && gap < 0.24 && ratio > 0.62 && ratio < 1.65;
      if (shape.type === 'line')
        accepted = err < 0.026 && coverage < 0.045 && ratio > 0.82 && ratio < 1.3;
      if (shape.type === 'arrow')
        accepted = err < 0.043 && coverage < 0.045 && gap < 0.13 && ratio > 0.67 && ratio < 1.65;
      if (forced === shape.type || (!forced && accepted)) candidates.push({ shape, score });
    }
    // Farthest endpoints provide a line estimate independent of stroke order.
    const hh = hull(sample);
    let aa = sample[0],
      zz = sample.at(-1),
      far = 0;
    for (const a of hh)
      for (const b of hh) {
        const d = distance(a, b);
        if (d > far) {
          far = d;
          aa = a;
          zz = b;
        }
      }
    assess({ type: 'line', x1: aa.x, y1: aa.y, x2: zz.x, y2: zz.y }, 0.003);
    const center = { x: bb.x + bb.w / 2, y: bb.y + bb.h / 2 },
      r = sample.reduce((s, p) => s + distance(p, center), 0) / sample.length;
    if (Math.min(bb.w, bb.h) > 8) {
      assess({ type: 'circle', cx: center.x, cy: center.y, r }, -0.004);
      let bestRect = null,
        bestEllipse = null;
      for (let deg = 0; deg < 180; deg += 3) {
        const angle = (deg * Math.PI) / 180,
          c = Math.cos(angle),
          s = Math.sin(angle),
          rot = sample.map((p) => ({ x: p.x * c + p.y * s, y: -p.x * s + p.y * c })),
          b = pointBounds(rot),
          cx = b.x + b.w / 2,
          cy = b.y + b.h / 2;
        if (Math.min(b.w, b.h) < 7) continue;
        const rectError =
          rot.reduce(
            (v, p) => v + Math.min(p.x - b.x, b.x + b.w - p.x, p.y - b.y, b.y + b.h - p.y) ** 2,
            0
          ) / rot.length;
        if (!bestRect || rectError < bestRect.err)
          bestRect = {
            err: rectError,
            shape: {
              type: 'rectangle',
              corners: [
                { x: b.x, y: b.y },
                { x: b.x + b.w, y: b.y },
                { x: b.x + b.w, y: b.y + b.h },
                { x: b.x, y: b.y + b.h }
              ].map((p) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c }))
            }
          };
        const ellipseError =
          rot.reduce(
            (v, p) => v + (Math.hypot((p.x - cx) / (b.w / 2), (p.y - cy) / (b.h / 2)) - 1) ** 2,
            0
          ) / rot.length;
        if (!bestEllipse || ellipseError < bestEllipse.err)
          bestEllipse = {
            err: ellipseError,
            shape: {
              type: 'ellipse',
              cx: cx * c - cy * s,
              cy: cx * s + cy * c,
              rx: b.w / 2,
              ry: b.h / 2,
              angle
            }
          };
      }
      if (bestRect) {
        assess(bestRect.shape, 0.001);
        const c = bestRect.shape.corners,
          w = distance(c[0], c[1]),
          h = distance(c[0], c[3]);
        if (Math.abs(w - h) / Math.max(w, h) < 0.22) {
          const n = (w + h) / 2,
            ux = (c[1].x - c[0].x) / w,
            uy = (c[1].y - c[0].y) / w,
            vx = (c[3].x - c[0].x) / h,
            vy = (c[3].y - c[0].y) / h,
            center = { x: (c[0].x + c[2].x) / 2, y: (c[0].y + c[2].y) / 2 };
          assess(
            {
              type: 'rectangle',
              shapeKind: 'square',
              corners: [
                [-1, -1],
                [1, -1],
                [1, 1],
                [-1, 1]
              ].map(([a, b]) => ({
                x: center.x + ((a * ux + b * vx) * n) / 2,
                y: center.y + ((a * uy + b * vy) * n) / 2
              }))
            },
            0.003
          );
        }
      }
      if (bestEllipse) assess(bestEllipse.shape, 0.006);
      const vertices =
        hh.length <= 32 ? hh : hh.filter((_, i) => i % Math.ceil(hh.length / 32) === 0);
      let area = 0,
        triangle = null;
      for (let i = 0; i < vertices.length; i++)
        for (let j = i + 1; j < vertices.length; j++)
          for (let k = j + 1; k < vertices.length; k++) {
            const a = vertices[i],
              b = vertices[j],
              c = vertices[k],
              value = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
            if (value > area) {
              area = value;
              triangle = [a, b, c];
            }
          }
      if (groups.length === 1 && distance(groups[0][0], groups[0].at(-1)) < diag * 0.13) {
        const vertices = simplify(resample(groups[0], 160), diag * 0.025);
        if (distance(vertices[0], vertices.at(-1)) < diag * 0.13) vertices.pop();
        if (vertices.length >= 5 && vertices.length <= 12)
          assess({ type: 'polygon', corners: vertices }, 0.008);
      }
      const quad = simplify([...hh, hh[0]], diag * 0.045).slice(0, -1);
      if (quad.length === 4)
        assess({ type: 'polygon', shapeKind: 'quadrilateral', corners: quad }, 0.005);
      if (triangle) assess({ type: 'triangle', corners: triangle }, 0.002);
    }
    // Detect a long shaft and two shorter branches meeting at its head.
    const segments = groups
      .flatMap((p) => {
        const q = simplify(resample(p, 80), diag * 0.028);
        return q.slice(1).map((b, i) => ({ a: q[i], b, l: distance(q[i], b) }));
      })
      .sort((a, b) => b.l - a.l);
    for (const shaft of segments.slice(0, 3))
      for (const flip of [false, true]) {
        const tip = flip ? shaft.a : shaft.b,
          tail = flip ? shaft.b : shaft.a,
          L = shaft.l;
        if (L < diag * 0.45) continue;
        const ux = (tail.x - tip.x) / L,
          uy = (tail.y - tip.y) / L;
        const wings = segments
          .filter((s) => s !== shaft)
          .flatMap((s) => {
            const near =
              distance(s.a, tip) < diag * 0.12
                ? s.a
                : distance(s.b, tip) < diag * 0.12
                  ? s.b
                  : null;
            if (!near || s.l < L * 0.09 || s.l > L * 0.65) return [];
            const end = near === s.a ? s.b : s.a,
              vx = end.x - tip.x,
              vy = end.y - tip.y,
              projection = vx * ux + vy * uy,
              side = vx * uy - vy * ux;
            if (projection < L * 0.07 || projection > L * 0.65 || Math.abs(side) < L * 0.045)
              return [];
            return [{ side, projection }];
          });
        if (wings.some((a) => wings.some((b) => a.side * b.side < 0)))
          assess(
            {
              type: 'arrow',
              x1: tail.x,
              y1: tail.y,
              x2: tip.x,
              y2: tip.y,
              headLength: wings.reduce((s, w) => s + w.projection, 0) / wings.length
            },
            -0.005
          );
      }
    // Explicit conversion remains available when the user's intended type is known.
    if (forced === 'arrow' && !candidates.length)
      assess({ type: 'arrow', x1: aa.x, y1: aa.y, x2: zz.x, y2: zz.y, headLength: far * 0.22 });
    candidates.sort((a, b) => a.score - b.score);
    const unique = [];
    for (const c of candidates)
      if (
        !unique.some(
          (x) => (x.shape.shapeKind || x.shape.type) === (c.shape.shapeKind || c.shape.type)
        )
      )
        unique.push(c);
    return unique.slice(0, 6);
  }
  module.exports = {
    pointBounds,
    expand,
    overlaps,
    contains,
    segmentDistance,
    outline,
    elementBounds,
    bounds,
    hit,
    transform,
    screenToWorld,
    worldToScreen,
    zoomAt,
    resizeScale,
    resample,
    pathLength,
    recognizeGroups
  };

  // Drafting helpers work in world coordinates; tolerances are converted by the view.
  function snapAngle(start, end, step = 15) {
    const length = distance(start, end),
      angle =
        (Math.round(Math.atan2(end.y - start.y, end.x - start.x) / ((step * Math.PI) / 180)) *
          step *
          Math.PI) /
        180;
    return {
      ...end,
      x: start.x + length * Math.cos(angle),
      y: start.y + length * Math.sin(angle),
      angle
    };
  }
  function boundedPoint(p, rect, inset = 0) {
    if (!rect) return p;
    const m = Math.min(inset, rect.w / 2, rect.h / 2);
    return {
      ...p,
      x: clamp(p.x, rect.x + m, rect.x + rect.w - m),
      y: clamp(p.y, rect.y + m, rect.y + rect.h - m)
    };
  }
  function boundedRay(start, end, rect, inset = 0) {
    if (!rect) return end;
    const m = Math.min(inset, rect.w / 2, rect.h / 2),
      dx = end.x - start.x,
      dy = end.y - start.y;
    let t = 1;
    for (const [d, lo, hi, v] of [
      [dx, rect.x + m, rect.x + rect.w - m, start.x],
      [dy, rect.y + m, rect.y + rect.h - m, start.y]
    ]) {
      if (d > 0) t = Math.min(t, (hi - v) / d);
      if (d < 0) t = Math.min(t, (lo - v) / d);
    }
    t = clamp(t, 0, 1);
    return { ...end, x: start.x + dx * t, y: start.y + dy * t };
  }
  function snapGuides(p, guides, tolerance) {
    let out = { ...p };
    for (const axis of ['x', 'y']) {
      let best = tolerance;
      for (const g of guides || []) {
        if (g.axis !== axis) continue;
        const d = Math.abs(p[axis] - g.value);
        if (d < best) {
          best = d;
          out[axis] = g.value;
        }
      }
    }
    return out;
  }
  Object.assign(module.exports, { snapAngle, boundedPoint, boundedRay, snapGuides });

  function erased(e, p) {
    return (e.erasures || []).some(
      (c) => segmentDistance(p, { x: c.x1, y: c.y1 }, { x: c.x2, y: c.y2 }) < c.r
    );
  }
  function insidePolygon(p, poly) {
    let yes = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i],
        b = poly[j];
      if (segmentDistance(p, a, b) < 1e-7) return true;
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
        yes = !yes;
    }
    return yes;
  }
  function intersection(a, b, c, d) {
    const rx = b.x - a.x,
      ry = b.y - a.y,
      sx = d.x - c.x,
      sy = d.y - c.y,
      den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-10) return null;
    const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den,
      u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { x: a.x + t * rx, y: a.y + t * ry } : null;
  }
  function lassoHit(e, poly) {
    if (poly.length < 3 || !overlaps(elementBounds(e), pointBounds(poly))) return false;
    const pts = outline(e, 160);
    if (pts.some((p) => insidePolygon(p, poly) && !erased(e, p))) return true;
    for (let i = 1; i < pts.length; i++)
      for (let j = 0; j < poly.length; j++) {
        const p = intersection(pts[i - 1], pts[i], poly[j], poly[(j + 1) % poly.length]);
        if (p && !erased(e, p)) return true;
      }
    return false;
  }
  function erasePart(e, from, to, r) {
    const sweep = expand(pointBounds([from, to]), r + (e.width || 0));
    if (!overlaps(elementBounds(e), sweep)) return e;
    return {
      ...e,
      erasures: [...(e.erasures || []), { x1: from.x, y1: from.y, x2: to.x, y2: to.y, r }]
    };
  }
  // One inverse capsule per clip: intersections remove the union, including overlaps.
  function capsulePath(c) {
    const a = Math.atan2(c.y2 - c.y1, c.x2 - c.x1),
      nx = -Math.sin(a) * c.r,
      ny = Math.cos(a) * c.r;
    return `M ${c.x1 + nx} ${c.y1 + ny} L ${c.x2 + nx} ${c.y2 + ny} A ${c.r} ${c.r} 0 0 0 ${c.x2 - nx} ${c.y2 - ny} L ${c.x1 - nx} ${c.y1 - ny} A ${c.r} ${c.r} 0 0 0 ${c.x1 + nx} ${c.y1 + ny} Z`;
  }
  Object.assign(module.exports, { erased, insidePolygon, lassoHit, erasePart, capsulePath });

  function rotatePoint(p, origin, angle) {
    const x = p.x - origin.x,
      y = p.y - origin.y,
      c = Math.cos(angle),
      s = Math.sin(angle);
    return { ...p, x: origin.x + x * c - y * s, y: origin.y + x * s + y * c };
  }
  function imageCorners(e) {
    return [
      { x: e.cx - e.imageW / 2, y: e.cy - e.imageH / 2 },
      { x: e.cx + e.imageW / 2, y: e.cy - e.imageH / 2 },
      { x: e.cx + e.imageW / 2, y: e.cy + e.imageH / 2 },
      { x: e.cx - e.imageW / 2, y: e.cy + e.imageH / 2 }
    ].map((p) => rotatePoint(p, { x: e.cx, y: e.cy }, e.angle || 0));
  }
  function anchors(e) {
    if (e.type === 'path')
      return (e.nodes.length > 64 ? [...e.nodes.slice(0, 63), e.nodes.at(-1)] : e.nodes).map(
        (p, index) => ({ ...p, targetId: e.id, index })
      );
    if (e.type === 'region')
      return e.geometry
        .flatMap((p) => p[0].slice(0, -1))
        .slice(0, 64)
        .map(([x, y], index) => ({ x, y, targetId: e.id, index }));
    let p = [];
    if (e.type === 'stroke') {
      p = [e.points[0], e.points.at(-1)];
    } else if (e.type === 'line' || e.type === 'arrow') {
      p = [
        { x: e.x1, y: e.y1 },
        { x: e.x2, y: e.y2 }
      ];
    } else if (e.type === 'circle' || e.type === 'ellipse') {
      const rx = e.r ?? e.rx,
        ry = e.r ?? e.ry;
      p = [
        { x: e.cx + rx, y: e.cy },
        { x: e.cx, y: e.cy + ry },
        { x: e.cx - rx, y: e.cy },
        { x: e.cx, y: e.cy - ry }
      ].map((v) => rotatePoint(v, { x: e.cx, y: e.cy }, e.angle || 0));
    } else {
      const corners = ['image', 'text'].includes(e.type) ? imageCorners(e) : e.corners;
      p = corners.concat(
        corners.map((a, i) => ({
          x: (a.x + corners[(i + 1) % corners.length].x) / 2,
          y: (a.y + corners[(i + 1) % corners.length].y) / 2
        }))
      );
    }
    return p.map((v, index) => ({ ...v, targetId: e.id, index }));
  }
  function snapAnchor(p, elements, tolerance, exclude = new Set()) {
    let best = null,
      d = tolerance;
    for (const e of elements) {
      if (exclude.has(e.id)) continue;
      for (const a of anchors(e)) {
        if (erased(e, a)) continue;
        const dist = distance(p, a);
        if (dist < d) {
          best = a;
          d = dist;
        }
      }
    }
    return best;
  }
  function resolveConnections(elements) {
    const byId = new Map(elements.map((e) => [e.id, e]));
    return elements.map((e) => {
      if (!e.bindings || !['line', 'arrow'].includes(e.type)) return e;
      let out = e;
      for (const [key, x, y] of [
        ['start', 'x1', 'y1'],
        ['end', 'x2', 'y2']
      ]) {
        const b = e.bindings[key],
          target = b && byId.get(b.targetId);
        if (!b) continue;
        if (!target || target.bindings) {
          if (out === e) out = { ...e, bindings: { ...e.bindings } };
          delete out.bindings[key];
          continue;
        }
        const p = anchors(target)[b.index];
        if (p && (p.x !== e[x] || p.y !== e[y])) {
          if (out === e) out = { ...e };
          out[x] = p.x;
          out[y] = p.y;
        }
      }
      return out;
    });
  }
  function alignMove(box, others, dx, dy, tolerance) {
    let result = { dx, dy, guides: [] };
    for (const axis of ['x', 'y']) {
      const size = axis === 'x' ? 'w' : 'h',
        delta = axis === 'x' ? 'dx' : 'dy',
        positions = [box[axis], box[axis] + box[size] / 2, box[axis] + box[size]],
        targets = others.flatMap((b) => [b[axis], b[axis] + b[size] / 2, b[axis] + b[size]]);
      let offset = 0,
        best = tolerance,
        guide = null;
      for (const pos of positions)
        for (const target of targets) {
          const d = target - (pos + result[delta]);
          if (Math.abs(d) < best) {
            best = Math.abs(d);
            offset = d;
            guide = target;
          }
        }
      if (guide !== null) {
        result[delta] += offset;
        result.guides.push({ axis, value: guide });
      }
    }
    // Equal spacing between adjacent objects along either axis.
    for (const axis of ['x', 'y']) {
      const size = axis === 'x' ? 'w' : 'h',
        cross = axis === 'x' ? 'y' : 'x',
        crossSize = axis === 'x' ? 'h' : 'w',
        delta = axis === 'x' ? 'dx' : 'dy',
        crossDelta = cross === 'x' ? result.dx : result.dy;
      if (result.guides.some((g) => g.axis === axis)) continue;
      const nearby = others
        .filter(
          (b) =>
            b[cross] <= box[cross] + crossDelta + box[crossSize] &&
            b[cross] + b[crossSize] >= box[cross] + crossDelta
        )
        .sort((a, b) => a[axis] - b[axis]);
      for (let i = 1; i < nearby.length; i++) {
        const a = nearby[i - 1],
          b = nearby[i],
          gap = b[axis] - a[axis] - a[size];
        if (gap < box[size]) continue;
        const target = a[axis] + a[size] + (gap - box[size]) / 2,
          d = target - box[axis] - result[delta];
        if (Math.abs(d) < tolerance) {
          result[delta] += d;
          result.guides.push({
            axis,
            value: target + box[size] / 2,
            spacing: (gap - box[size]) / 2
          });
          break;
        }
      }
    }
    return result;
  }
  function rulerPoint(p, r, width = 0) {
    const c = Math.cos(r.angle),
      s = Math.sin(r.angle),
      t = clamp((p.x - r.x) * c + (p.y - r.y) * s, 0, r.length);
    return { ...p, x: r.x + t * c - (s * width) / 2, y: r.y + t * s + (c * width) / 2 };
  }
  Object.assign(module.exports, {
    rotatePoint,
    imageCorners,
    anchors,
    snapAnchor,
    resolveConnections,
    alignMove,
    rulerPoint
  });

  // Connector body is sampled for the same rendering, picking and bounds pipeline.
  function connectorBody(e, n = 40) {
    const a = { x: e.x1, y: e.y1 },
      b = { x: e.x2, y: e.y2 };
    if (e.route === 'polyline') return [a, ...(e.waypoints || []), b];
    if (e.route === 'elbow') {
      const x = e.elbowX ?? (a.x + b.x) / 2;
      return [a, { x, y: a.y }, { x, y: b.y }, b];
    }
    if (e.route === 'curve') {
      const mx = (a.x + b.x) / 2,
        [c, d] = e.controls || [
          { x: mx, y: a.y },
          { x: mx, y: b.y }
        ];
      return Array.from({ length: n + 1 }, (_, i) => {
        const t = i / n,
          u = 1 - t;
        return {
          x: u * u * u * a.x + 3 * u * u * t * c.x + 3 * u * t * t * d.x + t * t * t * b.x,
          y: u * u * u * a.y + 3 * u * u * t * c.y + 3 * u * t * t * d.y + t * t * t * b.y
        };
      });
    }
    return [a, b];
  }
  function connectorOutline(e) {
    const pts = connectorBody(e),
      out = pts.slice(),
      head = (tip, near) => {
        const L = distance(tip, near) || 1,
          ux = (near.x - tip.x) / L,
          uy = (near.y - tip.y) / L,
          h = e.headLength || 16;
        return [
          { x: tip.x + ux * h - uy * h * 0.55, y: tip.y + uy * h + ux * h * 0.55 },
          tip,
          { x: tip.x + ux * h + uy * h * 0.55, y: tip.y + uy * h - ux * h * 0.55 },
          tip
        ];
      };
    if (e.endArrow !== false)
      out.push(
        ...head(
          pts.at(-1),
          [...pts].reverse().find((p) => distance(p, pts.at(-1)) > 1e-6) || pts[0]
        )
      );
    if (e.startArrow) {
      out.push(...[...pts].reverse());
      out.push(...head(pts[0], pts.find((p) => distance(p, pts[0]) > 1e-6) || pts.at(-1)));
    }
    return out;
  }
  function editPoint(e, index, p) {
    if (e.type === 'path') return VectorOps.edit(e, index, p);
    const out = { ...e };
    delete out.shapeFrame;
    delete out.shapeKind;
    delete out.shapeOptions;
    if (e.connector && index >= 2) {
      if (e.route === 'curve')
        out.controls = (
          e.controls || [
            { x: (e.x1 + e.x2) / 2, y: e.y1 },
            { x: (e.x1 + e.x2) / 2, y: e.y2 }
          ]
        ).map((q, i) => (i === index - 2 ? { x: p.x, y: p.y } : q));
      else if (e.route === 'elbow') out.elbowX = p.x;
      else
        out.waypoints = (e.waypoints || []).map((q, i) =>
          i === index - 2 ? { x: p.x, y: p.y } : q
        );
      return out;
    }
    if (['line', 'arrow'].includes(e.type)) {
      const side = index === 0 ? '1' : '2';
      out['x' + side] = p.x;
      out['y' + side] = p.y;
      if (e.bindings) {
        out.bindings = { ...e.bindings };
        delete out.bindings[index === 0 ? 'start' : 'end'];
      }
    } else if (e.corners) {
      out.corners = e.corners.map((q, i) => (i === index ? { x: p.x, y: p.y } : q));
    } else if (e.type === 'circle') out.r = Math.max(0.1, distance(p, { x: e.cx, y: e.cy }));
    else if (e.type === 'ellipse') {
      const q = rotatePoint(p, { x: e.cx, y: e.cy }, -(e.angle || 0));
      if (index % 2 === 0) out.rx = Math.max(0.1, Math.abs(q.x - e.cx));
      else out.ry = Math.max(0.1, Math.abs(q.y - e.cy));
    }
    return out;
  }
  function pointHandles(e) {
    if (e.type === 'path') return VectorOps.handles(e);
    if (e.type === 'region') return [];
    if (['image', 'text', 'stroke'].includes(e.type)) return [];
    const h = anchors(e).slice(0, e.corners ? e.corners.length : undefined);
    if (e.connector) {
      const extras =
        e.route === 'curve'
          ? e.controls || [
              { x: (e.x1 + e.x2) / 2, y: e.y1 },
              { x: (e.x1 + e.x2) / 2, y: e.y2 }
            ]
          : e.route === 'elbow'
            ? [{ x: e.elbowX ?? (e.x1 + e.x2) / 2, y: (e.y1 + e.y2) / 2 }]
            : e.route === 'polyline'
              ? e.waypoints || []
              : [];
      h.push(...extras.map((p, i) => ({ ...p, index: i + 2, control: true })));
    }
    return h;
  }
  function expandGroups(elements, ids) {
    const groups = new Set(
      elements.filter((e) => ids.has(e.id) && e.groupId).map((e) => e.groupId)
    );
    return new Set(elements.filter((e) => ids.has(e.id) || groups.has(e.groupId)).map((e) => e.id));
  }
  function anchorKind(e, a) {
    if (e.type === 'region' || (e.type === 'path' && e.closed)) return 'corners';
    if (e.type === 'path')
      return a.index === 0 || a.index === Math.min(63, e.nodes.length - 1)
        ? 'endpoints'
        : 'corners';
    if (e.type === 'stroke' || ['line', 'arrow'].includes(e.type)) return 'endpoints';
    if (e.corners || ['image', 'text'].includes(e.type))
      return a.index < (e.corners?.length || 4) ? 'corners' : 'midpoints';
    return 'midpoints';
  }
  function pickAnchor(p, elements, tolerance, types, previous, release = 1.8) {
    const enabled = (a) => types[anchorKind(a.e, a.p)] !== false;
    const candidates = elements
      .flatMap((e) =>
        anchors(e)
          .filter((a) => !erased(e, a))
          .map((p) => ({ e, p }))
      )
      .filter(enabled);
    if (previous && !previous.self) {
      const keep = candidates.find(
        (a) => a.p.targetId === previous.targetId && a.p.index === previous.index
      );
      if (keep && distance(p, keep.p) <= tolerance * release) return keep.p;
    }
    let best = null,
      d = tolerance;
    for (const a of candidates) {
      const delta = distance(p, a.p);
      if (delta < d) {
        d = delta;
        best = a.p;
      }
    }
    return best;
  }
  Object.assign(module.exports, {
    connectorBody,
    connectorOutline,
    editPoint,
    pointHandles,
    expandGroups,
    anchorKind,
    pickAnchor
  });
  function connectorLabelPoint(e) {
    const points = connectorBody(e);
    let total = 0;
    for (let i = 1; i < points.length; i++) total += distance(points[i - 1], points[i]);
    let remaining = total / 2;
    for (let i = 1; i < points.length; i++) {
      const len = distance(points[i - 1], points[i]);
      if (remaining <= len) {
        const t = remaining / (len || 1);
        return {
          x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
          y: points[i - 1].y + (points[i].y - points[i - 1].y) * t
        };
      }
      remaining -= len;
    }
    return points[0];
  }
  Object.assign(module.exports, { connectorLabelPoint });

  function cropImage(e, index, p) {
    const crop = e.crop || { x: 0, y: 0, w: 1, h: 1 },
      q = rotatePoint(p, { x: e.cx, y: e.cy }, -(e.angle || 0)),
      left = e.cx - e.imageW / 2,
      top = e.cy - e.imageH / 2,
      fullW = e.imageW / crop.w,
      fullH = e.imageH / crop.h;
    let x1 = crop.x,
      y1 = crop.y,
      x2 = x1 + crop.w,
      y2 = y1 + crop.h;
    const u = crop.x + (q.x - left) / fullW,
      v = crop.y + (q.y - top) / fullH;
    if (index === 0 || index === 3) x1 = clamp(u, 0, x2 - 0.01);
    else x2 = clamp(u, x1 + 0.01, 1);
    if (index === 0 || index === 1) y1 = clamp(v, 0, y2 - 0.01);
    else y2 = clamp(v, y1 + 0.01, 1);
    const center = rotatePoint(
      {
        x: left + (x1 - crop.x + (x2 - x1) / 2) * fullW,
        y: top + (y1 - crop.y + (y2 - y1) / 2) * fullH
      },
      { x: e.cx, y: e.cy },
      e.angle || 0
    );
    return {
      ...e,
      cx: center.x,
      cy: center.y,
      imageW: Math.max(1, (x2 - x1) * fullW),
      imageH: Math.max(1, (y2 - y1) * fullH),
      crop: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
    };
  }
  function arrange(elements, ids, operation) {
    const chosen = elements.filter((e) => ids.has(e.id));
    if (chosen.length < 2) return elements;
    const boxes = chosen.map(elementBounds),
      all = bounds(chosen),
      moves = new Map();
    if (operation.startsWith('distribute')) {
      if (chosen.length < 3) return elements;
      const axis = operation.endsWith('x') ? 'x' : 'y',
        size = axis === 'x' ? 'w' : 'h',
        ordered = chosen.map((e, i) => ({ e, b: boxes[i] })).sort((a, b) => a.b[axis] - b.b[axis]),
        first = ordered[0].b,
        last = ordered.at(-1).b,
        total = ordered.reduce((sum, o) => sum + o.b[size], 0),
        gap = (last[axis] + last[size] - first[axis] - total) / (ordered.length - 1);
      let pos = first[axis];
      for (const o of ordered) {
        moves.set(o.e.id, { [axis === 'x' ? 'dx' : 'dy']: pos - o.b[axis] });
        pos += o.b[size] + gap;
      }
    } else
      chosen.forEach((e, i) => {
        const b = boxes[i];
        const dx =
            operation === 'left'
              ? all.x - b.x
              : operation === 'right'
                ? all.x + all.w - b.x - b.w
                : operation === 'center-x'
                  ? all.x + all.w / 2 - b.x - b.w / 2
                  : 0,
          dy =
            operation === 'top'
              ? all.y - b.y
              : operation === 'bottom'
                ? all.y + all.h - b.y - b.h
                : operation === 'center-y'
                  ? all.y + all.h / 2 - b.y - b.h / 2
                  : 0;
        moves.set(e.id, { dx, dy });
      });
    return resolveConnections(
      elements.map((e) => (moves.has(e.id) ? transform(e, moves.get(e.id)) : e))
    );
  }
  function dashArray(e) {
    return e.dash === 'dashed'
      ? [e.width * 4, e.width * 3]
      : e.dash === 'dotted'
        ? [e.width * 0.1, e.width * 2.5]
        : [];
  }
  function strokeSegments(e) {
    const points = outline(e, 192),
      pattern = dashArray(e),
      segments = [];
    let phase = 0,
      remaining = pattern[0];
    for (let i = 1; i < points.length; i++) {
      let a = points[i - 1],
        b = points[i],
        len = distance(a, b);
      if (!pattern.length) {
        segments.push([a, b]);
        continue;
      }
      while (len > 1e-8) {
        const step = Math.min(len, remaining),
          t = step / len,
          q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        if (phase % 2 === 0) segments.push([a, q]);
        a = q;
        len -= step;
        remaining -= step;
        if (remaining < 1e-8) {
          phase = (phase + 1) % pattern.length;
          remaining = pattern[phase];
        }
        if (segments.length > 30000) return segments;
      }
    }
    return segments;
  }
  function scribbleGesture(points) {
    if (points.length < 8) return false;
    const b = pointBounds(points);
    if (!b || b.w < 25 || b.h > Math.max(80, b.w * 0.6)) return false;
    let reversals = 0,
      last = 0,
      length = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      length += distance(points[i], points[i - 1]);
      if (Math.abs(dx) > 2) {
        const sign = Math.sign(dx);
        if (last && last !== sign) reversals++;
        last = sign;
      }
    }
    return reversals >= 4 && length > b.w * 3;
  }
  function undoGesture(points) {
    if (points.length < 3) return false;
    const b = pointBounds(points),
      a = points[0],
      z = points.at(-1);
    return b.w > 60 && b.h < Math.max(20, b.w * 0.15) && a.x - z.x > b.w * 0.8;
  }
  Object.assign(module.exports, {
    cropImage,
    arrange,
    dashArray,
    strokeSegments,
    scribbleGesture,
    undoGesture
  });

  return module.exports;
})();
