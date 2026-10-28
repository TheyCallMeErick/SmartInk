const Visible = (() => {
  const module = { exports: {} };
  const Engine = InkEngine;
  ('use strict');

  const circle = (x, y, r) => {
    const n = Math.min(
      512,
      Math.max(24, Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - 0.1 / Math.max(r, 0.1)))))
    );
    return Array.from({ length: n }, (_, i) => [
      x + r * Math.cos((i * 2 * Math.PI) / n),
      y + r * Math.sin((i * 2 * Math.PI) / n)
    ]);
  };
  function capsule(a, b, r) {
    const angle = Math.atan2(b.y - a.y, b.x - a.x),
      n = Math.min(
        256,
        Math.max(12, Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - 0.1 / Math.max(r, 0.1)))))
      );
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = angle - Math.PI / 2 + (i * Math.PI) / n;
      out.push([b.x + r * Math.cos(t), b.y + r * Math.sin(t)]);
    }
    for (let i = 0; i <= n; i++) {
      const t = angle + Math.PI / 2 + (i * Math.PI) / n;
      out.push([a.x + r * Math.cos(t), a.y + r * Math.sin(t)]);
    }
    return [out];
  }
  function rawGeometry(e) {
    if (e.type === 'region') {
      const parts = VectorOps.rings(e).flatMap((r) =>
        r.slice(1).map((p, i) => capsule(r[i], p, e.width / 2))
      );
      return Clipper.union(...(e.fill && e.fill !== 'none' ? [e.geometry] : []), ...parts);
    }
    if (['image', 'text'].includes(e.type)) return [[Ink.imageCorners(e).map((p) => [p.x, p.y])]];
    if (e.type === 'circle' && e.dash !== 'dashed' && e.dash !== 'dotted') {
      if (e.fill && e.fill !== 'none') return [[circle(e.cx, e.cy, e.r + e.width / 2)]];
      const outer = circle(e.cx, e.cy, e.r + e.width / 2),
        inner = e.r - e.width / 2;
      return [inner > 0 ? [outer, circle(e.cx, e.cy, inner).reverse()] : [outer]];
    }
    if (e.type === 'stroke' && e.engine === Engine.ENGINE) {
      const points = Engine.outline(e),
        ring = [];
      if (!points.length) return [];
      let start = points[0];
      for (let i = 0; i < points.length; i++) {
        const c = points[i],
          n = points[(i + 1) % points.length],
          end = [(c[0] + n[0]) / 2, (c[1] + n[1]) / 2],
          steps = Math.max(
            2,
            Math.min(16, Math.ceil(Math.hypot(c[0] - start[0], c[1] - start[1]) / 2))
          );
        for (let j = 0; j < steps; j++) {
          const t = j / steps,
            u = 1 - t;
          ring.push([
            u * u * start[0] + 2 * u * t * c[0] + t * t * end[0],
            u * u * start[1] + 2 * u * t * c[1] + t * t * end[1]
          ]);
        }
        start = end;
      }
      ring.push(points[0]);
      return Clipper.union([ring]);
    }
    if (e.type === 'stroke') {
      const pts = Ink.smooth(e.points, e.smoothing),
        radius = (p) => e.width * (e.pressure ? 0.25 + 0.75 * p.p : 0.5),
        left = [],
        right = [];
      if (pts.length === 1) return [[circle(pts[0].x, pts[0].y, radius(pts[0]))]];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)],
          b = pts[Math.min(pts.length - 1, i + 1)],
          l = Ink.dist(a, b) || 1,
          r = radius(pts[i]),
          nx = (-(b.y - a.y) / l) * r,
          ny = ((b.x - a.x) / l) * r;
        left.push([pts[i].x + nx, pts[i].y + ny]);
        right.push([pts[i].x - nx, pts[i].y - ny]);
      }
      return Clipper.union(
        [left.concat(right.reverse())],
        [circle(pts[0].x, pts[0].y, radius(pts[0]))],
        [circle(pts.at(-1).x, pts.at(-1).y, radius(pts.at(-1)))]
      );
    }
    const parts = Ink.strokeSegments(e).map(([a, b]) => capsule(a, b, e.width / 2));
    if (
      e.fill &&
      e.fill !== 'none' &&
      (['rectangle', 'triangle', 'polygon', 'circle', 'ellipse'].includes(e.type) ||
        (e.type === 'path' && e.closed))
    )
      parts.push([Ink.outline(e, 192).map((p) => [p.x, p.y])]);
    return parts.length ? Clipper.union(...parts) : [];
  }
  function bounds(geometry) {
    const p = [];
    for (const polygon of geometry)
      for (const ring of polygon) for (const [x, y] of ring) p.push({ x, y });
    return Ink.pointBounds(p);
  }
  function path(geometry) {
    return geometry
      .map((poly) =>
        poly
          .map(
            (ring) =>
              'M ' +
              ring.map((p) => p.map((v) => Number(v.toFixed(4))).join(' ')).join(' L ') +
              ' Z'
          )
          .join(' ')
      )
      .join(' ');
  }
  function contains(geometry, p) {
    return geometry.some(
      (poly) =>
        Ink.insidePolygon(
          p,
          poly[0].map(([x, y]) => ({ x, y }))
        ) &&
        !poly.slice(1).some((h) =>
          Ink.insidePolygon(
            p,
            h.map(([x, y]) => ({ x, y }))
          )
        )
    );
  }
  class VisibleCache {
    constructor() {
      this.cache = new WeakMap();
      this.base = new WeakMap();
      this.computations = 0;
    }
    get(e) {
      if (this.cache.has(e)) return this.cache.get(e);
      this.computations++;
      let geometry;
      try {
        const key = e.type === 'stroke' ? e.points : e,
          signature = [
            e.engine,
            e.width,
            e.pressure,
            e.smoothing,
            e.streamline,
            e.minWidth,
            e.pressureGamma,
            e.pressureMin,
            e.pressureMax,
            e.cornerProtection,
            e.adaptiveInk
          ].join('|'),
          cached = this.base.get(key);
        geometry = cached?.signature === signature ? cached.geometry : rawGeometry(e);
        if (!cached || cached.signature !== signature) this.base.set(key, { signature, geometry });
        if (e.erasures?.length) {
          const cuts = e.erasures.map((c) =>
            capsule({ x: c.x1, y: c.y1 }, { x: c.x2, y: c.y2 }, c.r)
          );
          for (let i = 0; i < cuts.length; i += 64)
            geometry = Clipper.difference(geometry, ...cuts.slice(i, i + 64));
        }
        const value = { geometry, bounds: bounds(geometry), path: path(geometry) };
        this.cache.set(e, value);
        return value;
      } catch (error) {
        const value = { geometry: null, bounds: Ink.elementBounds(e), error: String(error) };
        this.cache.set(e, value);
        return value;
      }
    }
    retainTransform(original, moved, tx) {
      const previous = this.cache.get(original);
      if (!previous?.geometry) return;
      const o = tx.origin || { x: 0, y: 0 },
        k = tx.scale ?? 1,
        c = Math.cos(tx.angle || 0) * k,
        s = Math.sin(tx.angle || 0) * k;
      const geometry = previous.geometry.map((poly) =>
        poly.map((ring) =>
          ring.map(([x, y]) => [
            o.x + c * (x - o.x) - s * (y - o.y) + (tx.dx || 0),
            o.y + s * (x - o.x) + c * (y - o.y) + (tx.dy || 0)
          ])
        )
      );
      let svg;
      this.cache.set(moved, {
        geometry,
        bounds: bounds(geometry),
        get path() {
          return (svg ??= path(geometry));
        }
      });
    }
    hit(e, p, tolerance = 0) {
      const g = this.get(e);
      if (!g.geometry) return !Ink.erased(e, p) && Ink.hit(e, p, tolerance);
      if (!g.bounds || !Ink.contains(Ink.expand(g.bounds, tolerance), p)) return false;
      if (contains(g.geometry, p)) return true;
      if (Ink.erased(e, p)) return false;
      for (const poly of g.geometry)
        for (const ring of poly)
          for (let i = 1; i < ring.length; i++)
            if (
              Ink.segmentDistance(
                p,
                { x: ring[i - 1][0], y: ring[i - 1][1] },
                { x: ring[i][0], y: ring[i][1] }
              ) <= tolerance
            )
              return true;
      return false;
    }
    contained(e, points) {
      const g = this.get(e);
      if (!g.geometry?.length) return false;
      try {
        return Clipper.difference(g.geometry, [points.map((p) => [p.x, p.y])]).length === 0;
      } catch {
        return false;
      }
    }
    lasso(e, points) {
      const g = this.get(e);
      if (!g.geometry) return Ink.lassoHit(e, points);
      if (!g.bounds || !Ink.overlaps(g.bounds, Ink.pointBounds(points))) return false;
      try {
        return Clipper.intersection(g.geometry, [points.map((p) => [p.x, p.y])]).length > 0;
      } catch {
        return false;
      }
    }
    bounds(elements) {
      const points = [];
      for (const e of elements) {
        const b = this.get(e).bounds;
        if (b) points.push({ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h });
      }
      return Ink.pointBounds(points);
    }
  }
  class SpatialIndex {
    constructor() {
      this.source = null;
      this.cells = new Map();
      this.large = [];
      this.records = [];
      this.size = 512;
    }
    sync(elements) {
      if (this.source === elements) return;
      this.source = elements;
      this.cells.clear();
      this.large = [];
      this.records = [];
      for (let order = 0; order < elements.length; order++) {
        const e = elements[order],
          b = Ink.elementBounds(e);
        if (!b) continue;
        const rec = { e, b, order };
        this.records.push(rec);
        const x0 = Math.floor(b.x / 512),
          y0 = Math.floor(b.y / 512),
          x1 = Math.floor((b.x + b.w) / 512),
          y1 = Math.floor((b.y + b.h) / 512);
        if ((x1 - x0 + 1) * (y1 - y0 + 1) > 256) {
          this.large.push(rec);
          continue;
        }
        for (let x = x0; x <= x1; x++)
          for (let y = y0; y <= y1; y++) {
            const key = x + ',' + y;
            if (!this.cells.has(key)) this.cells.set(key, []);
            this.cells.get(key).push(rec);
          }
      }
    }
    query(b) {
      const x0 = Math.floor(b.x / 512),
        y0 = Math.floor(b.y / 512),
        x1 = Math.floor((b.x + b.w) / 512),
        y1 = Math.floor((b.y + b.h) / 512);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4096)
        return this.records.filter((r) => Ink.overlaps(r.b, b)).map((r) => r.e);
      const found = new Set(this.large);
      for (let x = x0; x <= x1; x++)
        for (let y = y0; y <= y1; y++)
          for (const r of this.cells.get(x + ',' + y) || []) found.add(r);
      return [...found]
        .filter((r) => Ink.overlaps(r.b, b))
        .sort((a, b) => a.order - b.order)
        .map((r) => r.e);
    }
  }
  module.exports = { VisibleCache, SpatialIndex, rawGeometry, capsule, contains };

  return module.exports;
})();
