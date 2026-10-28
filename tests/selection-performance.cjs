'use strict';
const assert = require('node:assert/strict'),
  { setup } = require('./harness.cjs');
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
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((fn) => fn());
  };
  const elements = Array.from({ length: 100 }, (_, i) => ({
    id: 'e' + i,
    type: 'line',
    x1: i * 5,
    y1: 100,
    x2: i * 5 + 4,
    y2: 130,
    width: 2,
    opacity: 1,
    color: '#000000',
    layerId: 'ink'
  }));
  elements.push({
    id: 'link',
    type: 'line',
    x1: 0,
    y1: 0,
    x2: 700,
    y2: 400,
    width: 2,
    opacity: 1,
    color: '#000000',
    layerId: 'ink',
    bindings: { start: { targetId: 'e0', index: 0 } },
    connector: true
  });
  const reset = () => {
    v.s.doc.elements = elements;
    v.mode = 'select';
    v.selected = new Set(elements.slice(0, 100).map((e) => e.id));
    v.active = {
      mode: 'move-selection',
      pointer: 7,
      start: { x: 0, y: 0 },
      before: elements,
      revision: v.s.revision,
      selected: new Set(v.selected)
    };
  };
  v.plugin.settings.smartGuides = false;
  reset();
  const transform = Ink.transform;
  let transformed = 0;
  Ink.transform = (...args) => {
    transformed++;
    return transform(...args);
  };
  for (let i = 1; i <= 40; i++) v.move({ ...h.pointer(48 + i, 0), clientY: 68 });
  assert.equal(frames.size, 1);
  assert.equal(transformed, 0);
  flush();
  assert.equal(v.active.fastMove.dx, 40);
  assert.equal(transformed, 0, 'No selected geometry copies during frame');
  assert.equal(v.s.doc.elements, elements);
  assert.equal(v.active.fastMove.connections.get('link').x1, Ink.anchors(elements[0])[0].x + 40);
  const originalPath = v.pathCache.get(elements[0]);
  v.move({ ...h.pointer(98, 0), clientY: 78 });
  flush();
  assert.equal(v.pathCache.get(elements[0]), originalPath, 'Original Path2D stays cached');
  assert.equal(transformed, 0);
  // Final event must flush even when the display frame has not run.
  v.up({ ...h.pointer(108, 0), clientY: 88 });
  assert.equal(v.s.doc.elements[0].x1, 60);
  assert.equal(v.s.doc.elements[0].y1, 140);
  assert.equal(transformed, 100);
  assert.equal(v.s.history.undoStack.length, 1);
  v.undo();
  assert.equal(v.s.doc.elements[0].x1, 0);
  v.redo();
  assert.equal(v.s.doc.elements[0].x1, 60);
  reset();
  v.move({ ...h.pointer(88, 0), clientY: 88 });
  v.cancelGesture();
  flush();
  assert.equal(v.active, null);
  assert.equal(v.s.doc.elements, elements, 'Cancel leaves source geometry intact');
  reset();
  v.move({ ...h.pointer(88, 0), clientY: 88 });
  v.s.revision++;
  flush();
  assert.equal(v.active, null, 'Concurrent edit invalidates pending transform');
  assert.equal(v.s.doc.elements, elements);
  Ink.transform = transform;
  console.log(
    'PASS: batched moves, retained paths, zero geometry copies per frame, live connector, final-event flush, single undo, cancellation and stale revision'
  );
} finally {
  clearTimeout(v.feedbackTimer);
  h.dispose();
}
