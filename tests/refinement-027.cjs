'use strict';
const assert = require('node:assert/strict'),
  { setup, walk } = require('./harness.cjs');
const h = setup(),
  v = h.view,
  button = (p, t) => walk(p).find((n) => n.tagName === 'BUTTON' && n.textContent === t);
try {
  const b = v.plugin.settings.brushes.write;
  b.smoothing = 0.9;
  b.width = 4;
  b.pressureGamma = 2;
  v.openBrushPanel('write');
  const doc = JSON.stringify(v.s.doc);
  button(v.flyout, 'Restaurar suavização').click();
  assert.equal(v.plugin.settings.brushes.write.smoothing, 0.55);
  assert.ok(v.preferenceUndo);
  assert.equal(v.undoPreference(), true);
  assert.equal(v.plugin.settings.brushes.write.smoothing, 0.9);
  assert.equal(JSON.stringify(v.s.doc), doc);
  button(v.flyout, 'Restaurar pressão').click();
  v.plugin.settings.brushes.write.pressureGamma = 3;
  assert.equal(v.undoPreference(), false);
  assert.equal(v.plugin.settings.brushes.write.pressureGamma, 3);
  const pad = walk(v.flyout).find((n) => n.getAttribute('class') === 'si-brush-test-pad'),
    event = {
      pointerId: 6,
      pointerType: 'pen',
      button: 0,
      pressure: 0.6,
      clientX: 50,
      clientY: 50,
      timeStamp: 2,
      preventDefault() {}
    };
  pad.handlers.pointerdown[0](event);
  pad.handlers.pointerup[0]({ ...event, clientX: 80 });
  assert.equal(v.brushTest.state.strokes.length, 1);
  v.openCalibration('write');
  v.openBrushPanel('write');
  assert.equal(v.brushTest.state.strokes.length, 1);
  const before = walk(v.flyout).find(
    (n) => n.getAttribute('class') === 'si-brush-test-pad si-brush-before'
  );
  const current = walk(v.flyout).find((n) => n.getAttribute('class') === 'si-brush-test-pad');
  assert.ok(before.children.length);
  const width = walk(v.flyout).find((n) => n.getAttribute('aria-label') === 'Espessura em pixels');
  width.value = '8';
  width.handlers.input[0]();
  assert.notEqual(before.children[0].getAttribute('d'), current.children[0].getAttribute('d'));
  assert.equal(JSON.stringify(v.s.doc), doc);
  v.closePanel();
  v.openPagePanel(v.pageButton);
  v.searchSettings('grossura');
  assert.ok(
    walk(v.settingsSearchResults).some(
      (n) => n.tagName === 'BUTTON' && n.textContent.startsWith('Espessura')
    )
  );
  v.searchSettings('pressure');
  assert.ok(
    walk(v.settingsSearchResults).some(
      (n) => n.tagName === 'BUTTON' && n.textContent.includes('pressão')
    )
  );
  assert.ok(
    v.settingsCatalog.some((n) => n.label === 'Erro máximo de QuickShape (menor = mais rigoroso)')
  );
  v.plugin.settings.favorites = [
    { name: 'A', kind: 'write', brush: { ...b } },
    { name: 'B', kind: 'write', brush: { ...b } }
  ];
  v.openWorkflow();
  let rows = walk(v.flyout).filter((n) => n.classList.contains('si-favorite-editor'));
  assert.equal(rows.length, 2);
  rows[0].children
    .find((n) => n.getAttribute('aria-label') === 'Mover favorito para baixo')
    .click();
  assert.equal(v.plugin.settings.favorites[0].name, 'B');
  assert.equal(v.undoPreference(), true);
  assert.equal(v.plugin.settings.favorites[0].name, 'A');
  rows = walk(v.flyout).filter((n) => n.classList.contains('si-favorite-editor'));
  button(rows[0], 'Remover').click();
  assert.equal(v.plugin.settings.favorites.length, 1);
  v.undoPreference();
  assert.equal(v.plugin.settings.favorites.length, 2);
  v.closePanel();
  v.selectionPointer = 'pen';
  v.zoom = 1;
  assert.equal(v.nearestSelectionHandle({ x: 16, y: 0 }, [{ x: 0, y: 0 }]), 0);
  v.selectionPointer = 'mouse';
  assert.equal(v.nearestSelectionHandle({ x: 16, y: 0 }, [{ x: 0, y: 0 }]), -1);
  v.selectionPointer = 'pen';
  assert.equal(
    v.nearestSelectionHandle({ x: 8, y: 0 }, [
      { x: 0, y: 0 },
      { x: 10, y: 0 }
    ]),
    1
  );
  const p = v.makePanel(v.pageButton, 'Test', 'test');
  p.getBoundingClientRect = () => ({ width: 180, height: 120 });
  v.selectionBox = () => null;
  v.lastWritingPoint = { x: 100, y: 100 };
  p.style.left = '60px';
  p.style.top = '60px';
  v.placePanelAwayFromWork(p);
  assert.notEqual(p.style.left + ' ' + p.style.top, '60px 60px');
  const pos = p.style.left + ' ' + p.style.top;
  v.lastWritingPoint = { x: 200, y: 200 };
  v.placePanelAwayFromWork(p);
  assert.equal(p.style.left + ' ' + p.style.top, pos);
  v.closePanel();
  v.active = { stroke: {} };
  v.showCanvasFeedback('Teste informativo');
  v.showCanvasFeedback('Teste informativo');
  assert.equal(v.pendingInformational.get('Teste informativo'), 2);
  v.active = null;
  v.finish(false);
  assert.equal(v.pendingInformational.size, 0);
  assert.ok(walk(v.canvasFeedback).some((n) => n.textContent === 'Teste informativo (×2)'));
  console.log(
    'PASS: configuration undo/conflict guard, retained before/after samples, complete cold search, favorite reordering/removal undo, pen hit targets, stable panel placement and deferred notices'
  );
} finally {
  clearTimeout(v.feedbackTimer);
  h.dispose();
}
