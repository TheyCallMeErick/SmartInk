/* Parameterized primitives and reversible ink operations. No document IO here. */
const ShapeKit = (() => {
  const families = [
    [
      'Quadriláteros',
      [
        ['rectangle', 'Retângulo'],
        ['square', 'Quadrado'],
        ['parallelogram', 'Paralelogramo'],
        ['rhombus', 'Losango'],
        ['trapezoid', 'Trapézio isósceles'],
        ['right-trapezoid', 'Trapézio retângulo'],
        ['kite', 'Deltoide'],
        ['quadrilateral', 'Quadrilátero livre']
      ]
    ],
    [
      'Triângulos',
      [
        ['equilateral', 'Equilátero'],
        ['isosceles', 'Isósceles'],
        ['scalene', 'Escaleno'],
        ['right-triangle', 'Retângulo'],
        ['acute-triangle', 'Acutângulo'],
        ['obtuse-triangle', 'Obtusângulo']
      ]
    ],
    [
      'Círculos, elipses e partes',
      [
        ['circle', 'Círculo'],
        ['ellipse', 'Elipse'],
        ['arc', 'Arco elíptico'],
        ['sector', 'Setor elíptico'],
        ['segment', 'Segmento elíptico']
      ]
    ],
    [
      'Polígonos regulares',
      [
        ['pentagon', 'Pentágono'],
        ['hexagon', 'Hexágono'],
        ['heptagon', 'Heptágono'],
        ['octagon', 'Octógono'],
        ['regular', 'Polígono de n lados']
      ]
    ],
    [
      'Estrelas e formas derivadas',
      [
        ['star', 'Estrela de n pontas'],
        ['rounded', 'Retângulo arredondado']
      ]
    ],
    [
      'Linhas e curvas',
      [
        ['line', 'Segmento de reta'],
        ['arrow', 'Seta'],
        ['bezier', 'Curva de Bézier'],
        ['spiral', 'Espiral']
      ]
    ]
  ];
  const names = Object.fromEntries(families.flatMap(([, items]) => items));
  const options = (o) => ({
    corner: Ink.clamp(Number(o?.corner) || 0, 0, 0.5),
    sides: Math.round(Ink.clamp(Number(o?.sides) || 6, 3, 32)),
    tips: Math.round(Ink.clamp(Number(o?.tips) || 5, 3, 16)),
    inner: Ink.clamp(Number(o?.inner) || 0.45, 0.1, 0.9),
    rounding: Ink.clamp(Number(o?.rounding) || 0.2, 0.01, 0.5),
    start: Ink.clamp(Number(o?.start) || 0, -360, 360),
    sweep: Ink.clamp(Number(o?.sweep) || 240, 5, 355),
    turns: Ink.clamp(Number(o?.turns) || 2, 0.25, 5),
    skew: Ink.clamp(Number(o?.skew) || 0.25, 0.05, 0.45)
  });
  function make(kind, a, b, raw = {}, style = {}) {
    if (!names[kind]) throw new Error('Forma desconhecida.');
    const o = options(raw);
    let x = Math.min(a.x, b.x),
      y = Math.min(a.y, b.y),
      w = Math.max(0.1, Math.abs(b.x - a.x)),
      h = Math.max(0.1, Math.abs(b.y - a.y));
    if (['square', 'circle'].includes(kind)) w = h = Math.min(w, h);
    if (kind === 'equilateral') {
      w = Math.min(w, (h * 2) / Math.sqrt(3));
      h = (w * Math.sqrt(3)) / 2;
    }
    // Angle classes use fixed similar triangles; arbitrary stretching would change their classification.
    if (kind === 'scalene') {
      w = Math.min(w, h / 0.7);
      h = w * 0.7;
    }
    if (kind === 'acute-triangle') {
      w = Math.min(w, h / 0.85);
      h = w * 0.85;
    }
    if (kind === 'obtuse-triangle') {
      w = Math.min(w, h / 0.3);
      h = w * 0.3;
    }
    const p = (u, v) => ({ x: x + u * w, y: y + v * h }),
      poly = (v, type = 'polygon') => ({ type, corners: v.map(([u, v]) => p(u, v)) });
    let shape;
    if (['rectangle', 'square', 'quadrilateral'].includes(kind) && !o.corner)
      shape = poly(
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1]
        ],
        'rectangle'
      );
    else if (kind === 'parallelogram')
      shape = poly([
        [o.skew, 0],
        [1, 0],
        [1 - o.skew, 1],
        [0, 1]
      ]);
    else if (kind === 'rhombus')
      shape = poly([
        [0.5, 0],
        [1, 0.5],
        [0.5, 1],
        [0, 0.5]
      ]);
    else if (kind === 'trapezoid')
      shape = poly([
        [o.skew, 0],
        [1 - o.skew, 0],
        [1, 1],
        [0, 1]
      ]);
    else if (kind === 'right-trapezoid')
      shape = poly([
        [0, 0],
        [1 - o.skew, 0],
        [1, 1],
        [0, 1]
      ]);
    else if (kind === 'kite')
      shape = poly([
        [0.5, 0],
        [1, 0.35],
        [0.5, 1],
        [0, 0.35]
      ]);
    else if (['equilateral', 'isosceles'].includes(kind))
      shape = poly(
        [
          [0.5, 0],
          [1, 1],
          [0, 1]
        ],
        'triangle'
      );
    else if (['scalene', 'right-triangle'].includes(kind))
      shape = poly(
        [
          [0, 0],
          [1, 1],
          [0, 1]
        ],
        'triangle'
      );
    else if (kind === 'acute-triangle')
      shape = poly(
        [
          [0.4, 0],
          [1, 1],
          [0, 1]
        ],
        'triangle'
      );
    else if (kind === 'obtuse-triangle')
      shape = poly(
        [
          [0.35, 0],
          [1, 1],
          [0, 1]
        ],
        'triangle'
      );
    else if (kind === 'circle') shape = { type: 'circle', cx: x + w / 2, cy: y + h / 2, r: w / 2 };
    else if (kind === 'ellipse')
      shape = { type: 'ellipse', cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2, angle: 0 };
    else if (['regular', 'pentagon', 'hexagon', 'heptagon', 'octagon', 'star'].includes(kind)) {
      const n =
          { pentagon: 5, hexagon: 6, heptagon: 7, octagon: 8 }[kind] ||
          (kind === 'star' ? o.tips : o.sides),
        count = kind === 'star' ? n * 2 : n,
        r = Math.min(w, h) / 2;
      shape = {
        type: 'polygon',
        corners: Array.from({ length: count }, (_, i) => {
          const angle = -Math.PI / 2 + (i * Math.PI * 2) / count,
            rr = r * (kind === 'star' && i % 2 ? o.inner : 1);
          return { x: x + w / 2 + Math.cos(angle) * rr, y: y + h / 2 + Math.sin(angle) * rr };
        })
      };
    } else if (
      kind === 'rounded' ||
      (['rectangle', 'square', 'quadrilateral'].includes(kind) && o.corner)
    ) {
      const r = Math.min(w, h) * (kind === 'rounded' ? o.rounding : o.corner),
        corners = [];
      for (const [cx, cy, start] of [
        [x + w - r, y + r, -90],
        [x + w - r, y + h - r, 0],
        [x + r, y + h - r, 90],
        [x + r, y + r, 180]
      ])
        for (let i = 0; i < 8; i++) {
          const t = ((start + (i / 7) * 90) * Math.PI) / 180;
          corners.push({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) });
        }
      shape = { type: 'polygon', corners };
    } else if (kind === 'spiral') {
      shape = {
        type: 'stroke',
        pressure: false,
        smoothing: 0,
        streamline: 0,
        adaptiveInk: false,
        points: Array.from({ length: Math.ceil(o.turns * 64) + 1 }, (_, i) => {
          const count = Math.ceil(o.turns * 64),
            t = i / count,
            theta = ((o.start + 360 * o.turns * t) * Math.PI) / 180;
          return {
            x: x + w / 2 + ((Math.cos(theta) * w) / 2) * t,
            y: y + h / 2 + ((Math.sin(theta) * h) / 2) * t,
            p: 0.5,
            t: i * 8
          };
        })
      };
    } else if (['arc', 'sector', 'segment'].includes(kind)) {
      const pts = Array.from({ length: 22 }, (_, i) => {
        const t = i / 21,
          theta = ((o.start + (kind === 'spiral' ? 360 * o.turns : o.sweep) * t) * Math.PI) / 180,
          r = kind === 'spiral' ? t : 1;
        return {
          x: x + w / 2 + ((Math.cos(theta) * w) / 2) * r,
          y: y + h / 2 + ((Math.sin(theta) * h) / 2) * r
        };
      });
      shape =
        kind === 'sector'
          ? { type: 'polygon', corners: [p(0.5, 0.5), ...pts] }
          : kind === 'segment'
            ? { type: 'polygon', corners: pts }
            : {
                type: 'line',
                connector: true,
                route: 'polyline',
                startArrow: false,
                endArrow: false,
                x1: pts[0].x,
                y1: pts[0].y,
                x2: pts.at(-1).x,
                y2: pts.at(-1).y,
                waypoints: pts.slice(1, -1)
              };
    } else {
      shape = { type: kind === 'arrow' ? 'arrow' : 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y };
      if (kind === 'arrow') shape.headLength = Math.min(20, Math.max(2, Ink.dist(a, b) * 0.2));
      if (kind === 'bezier')
        Object.assign(shape, {
          connector: true,
          route: 'curve',
          startArrow: false,
          endArrow: false,
          controls: [p(0.25, 0), p(0.75, 1)]
        });
    }
    return {
      ...style,
      ...shape,
      id: style.id || Ink.uid(),
      color: style.color || '#202020',
      width: style.width || 2,
      opacity: style.opacity || 1,
      shapeKind: kind,
      shapeOptions: o,
      shapeFrame: [
        { x, y },
        { x: x + w, y },
        { x, y: y + h }
      ]
    };
  }
  function rebuild(e, opts) {
    const f = e.shapeFrame;
    if (!f) return null;
    const w = Ink.dist(f[0], f[1]),
      h = Ink.dist(f[0], f[2]),
      angle = Math.atan2(f[1].y - f[0].y, f[1].x - f[0].x);
    const fresh = make(e.shapeKind, { x: 0, y: 0 }, { x: w, y: h }, opts, {
      id: e.id,
      color: e.color,
      width: e.width,
      opacity: e.opacity,
      fill: e.fill,
      dash: e.dash,
      layerId: e.layerId
    });
    return { ...e, ...Ink.transform(fresh, { angle, dx: f[0].x, dy: f[0].y }) };
  }
  function label(e) {
    if (e.shapeKind && names[e.shapeKind]) return names[e.shapeKind];
    if (e.type === 'rectangle' && e.corners) {
      const w = Ink.dist(e.corners[0], e.corners[1]),
        h = Ink.dist(e.corners[1], e.corners[2]);
      if (Math.abs(w - h) < Math.max(w, h) * 0.015) return 'Quadrado';
    }
    return (
      {
        circle: 'Círculo',
        ellipse: 'Elipse',
        rectangle: 'Retângulo',
        triangle: 'Triângulo',
        polygon: 'Polígono',
        line: 'Segmento de reta',
        arrow: 'Seta'
      }[e.type] || 'Forma'
    );
  }
  function icon(e) {
    const b = Ink.elementBounds(e),
      pad = Math.max(b.w, b.h) * 0.09 + 1;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x - pad} ${b.y - pad} ${b.w + pad * 2} ${b.h + pad * 2}" aria-hidden="true"><path d="${Ink.shapePath({ ...e, type: e.type, color: '#202020', width: 2 })}" fill="${e.type === 'stroke' ? 'currentColor' : 'none'}" stroke="${e.type === 'stroke' ? 'none' : 'currentColor'}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  function freeInk(stroke, points) {
    const out = { ...stroke, points };
    delete out.shapeKind;
    delete out.shapeOptions;
    delete out.shapeFrame;
    return out;
  }
  function join(strokes, smooth = true, maxGap = 40) {
    if (
      strokes.length !== 2 ||
      strokes.some((e) => e.type !== 'stroke' || e.erasures?.length || e.points.length < 2)
    )
      throw new Error('Selecione dois traços sem recortes.');
    const [a, b] = strokes;
    if (a.layerId !== b.layerId) throw new Error('Use traços da mesma camada.');
    let best;
    for (const reverseA of [false, true])
      for (const reverseB of [false, true]) {
        const pa = reverseA ? a.points[0] : a.points.at(-1),
          pb = reverseB ? b.points.at(-1) : b.points[0],
          gap = Ink.dist(pa, pb);
        if (!best || gap < best.gap) best = { reverseA, reverseB, gap };
      }
    if (best.gap > maxGap)
      throw new Error('Extremidades distantes: aproxime os traços ou aumente a distância máxima.');
    const pa = best.reverseA ? a.points.slice().reverse() : a.points.slice(),
      pb = best.reverseB ? b.points.slice().reverse() : b.points.slice(),
      end = pa.at(-1),
      start = pb[0],
      pre = pa.at(-2),
      post = pb[1],
      len = Math.max(best.gap, 0.1),
      unit = (a, b) => {
        const d = Ink.dist(a, b) || 1;
        return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
      },
      u = unit(pre, end),
      v = unit(start, post),
      bridge = [];
    for (let i = 1; i < 12; i++) {
      const t = i / 12,
        k = 1 - t,
        amount = smooth ? len / 3 : 0;
      bridge.push({
        ...end,
        x:
          k * k * k * end.x +
          3 * k * k * t * (end.x + u.x * amount) +
          3 * k * t * t * (start.x - v.x * amount) +
          t * t * t * start.x,
        y:
          k * k * k * end.y +
          3 * k * k * t * (end.y + u.y * amount) +
          3 * k * t * t * (start.y - v.y * amount) +
          t * t * t * start.y,
        p: end.p + (start.p - end.p) * t,
        t: i * 8
      });
    }
    let time = 0;
    const points = [];
    for (const block of [pa, bridge, pb])
      block.forEach((p, i) => {
        if (points.length) time += i ? Math.max(1, Math.abs(p.t - block[i - 1].t)) : 8;
        points.push({ ...p, t: time });
      });
    const out = freeInk(a, points);
    delete out.inputStats;
    return out;
  }
  // Local displacement preserves pressure/tilt and the distant parts of a stroke.
  function deform(stroke, index, target, radius) {
    const source = stroke.points,
      anchor = source[index],
      distances = new Array(source.length).fill(0);
    for (let i = index - 1; i >= 0; i--)
      distances[i] = distances[i + 1] + Ink.dist(source[i], source[i + 1]);
    for (let i = index + 1; i < source.length; i++)
      distances[i] = distances[i - 1] + Ink.dist(source[i], source[i - 1]);
    return freeInk(
      stroke,
      source.map((p, i) => {
        const t = Ink.clamp(1 - distances[i] / Math.max(1, radius), 0, 1),
          weight = t * t * (3 - 2 * t);
        return {
          ...p,
          x: p.x + (target.x - anchor.x) * weight,
          y: p.y + (target.y - anchor.y) * weight
        };
      })
    );
  }
  function tidy(strokes, { baseline = true, height = false, slant = 0, strength = 0.5 } = {}) {
    const eligible = strokes.filter((e) => e.type === 'stroke' && !e.erasures?.length),
      boxes = eligible.map((e) => ({ e, b: Ink.pointBounds(e.points) }));
    if (!boxes.length) return new Map();
    const heights = boxes.map((x) => x.b.h).sort((a, b) => a - b),
      median = heights[Math.floor(heights.length / 2)],
      letters = boxes.filter((x) => x.b.h >= median * 0.45),
      rows = [];
    for (const item of letters.slice().sort((a, b) => a.b.y - b.b.y)) {
      const cy = item.b.y + item.b.h / 2;
      let row = rows.find((r) => Math.abs(r.cy - cy) < Math.max(median * 0.6, 2));
      if (!row) {
        row = { cy, items: [] };
        rows.push(row);
      }
      row.items.push(item);
    }
    const result = new Map();
    for (const row of rows) {
      const bottoms = row.items.map((x) => x.b.y + x.b.h).sort((a, b) => a - b),
        base = bottoms[Math.floor(bottoms.length / 2)],
        hs = row.items.map((x) => x.b.h).sort((a, b) => a - b),
        targetH = hs[Math.floor(hs.length / 2)];
      for (const { e, b } of row.items) {
        const dy = baseline ? (base - b.y - b.h) * strength : 0,
          scale = height
            ? 1 + (Ink.clamp(targetH / Math.max(0.1, b.h), 0.85, 1.15) - 1) * strength
            : 1,
          shear = Math.tan((slant * Math.PI) / 180) * strength;
        result.set(
          e.id,
          freeInk(
            e,
            e.points.map((p) => ({
              ...p,
              x: p.x + (b.y + b.h - p.y) * shear,
              y: b.y + b.h + (p.y - b.y - b.h) * scale + dy
            }))
          )
        );
      }
    }
    return result;
  }
  return { families, names, options, make, rebuild, label, icon, join, deform, tidy };
})();
