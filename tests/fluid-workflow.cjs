'use strict';
const assert = require('node:assert/strict'),
  { setup, walk } = require('./harness.cjs');
(async () => {
  const h = setup(),
    v = h.view,
    { Ink } = h;
  try {
    let next = 0;
    const frames = new Map();
    v.win.requestAnimationFrame = (fn) => {
      frames.set(++next, fn);
      return next;
    };
    v.win.cancelAnimationFrame = (id) => frames.delete(id);
    const flush = () => {
      const work = [...frames.values()];
      frames.clear();
      work.forEach((fn) => fn(16));
    };
    const line = (id, x) => ({
      id,
      type: 'line',
      x1: x,
      y1: 50,
      x2: x + 10,
      y2: 60,
      width: 2,
      opacity: 1,
      color: '#000000',
      layerId: 'ink'
    });
    const selected = Array.from({ length: 64 }, (_, i) => line('s' + i, i * 10)),
      fixed = line('fixed', 0);
    v.s.doc.elements = [fixed, ...selected];
    v.selected = new Set(selected.map((e) => e.id));
    v.mode = 'select';
    v.plugin.settings.smartGuides = false;
    const start = (mode, extra = {}) => {
      v.active = {
        mode,
        pointer: 7,
        start: { x: 100, y: 0 },
        before: v.s.doc.elements,
        revision: v.s.revision,
        selected: new Set(v.selected),
        origin: { x: 0, y: 0 },
        handle: { x: 100, y: 0 },
        ...extra
      };
    };
    start('rotate');
    v.move({ ...h.pointer(48, 0), clientY: 148 });
    flush();
    assert.ok(Math.abs(v.active.fastMove.tx.angle - Math.PI / 2) < 1e-8);
    assert.equal(v.active.preview, undefined);
    v.finish(true);
    assert.ok(Math.abs(v.s.doc.elements[1].x1 + 50) < 1e-8);
    v.undo();
    start('resize');
    v.move({ ...h.pointer(248, 0), clientY: 48 });
    flush();
    assert.equal(v.active.fastMove.tx.scale, 2);
    v.finish(true);
    assert.equal(v.s.doc.elements[1].y1, 100);
    v.undo();
    let stationaryPaints = 0;
    const paint = v.paint;
    v.paint = function (ctx, e, ...rest) {
      if (e.id === 'fixed') stationaryPaints++;
      return paint.call(this, ctx, e, ...rest);
    };
    start('move-selection', { start: { x: 0, y: 0 } });
    v.move({ ...h.pointer(80, 0), clientY: 80 });
    flush();
    assert.equal(stationaryPaints, 1);
    v.move({ ...h.pointer(100, 0), clientY: 100 });
    flush();
    assert.equal(stationaryPaints, 1, 'Stationary pixels reused');
    v.camera.x++;
    v.render();
    assert.equal(stationaryPaints, 2, 'Camera invalidates raster cache');
    v.cancelGesture();
    v.paint = paint;
    // Visible geometry is transformed once without rerunning clipping/outline generation.
    const cached = line('visible', 10),
      transformed = Ink.transform(cached, { dx: 30, dy: 20 });
    v.visible.get(cached);
    const computations = v.visible.computations;
    v.visible.retainTransform(cached, transformed, { dx: 30, dy: 20 });
    assert.ok(v.visible.hit(transformed, { x: 45, y: 75 }, 4));
    assert.equal(v.visible.computations, computations);
    // Share unchanged history blocks, while preserving insert/remove/reorder and metadata setters.
    const history = new Ink.History(2),
      before = Array.from({ length: 256 }, (_, i) => line('h' + i, i)),
      after = before.slice();
    after[70] = { ...after[70], x1: 900 };
    history.push(before, before);
    const snapshot = history.snapshot;
    history.push(before, after);
    assert.equal(history.snapshot.chunks[0], snapshot.chunks[0]);
    assert.notEqual(history.snapshot.chunks[1], snapshot.chunks[1]);
    assert.equal(history.undo()[70].x1, 70);
    assert.equal(history.redo()[70].x1, 900);
    history.push(after, [after[5], after[0]]);
    assert.equal(history.undoStack.length, 2);
    assert.equal(history.undo().length, 256);
    assert.equal(history.redo()[0].id, 'h5');
    v.active = null;
    v.s.doc.elements = [line('nudge', 100)];
    v.selected = new Set(['nudge']);
    v.mode = 'select';
    const count = v.s.history.undoStack.length;
    v.nudgeSelection(1, 0);
    v.nudgeSelection(10, 0);
    v.finish(true);
    assert.equal(v.s.doc.elements[0].x1, 111);
    assert.equal(v.s.history.undoStack.length, count + 1);
    v.undo();
    assert.equal(v.s.doc.elements[0].x1, 100);
    const text = v.selectionClipboardText();
    assert.equal(v.pasteSelection(text, 'original'), true);
    assert.equal(v.s.doc.elements.at(-1).x1, 100);
    const image = {
      id: 'image',
      type: 'image',
      src: 'data:image/png;base64,AAAA',
      cx: 90,
      cy: 120,
      imageW: 40,
      imageH: 60,
      angle: 0.3,
      width: 1,
      opacity: 0.5,
      color: '#ffffff',
      layerId: 'ink',
      crop: { x: 0, y: 0, w: 0.5, h: 0.5 }
    };
    v.s.doc.elements = [image];
    v.selected = new Set(['image']);
    v.decodePastedImage = async () => ({ src: 'data:image/png;base64,AABB', w: 100, h: 100 });
    v.replaceSelectedImage();
    const input = walk(v.root)
      .filter((e) => e.tagName === 'INPUT' && e.type === 'file')
      .at(-1);
    input.files = [{ size: 10, type: 'image/png' }];
    await input.handlers.change[0]();
    const replacement = v.s.doc.elements[0];
    assert.equal(replacement.cx, 90);
    assert.equal(replacement.imageW, 40);
    assert.equal(replacement.angle, 0.3);
    assert.equal(replacement.crop, undefined);
    assert.equal(replacement.src, 'data:image/png;base64,AABB');
    v.undo();
    assert.equal(v.s.doc.elements[0].src, image.src);
    v.s.doc.elements = [line('png', 10)];
    v.selected = new Set(['png']);
    let payload;
    v.win.navigator = { clipboard: { write: async (value) => (payload = value) } };
    v.win.ClipboardItem = class {
      constructor(data) {
        this.data = data;
      }
    };
    const create = h.document.createElement;
    h.document.createElement = (tag) => {
      const node = create(tag);
      if (tag === 'canvas') node.toBlob = (fn) => fn(new Blob(['png'], { type: 'image/png' }));
      return node;
    };
    await v.copySelectionImage();
    assert.equal(payload[0].data['image/png'].type, 'image/png');
    h.document.createElement = create;
    v.updateSuggestion();
    const copy = walk(v.suggestion).find(
      (n) => n.tagName === 'BUTTON' && n.textContent === 'Copiar'
    );
    assert.equal(copy.dataset.siIcon, 'copy');
    assert.equal(copy.children.at(-1).getAttribute('aria-hidden'), 'true');
    const report = v.performanceReport();
    assert.ok(report.phases.desenho);
    assert.equal(JSON.stringify(report).includes('data:image'), false);
    // Autopan moves only the camera and updates the active gesture; cancellation stops frames.
    v.active = {
      mode: 'marquee',
      pointer: 7,
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      selected: new Set()
    };
    const x = v.camera.x;
    v.armAutopan({ ...h.pointer(895, 0), clientY: 300 });
    flush();
    assert.ok(v.camera.x < x);
    v.cancelGesture();
    assert.equal(v.autopanFrame, null);
    console.log(
      'PASS: retained rotation/scale, stationary raster invalidation, shared history chunks, nudges, original paste, image replacement/undo, PNG clipboard, icons, diagnostics and autopan'
    );
  } finally {
    v.stopAutopan();
    clearTimeout(v.feedbackTimer);
    h.dispose();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
