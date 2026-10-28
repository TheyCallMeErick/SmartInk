'use strict';
const assert = require('node:assert/strict'),
  { setup, walk } = require('./harness.cjs');
const h = setup(),
  v = h.view,
  K = h.ShapeKit;
const click = (p, label) => {
  const b = walk(p).find((n) => n.tagName === 'BUTTON' && n.textContent === label);
  assert.ok(b, label);
  b.click();
};
const change = (p, label, value) => {
  const row = walk(p).find(
    (n) => n.tagName === 'LABEL' && n.children.some((c) => c.textContent === label)
  );
  assert.ok(row, label);
  const input = row.children.find((n) => n.tagName === 'INPUT');
  input.value = String(value);
  for (const fn of input.handlers.change || []) fn();
};
try {
  v.openShapeLibrary();
  assert.equal(
    walk(v.flyout).some((n) => n.textContent === 'Desenhar por arraste'),
    false
  );
  const search = walk(v.flyout).find((n) => n.type === 'search');
  search.value = 'xxxxx';
  search.handlers.input[0]();
  assert.ok(
    walk(v.flyout)
      .filter((n) => n.dataset?.shapeKind)
      .every((n) => n.hidden)
  );
  search.value = 'circulo';
  search.handlers.input[0]();
  assert.equal(
    walk(v.flyout)
      .filter((n) => n.dataset?.shapeKind && !n.hidden)
      .some((n) => n.dataset.shapeKind === 'circle'),
    true
  );
  walk(v.flyout)
    .find((n) => n.dataset?.shapeKind === 'rectangle')
    .click();
  assert.equal(v.mode, 'primitive');
  assert.equal(v.flyout, null);
  v.openPrimitiveInspector();
  const panel = v.flyout;
  v.shapeFixedSize = true;
  v.shapeDraftSize = { w: 200, h: 120 };
  v.directShapeOptions = { corner: 0.2 };
  v.plugin.settings.snapPoints = false;
  v.down({ ...h.pointer(150, 0), clientY: 160 });
  assert.equal(v.flyout, panel, 'Inspector survives canvas pointerdown');
  v.move({ ...h.pointer(210, 20), clientY: 210 });
  v.finish(true);
  let shape = v.s.doc.elements.at(-1);
  assert.equal(shape.shapeKind, 'rectangle');
  assert.equal(shape.corners.length, 32);
  assert.equal(h.Ink.dist(shape.shapeFrame[0], shape.shapeFrame[1]), 200);
  assert.equal(h.Ink.dist(shape.shapeFrame[0], shape.shapeFrame[2]), 120);
  v.closePanel(true);
  assert.equal(v.mode, 'primitive', 'Closing properties keeps tool active');
  const id = shape.id;
  v.openShapeParameters();
  change(v.flyout, 'Largura', 300);
  change(v.flyout, 'Rotação (°)', 30);
  assert.equal(v.s.doc.elements.at(-1), shape, 'Preview does not mutate the document');
  click(v.flyout, 'Cancelar');
  assert.equal(v.stylePreview, null);
  assert.equal(v.s.doc.elements.at(-1), shape);
  v.openShapeParameters();
  change(v.flyout, 'Largura', 300);
  change(v.flyout, 'Arredondamento (%)', 0);
  click(v.flyout, 'Aplicar alterações');
  shape = v.s.doc.elements.at(-1);
  assert.equal(shape.id, id);
  assert.equal(shape.corners.length, 4);
  assert.equal(h.Ink.dist(shape.shapeFrame[0], shape.shapeFrame[1]), 300);
  v.undo();
  assert.equal(v.s.doc.elements.at(-1).corners.length, 32);
  v.selected = new Set([id]);
  v.openShapeParameters();
  change(v.flyout, 'Largura', 900);
  v.s.revision++;
  click(v.flyout, 'Aplicar alterações');
  assert.equal(
    h.Ink.dist(v.s.doc.elements.at(-1).shapeFrame[0], v.s.doc.elements.at(-1).shapeFrame[1]),
    200,
    'Stale form does not apply'
  );
  const grouped = {
    ...K.make('rectangle', { x: 0, y: 0 }, { x: 100, y: 60 }, { corner: 0.1 }),
    groupId: 'group',
    noteLink: 'Note',
    locked: false
  };
  const rebuilt = K.rebuild(grouped, { corner: 0.3 });
  assert.equal(rebuilt.groupId, 'group');
  assert.equal(rebuilt.noteLink, 'Note');
  assert.equal(K.rebuild(rebuilt, { corner: 0 }).corners.length, 4);
  const d = h.Ink.fresh();
  d.elements = [{ ...rebuilt, layerId: 'ink' }];
  assert.equal(h.Ink.parse(h.Ink.serialize(d)).elements[0].shapeOptions.corner, 0.3);
  console.log(
    'PASS: immediate shape choice, search, persistent draft inspector, fixed size, rounded rectangles, preview/cancel/apply/undo/stale guards and metadata roundtrip'
  );
} finally {
  h.dispose();
}
