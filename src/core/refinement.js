/* Local, bounded editing helpers. All geometry stays in page coordinates. */
const Refinement = (() => {
  const xy = (p) => ({ x: p.x, y: p.y });
  function nearest(e, p) {
    let best = null;
    const count = e.nodes.length - (e.closed ? 0 : 1);
    for (let i = 0; i < count; i++) {
      const a = e.nodes[i],
        b = e.nodes[(i + 1) % e.nodes.length];
      for (let j = 0; j < 32; j++) {
        const u = VectorOps.cubic(a, b, j / 32),
          v = VectorOps.cubic(a, b, (j + 1) / 32),
          dx = v.x - u.x,
          dy = v.y - u.y,
          k = Ink.clamp(((p.x - u.x) * dx + (p.y - u.y) * dy) / (dx * dx + dy * dy || 1), 0, 1),
          q = { x: u.x + dx * k, y: u.y + dy * k },
          d = Ink.dist(p, q);
        if (!best || d < best.distance) best = { index: i, t: (j + k) / 32, point: q, distance: d };
      }
    }
    return best;
  }
  function bend(e, index, t, delta) {
    const nodes = e.nodes.map((n) => ({ ...n })),
      a = nodes[index],
      b = nodes[(index + 1) % nodes.length],
      factor = 1 / Math.max(0.15, 3 * t * (1 - t)),
      c = a.out || xy(a),
      d = b.in || xy(b);
    a.out = { x: c.x + delta.x * factor, y: c.y + delta.y * factor };
    b.in = { x: d.x + delta.x * factor, y: d.y + delta.y * factor };
    a.kind = b.kind = 'corner';
    return { ...e, nodes };
  }
  function translateNodes(e, indices, delta) {
    return {
      ...e,
      nodes: e.nodes.map((n, i) => {
        if (!indices.has(i)) return n;
        return {
          ...n,
          x: n.x + delta.x,
          y: n.y + delta.y,
          ...(n.in ? { in: { x: n.in.x + delta.x, y: n.in.y + delta.y } } : {}),
          ...(n.out ? { out: { x: n.out.x + delta.x, y: n.out.y + delta.y } } : {})
        };
      })
    };
  }
  function ringList(e) {
    return e.geometry.flatMap((poly, polygon) =>
      poly.map((ring, hole) => ({
        polygon,
        hole,
        ring,
        label: 'Parte ' + (polygon + 1) + ' · ' + (hole ? 'furo ' + hole : 'contorno externo')
      }))
    );
  }
  function editRing(e, ringIndex, node, p) {
    const item = ringList(e)[ringIndex];
    if (!item) return e;
    return {
      ...e,
      geometry: e.geometry.map((poly, i) =>
        i !== item.polygon
          ? poly
          : poly.map((r, j) =>
              j !== item.hole
                ? r
                : r.map((q, k) =>
                    k === node || (node === 0 && k === r.length - 1) ? [p.x, p.y] : q
                  )
            )
      )
    };
  }
  function normalizeRegion(e) {
    const geometry = Clipper.union(e.geometry);
    if (!geometry.length) throw new Error('A edição remove toda a região.');
    return { ...e, geometry };
  }
  function parameterize(e) {
    let frame, kind;
    if (e.type === 'circle') {
      kind = 'circle';
      frame = [
        { x: e.cx - e.r, y: e.cy - e.r },
        { x: e.cx + e.r, y: e.cy - e.r },
        { x: e.cx - e.r, y: e.cy + e.r }
      ];
    } else if (e.type === 'ellipse') {
      kind = 'ellipse';
      frame = [
        { x: e.cx - e.rx, y: e.cy - e.ry },
        { x: e.cx + e.rx, y: e.cy - e.ry },
        { x: e.cx - e.rx, y: e.cy + e.ry }
      ].map((p) => Ink.rotatePoint(p, { x: e.cx, y: e.cy }, e.angle || 0));
    } else if (e.type === 'rectangle') {
      const [a, b, c, d] = e.corners,
        w = Ink.dist(a, b),
        h = Ink.dist(a, d);
      if (
        !w ||
        !h ||
        Math.abs((b.x - a.x) * (d.x - a.x) + (b.y - a.y) * (d.y - a.y)) > w * h * 0.001 ||
        Math.abs(Ink.dist(b, c) - h) > h * 0.001
      )
        return e;
      frame = [xy(a), xy(b), xy(d)];
      kind = Math.abs(w - h) < Math.max(w, h) * 0.001 ? 'square' : 'rectangle';
    } else return e;
    return {
      ...e,
      shapeKind: kind,
      shapeFrame: frame,
      shapeOptions: ShapeKit.options(e.shapeOptions)
    };
  }
  function parameterHandles(e) {
    if (!e.shapeFrame) return [];
    const [a, b, c] = e.shapeFrame,
      w = Ink.dist(a, b),
      h = Ink.dist(a, c),
      u = { x: (b.x - a.x) / w, y: (b.y - a.y) / w },
      v = { x: (c.x - a.x) / h, y: (c.y - a.y) / h };
    if (e.type === 'circle')
      return [{ x: e.cx + u.x * e.r, y: e.cy + u.y * e.r, key: 'radius', label: 'Raio' }];
    const out = [
      { ...b, key: 'width', label: e.shapeKind === 'circle' ? 'Diâmetro' : 'Largura' },
      { ...c, key: 'height', label: 'Altura' }
    ];
    if (e.shapeKind === 'rounded') {
      const r = Math.min(w, h) * (e.shapeOptions?.rounding || 0.2);
      out.push({ x: a.x + u.x * r, y: a.y + u.y * r, key: 'rounding', label: 'Arredondamento' });
    }
    return out;
  }
  function parameterEdit(e, key, p) {
    if (key === 'radius' && e.type === 'circle')
      return parameterize({ ...e, r: Math.max(0.1, Ink.dist(p, { x: e.cx, y: e.cy })) });
    const [a, b, c] = e.shapeFrame,
      w = Ink.dist(a, b),
      h = Ink.dist(a, c),
      u = { x: (b.x - a.x) / w, y: (b.y - a.y) / w },
      v = { x: (c.x - a.x) / h, y: (c.y - a.y) / h },
      project = (axis) => Math.max(0.1, (p.x - a.x) * axis.x + (p.y - a.y) * axis.y),
      opts = { ...e.shapeOptions };
    let width = w,
      height = h;
    if (key === 'rounding') opts.rounding = Ink.clamp(project(u) / Math.min(w, h), 0.01, 0.5);
    else if (key === 'width') width = project(u);
    else height = project(v);
    if (['circle', 'square'].includes(e.shapeKind))
      width = height = key === 'height' ? height : width;
    const frame = [
      a,
      { x: a.x + u.x * width, y: a.y + u.y * width },
      { x: a.x + v.x * height, y: a.y + v.y * height }
    ];
    const rebuilt = ShapeKit.rebuild({ ...e, shapeFrame: frame }, opts);
    return { ...e, ...rebuilt };
  }
  function gaps(elements, maxGap = 60) {
    const ss = [],
      ends = [];
    for (const e of elements) {
      if (e.erasures?.length || ['image', 'text'].includes(e.type)) continue;
      for (const ring of VectorOps.rings(e)) {
        for (let i = 1; i < ring.length; i++) {
          ss.push({ a: ring[i - 1], b: ring[i] });
          if (ss.length > 900) throw new Error('Selecione menos contornos para localizar frestas.');
        }
        if (!VectorOps.closed(e) && ring.length > 1) ends.push(ring[0], ring.at(-1));
      }
    }
    const result = [];
    for (const p of ends) {
      let incidence = 0,
        best = null;
      for (const s of ss) {
        const dx = s.b.x - s.a.x,
          dy = s.b.y - s.a.y,
          t = Ink.clamp(((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1),
          q = { x: s.a.x + dx * t, y: s.a.y + dy * t },
          d = Ink.dist(p, q);
        if (d < 1e-5) {
          incidence++;
          continue;
        }
        if (d <= maxGap && (!best || d < best.distance)) best = { a: xy(p), b: q, distance: d };
      }
      if (incidence > 1 || !best) continue;
      if (!result.some((g) => Ink.dist(g.a, best.b) < 1e-5 && Ink.dist(g.b, best.a) < 1e-5))
        result.push(best);
    }
    return result.sort((a, b) => a.distance - b.distance).slice(0, 12);
  }
  function trimTarget(elements, p, tolerance) {
    let best = null,
      d = tolerance;
    for (const e of elements) {
      if (e.erasures?.length || ['image', 'text', 'region', 'arrow'].includes(e.type)) continue;
      for (const ring of VectorOps.rings(e))
        for (let i = 1; i < ring.length; i++) {
          const n = Ink.segmentDistance(p, ring[i - 1], ring[i]);
          if (n < d) {
            d = n;
            best = e;
          }
        }
    }
    return best;
  }
  function run(op, args) {
    if (op === 'boolean') return VectorOps.boolean(args.elements, args.kind);
    if (op === 'fill') return VectorOps.fill(args.elements, args.point, args.gap, args.style);
    if (op === 'gaps') return gaps(args.elements, args.gap);
    if (op === 'normalize') return normalizeRegion(args.element);
    if (op === 'trim') {
      const target = trimTarget(args.elements, args.point, args.tolerance);
      if (!target) throw new Error('Aproxime o cursor de um contorno selecionado.');
      return {
        targetId: target.id,
        ...VectorOps.trim(
          target,
          args.elements.filter((e) => e !== target),
          args.point,
          true
        )
      };
    }
    throw new Error('Operação desconhecida.');
  }
  return {
    nearest,
    bend,
    translateNodes,
    ringList,
    editRing,
    normalizeRegion,
    parameterize,
    parameterHandles,
    parameterEdit,
    gaps,
    trimTarget,
    run
  };
})();
