/* Explicit vector operations. Work is bounded and never runs during ink sampling. */
const VectorOps = (() => {
  const xy = (p) => ({ x: p.x, y: p.y }),
    lerp = (a, b, t) => {
      const q = {};
      for (const k of ['x', 'y', 'p', 't', 'tiltX', 'tiltY'])
        if (a[k] !== undefined && b[k] !== undefined) q[k] = a[k] + (b[k] - a[k]) * t;
      return q;
    };
  const clean = (e) => {
    const out = { ...e };
    for (const k of [
      'shapeKind',
      'shapeOptions',
      'shapeFrame',
      'bindings',
      'geometryRule',
      'connector',
      'controls',
      'waypoints',
      'erasures',
      'points',
      'nodes',
      'geometry',
      'corners',
      'cx',
      'cy',
      'r',
      'rx',
      'ry',
      'angle',
      'x1',
      'y1',
      'x2',
      'y2',
      'headLength'
    ])
      delete out[k];
    return out;
  };
  const closed = (e) =>
    ['rectangle', 'triangle', 'polygon', 'circle', 'ellipse', 'region'].includes(e.type) ||
    (e.type === 'path' && e.closed);
  function cubic(a, b, t) {
    const c = a.out || a,
      d = b.in || b,
      u = 1 - t;
    return {
      x: u * u * u * a.x + 3 * u * u * t * c.x + 3 * u * t * t * d.x + t * t * t * b.x,
      y: u * u * u * a.y + 3 * u * u * t * c.y + 3 * u * t * t * d.y + t * t * t * b.y
    };
  }
  function flatten(e) {
    const p = [];
    for (let i = 0; i < e.nodes.length - (e.closed ? 0 : 1); i++) {
      const a = e.nodes[i],
        b = e.nodes[(i + 1) % e.nodes.length],
        steps = a.out || b.in ? 24 : 1;
      if (!i) p.push(xy(a));
      for (let j = 1; j <= steps; j++) p.push(cubic(a, b, j / steps));
    }
    return p;
  }
  function path(e) {
    const f = (n) => Number(n.toFixed(4)),
      coord = (p) => f(p.x) + ' ' + f(p.y);
    if (e.type === 'region')
      return e.geometry
        .map((poly) =>
          poly.map((r) => 'M ' + r.map((p) => p.map(f).join(' ')).join(' L ') + ' Z').join(' ')
        )
        .join(' ');
    let s = 'M ' + coord(e.nodes[0]);
    for (let i = 0; i < e.nodes.length - (e.closed ? 0 : 1); i++) {
      const a = e.nodes[i],
        b = e.nodes[(i + 1) % e.nodes.length];
      s +=
        a.out || b.in
          ? ' C ' + coord(a.out || a) + ' ' + coord(b.in || b) + ' ' + coord(b)
          : ' L ' + coord(b);
    }
    return s + (e.closed ? ' Z' : '');
  }
  function rings(e) {
    if (e.type === 'region') return e.geometry.flat().map((r) => r.map(([x, y]) => ({ x, y })));
    return [Ink.outline(e, 128)];
  }
  function interior(e) {
    if (!closed(e) || e.erasures?.length)
      throw new Error('Use formas fechadas sem recortes de borracha.');
    if (e.type === 'region') return e.geometry;
    return Clipper.union([Ink.outline(e, 128).map((p) => [p.x, p.y])]);
  }
  function region(geometry, style) {
    if (!geometry.length) throw new Error('A operação não produz uma área preenchida.');
    return {
      ...clean(style),
      type: 'region',
      geometry,
      fill: style.fill && style.fill !== 'none' ? style.fill : style.color
    };
  }
  function boolean(selected, op) {
    if (selected.length < 2 || selected.length > 32)
      throw new Error('Selecione de 2 a 32 formas fechadas.');
    if (new Set(selected.map((e) => e.layerId)).size !== 1)
      throw new Error('Use formas da mesma camada.');
    const g = selected.map(interior);
    if (
      g.reduce(
        (sum, geometry) =>
          sum + geometry.reduce((s, p) => s + p.reduce((n, r) => n + r.length, 0), 0),
        0
      ) > 20000
    )
      throw new Error('Seleção muito complexa; reduza os contornos.');
    if (!['union', 'difference', 'intersection', 'xor'].includes(op))
      throw new Error('Operação inválida.');
    return region(Clipper[op](...g), selected[0]);
  }
  function toPath(e) {
    if (e.type === 'path') return e;
    if (e.erasures?.length || ['image', 'text', 'region'].includes(e.type))
      throw new Error('Escolha uma forma simples ou um traço sem recortes.');
    let points = e.connector ? Ink.connectorBody(e) : Ink.outline(e, 64),
      isClosed = closed(e);
    if (isClosed) points = points.slice(0, -1);
    if (points.length > 128) points = Ink.resample(points, 128);
    return {
      ...clean(e),
      type: 'path',
      closed: isClosed,
      fill: isClosed ? e.fill || 'none' : 'none',
      nodes: points.map((p) => ({ ...xy(p), kind: 'corner' }))
    };
  }
  function handles(e) {
    return e.nodes.flatMap((n, i) => [
      { ...xy(n), index: i * 3 },
      ...(n.in ? [{ ...n.in, index: i * 3 + 1, control: true }] : []),
      ...(n.out ? [{ ...n.out, index: i * 3 + 2, control: true }] : [])
    ]);
  }
  function edit(e, index, p) {
    const i = Math.floor(index / 3),
      part = index % 3,
      n = e.nodes[i];
    if (!n) return e;
    const v = { ...n };
    if (!part) {
      const dx = p.x - n.x,
        dy = p.y - n.y;
      Object.assign(v, xy(p));
      for (const key of ['in', 'out']) if (n[key]) v[key] = { x: n[key].x + dx, y: n[key].y + dy };
    } else {
      const key = part === 1 ? 'in' : 'out',
        other = part === 1 ? 'out' : 'in';
      v[key] = xy(p);
      if (n.kind !== 'corner') {
        const len = n.kind === 'symmetric' ? Ink.dist(p, n) : Ink.dist(n[other] || n, n),
          d = Ink.dist(p, n);
        v[other] = d
          ? { x: n.x + ((n.x - p.x) * len) / d, y: n.y + ((n.y - p.y) * len) / d }
          : xy(n);
      }
    }
    return { ...e, nodes: e.nodes.map((q, j) => (j === i ? v : q)) };
  }
  function nodeKind(e, i, kind) {
    if (!e.nodes[i]) throw new Error('Nó inválido.');
    const n = e.nodes[i],
      a = e.nodes[(i - 1 + e.nodes.length) % e.nodes.length],
      b = e.nodes[(i + 1) % e.nodes.length],
      len = Ink.dist(a, b) || 1,
      ux = (b.x - a.x) / len,
      uy = (b.y - a.y) / len,
      v = { ...n, kind };
    if (kind !== 'corner') {
      const left = Ink.dist(a, n) / 3,
        right = kind === 'symmetric' ? left : Ink.dist(n, b) / 3;
      v.in = { x: n.x - ux * left, y: n.y - uy * left };
      v.out = { x: n.x + ux * right, y: n.y + uy * right };
    }
    return { ...e, nodes: e.nodes.map((q, j) => (i === j ? v : q)) };
  }
  function insert(e, i, t = 0.5) {
    t = Ink.clamp(t, 0.001, 0.999);
    if (e.nodes.length >= 128) throw new Error('Limite de 128 nós.');
    if (!e.closed && i === e.nodes.length - 1)
      throw new Error('Escolha um nó que tenha um segmento seguinte.');
    const nodes = e.nodes.map((n) => ({ ...n })),
      a = nodes[i],
      b = nodes[(i + 1) % nodes.length],
      ab = lerp(a, a.out || a, t),
      bc = lerp(a.out || a, b.in || b, t),
      cd = lerp(b.in || b, b, t),
      left = lerp(ab, bc, t),
      right = lerp(bc, cd, t),
      mid = lerp(left, right, t);
    a.out = ab;
    b.in = cd;
    nodes.splice(i + 1, 0, { ...mid, in: left, out: right, kind: 'smooth' });
    return { ...e, nodes };
  }
  function remove(e, i) {
    if (e.nodes.length <= (e.closed ? 3 : 2)) throw new Error('Não é possível remover mais nós.');
    return { ...e, nodes: e.nodes.filter((_, j) => j !== i) };
  }
  function split(e, i) {
    if (e.closed) {
      const nodes = [...e.nodes.slice(i), ...e.nodes.slice(0, i), { ...e.nodes[i] }];
      if (nodes.length > 128) throw new Error('Remova um nó antes de abrir este caminho.');
      return [{ ...e, closed: false, fill: 'none', nodes }];
    }
    if (i <= 0 || i >= e.nodes.length - 1) throw new Error('Escolha um nó interno para dividir.');
    return [
      { ...e, nodes: e.nodes.slice(0, i + 1) },
      { ...e, id: Ink.uid(), nodes: e.nodes.slice(i) }
    ];
  }
  function intersect(a, b, c, d) {
    const ux = b.x - a.x,
      uy = b.y - a.y,
      vx = d.x - c.x,
      vy = d.y - c.y,
      det = ux * vy - uy * vx;
    if (Math.abs(det) < 1e-10) return null;
    const t = ((c.x - a.x) * vy - (c.y - a.y) * vx) / det,
      u = ((c.x - a.x) * uy - (c.y - a.y) * ux) / det;
    return t >= -1e-8 && t <= 1 + 1e-8 && u >= -1e-8 && u <= 1 + 1e-8
      ? { t: Ink.clamp(t, 0, 1), u: Ink.clamp(u, 0, 1) }
      : null;
  }
  function segments(elements, max = 900) {
    const out = [];
    for (const e of elements) {
      if (['image', 'text'].includes(e.type) || e.erasures?.length) continue;
      for (const pts of rings(e))
        for (let i = 1; i < pts.length; i++) {
          if (Ink.dist(pts[i - 1], pts[i]) > 1e-8)
            out.push({ a: pts[i - 1], b: pts[i], e, index: i - 1 });
          if (out.length > max)
            throw new Error('Selecione uma região menor: limite de ' + max + ' segmentos.');
        }
    }
    return out;
  }
  function trim(target, others, p, detail = false) {
    if (target.erasures?.length || ['image', 'text', 'region', 'arrow'].includes(target.type))
      throw new Error('Recorte uma linha, curva ou contorno simples sem borracha.');
    const pts = target.connector ? Ink.connectorBody(target) : Ink.outline(target, 128);
    if (pts.length > 20000) throw new Error('O traço excede 20 mil pontos.');
    const seg = segments(others),
      cuts = [0, pts.length - 1];
    if (pts.length * seg.length > 1500000) throw new Error('Reduza a seleção antes de recortar.');
    let nearest = Infinity,
      at = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1],
        b = pts[i],
        d = Ink.segmentDistance(p, a, b);
      if (d < nearest) {
        nearest = d;
        const l = Ink.dist(a, b) ** 2;
        at =
          i -
          1 +
          Ink.clamp(((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (l || 1), 0, 1);
      }
      for (const s of seg) {
        const x = intersect(a, b, s.a, s.b);
        if (x) cuts.push(i - 1 + x.t);
      }
    }
    const crossings = cuts.slice(2);
    const unique = cuts.sort((a, b) => a - b).filter((v, i, a) => !i || v - a[i - 1] > 1e-7);
    if (unique.length < 3) throw new Error('Nenhuma interseção encontrada.');
    let k = unique.findIndex(
      (v, i) => i < unique.length - 1 && at >= v - 1e-7 && at <= unique[i + 1] + 1e-7
    );
    if (k < 0) k = unique.length - 2;
    const sample = (t) => {
        const i = Math.min(pts.length - 2, Math.floor(t));
        return lerp(pts[i], pts[i + 1], t - i);
      },
      slice = (a, b) => [
        sample(a),
        ...pts.filter((_, i) => i > a + 1e-7 && i < b - 1e-7),
        sample(b)
      ];
    let parts = [],
      removed = [];
    const lo = unique[k],
      hi = unique[k + 1],
      end = pts.length - 1;
    if (closed(target)) {
      const cross = crossings
        .map((t) => (Math.abs(t - end) < 1e-7 ? 0 : t))
        .sort((a, b) => a - b)
        .filter((t, i, a) => !i || t - a[i - 1] > 1e-7);
      if (cross.length < 2)
        throw new Error('Um contorno fechado precisa de duas interseções distintas.');
      const prev = cross.filter((t) => t <= at + 1e-7).at(-1) ?? cross.at(-1),
        next = cross.find((t) => t > at + 1e-7) ?? cross[0];
      removed = prev < next ? slice(prev, next) : [...slice(prev, end), ...slice(0, next).slice(1)];
      parts =
        next < prev ? [slice(next, prev)] : [[...slice(next, end), ...slice(0, prev).slice(1)]];
    } else {
      removed = slice(lo, hi);
      if (lo > 1e-7) parts.push(slice(0, lo));
      if (hi < end - 1e-7) parts.push(slice(hi, end));
    }
    const pieces = parts
      .filter((p) => Ink.pathLength(p) > 0.01)
      .map((points, i) =>
        target.type === 'stroke'
          ? { ...clean(target), id: i ? Ink.uid() : target.id, points }
          : {
              ...clean(target),
              id: i ? Ink.uid() : target.id,
              type: 'path',
              closed: false,
              fill: 'none',
              nodes: points.map((p) => ({ ...xy(p), kind: 'corner' }))
            }
      );
    return detail ? { pieces, removed } : pieces;
  }
  // Build a bounded planar graph; walk bounded faces. Only explicit endpoints are welded.
  function fill(elements, p, gap, style) {
    if (elements.length > 64) throw new Error('Selecione até 64 contornos.');
    const ss = segments(elements, 800).map((s) => ({ ...s, cuts: [0, 1] }));
    gap = Ink.clamp(gap, 0, 20);
    const ends = [];
    for (const e of elements) {
      if (closed(e) || ['image', 'text', 'region'].includes(e.type)) continue;
      const v = Ink.outline(e);
      if (v.length) {
        ends.push(v[0], v.at(-1));
      }
    }
    // Join a nearby endpoint to another endpoint or edge without moving original ink.
    const bridges = [];
    for (const a of ends) {
      let best = null,
        d = gap + 1e-8;
      for (const s of ss) {
        if (Ink.dist(a, s.a) < 1e-7 || Ink.dist(a, s.b) < 1e-7) continue;
        const ux = s.b.x - s.a.x,
          uy = s.b.y - s.a.y,
          t = Ink.clamp(((a.x - s.a.x) * ux + (a.y - s.a.y) * uy) / (ux * ux + uy * uy), 0, 1),
          q = lerp(s.a, s.b, t),
          n = Ink.dist(a, q);
        if (n < d && n > 1e-7) {
          d = n;
          best = q;
        }
      }
      if (best) bridges.push({ a, b: best, cuts: [0, 1] });
    }
    ss.push(...bridges);
    if (ss.length > 1000) throw new Error('Contorno muito complexo.');
    for (let i = 0; i < ss.length; i++)
      for (let j = i + 1; j < ss.length; j++) {
        const x = intersect(ss[i].a, ss[i].b, ss[j].a, ss[j].b);
        if (x) {
          ss[i].cuts.push(x.t);
          ss[j].cuts.push(x.u);
        }
      }
    const nodes = [],
      map = new Map(),
      adj = [],
      edges = new Set();
    const vertex = (p) => {
      const key = Math.round(p.x * 1e5) + ',' + Math.round(p.y * 1e5);
      if (!map.has(key)) {
        map.set(key, nodes.length);
        nodes.push(xy(p));
        adj.push(new Set());
      }
      return map.get(key);
    };
    for (const s of ss) {
      const ts = s.cuts.sort((a, b) => a - b).filter((v, i, a) => !i || v - a[i - 1] > 1e-7);
      for (let i = 1; i < ts.length; i++) {
        const a = vertex(lerp(s.a, s.b, ts[i - 1])),
          b = vertex(lerp(s.a, s.b, ts[i]));
        if (a !== b) {
          adj[a].add(b);
          adj[b].add(a);
          edges.add(a + ',' + b);
          edges.add(b + ',' + a);
        }
      }
    }
    if (edges.size > 20000) throw new Error('Muitas interseções; reduza a seleção.');
    const sorted = adj.map((set, i) =>
        [...set].sort(
          (a, b) =>
            Math.atan2(nodes[a].y - nodes[i].y, nodes[a].x - nodes[i].x) -
            Math.atan2(nodes[b].y - nodes[i].y, nodes[b].x - nodes[i].x)
        )
      ),
      seen = new Set(),
      faces = [];
    for (const key of edges) {
      if (seen.has(key)) continue;
      let [a, b] = key.split(',').map(Number),
        start = a,
        next = b,
        ring = [],
        valid = false;
      for (let n = 0; n <= edges.size; n++) {
        const k = a + ',' + b;
        if (seen.has(k)) break;
        seen.add(k);
        ring.push(nodes[a]);
        const list = sorted[b],
          i = list.indexOf(a),
          c = list[(i - 1 + list.length) % list.length];
        a = b;
        b = c;
        if (a === start && b === next) {
          valid = true;
          break;
        }
      }
      if (!valid || ring.length < 3) continue;
      let area = 0;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i],
          b = ring[(i + 1) % ring.length];
        area += a.x * b.y - b.x * a.y;
      }
      if (area > 1e-5) faces.push({ ring, area: area / 2 });
    }
    const face = faces
      .filter((f) => Ink.insidePolygon(p, f.ring))
      .sort((a, b) => a.area - b.area)[0];
    if (!face)
      throw new Error('Não há uma área fechada aqui. Ajuste a tolerância ou feche a abertura.');
    let g = Clipper.union([face.ring.map((q) => [q.x, q.y])]);
    const holes = faces.filter(
      (f) =>
        f !== face &&
        f.area < face.area &&
        !Ink.insidePolygon(p, f.ring) &&
        f.ring.every((q) => Ink.insidePolygon(q, face.ring))
    );
    if (holes.length)
      g = Clipper.difference(g, ...holes.map((f) => [f.ring.map((q) => [q.x, q.y])]));
    return region(g, { ...style, id: Ink.uid() });
  }
  function repeat(selected, { count, dx, dy, angle }) {
    if (
      !selected.length ||
      count < 1 ||
      count > 100 ||
      !Number.isInteger(count) ||
      ![dx, dy, angle].every(Number.isFinite) ||
      count * selected.length > 2000
    )
      throw new Error('Use até 100 cópias e 2 mil objetos por repetição.');
    const b = Ink.bounds(selected),
      origin = { x: b.x + b.w / 2, y: b.y + b.h / 2 },
      out = [];
    for (let i = 1; i <= count; i++) {
      const ids = new Map(selected.map((e) => [e.id, Ink.uid()]));
      for (const e of Workflow.cloneGroups(selected)) {
        const copy = Ink.transform(e, { dx: dx * i, dy: dy * i, angle: angle * i, origin });
        copy.id = ids.get(e.id);
        if (copy.bindings) {
          copy.bindings = {};
          for (const [k, v] of Object.entries(e.bindings))
            if (ids.has(v.targetId)) copy.bindings[k] = { ...v, targetId: ids.get(v.targetId) };
        }
        if (copy.geometryRule?.targetId) {
          copy.geometryRule = ids.has(copy.geometryRule.targetId)
            ? { ...copy.geometryRule, targetId: ids.get(copy.geometryRule.targetId) }
            : undefined;
        }
        out.push(copy);
      }
    }
    return Ink.resolveConnections(out);
  }
  function continueStroke(original, stroke, side) {
    let points =
        side === 0
          ? [...stroke.points.slice(1).reverse(), ...original.points]
          : [...original.points, ...stroke.points.slice(1)],
      time = 0;
    points = points.map((p, i) => ({ ...p, t: i ? (time += Math.abs(p.t - points[i - 1].t)) : 0 }));
    const next = { ...original, points };
    delete next.shapeKind;
    delete next.shapeFrame;
    delete next.shapeOptions;
    return next;
  }

  return {
    closed,
    cubic,
    flatten,
    path,
    rings,
    interior,
    boolean,
    toPath,
    handles,
    edit,
    nodeKind,
    insert,
    remove,
    split,
    trim,
    fill,
    repeat,
    continueStroke
  };
})();
