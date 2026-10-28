'use strict';
const assert = require('node:assert/strict'),
  { setup, walk } = require('./harness.cjs');
const h = setup(),
  v = h.view,
  K = h.ShapeKit;
const field = (p, label) =>
  walk(p).find((n) => n.tagName === 'INPUT' && n.getAttribute('aria-label') === label);
const change = (input, value) => {
  input.value = String(value);
  for (const fn of input.handlers.change || []) fn();
};
try {
  let calls = [];
  const p = v.makePanel(v.pageButton, 'Teste', 'test'),
    i = v.numberField(p, 'Número', 5, 1, 10, (n) => calls.push(n), 0.5);
  change(i, '');
  assert.equal(i.getAttribute('aria-invalid'), 'true');
  assert.equal(calls.length, 0);
  change(i, 20);
  assert.equal(calls.length, 0);
  i._siRestore();
  assert.equal(i.value, '5');
  change(i, 6);
  assert.equal(calls[0], 6);
  i.handlers.keydown[0]({
    key: 'ArrowUp',
    shiftKey: true,
    preventDefault() {},
    stopPropagation() {}
  });
  assert.equal(i.value, '10');
  const label = i.parentNode.children[0];
  label.handlers.pointerdown[0]({ button: 0, clientX: 100, pointerId: 1, preventDefault() {} });
  label.handlers.pointermove[0]({ clientX: 88 });
  label.handlers.pointercancel[0]();
  assert.equal(i.value, '10');
  const a = { ...K.make('rectangle', { x: 0, y: 0 }, { x: 100, y: 50 }), layerId: 'ink' },
    b = { ...K.make('ellipse', { x: 200, y: 0 }, { x: 300, y: 70 }), layerId: 'ink' };
  v.s.doc.elements = [a, b];
  v.selected = new Set([a.id]);
  v.openShapeParameters();
  v.selected = new Set([b.id]);
  v.updateSuggestion();
  assert.equal(v.propertyTarget, b.id);
  v.selected = new Set([a.id]);
  v.updateSuggestion();
  const row = walk(v.flyout).find(
    (n) => n.tagName === 'LABEL' && n.children.some((c) => c.textContent === 'Manter proporção')
  );
  const toggle = row.children.find((c) => c.tagName === 'INPUT');
  toggle.checked = true;
  toggle.handlers.change[0]();
  change(field(v.flyout, 'Largura'), 200);
  assert.equal(field(v.flyout, 'Altura').value, '100');
  assert.equal(v.propertyDirty, true);
  v.down(h.pointer(300, 10));
  assert.ok(v.propertyMessage);
  assert.equal(v.active, null);
  v.closePanel();
  v.openShapeLibrary();
  const search = walk(v.flyout).find((n) => n.type === 'search');
  search.value = 'estrela';
  search.handlers.input[0]();
  v.closePanel();
  v.openShapeLibrary();
  assert.equal(walk(v.flyout).find((n) => n.type === 'search').value, 'estrela');
  v.mode = 'select';
  v.selected = new Set([a.id, b.id]);
  v.s.doc.elements = [
    { ...a, color: '#ff0000', width: 2 },
    { ...b, color: '#000000', width: 4 }
  ];
  v.openBrushPanel('write', true);
  assert.ok(walk(v.flyout).some((n) => n.className === 'si-mixed-values'));
  v.polishPanel(v.flyout);
  assert.ok(walk(v.flyout).some((n) => n.textContent === 'Seleção atual · prévia até aplicar'));
  v.closePanel();
  v.s.doc.elements = [];
  v.active = null;
  v.updateEmptyHint();
  assert.equal(v.emptyHint.hidden, false);
  v.s.doc.elements = [a];
  v.updateEmptyHint();
  assert.equal(v.emptyHint.hidden, true);
  console.log(
    'PASS: numeric validation/restoration/scrubbing, proportion lock, inspector follows selection, pending edit protection, gallery memory, mixed styles and first-use hint'
  );
} finally {
  clearTimeout(v.feedbackTimer);
  h.dispose();
}
