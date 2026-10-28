'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  { Worker } = require('node:worker_threads'),
  { setup, walk } = require('./harness.cjs');
const h = setup(),
  {
    view: v,
    Ink,
    Refinement: R,
    DigitAssist: D,
    ShapeKit: K,
    VectorOps: V,
    plugin,
    pointer,
    Brushes,
    SMART_INK_WORKER_SOURCE
  } = h;
const style = { color: '#123456', width: 2, opacity: 1, layerId: 'ink' },
  line = (id, x1, y1, x2, y2) => ({ ...style, type: 'line', id, x1, y1, x2, y2 }),
  rect = (id, x, y, w, height) =>
    K.make('rectangle', { x, y }, { x: x + w, y: y + height }, {}, { ...style, id }),
  click = (root, text) => {
    const b = walk(root).find((n) => n.tagName === 'BUTTON' && n.textContent === text);
    assert.ok(b, text);
    assert.ok(!b.disabled, text + ' enabled');
    b.click();
  };
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
(async () => {
  try {
    const a = line('a', 0, 0, 100, 0),
      cuts = [line('c1', 25, -20, 25, 20), line('c2', 75, -20, 75, 20)],
      detail = R.run('trim', { elements: [a, ...cuts], point: { x: 50, y: 0 }, tolerance: 10 });
    assert.equal(detail.removed[0].x, 25);
    assert.equal(detail.removed.at(-1).x, 75);
    assert.equal(detail.pieces.length, 2);
    const broken = [
        line('b1', 0, 0, 100, 0),
        line('b2', 100, 0, 100, 100),
        line('b3', 100, 100, 0, 100),
        line('b4', 0, 100, 0, 5)
      ],
      gaps = R.gaps(broken, 10);
    assert.equal(gaps.length, 1);
    assert.equal(gaps[0].distance, 5);
    const outer = rect('outer', 0, 0, 100, 100),
      inner = rect('inner', 20, 20, 30, 30),
      region = V.boolean([outer, inner], 'difference');
    assert.equal(R.ringList(region).length, 2);
    const edited = R.editRing(region, 1, 0, { x: 23, y: 25 }),
      normalized = R.normalizeRegion(edited);
    assert.equal(normalized.geometry[0].length, 2);
    assert.equal(region.geometry[0][1][0][0], 20);
    assert.equal(edited.geometry[0][1][0][0], 23);
    assert.equal(edited.geometry[0][1].at(-1)[0], 23);
    let curve = {
      ...style,
      id: 'curve',
      type: 'path',
      closed: false,
      fill: 'none',
      nodes: [
        { x: 0, y: 0, kind: 'corner' },
        { x: 100, y: 0, kind: 'corner' }
      ]
    };
    const near = R.nearest(curve, { x: 35, y: 2 });
    assert.ok(Math.abs(near.point.x - 35) < 0.01);
    const bent = R.bend(curve, 0, 0.5, { x: 0, y: 20 });
    assert.ok(Math.abs(V.cubic(bent.nodes[0], bent.nodes[1], 0.5).y - 20) < 1e-8);
    const shifted = R.translateNodes(bent, new Set([0, 1]), { x: 4, y: 8 });
    assert.equal(shifted.nodes[0].out.y, bent.nodes[0].out.y + 8);
    const rounded = K.make(
        'rounded',
        { x: 0, y: 0 },
        { x: 100, y: 80 },
        { rounding: 0.2 },
        { ...style, id: 'round' }
      ),
      resized = R.parameterEdit(rounded, 'width', { x: 180, y: 0 });
    assert.equal(Ink.dist(resized.shapeFrame[0], resized.shapeFrame[1]), 180);
    assert.equal(resized.shapeKind, 'rounded');
    assert.equal(
      R.parameterEdit(rounded, 'rounding', { x: 30, y: 0 }).shapeOptions.rounding,
      0.375
    );
    // Real pointer lifecycle for segment bending, nodes, cancellation and numeric parameters.
    v.s.doc.elements = [curve];
    v.mode = 'select';
    v.selected = new Set(['curve']);
    v.pointEditing = 'curve';
    v.down({ ...pointer(98, 0), clientY: 48 });
    assert.equal(v.active.kind, 'bend');
    v.move({ ...pointer(98, 10), clientY: 68 });
    v.finish(true);
    assert.ok(v.s.doc.elements[0].nodes[0].out);
    assert.equal(v.s.history.undoStack.at(-1).label, 'Ajuste de curva');
    v.undo();
    assert.equal(v.s.doc.elements[0], curve);
    assert.match(v.hint.textContent, /Ajuste de curva/);
    v.pointEditing = 'curve';
    v.down({ ...pointer(48, 20), clientY: 48, shiftKey: true });
    v.down({ ...pointer(148, 21), clientY: 48, shiftKey: true });
    assert.equal(v.nodeSelection.size, 2);
    v.down({ ...pointer(48, 22), clientY: 48 });
    v.move({ ...pointer(58, 23), clientY: 58 });
    v.finish(true);
    assert.equal(v.s.doc.elements[0].nodes[1].x, 110);
    v.undo();
    v.pointEditing = null;
    v.regionEditing = region.id;
    v.regionRingIndex = 1;
    v.s.doc.elements = [region];
    v.selected = new Set([region.id]);
    const point = R.ringList(region)[1].ring[0];
    v.down({ ...pointer(point[0] + 48, 30), clientY: point[1] + 48 });
    assert.equal(v.active.kind, 'ring');
    v.move({ ...pointer(point[0] + 51, 31), clientY: point[1] + 53 });
    v.finish(true);
    assert.equal(v.s.doc.elements[0], region);
    click(v.flyout, 'Cancelar');
    assert.equal(v.s.doc.elements[0], region);
    v.regionEditing = null;
    v.s.doc.elements = [rounded];
    v.parameterEditing = rounded.id;
    v.down({ ...pointer(148, 40), clientY: 48 });
    assert.equal(v.active.kind, 'width');
    v.move({ ...pointer(198, 41), clientY: 48 });
    v.finish(true);
    assert.equal(v.s.doc.elements[0].shapeKind, 'rounded');
    assert.equal(
      Ink.dist(v.s.doc.elements[0].shapeFrame[0], v.s.doc.elements[0].shapeFrame[1]),
      150
    );
    v.undo();
    v.parameterEditing = null;
    // Newly recognized primitives expose parameter handles; circle radius keeps its center.
    const nativeCircle = { ...style, id: 'native', type: 'circle', cx: 50, cy: 40, r: 20 },
      param = v.correctedShape(nativeCircle, {
        ...style,
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 1 }
        ]
      });
    assert.equal(param.shapeKind, 'circle');
    const expanded = R.parameterEdit(param, 'radius', { x: 100, y: 40 });
    assert.equal(expanded.r, 50);
    assert.equal(expanded.cx, 50);
    assert.equal(expanded.cy, 40);
    v.mode = 'select';
    v.s.doc.elements = [curve];
    v.pointEditing = 'curve';
    v.selected = new Set(['curve']);
    v.overlay.dispatchEvent({ ...pointer(83, 45), type: 'dblclick', clientY: 48 });
    assert.equal(v.s.doc.elements[0].nodes.length, 3);
    v.undo();
    v.pointEditing = null;
    v.openOverlapPicker([outer, inner]);
    const options = walk(v.flyout).filter((n) => n.className === 'si-overlap-item');
    assert.equal(options.length, 2);
    options[1].dispatchEvent({ type: 'focus' });
    assert.equal(v.overlapHighlight, inner);
    options[1].click();
    assert.ok(v.selected.has('inner'));
    assert.equal(v.overlapHighlight, null);
    // Temporary tools restore through nested and out-of-order key releases; pen buttons restore on finish.
    v.mode = 'write';
    v.beginTemporary('select', 'Q');
    v.beginTemporary('erase', 'E');
    v.endTemporary('Q');
    assert.equal(v.mode, 'erase');
    v.endTemporary('E');
    assert.equal(v.mode, 'write');
    v.beginTemporary('pan', 'Space');
    v.endTemporary('Space');
    assert.equal(v.mode, 'write');
    plugin.settings.penButtons.secondary = 'select';
    v.down({ ...pointer(300, 50), button: 2 });
    assert.equal(v.mode, 'select');
    v.finish(true);
    assert.equal(v.mode, 'write');
    assert.equal(v.tempStack.length, 0);
    // Algorithm checks use authored templates; they do not estimate accuracy on real handwriting.
    const digitStrokes = (digit, x = 0) =>
      D.templates[digit].map((points, i) => ({
        ...style,
        id: digit + '-' + i + '-' + x,
        type: 'stroke',
        pressure: true,
        smoothing: 0.4,
        points: points.map(([px, py], j) => ({ x: x + px * 40, y: py * 60, p: 0.4, t: j * 10 }))
      }));
    for (let digit = 0; digit <= 9; digit++) {
      const sample = digitStrokes(String(digit));
      assert.equal(D.rank(sample)[0].digit, String(digit));
      const model = D.learn(sample, String(digit));
      assert.equal(D.validSamples([model]).length, 1);
      assert.ok(D.cleanNumbers(sample, String(digit)).every((e) => e.type === 'path'));
    }
    assert.equal(D.validSamples([{ digit: 'x', points: [] }]).length, 0);
    const number = [...digitStrokes('2'), ...digitStrokes('7', 60)];
    assert.equal(D.suggest(number).length, 2);
    assert.equal(
      D.suggest(number)
        .map((g) => g.candidates[0].digit)
        .join(''),
      '27'
    );
    assert.throws(() => D.cleanNumbers(number, 'abc'));
    assert.throws(() => D.learn(number, '27'));
    v.s.doc.elements = number;
    v.selected = new Set(number.map((e) => e.id));
    v.openDigitAssist();
    assert.equal(v.panelKind, 'digit-assist');
    assert.equal(v.s.doc.elements.length, 2);
    assert.ok(v.stylePreview.elements.length > 2);
    click(v.flyout, 'Manter somente o original');
    assert.equal(v.s.doc.elements.length, 2);
    v.openDigitAssist();
    click(v.flyout, 'Aplicar número confirmado');
    assert.ok(v.s.doc.elements.length > 2);
    assert.equal(v.s.history.undoStack.at(-1).label, 'Números confirmados');
    v.undo();
    assert.equal(v.s.doc.elements.length, 2);
    const one = digitStrokes('1');
    v.s.doc.elements = one;
    v.selected = new Set(one.map((e) => e.id));
    v.openDigitAssist();
    click(v.flyout, 'Ensinar este exemplo com o algarismo escolhido');
    assert.equal(plugin.settings.digitSamples.length, 1);
    assert.equal(Brushes.settings(plugin.settings).digitSamples.length, 1);
    v.closePanel();
    // Disk roundtrip with pressure ink, editable curve, region hole and attached connector.
    const connection = {
        ...line('connection', 0, 0, 50, 50),
        connector: true,
        bindings: { start: { targetId: region.id, index: 0 } }
      },
      doc = {
        ...Ink.fresh(),
        elements: [...number, bent, region, connection, ...D.cleanNumbers(number, '27')]
      };
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'smartink-roundtrip-'));
    try {
      fs.writeFileSync(path.join(folder, 'page.smartink'), Ink.serialize(doc));
      const read = Ink.parse(fs.readFileSync(path.join(folder, 'page.smartink'), 'utf8'));
      assert.equal(read.elements.find((e) => e.type === 'region').geometry[0].length, 2);
      assert.equal(read.elements.find((e) => e.id === 'curve').nodes[0].out.y, bent.nodes[0].out.y);
      assert.equal(read.elements[0].points[0].p, 0.4);
      assert.match(Ink.svg(read), /fill-rule="evenodd"/);
    } finally {
      fs.rmSync(folder, { recursive: true });
    }
    // Actual worker thread runs the browser worker source, including cancellation and stale revision guard.
    const urls = new Map();
    let seq = 0,
      terminated = 0;
    v.win.Blob = class {
      constructor(parts) {
        this.source = parts.join('');
      }
    };
    v.win.URL = {
      createObjectURL(blob) {
        const id = 'blob:test-' + ++seq;
        urls.set(id, blob.source);
        return id;
      },
      revokeObjectURL(id) {
        urls.delete(id);
      }
    };
    v.win.Worker = class {
      constructor(url) {
        const code =
          "const {parentPort}=require('node:worker_threads');const self={postMessage:value=>parentPort.postMessage(value)};" +
          urls.get(url) +
          ";parentPort.on('message',data=>self.onmessage({data}));";
        this.worker = new Worker(code, { eval: true });
        this.worker.on('message', (data) => this.onmessage?.({ data }));
        this.worker.on('error', (error) => this.onerror?.(error));
      }
      postMessage(data) {
        this.worker.postMessage(data);
      }
      terminate() {
        terminated++;
        void this.worker.terminate();
      }
    };
    const result = await v.runGeometry('boolean', { elements: [outer, inner], kind: 'difference' })
      .promise;
    assert.equal(result.geometry[0].length, 2);
    assert.equal(urls.size, 0);
    const job = v.runGeometry('fill', { elements: broken, point: { x: 50, y: 50 }, gap: 6, style });
    const rejection = assert.rejects(job.promise, { name: 'AbortError' });
    v.cancelGeometry();
    await rejection;
    assert.equal(urls.size, 0);
    assert.ok(terminated >= 2);
    v.s.doc.elements = [outer, inner];
    v.selected = new Set(['outer', 'inner']);
    v.previewVectorOperation(
      'União',
      'boolean',
      { elements: [outer, inner], kind: 'union' },
      (result) => [result]
    );
    v.s.revision++;
    await v.vectorPromise;
    assert.equal(v.s.doc.elements.length, 2);
    assert.equal(v.stylePreview, null);
    v.closePanel();
    v.previewVectorOperation(
      'União',
      'boolean',
      { elements: [outer, inner], kind: 'union' },
      (result) => [result]
    );
    await v.vectorPromise;
    assert.equal(v.s.doc.elements.length, 2);
    assert.equal(v.stylePreview.elements.length, 1);
    click(v.flyout, 'Aplicar alterações');
    assert.equal(v.s.doc.elements.length, 1);
    v.undo();
    assert.equal(v.s.doc.elements.length, 2);
    v.mode = 'select';
    v.s.doc.elements = [a, ...cuts];
    v.selected = new Set(v.s.doc.elements.map((e) => e.id));
    v.armVectorTool('trim');
    v.scheduleTrimHover({ x: 50, y: 0 });
    await delay(110);
    if (v.hoverGeometryJob) await v.hoverGeometryJob.promise;
    assert.equal(v.trimHover[0].x, 25);
    v.selectTool('write', false, false);
    assert.equal(v.vectorTask, null);
    assert.equal(v.trimHover, null);
    v.openGapDiagnosis(broken, new Error('Área aberta'));
    await v.vectorPromise;
    assert.equal(v.gapMarkers.length, 1);
    assert.ok(walk(v.flyout).some((n) => n.textContent.startsWith('Conferir fresta')));
    v.closePanel();
    console.log(
      'PASS: trim detail, gap diagnosis, ring editing, direct Bézier/node/parameter gestures, temporary tools, digit templates/correction/personal samples, disk roundtrip, actual worker thread/cancel/stale preview'
    );
  } finally {
    h.dispose();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
