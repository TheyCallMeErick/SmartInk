/* Small offline geometric template matcher, not a trained OCR model. */
const DigitAssist = (() => {
  const templates = {
    0: [
      [
        [0.5, 0],
        [0.18, 0.07],
        [0, 0.4],
        [0.07, 0.83],
        [0.4, 1],
        [0.8, 0.9],
        [1, 0.55],
        [0.9, 0.15],
        [0.5, 0]
      ]
    ],
    1: [
      [
        [0.15, 0.22],
        [0.52, 0],
        [0.52, 1]
      ],
      [
        [0.2, 1],
        [0.85, 1]
      ]
    ],
    2: [
      [
        [0, 0.2],
        [0.2, 0],
        [0.65, 0],
        [0.95, 0.2],
        [0.85, 0.4],
        [0.1, 0.9],
        [0, 1],
        [1, 1]
      ]
    ],
    3: [
      [
        [0, 0.08],
        [0.5, 0],
        [0.9, 0.16],
        [0.7, 0.4],
        [0.35, 0.48],
        [0.8, 0.53],
        [1, 0.75],
        [0.7, 1],
        [0.1, 0.95]
      ]
    ],
    4: [
      [
        [0.7, 0],
        [0, 0.65],
        [1, 0.65]
      ],
      [
        [0.7, 0],
        [0.7, 1]
      ]
    ],
    5: [
      [
        [1, 0],
        [0.1, 0],
        [0.05, 0.5],
        [0.6, 0.45],
        [0.95, 0.65],
        [0.85, 0.9],
        [0.5, 1],
        [0, 0.9]
      ]
    ],
    6: [
      [
        [0.85, 0],
        [0.4, 0.08],
        [0.05, 0.5],
        [0, 0.8],
        [0.25, 1],
        [0.7, 0.95],
        [1, 0.7],
        [0.75, 0.5],
        [0.3, 0.5],
        [0, 0.72]
      ]
    ],
    7: [
      [
        [0, 0],
        [1, 0],
        [0.3, 1]
      ]
    ],
    8: [
      [
        [0.5, 0.48],
        [0.05, 0.2],
        [0.25, 0],
        [0.7, 0],
        [0.95, 0.2],
        [0.5, 0.48],
        [0, 0.75],
        [0.2, 1],
        [0.75, 1],
        [1, 0.75],
        [0.5, 0.48]
      ]
    ],
    9: [
      [
        [0.9, 0.45],
        [0.6, 0.55],
        [0.1, 0.45],
        [0, 0.2],
        [0.25, 0],
        [0.7, 0.05],
        [0.95, 0.25],
        [0.9, 0.65],
        [0.5, 1],
        [0.1, 1]
      ]
    ]
  };
  const variants = {
    1: [
      [
        [
          [0.5, 0],
          [0.5, 1]
        ]
      ],
      [
        [
          [0.15, 0.2],
          [0.5, 0],
          [0.5, 1]
        ]
      ]
    ],
    7: [
      [
        [
          [0, 0],
          [1, 0],
          [0.3, 1]
        ],
        [
          [0.25, 0.5],
          [0.8, 0.5]
        ]
      ]
    ],
    4: [
      [
        [
          [0, 0],
          [0, 0.6],
          [1, 0.6]
        ],
        [
          [0.75, 0],
          [0.75, 1]
        ]
      ]
    ],
    0: [
      [
        templates['0'][0],
        [
          [0.1, 0.9],
          [0.9, 0.1]
        ]
      ]
    ]
  };
  function cloud(strokes) {
    const pts = strokes.flat(),
      b = Ink.pointBounds(pts);
    if (!b || Math.max(b.w, b.h) < 1e-8) throw new Error('Amostra pequena demais.');
    const ratio = b.w / Math.max(b.h, 1e-8),
      scale = Math.max(b.w, b.h),
      samples = strokes.flatMap((p) =>
        Ink.resample(p, Math.max(4, Math.round(48 / strokes.length)))
      );
    return {
      ratio,
      points: samples.map((p) => ({
        x: (p.x - b.x - b.w / 2) / (b.w || scale),
        y: (p.y - b.y - b.h / 2) / (b.h || scale)
      }))
    };
  }
  const convert = (raw) => raw.map((stroke) => stroke.map(([x, y]) => ({ x, y })));
  const reference = [];
  for (const [digit, raw] of Object.entries(templates))
    for (const variant of [raw, ...(variants[digit] || [])])
      reference.push({ digit, ...cloud(convert(variant)) });
  function distance(a, b) {
    const one = (p, q) =>
      p.reduce((sum, v) => sum + Math.min(...q.map((w) => Ink.dist(v, w))), 0) / p.length;
    return (
      (one(a.points, b.points) + one(b.points, a.points)) / 2 +
      Math.min(0.2, Math.abs(Math.log((a.ratio + 0.1) / (b.ratio + 0.1))) * 0.035)
    );
  }
  function rank(elements, personal = []) {
    const strokes = elements.map((e) => e.points);
    if (!strokes.length || strokes.length > 12 || strokes.reduce((s, p) => s + p.length, 0) > 20000)
      throw new Error('Selecione até 12 traços e 20 mil pontos por algarismo.');
    const sample = cloud(strokes),
      scores = new Map();
    for (const ref of [...reference, ...personal]) {
      if (!ref.points?.length) continue;
      const score = distance(sample, ref);
      if (!scores.has(ref.digit) || score < scores.get(ref.digit)) scores.set(ref.digit, score);
    }
    return [...scores]
      .map(([digit, score]) => ({ digit, score }))
      .sort((a, b) => a.score - b.score)
      .slice(0, 3);
  }
  function group(elements) {
    if (
      !elements.length ||
      elements.length > 80 ||
      elements.some((e) => e.type !== 'stroke' || e.erasures?.length)
    )
      throw new Error('Selecione tinta sem borracha, até 80 traços.');
    if (elements.reduce((n, e) => n + e.points.length, 0) > 30000)
      throw new Error('Selecione menos pontos para sugerir números.');
    const records = elements
        .map((e) => ({ e, b: Ink.pointBounds(e.points) }))
        .sort((a, b) => a.b.x - b.b.x),
      groups = [];
    for (const record of records) {
      const g = groups.at(-1),
        overlap = g && record.b.x <= g.right + Math.max(1, Math.min(g.height, record.b.h) * 0.08);
      if (overlap) {
        g.elements.push(record.e);
        g.right = Math.max(g.right, record.b.x + record.b.w);
        g.height = Math.max(g.height, record.b.h);
      } else
        groups.push({ elements: [record.e], right: record.b.x + record.b.w, height: record.b.h });
    }
    if (groups.length > 24) throw new Error('Selecione até 24 algarismos.');
    return groups.map((g) => g.elements);
  }
  function suggest(elements, personal = []) {
    return group(elements).map((elements) => ({ elements, candidates: rank(elements, personal) }));
  }
  function learn(elements, digit) {
    if (!/^[0-9]$/.test(digit)) throw new Error('Escolha um algarismo de 0 a 9.');
    return { digit, ...cloud(elements.map((e) => e.points)) };
  }
  function validSamples(value) {
    return Array.isArray(value)
      ? value
          .filter(
            (s) =>
              s &&
              typeof s.digit === 'string' &&
              /^[0-9]$/.test(s.digit) &&
              Number.isFinite(s.ratio) &&
              s.ratio >= 0 &&
              s.ratio < 1000 &&
              Array.isArray(s.points) &&
              s.points.length >= 4 &&
              s.points.length <= 64 &&
              s.points.every(
                (p) =>
                  Number.isFinite(p.x) &&
                  Number.isFinite(p.y) &&
                  Math.abs(p.x) <= 1 &&
                  Math.abs(p.y) <= 1
              )
          )
          .slice(-50)
      : [];
  }
  function roundDigit(e, ch) {
    const indices = {
      0: 'all',
      2: [1, 2, 3],
      3: [1, 2, 3, 5, 6, 7],
      5: [3, 4, 5, 6],
      6: [1, 2, 3, 4, 5, 6, 7, 8],
      8: [1, 2, 3, 4, 6, 7, 8, 9],
      9: [1, 2, 3, 4, 5, 6, 7, 8]
    }[ch];
    if (!indices) return e;
    let nodes = e.nodes;
    if (ch === '0') {
      nodes = nodes.slice(0, -1);
      e = { ...e, closed: true };
    }
    nodes = nodes.map((n, i) => {
      if (indices !== 'all' && !indices.includes(i)) return n;
      if (!e.closed && (i === 0 || i === nodes.length - 1)) return n;
      const a = nodes[(i - 1 + nodes.length) % nodes.length],
        b = nodes[(i + 1) % nodes.length],
        dx = (b.x - a.x) / 6,
        dy = (b.y - a.y) / 6;
      return {
        ...n,
        kind: 'symmetric',
        in: { x: n.x - dx, y: n.y - dy },
        out: { x: n.x + dx, y: n.y + dy }
      };
    });
    return { ...e, nodes };
  }
  function cleanNumbers(elements, text, { typed = false, keepOriginal = false } = {}) {
    if (!/^[0-9.,+\- ]{1,32}$/.test(text) || !/[0-9]/.test(text))
      throw new Error('Use até 32 caracteres: números, espaço, sinal e separador decimal.');
    const b = Ink.bounds(elements),
      source = elements[0],
      height = Math.max(10, b.h - source.width * 2),
      charWidth = height * 0.58,
      gap = height * 0.15,
      total = text.length * charWidth + (text.length - 1) * gap,
      scale = Math.min(1, Math.max(b.w, height) / Math.max(total, 1)),
      h = height * scale,
      w = charWidth * scale,
      step = (charWidth + gap) * scale,
      x = b.x + source.width,
      y = b.y + source.width + (keepOriginal ? b.h + height * 0.25 : 0),
      style = {
        color: source.color,
        width: source.width,
        opacity: source.opacity,
        layerId: source.layerId
      },
      out = [];
    if (typed)
      return [
        {
          ...style,
          id: Ink.uid(),
          type: 'text',
          text,
          fontSize: h,
          align: 'left',
          bold: false,
          cx: x + (total * scale) / 2,
          cy: y + h / 2,
          imageW: Math.max(20, total * scale + 8),
          imageH: h * 1.25 + 8,
          angle: 0
        }
      ];
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === ' ') continue;
      let raw = templates[ch];
      if (ch === '.' || ch === ',')
        raw = [
          [
            [0.4, 1],
            [0.42, 1 + (ch === ',' ? 0.18 : 0)]
          ]
        ];
      if (ch === '-')
        raw = [
          [
            [0.1, 0.5],
            [0.9, 0.5]
          ]
        ];
      if (ch === '+')
        raw = [
          [
            [0.1, 0.5],
            [0.9, 0.5]
          ],
          [
            [0.5, 0.2],
            [0.5, 0.8]
          ]
        ];
      for (const stroke of raw)
        out.push(
          roundDigit(
            {
              ...style,
              id: Ink.uid(),
              type: 'path',
              closed: false,
              fill: 'none',
              nodes: stroke.map(([u, v]) => ({
                x: x + i * step + u * w,
                y: y + v * h,
                kind: 'corner'
              }))
            },
            ch
          )
        );
    }
    return out;
  }
  return { templates, cloud, rank, group, suggest, learn, validSamples, cleanNumbers };
})();
