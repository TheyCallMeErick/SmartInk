const Ink = (() => {
  const module = { exports: {} };
  ('use strict');

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const uid = () => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  const fresh = () => ({
    schemaVersion: 9,
    id: uid(),
    width: 1400,
    height: 1800,
    background: 'dots',
    elements: [],
    layers: [
      { id: 'background', name: 'Fundo', visible: true, locked: true },
      { id: 'ink', name: 'Escrita', visible: true, locked: false }
    ],
    activeLayer: 'ink'
  });
  function parse(text) {
    if (text.length > 40000000) throw new Error('Arquivo acima do limite de 40 MB do protótipo.');
    const d = JSON.parse(text);
    const num = (v, a, b) => typeof v === 'number' && Number.isFinite(v) && v >= a && v <= b;
    if (
      ![1, 2, 3, 4, 5, 6, 7, 8, 9].includes(d.schemaVersion) ||
      typeof d.id !== 'string' ||
      !num(d.width, 100, 10000) ||
      !num(d.height, 100, 10000) ||
      !['dots', 'grid', 'lines', 'plain'].includes(d.background) ||
      !Array.isArray(d.elements) ||
      d.elements.length > 20000
    )
      throw new Error('Formato Smart Ink inválido ou versão incompatível.');
    if (d.width * d.height > 8000000)
      throw new Error('Página acima do limite de área do protótipo.');
    if (!d.layers)
      d.layers = [
        { id: 'background', name: 'Fundo', visible: true, locked: true },
        { id: 'ink', name: 'Escrita', visible: true, locked: false }
      ];
    if (
      !Array.isArray(d.layers) ||
      !d.layers.length ||
      d.layers.length > 50 ||
      new Set(d.layers.map((l) => l.id)).size !== d.layers.length ||
      d.layers.some(
        (l) =>
          typeof l.id !== 'string' ||
          typeof l.name !== 'string' ||
          l.name.length > 200 ||
          typeof l.visible !== 'boolean' ||
          typeof l.locked !== 'boolean'
      )
    )
      throw new Error('Camadas inválidas.');
    if (d.activeLayer === undefined) d.activeLayer = 'ink';
    if (!d.layers.some((l) => l.id === d.activeLayer)) d.activeLayer = d.layers[0].id;
    if (
      d.linkedStyle !== undefined &&
      d.linkedStyle !== null &&
      (typeof d.linkedStyle !== 'string' || d.linkedStyle.length > 200)
    )
      throw new Error('Estilo vinculado inválido.');
    if (
      d.template !== undefined &&
      !['plain', 'ruled', 'grid', 'cornell', 'cards', 'qa'].includes(d.template)
    )
      throw new Error('Modelo inválido.');
    if (d.drafting?.ruler) {
      const r = d.drafting.ruler;
      if (
        !num(r.x, -1e8, 1e8) ||
        !num(r.y, -1e8, 1e8) ||
        !num(r.angle, -100, 100) ||
        !num(r.length, 20, 100000) ||
        typeof r.enabled !== 'boolean'
      )
        throw new Error('Régua inválida.');
    }
    if (
      d.regions !== undefined &&
      (!Array.isArray(d.regions) ||
        d.regions.length > 100 ||
        d.regions.some(
          (r) =>
            typeof r.id !== 'string' ||
            typeof r.name !== 'string' ||
            r.name.length > 100 ||
            !num(r.x, -1e8, 1e8) ||
            !num(r.y, -1e8, 1e8) ||
            !num(r.w, 1, 1e8) ||
            !num(r.h, 1, 1e8)
        ))
    )
      throw new Error('Regiões inválidas.');
    if (d.paperSpacing !== undefined && !num(d.paperSpacing, 8, 200))
      throw new Error('Espaçamento de pauta inválido.');
    if (d.gridStyle !== undefined && !['cartesian', 'isometric'].includes(d.gridStyle))
      throw new Error('Grade inválida.');
    for (const layer of d.layers)
      if (layer.drawingAssist !== undefined && typeof layer.drawingAssist !== 'boolean')
        throw new Error('Assistência de camada inválida.');
    const ids = new Set();
    let count = 0;
    for (const e of d.elements) {
      if (
        typeof e.id !== 'string' ||
        ids.has(e.id) ||
        !/^#[0-9a-f]{6}$/i.test(e.color) ||
        !num(e.width, 0.1, 10000) ||
        !num(e.opacity, 0.05, 1)
      )
        throw new Error('Elemento inválido.');
      ids.add(e.id);
      if (e.shapeKind !== undefined && (typeof e.shapeKind !== 'string' || e.shapeKind.length > 40))
        throw new Error('Família de forma inválida.');
      if (
        e.shapeFrame !== undefined &&
        (!Array.isArray(e.shapeFrame) ||
          e.shapeFrame.length !== 3 ||
          e.shapeFrame.some((p) => !num(p.x, -1e8, 1e8) || !num(p.y, -1e8, 1e8)))
      )
        throw new Error('Referencial de forma inválido.');
      if (
        e.shapeOptions !== undefined &&
        (!e.shapeOptions ||
          typeof e.shapeOptions !== 'object' ||
          Object.values(e.shapeOptions).some((v) => !num(v, -1000, 1000)))
      )
        throw new Error('Parâmetros de forma inválidos.');
      if (e.fill !== undefined && e.fill !== 'none' && !/^#[a-f0-9]{6}$/i.test(e.fill))
        throw new Error('Preenchimento inválido.');
      if (e.dash !== undefined && !['solid', 'dashed', 'dotted'].includes(e.dash))
        throw new Error('Tracejado inválido.');
      for (const k of ['controls', 'waypoints'])
        if (
          e[k] !== undefined &&
          (!Array.isArray(e[k]) ||
            e[k].length > (k === 'controls' ? 2 : 20) ||
            (k === 'controls' && e[k].length !== 2) ||
            e[k].some((p) => !num(p.x, -1e8, 1e8) || !num(p.y, -1e8, 1e8)))
        )
          throw new Error('Pontos de controle inválidos.');
      if (e.elbowX !== undefined && !num(e.elbowX, -1e8, 1e8))
        throw new Error('Cotovelo inválido.');
      if (
        e.geometryRule !== undefined &&
        (!e.geometryRule ||
          !['square', 'circle', 'parallel', 'perpendicular', 'equal', 'tangent'].includes(
            e.geometryRule.kind
          ) ||
          (e.geometryRule.targetId !== undefined && typeof e.geometryRule.targetId !== 'string'))
      )
        throw new Error('Restrição geométrica inválida.');
      if (
        e.groupPath !== undefined &&
        (!Array.isArray(e.groupPath) ||
          e.groupPath.length > 16 ||
          e.groupPath.some((g) => typeof g !== 'string' || !g || g.length > 200) ||
          new Set(e.groupPath).size !== e.groupPath.length)
      )
        throw new Error('Hierarquia de grupos inválida.');
      if (
        e.transcription !== undefined &&
        (typeof e.transcription !== 'string' || e.transcription.length > 10000)
      )
        throw new Error('Transcrição inválida.');
      if (e.adaptiveInk !== undefined && typeof e.adaptiveInk !== 'boolean')
        throw new Error('Filtro adaptativo inválido.');
      if (e.groupId !== undefined && (typeof e.groupId !== 'string' || e.groupId.length > 200))
        throw new Error('Grupo inválido.');
      if (e.connector !== undefined && typeof e.connector !== 'boolean')
        throw new Error('Conector inválido.');
      if (e.route !== undefined && !['straight', 'elbow', 'curve', 'polyline'].includes(e.route))
        throw new Error('Rota inválida.');
      for (const k of ['startArrow', 'endArrow'])
        if (e[k] !== undefined && typeof e[k] !== 'boolean') throw new Error('Seta inválida.');
      if (e.label !== undefined && (typeof e.label !== 'string' || e.label.length > 300))
        throw new Error('Rótulo inválido.');
      if (e.crop) {
        const c = e.crop;
        if (
          !num(c.x, 0, 1) ||
          !num(c.y, 0, 1) ||
          !num(c.w, 0.001, 1) ||
          !num(c.h, 0.001, 1) ||
          c.x + c.w > 1.000001 ||
          c.y + c.h > 1.000001
        )
          throw new Error('Recorte de imagem inválido.');
      }
      if (e.layerId !== undefined && !d.layers.some((l) => l.id === e.layerId))
        throw new Error('Camada do objeto inválida.');
      if (e.locked !== undefined && typeof e.locked !== 'boolean')
        throw new Error('Bloqueio inválido.');
      if (
        e.noteLink !== undefined &&
        (typeof e.noteLink !== 'string' || e.noteLink.length > 2048 || /[\r\n<>]/.test(e.noteLink))
      )
        throw new Error('Link inválido.');
      if (e.bindings) {
        if (!['line', 'arrow'].includes(e.type) || typeof e.bindings !== 'object')
          throw new Error('Conector inválido.');
        for (const b of Object.values(e.bindings))
          if (
            !b ||
            typeof b.targetId !== 'string' ||
            !Number.isInteger(b.index) ||
            b.index < 0 ||
            b.index > 63 ||
            b.targetId === e.id
          )
            throw new Error('Âncora inválida.');
      }
      if (e.erasures) {
        if (!Array.isArray(e.erasures) || e.erasures.length > 100000)
          throw new Error('Recortes inválidos.');
        for (const c of e.erasures)
          if (
            !num(c.x1, -1e8, 1e8) ||
            !num(c.y1, -1e8, 1e8) ||
            !num(c.x2, -1e8, 1e8) ||
            !num(c.y2, -1e8, 1e8) ||
            !num(c.r, 0.001, 1e8)
          )
            throw new Error('Recorte inválido.');
      }
      if (e.type === 'text') {
        if (
          typeof e.text !== 'string' ||
          e.text.length > 10000 ||
          !num(e.fontSize, 4, 2000) ||
          !['left', 'center', 'right'].includes(e.align) ||
          typeof e.bold !== 'boolean' ||
          !num(e.cx, -1e8, 1e8) ||
          !num(e.cy, -1e8, 1e8) ||
          !num(e.imageW, 1, 1e7) ||
          !num(e.imageH, 1, 1e7) ||
          !num(e.angle, -100, 100)
        )
          throw new Error('Texto inválido.');
      } else if (e.type === 'image') {
        if (
          !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(e.src) ||
          e.src.length > 14000000 ||
          !num(e.cx, -1e8, 1e8) ||
          !num(e.cy, -1e8, 1e8) ||
          !num(e.imageW, 1, 1e7) ||
          !num(e.imageH, 1, 1e7) ||
          !num(e.angle, -100, 100)
        )
          throw new Error('Imagem inválida.');
      } else if (e.type === 'region') {
        if (!Array.isArray(e.geometry) || !e.geometry.length || e.geometry.length > 256)
          throw new Error('Região inválida.');
        let total = 0;
        for (const poly of e.geometry) {
          if (!Array.isArray(poly) || !poly.length || poly.length > 256)
            throw new Error('Contorno inválido.');
          for (const ring of poly) {
            if (!Array.isArray(ring) || ring.length < 4 || ring.length > 20000)
              throw new Error('Anel inválido.');
            total += ring.length;
            for (const p of ring)
              if (
                !Array.isArray(p) ||
                p.length !== 2 ||
                !num(p[0], -1e8, 1e8) ||
                !num(p[1], -1e8, 1e8)
              )
                throw new Error('Ponto de região inválido.');
            if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1])
              throw new Error('Anel aberto.');
          }
        }
        count += total;
        if (total > 50000 || count > 1000000) throw new Error('Região muito complexa.');
      } else if (e.type === 'path') {
        if (
          typeof e.closed !== 'boolean' ||
          !Array.isArray(e.nodes) ||
          e.nodes.length < (e.closed ? 3 : 2) ||
          e.nodes.length > 20000
        )
          throw new Error('Caminho inválido.');
        count += e.nodes.length;
        if (count > 1000000) throw new Error('Limite de pontos excedido.');
        for (const n of e.nodes) {
          if (
            !n ||
            !num(n.x, -1e8, 1e8) ||
            !num(n.y, -1e8, 1e8) ||
            !['corner', 'smooth', 'symmetric'].includes(n.kind)
          )
            throw new Error('Nó inválido.');
          for (const key of ['in', 'out'])
            if (n[key] && (!num(n[key].x, -1e8, 1e8) || !num(n[key].y, -1e8, 1e8)))
              throw new Error('Alça inválida.');
        }
      } else if (e.type === 'stroke') {
        if (e.engine !== undefined && e.engine !== InkEngine.ENGINE)
          throw new Error('Motor de tinta incompatível.');
        for (const [key, lo, hi] of [
          ['cornerProtection', 0, 1],
          ['streamline', 0, 1],
          ['minWidth', 0.05, 1],
          ['pressureGamma', 0.25, 4],
          ['pressureMin', 0, 0.95],
          ['pressureMax', 0.05, 1]
        ])
          if (e[key] !== undefined && !num(e[key], lo, hi)) throw new Error('Calibração inválida.');
        if ((e.pressureMax ?? 1) - (e.pressureMin ?? 0) < 0.05 - 1e-9)
          throw new Error('Faixa de pressão inválida.');
        if (
          !Array.isArray(e.points) ||
          !e.points.length ||
          !num(e.smoothing, 0, 1) ||
          typeof e.pressure !== 'boolean'
        )
          throw new Error('Traço inválido.');
        count += e.points.length;
        if (count > 1000000) throw new Error('Limite de um milhão de pontos excedido.');
        for (const p of e.points) {
          if (
            (p.tiltX !== undefined && !num(p.tiltX, -90, 90)) ||
            (p.tiltY !== undefined && !num(p.tiltY, -90, 90))
          )
            throw new Error('Inclinação inválida.');
        }
        for (const p of e.points)
          if (!num(p.x, -1e8, 1e8) || !num(p.y, -1e8, 1e8) || !num(p.p, 0, 1) || !num(p.t, 0, 1e16))
            throw new Error('Ponto inválido.');
      } else if (e.type === 'line' || e.type === 'arrow') {
        for (const k of ['x1', 'y1', 'x2', 'y2'])
          if (!num(e[k], -1e8, 1e8)) throw new Error('Linha inválida.');
        if (e.type === 'arrow' && !num(e.headLength, 0.01, 1e8)) throw new Error('Seta inválida.');
      } else if (e.type === 'ellipse') {
        if (
          !num(e.cx, -1e8, 1e8) ||
          !num(e.cy, -1e8, 1e8) ||
          !num(e.rx, 0.01, 1e8) ||
          !num(e.ry, 0.01, 1e8) ||
          !num(e.angle, -100, 100)
        )
          throw new Error('Elipse inválida.');
      } else if (e.type === 'circle') {
        if (!num(e.cx, -1e8, 1e8) || !num(e.cy, -1e8, 1e8) || !num(e.r, 0.01, 1e8))
          throw new Error('Círculo inválido.');
      } else if (e.type === 'rectangle' || e.type === 'triangle' || e.type === 'polygon') {
        if (
          !Array.isArray(e.corners) ||
          (e.type === 'polygon'
            ? e.corners.length < 3 || e.corners.length > 32
            : e.corners.length !== (e.type === 'triangle' ? 3 : 4)) ||
          e.corners.some((p) => !num(p.x, -1e8, 1e8) || !num(p.y, -1e8, 1e8))
        )
          throw new Error('Polígono inválido.');
      } else throw new Error('Tipo de elemento desconhecido.');
    }
    if (d.drafting) {
      const a = d.drafting;
      if (
        !Array.isArray(a.guides) ||
        a.guides.length > 100 ||
        a.guides.some((g) => !['x', 'y'].includes(g.axis) || !num(g.value, -1e8, 1e8))
      )
        throw new Error('Guias inválidas.');
      if (
        a.limit &&
        (!num(a.limit.x, -1e8, 1e8) ||
          !num(a.limit.y, -1e8, 1e8) ||
          !num(a.limit.w, 20, 1e8) ||
          !num(a.limit.h, 20, 1e8))
      )
        throw new Error('Área delimitadora inválida.');
    }
    d.schemaVersion = 9;
    return d;
  }
  const serialize = (d) => JSON.stringify(d);
  function smooth(points, amount) {
    return points.map((p, i) => {
      if (i === 0 || i === points.length - 1) return { ...p };
      const a = points[i - 1],
        b = points[i + 1];
      return {
        ...p,
        x: p.x + (a.x + b.x - 2 * p.x) * amount * 0.25,
        y: p.y + (a.y + b.y - 2 * p.y) * amount * 0.25
      };
    });
  }
  const f = (n) => Number(n.toFixed(3));
  function inkPath(e) {
    if (e.engine === InkEngine.ENGINE) return InkEngine.path(e);
    const pts = smooth(e.points, e.smoothing),
      left = [],
      right = [];
    const radius = (p) => e.width * (e.pressure ? 0.25 + 0.75 * p.p : 0.5);
    const disk = (p, r) =>
      `M ${f(p.x - r)} ${f(p.y)} a ${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0 a ${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0 Z`;
    if (pts.length === 1) return disk(pts[0], radius(pts[0]));
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)],
        b = pts[Math.min(pts.length - 1, i + 1)];
      const len = dist(a, b) || 1,
        r = radius(pts[i]);
      const nx = (-(b.y - a.y) / len) * r,
        ny = ((b.x - a.x) / len) * r;
      left.push([f(pts[i].x + nx), f(pts[i].y + ny)]);
      right.push([f(pts[i].x - nx), f(pts[i].y - ny)]);
    }
    return (
      'M ' +
      left
        .concat(right.reverse())
        .map((p) => p.join(' '))
        .join(' L ') +
      ' Z ' +
      disk(pts[0], radius(pts[0])) +
      ' ' +
      disk(pts.at(-1), radius(pts.at(-1)))
    );
  }
  function shapePath(e) {
    if (e.type === 'path' || e.type === 'region') return VectorOps.path(e);
    if (e.type === 'stroke') return inkPath(e);
    const pts = Geometry.outline(e, 128);
    return (
      'M ' +
      pts.map((p) => `${f(p.x)} ${f(p.y)}`).join(' L ') +
      (['rectangle', 'triangle', 'polygon', 'circle', 'ellipse'].includes(e.type) ? ' Z' : '')
    );
  }
  function svg(d, vaultName = '', options = {}) {
    parse(serialize(d));
    const elements = renderElements(d, Geometry.resolveConnections(d.elements));
    const b =
      options.bounds ||
      Geometry.expand(Geometry.bounds(elements) || { x: 0, y: 0, w: 800, h: 600 }, 32);
    if (![b.x, b.y, b.w, b.h].every(Number.isFinite) || b.w <= 0 || b.h <= 0)
      throw new Error('Área de exportação inválida.');
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${f(b.w)}" height="${f(b.h)}" viewBox="${f(b.x)} ${f(b.y)} ${f(b.w)} ${f(b.h)}"><rect x="${f(b.x)}" y="${f(b.y)}" width="${f(b.w)}" height="${f(b.h)}" fill="${options.transparent ? 'none' : '#ffffff'}"/>` +
      (options.paper ? paperSvg(d, b) : '') +
      elements
        .map((e, i) => {
          const cuts = e.erasures || [],
            mask = cuts.length
              ? `<defs><mask id="cut${i}" maskUnits="userSpaceOnUse" x="${f(b.x)}" y="${f(b.y)}" width="${f(b.w)}" height="${f(b.h)}"><rect x="${f(b.x)}" y="${f(b.y)}" width="${f(b.w)}" height="${f(b.h)}" fill="white"/>${cuts.map((c) => `<path d="M ${f(c.x1)} ${f(c.y1)} L ${f(c.x2)} ${f(c.y2)}" stroke="black" stroke-width="${f(c.r * 2)}" stroke-linecap="round"/>`).join('')}</mask></defs>`
              : '';
          let body =
            e.type === 'text'
              ? textSvg(e)
              : e.type === 'image'
                ? imageSvg(e)
                : mask +
                  `<path d="${shapePath(e)}" fill="${e.type === 'stroke' ? e.color : e.fill || 'none'}" stroke="${e.type === 'stroke' ? 'none' : e.color}" stroke-width="${e.width}" stroke-linecap="round" stroke-linejoin="round" fill-rule="${e.type === 'stroke' ? 'nonzero' : 'evenodd'}" stroke-dasharray="${Geometry.dashArray(e).join(' ')}" opacity="${e.opacity}"${cuts.length ? ` mask="url(#cut${i})"` : ''}/>`;
          if (e.connector && e.label) {
            const p = Geometry.connectorLabelPoint(e),
              x = p.x,
              y = p.y;
            body += `<g text-anchor="middle" font-family="sans-serif" font-size="14"><text x="${f(x)}" y="${f(y - 8)}" stroke="#ffffff" stroke-width="5" stroke-linejoin="round" fill="#ffffff">${escapeXml(e.label)}</text><text x="${f(x)}" y="${f(y - 8)}" fill="${e.color}">${escapeXml(e.label)}</text></g>`;
          }
          return e.noteLink
            ? `<a href="obsidian://open?vault=${encodeURIComponent(vaultName)}&amp;file=${encodeURIComponent(e.noteLink)}" data-note-link="${escapeXml(e.noteLink)}">${body}</a>`
            : body;
        })
        .join('') +
      '</svg>'
    );
  }
  const hit = Geometry.hit;
  const recognize = (raw) => Geometry.recognizeGroups([raw])[0]?.shape || null;
  class History {
    constructor(limit = 80) {
      this.limit = limit;
      this.undoStack = [];
      this.redoStack = [];
      this.snapshot = null;
      this.source = null;
    }
    snapshotOf(elements, previous) {
      const chunks = [];
      for (let i = 0; i < elements.length; i += 64) {
        const old = previous?.chunks[i / 64],
          length = Math.min(64, elements.length - i);
        let same = old?.length === length;
        if (same)
          for (let j = 0; j < length; j++)
            if (old[j] !== elements[i + j]) {
              same = false;
              break;
            }
        chunks.push(same ? old : elements.slice(i, i + 64));
      }
      return { chunks, length: elements.length };
    }
    materialize(snapshot) {
      return snapshot.chunks.flat();
    }
    push(before, after) {
      const history = this,
        left =
          this.source === before && this.snapshot
            ? this.snapshot
            : this.snapshotOf(before, this.snapshot);
      let right = this.snapshotOf(after, left);
      const changedIds = new Set();
      const oldById = new Map(before.map((e) => [e.id, e]));
      for (const e of after) {
        if (oldById.get(e.id) !== e) changedIds.add(e.id);
        oldById.delete(e.id);
      }
      for (const id of oldById.keys()) changedIds.add(id);
      const op = {
        changedIds,
        get before() {
          return history.materialize(left);
        },
        get after() {
          return history.materialize(right);
        },
        set after(value) {
          right = history.snapshotOf(value, right);
          const previous = new Set(left.chunks.flat());
          for (const e of value) if (!previous.has(e)) changedIds.add(e.id);
          history.snapshot = right;
          history.source = value;
        }
      };
      this.undoStack.push(op);
      if (this.undoStack.length > this.limit) this.undoStack.shift();
      this.redoStack = [];
      this.snapshot = right;
      this.source = after;
    }
    undo() {
      const op = this.undoStack.pop();
      if (!op) return null;
      this.redoStack.push(op);
      const result = op.before;
      this.source = null;
      this.snapshot = this.snapshotOf(result, this.snapshot);
      return result;
    }
    redo() {
      const op = this.redoStack.pop();
      if (!op) return null;
      this.undoStack.push(op);
      const result = op.after;
      this.source = null;
      this.snapshot = this.snapshotOf(result, this.snapshot);
      return result;
    }
  }
  // Serial writes with an optimistic comparison. The adapter must compare atomically.
  class SaveQueue {
    constructor(baseline, write) {
      this.baseline = baseline;
      this.write = write;
      this.tail = Promise.resolve();
      this.error = null;
    }
    save(text) {
      const task = this.tail.then(async () => {
        if (this.error) throw this.error;
        if (text === this.baseline) return;
        try {
          await this.write(this.baseline, text);
          this.baseline = text;
        } catch (e) {
          this.error = e;
          throw e;
        }
      });
      this.tail = task.catch(() => {});
      return task;
    }
  }
  module.exports = {
    clamp,
    dist,
    clone,
    uid,
    fresh,
    parse,
    serialize,
    smooth,
    inkPath,
    shapePath,
    svg,
    hit,
    recognize,
    History,
    SaveQueue,
    ...Geometry
  };

  function escapeXml(s) {
    return String(s).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]
    );
  }
  function layerFor(d, e) {
    return (d.layers || []).find((l) => l.id === (e.layerId || 'ink'));
  }
  function isVisible(d, e) {
    return layerFor(d, e)?.visible !== false;
  }
  function isEditable(d, e) {
    return isVisible(d, e) && !e.locked && !layerFor(d, e)?.locked;
  }
  function renderElements(d, elements = d.elements) {
    const order = new Map((d.layers || []).map((l, i) => [l.id, i]));
    return elements
      .filter((e) => isVisible(d, e))
      .slice()
      .sort((a, b) => (order.get(a.layerId || 'ink') ?? 0) - (order.get(b.layerId || 'ink') ?? 0));
  }
  Object.assign(module.exports, { escapeXml, layerFor, isVisible, isEditable, renderElements });

  function imageSvg(e) {
    const c = e.crop || { x: 0, y: 0, w: 1, h: 1 };
    return `<g transform="translate(${f(e.cx)} ${f(e.cy)}) rotate(${f((e.angle * 180) / Math.PI)})" opacity="${e.opacity}"><svg x="${f(-e.imageW / 2)}" y="${f(-e.imageH / 2)}" width="${f(e.imageW)}" height="${f(e.imageH)}" viewBox="${c.x} ${c.y} ${c.w} ${c.h}" preserveAspectRatio="none" overflow="hidden"><image href="${e.src}" width="1" height="1" preserveAspectRatio="none"/></svg></g>`;
  }
  function paperSvg(d, b) {
    const step = d.paperSpacing || 28;
    let out = '';
    if (d.background !== 'plain') {
      let shape =
        d.background === 'dots'
          ? '<circle cx="0" cy="0" r="1" fill="#cbd1da"/>'
          : '<path d="M0 0H' +
            step +
            (d.background === 'grid' ? ' M0 0V' + step : '') +
            '" stroke="#e6e9ef" fill="none"/>';
      if (d.background === 'grid' && d.gridStyle === 'isometric') {
        const w = Math.sqrt(3) * step;
        out += `<defs><pattern id="iso-paper" width="${w}" height="${2 * step}" patternUnits="userSpaceOnUse"><path d="M0 0H${w} M0 ${step}H${w} M0 0L${w} ${step} M0 ${step}L${w} ${2 * step} M0 ${step}L${w} 0 M0 ${2 * step}L${w} ${step}" stroke="#e6e9ef" fill="none"/></pattern></defs><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="url(#iso-paper)"/>`;
      } else
        out += `<defs><pattern id="paper" width="${step}" height="${step}" patternUnits="userSpaceOnUse">${shape}</pattern></defs><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="url(#paper)"/>`;
    }
    if (['cornell', 'qa', 'cards'].includes(d.template)) {
      const W = d.template === 'cards' ? 450 : 900,
        H = d.template === 'cards' ? 300 : 1200;
      let shape = `<rect x="20" y="20" width="${W - 40}" height="${H - 40}" fill="none" stroke="#a9b4c7"/>`;
      if (d.template === 'cornell')
        shape +=
          '<path d="M240 20V960 M20 960H880" stroke="#a9b4c7" fill="none"/><text x="35" y="50">Palavras-chave</text><text x="255" y="50">Anotações</text><text x="35" y="990">Resumo</text>';
      else if (d.template === 'qa')
        shape +=
          '<path d="M20 400H880" stroke="#a9b4c7"/><text x="35" y="50">Pergunta</text><text x="35" y="430">Resposta</text>';
      else shape += '<text x="35" y="50">Ficha</text>';
      out += `<defs><pattern id="template" width="${W}" height="${H}" patternUnits="userSpaceOnUse"><g fill="#718097" font-size="12" font-family="sans-serif">${shape}</g></pattern></defs><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="url(#template)"/>`;
    }
    return out;
  }
  function renameEmbed(text, oldPath, newPath) {
    const lines = text.split(/(?<=\n)/);
    let fence = null,
      isInk = false;
    return lines
      .map((line) => {
        const opening = line.match(/^ {0,3}(`{3,}|~{3,})([^\r\n]*)/);
        if (!fence) {
          if (opening) {
            fence = opening[1];
            isInk = opening[2].trim() === 'smartink';
          }
          return line;
        }
        const closing = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*\r?\n?$/);
        if (closing && closing[1][0] === fence[0] && closing[1].length >= fence.length) {
          fence = null;
          isInk = false;
          return line;
        }
        if (isInk && line.trim() === oldPath) return line.replace(oldPath, newPath);
        return line;
      })
      .join('');
  }
  function printPages(d, options = {}) {
    const width = options.width || 794,
      height = options.height || 1123,
      margin = options.margin ?? 38,
      w = width - 2 * margin,
      h = height - 2 * margin;
    if (w <= 0 || h <= 0 || ![width, height, margin].every(Number.isFinite))
      throw new Error('Papel inválido.');
    const content = Geometry.bounds(renderElements(d)),
      b = options.bounds || (content ? Geometry.expand(content, 16) : { x: 0, y: 0, w, h });
    if (![b.x, b.y, b.w, b.h].every(Number.isFinite) || b.w <= 0 || b.h <= 0)
      throw new Error('Área de impressão inválida.');
    const cols = Math.max(1, Math.ceil(b.w / w)),
      rows = Math.max(1, Math.ceil(b.h / h));
    if (cols * rows > 100) throw new Error('Mais de 100 páginas; reduza a área selecionada.');
    const pages = [];
    let bytes = 0;
    const elements = Geometry.resolveConnections(d.elements);
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < cols; col++) {
        const pageBounds = { x: b.x + col * w, y: b.y + row * h, w, h },
          pageElements = elements
            .filter((e) => Geometry.overlaps(Geometry.elementBounds(e), pageBounds))
            .map((e) => {
              const copy = { ...e };
              delete copy.bindings;
              return copy;
            });
        const page = svg({ ...d, elements: pageElements }, '', {
          paper: options.paper,
          bounds: pageBounds
        });
        bytes += page.length;
        if (bytes > 50000000)
          throw new Error('Impressão acima de 50 MB; exporte em seleções menores.');
        pages.push(page);
      }
    return { width, height, margin, pages };
  }
  Object.assign(module.exports, { imageSvg, paperSvg, renameEmbed, printPages });

  function textSvg(e) {
    const x = e.align === 'left' ? -e.imageW / 2 + 4 : e.align === 'right' ? e.imageW / 2 - 4 : 0;
    return `<g transform="translate(${f(e.cx)} ${f(e.cy)}) rotate(${f((e.angle * 180) / Math.PI)})" opacity="${e.opacity}"><text fill="${e.color}" font-family="sans-serif" font-size="${e.fontSize}" font-weight="${e.bold ? 'bold' : 'normal'}" text-anchor="${e.align === 'left' ? 'start' : e.align === 'right' ? 'end' : 'middle'}">${e.text
      .split('\n')
      .map(
        (line, i) =>
          `<tspan x="${f(x)}" y="${f(-e.imageH / 2 + e.fontSize + 4 + i * e.fontSize * 1.25)}">${escapeXml(line) || ' '}</tspan>`
      )
      .join('')}</text></g>`;
  }
  Object.assign(module.exports, { textSvg });

  return module.exports;
})();
