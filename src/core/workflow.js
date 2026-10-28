const Workflow = (() => {
  const module = { exports: {} };
  ('use strict');

  function viewport(camera, zoom, size) {
    return Ink.pointBounds(
      [
        { x: 0, y: 0 },
        { x: size.w, y: 0 },
        { x: size.w, y: size.h },
        { x: 0, y: size.h }
      ].map((p) => Ink.screenToWorld(p, camera, zoom))
    );
  }
  function groupPath(e) {
    return e.groupPath?.length ? e.groupPath : e.groupId ? [e.groupId] : [];
  }
  function inPolygon(p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i],
        b = poly[j];
      if (Ink.segmentDistance(p, a, b) < 1e-7) return true;
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
        inside = !inside;
    }
    return inside;
  }
  function contained(e, poly, visible) {
    return visible.contained(e, poly);
  }
  function expandGroups(elements, ids, isolation) {
    const selected = elements.filter((e) => ids.has(e.id)),
      groups = new Set(
        selected
          .map((e) => {
            const p = groupPath(e),
              i = isolation ? p.indexOf(isolation) + 1 : 0;
            return p[i];
          })
          .filter(Boolean)
      );
    return new Set(
      elements
        .filter((e) => ids.has(e.id) || groupPath(e).some((g) => groups.has(g)))
        .map((e) => e.id)
    );
  }
  function dimensions(elements, unit = 'px', ppi = 96) {
    const b = Ink.bounds(elements);
    if (!b) return null;
    const ratio = { px: 1, mm: 25.4 / ppi, cm: 2.54 / ppi, in: 1 / ppi }[unit] || 1;
    return { w: b.w * ratio, h: b.h * ratio, unit };
  }
  function constrain(e, reference, kind) {
    if (kind === 'circle' && e.type === 'ellipse')
      return { ...e, rx: (e.rx + e.ry) / 2, ry: (e.rx + e.ry) / 2 };
    if (kind === 'square' && e.type === 'rectangle') {
      const [a, b, , d] = e.corners,
        w = Ink.dist(a, b),
        h = Ink.dist(a, d),
        n = (w + h) / 2;
      if (!w || !h) return e;
      const u = { x: ((b.x - a.x) * n) / w, y: ((b.y - a.y) * n) / w },
        v = { x: -u.y, y: u.x };
      return {
        ...e,
        corners: [
          a,
          { x: a.x + u.x, y: a.y + u.y },
          { x: a.x + u.x + v.x, y: a.y + u.y + v.y },
          { x: a.x + v.x, y: a.y + v.y }
        ]
      };
    }
    if (kind === 'tangent' && reference?.type === 'circle' && e.type === 'line') {
      const len = Math.hypot(e.x2 - e.x1, e.y2 - e.y1);
      if (!len) return e;
      const ux = (e.x2 - e.x1) / len,
        uy = (e.y2 - e.y1) / len,
        nx = -uy,
        ny = ux,
        side =
          ((e.x1 + e.x2) / 2 - reference.cx) * nx + ((e.y1 + e.y2) / 2 - reference.cy) * ny < 0
            ? -1
            : 1,
        cx = reference.cx + nx * reference.r * side,
        cy = reference.cy + ny * reference.r * side,
        out = {
          ...e,
          x1: cx - (ux * len) / 2,
          y1: cy - (uy * len) / 2,
          x2: cx + (ux * len) / 2,
          y2: cy + (uy * len) / 2
        };
      delete out.bindings;
      return out;
    }
    if (
      !reference ||
      !['line', 'arrow'].includes(e.type) ||
      !['line', 'arrow'].includes(reference.type)
    )
      return e;
    const length =
        kind === 'equal'
          ? Math.hypot(reference.x2 - reference.x1, reference.y2 - reference.y1)
          : Math.hypot(e.x2 - e.x1, e.y2 - e.y1),
      angle =
        kind === 'equal'
          ? Math.atan2(e.y2 - e.y1, e.x2 - e.x1)
          : Math.atan2(reference.y2 - reference.y1, reference.x2 - reference.x1) +
            (kind === 'perpendicular' ? Math.PI / 2 : 0);
    const out = { ...e, x2: e.x1 + length * Math.cos(angle), y2: e.y1 + length * Math.sin(angle) };
    delete out.bindings;
    return out;
  }
  function validateAssets(value) {
    if (!Array.isArray(value) || value.length > 20 || JSON.stringify(value).length > 10000000)
      throw new Error('Máximo: 20 elementos / 10 MB.');
    return value.map((a) => {
      if (
        !a ||
        typeof a.name !== 'string' ||
        a.name.length > 100 ||
        JSON.stringify(a.doc).length > 2000000
      )
        throw new Error('Elemento inválido.');
      return {
        id: Ink.uid(),
        name: a.name,
        category: String(a.category || 'Geral').slice(0, 80),
        doc: Ink.parse(Ink.serialize(a.doc))
      };
    });
  }
  function cloneGroups(elements) {
    const ids = new Map();
    return elements.map((e) => {
      const path = groupPath(e).map((g) => {
        if (!ids.has(g)) ids.set(g, Ink.uid());
        return ids.get(g);
      });
      const copy = { ...e };
      if (path.length) {
        copy.groupPath = path;
        copy.groupId = path[0];
      }
      return copy;
    });
  }
  module.exports = {
    viewport,
    groupPath,
    inPolygon,
    contained,
    expandGroups,
    dimensions,
    constrain,
    validateAssets,
    cloneGroups
  };

  return module.exports;
})();
