'use strict';
const assert = require('node:assert/strict'),
  { setup, walk } = require('./harness.cjs');
(async () => {
  const h = setup(),
    v = h.view,
    { Ink, Brushes } = h;
  try {
    const image = {
      id: 'image',
      type: 'image',
      src: 'data:image/png;base64,iVBORw0KGgo=',
      cx: 200,
      cy: 200,
      imageW: 100,
      imageH: 60,
      angle: 0,
      color: '#ffffff',
      width: 1,
      opacity: 1,
      layerId: v.s.doc.activeLayer,
      groupId: 'g',
      groupPath: ['g', 'sub']
    };
    const stroke = {
      id: 'stroke',
      type: 'stroke',
      points: [
        { x: 130, y: 100, p: 0.3, t: 0 },
        { x: 170, y: 110, p: 0.8, t: 10 }
      ],
      ...Brushes.strokeStyle(v.plugin.settings, 'write'),
      layerId: v.s.doc.activeLayer,
      groupId: 'g',
      groupPath: ['g', 'sub']
    };
    v.s.doc.elements = [image, stroke];
    v.selected = new Set(['image', 'stroke']);
    v.mode = 'select';
    const copied = v.selectionClipboardText(),
      originalSession = v.s;
    v.s = {
      ...v.s,
      doc: Ink.fresh(),
      history: new Ink.History(),
      revision: 0,
      file: { path: 'other.smartink' }
    };
    assert.equal(v.pasteSelection(copied), true);
    assert.equal(v.s.doc.elements.length, 2);
    const [a, b] = v.s.doc.elements;
    assert.notEqual(a.id, image.id);
    assert.equal(a.groupPath[1], b.groupPath[1]);
    assert.notEqual(a.groupPath[0], 'g');
    assert.equal(a.src, image.src);
    assert.equal(b.points[0].p, 0.3);
    assert.equal(originalSession.doc.elements.length, 2);
    v.undo();
    assert.equal(v.s.doc.elements.length, 0);
    v.redo();
    assert.equal(v.s.doc.elements.length, 2);
    assert.equal(v.pasteSelection('SMARTINK-SELECTION/1\n{}'), false);
    assert.equal(v.s.doc.elements.length, 2);
    v.s.doc.elements = [{ ...image, groupId: undefined, groupPath: undefined }];
    v.selected = new Set(['image']);
    v.updateSuggestion();
    assert.ok(walk(v.suggestion).some((n) => n.textContent === 'Recortar'));
    const beforeCamera = JSON.stringify(v.camera),
      beforeZoom = v.zoom;
    v.fitSelection();
    v.navigateView(false);
    assert.equal(JSON.stringify(v.camera), beforeCamera);
    assert.equal(v.zoom, beforeZoom);
    // Sub-threshold moves cannot create a history entry or preview.
    v.selectionPointer = 'pen';
    v.beginSelect({ x: 200, y: 200 }, { pointerId: 7, shiftKey: false, altKey: false });
    assert.equal(v.active.mode, 'move-selection');
    const revision = v.s.revision;
    v.move({ ...h.pointer(250, 0), clientY: 250 });
    assert.equal(v.active.preview, undefined);
    v.finish(true);
    assert.equal(v.s.revision, revision);
    // Shift scales a rotated image in its own axes, Alt keeps its center fixed.
    v.s.doc.elements = [{ ...image, groupId: undefined, groupPath: undefined, angle: Math.PI / 4 }];
    const current = v.s.doc.elements[0],
      corners = v.selectionHandles(v.selectionBox());
    v.beginSelect(corners[2], { pointerId: 7, altKey: false, shiftKey: false });
    assert.equal(v.active.mode, 'resize');
    const target = {
      x: current.cx + Math.cos(current.angle) * 100 - Math.sin(current.angle) * 30,
      y: current.cy + Math.sin(current.angle) * 100 + Math.cos(current.angle) * 30
    };
    const screen = Ink.worldToScreen(target, v.camera, v.zoom);
    v.move({ ...h.pointer(screen.x, 0), clientY: screen.y, altKey: true, shiftKey: true });
    const scaled = v.active.preview[0];
    assert.ok(Math.abs(scaled.imageW - 200) < 1e-7);
    assert.ok(Math.abs(scaled.imageH - 60) < 1e-7);
    assert.ok(Math.abs(scaled.cx - 200) < 1e-7);
    assert.ok(Math.abs(scaled.cy - 200) < 1e-7);
    v.escapeOneLevel();
    assert.equal(v.s.doc.elements[0].imageW, 100);
    assert.equal(v.selected.size, 1);
    // Escape cancels a preview, then the selection; it never undoes committed work.
    v.previewInkOperation('Preview', () => [{ ...current, imageW: 120 }]);
    v.escapeOneLevel();
    assert.equal(v.flyout, null);
    assert.equal(v.selected.size, 1);
    assert.equal(v.s.doc.elements[0].imageW, 100);
    v.escapeOneLevel();
    assert.equal(v.selected.size, 0);
    v.mode = 'write';
    v.down(h.pointer(300, 0));
    v.move(h.pointer(330, 10));
    const count = v.s.doc.elements.length;
    v.escapeOneLevel();
    assert.equal(v.active, null);
    assert.equal(v.s.doc.elements.length, count, 'Esc discards the active uncommitted stroke');
    // Reversible selection style, apply exactly once, pen preset unchanged.
    v.s.doc.elements = [stroke];
    v.selected = new Set(['stroke']);
    v.mode = 'select';
    const preset = JSON.stringify(v.plugin.settings.brushes.write);
    v.openSelectionStyle();
    const swatch = walk(v.flyout).find((n) => n.dataset.color && n.dataset.color !== stroke.color);
    assert.ok(swatch);
    swatch.click();
    assert.equal(v.s.doc.elements[0].color, stroke.color);
    assert.notEqual(v.stylePreview.elements[0].color, stroke.color);
    v.escapeOneLevel();
    assert.equal(v.s.doc.elements[0].color, stroke.color);
    v.openSelectionStyle();
    walk(v.flyout)
      .find((n) => n.dataset.color && n.dataset.color !== stroke.color)
      .click();
    const rev = v.s.revision;
    walk(v.flyout)
      .find((n) => n.textContent === 'Aplicar à seleção')
      .click();
    assert.equal(v.s.revision, rev + 1);
    assert.equal(JSON.stringify(v.plugin.settings.brushes.write), preset);
    v.undo();
    assert.equal(v.s.doc.elements[0].color, stroke.color);
    v.plugin.settings.lastBrush = 'pencil';
    v.returnToWriting();
    assert.equal(v.mode, 'pencil');
    assert.equal(Brushes.settings({ shortcuts: { select: 'KeyW' } }).returnBrushKey, 'KeyN');
    // Drop feeds a world-space position into the shared validated importer.
    let received;
    v.pasteImages = async (files, options) => {
      received = { files, options };
    };
    v.viewport.dispatchEvent({
      type: 'drop',
      clientX: 348,
      clientY: 248,
      dataTransfer: { files: [{ type: 'image/png', size: 10 }] },
      preventDefault() {},
      stopPropagation() {}
    });
    assert.equal(received.files.length, 1);
    assert.equal(received.options.center.x, 300);
    assert.equal(received.options.center.y, 200);
    console.log(
      'PASS: cross-page clipboard/groups/styles, fit/back, drag threshold, rotated free/center resize, staged Escape, reversible style, brush shortcut and drop position'
    );
  } finally {
    clearTimeout(v.feedbackTimer);
    h.dispose();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
