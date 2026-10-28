'use strict';
const assert = require('node:assert/strict'),
  { setup, walk } = require('./harness.cjs');
const h = setup(),
  { view: v, Ink, Brushes, SmartInkPlugin, plugin, pointer } = h,
  s = plugin.settings;
const line = (id, x1, y1, x2, y2) => ({
  id,
  type: 'line',
  layerId: 'ink',
  x1,
  y1,
  x2,
  y2,
  width: 2,
  color: '#202020',
  opacity: 1
});
const field = (label) => {
  const row = walk(v.flyout).find(
    (n) => n.tagName === 'LABEL' && n.children.some((c) => c.textContent === label)
  );
  assert.ok(row, label);
  return row.children.find((n) => n.tagName === 'INPUT');
};
(async () => {
  try {
    // Public controls -> history -> serialized document -> export; old versions migrate.
    v.openPagePanel();
    const spacing = field('Espaço entre linhas / grade');
    spacing.value = '42';
    spacing.dispatchEvent({ type: 'change' });
    assert.equal(v.s.doc.paperSpacing, 42);
    v.undo();
    assert.equal(v.s.doc.paperSpacing, undefined);
    v.redo();
    assert.equal(v.s.doc.paperSpacing, 42);
    v.s.doc.background = 'lines';
    assert.match(Ink.svg(v.s.doc, '', { paper: true }), /height="42" patternUnits/);
    assert.equal(Ink.parse(Ink.serialize(v.s.doc)).paperSpacing, 42);
    for (let version = 1; version <= 8; version++) {
      const d = Ink.fresh();
      d.schemaVersion = version;
      const parsed = Ink.parse(JSON.stringify(d));
      assert.equal(parsed.schemaVersion, 9);
      assert.equal(parsed.paperSpacing, undefined);
    }
    for (const n of [0, 7, 201, Infinity])
      assert.throws(() => Ink.parse(JSON.stringify({ ...Ink.fresh(), paperSpacing: n })));
    v.closePanel();
    v.openPagePanel();
    const backups = field('Criar backups automáticos');
    backups.checked = false;
    backups.dispatchEvent({ type: 'change' });
    assert.equal(Brushes.settings(s).backupsEnabled, false);
    let clones = 0;
    const clone = Ink.clone;
    Ink.clone = (...args) => {
      clones++;
      return clone(...args);
    };
    const actual = new SmartInkPlugin();
    actual.settings = s;
    actual.app = { vault: {} };
    await actual.backup(v.s, v.s.doc, true);
    assert.equal(clones, 0);
    Ink.clone = clone;
    v.closePanel();
    v.down(pointer(120, 0));
    h.advance(6000);
    v.move(pointer(130, 10));
    assert.equal(h.idle.size, 0);
    assert.equal(h.backups.length, 0);
    v.finish(false);
    v.setBackupsEnabled(true);
    // Hold conversion preserves original until explicit approval.
    v.down({ ...pointer(200, 30), tiltX: 21, tiltY: -9 });
    assert.equal(v.active.stroke.points[0].tiltX, 21);
    v.move(pointer(230, 40));
    const raw = v.active.stroke;
    v.active.heldShape = v.correctedShape(
      { type: 'line', x1: 200, y1: 100, x2: 230, y2: 100 },
      raw
    );
    v.finish(true);
    assert.equal(v.s.doc.elements.at(-1).type, 'stroke');
    assert.equal(v.pending.sourceId, raw.id);
    assert.equal(v.pending.shape.type, 'line');
    v.clearGroup();
    v.heldKeys.add('Shift');
    assert.equal(
      v.correctedShape({ type: 'ellipse', cx: 0, cy: 0, rx: 20, ry: 10 }, raw).type,
      'circle'
    );
    v.heldKeys.clear();
    const vertices = Array.from({ length: 6 }, (_, i) => ({
        x: 150 + 100 * Math.cos((i * Math.PI) / 3),
        y: 150 + 100 * Math.sin((i * Math.PI) / 3)
      })),
      points = [];
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 20; j++) {
        const a = vertices[i],
          b = vertices[(i + 1) % 6];
        points.push({
          x: a.x + ((b.x - a.x) * j) / 20,
          y: a.y + ((b.y - a.y) * j) / 20,
          p: 0.5,
          t: points.length
        });
      }
    points.push({ ...vertices[0], p: 0.5, t: points.length });
    const polygon = Ink.recognizeGroups([{ ...raw, points }])[0];
    assert.equal(polygon.shape.type, 'polygon');
    assert.equal(polygon.shape.corners.length, 6);
    const polyDoc = { ...Ink.fresh(), elements: [v.correctedShape(polygon.shape, raw)] };
    assert.equal(Ink.parse(Ink.serialize(polyDoc)).elements[0].corners.length, 6);
    assert.match(Ink.svg(polyDoc), /<path/);
    // Grid, centers and segment intersections remain opt-in for handwriting.
    v.s.doc.elements = [line('a', 0, 100, 200, 100), line('b', 80, 0, 80, 200)];
    v.s.doc.background = 'grid';
    v.s.doc.paperSpacing = 40;
    s.snapOrigin = false;
    s.snapObjects = true;
    s.snapPoints = true;
    s.snapTypes = { endpoints: false, corners: false, midpoints: false };
    s.snapIntersections = true;
    v.mode = 'connector';
    v.snapLock = null;
    let result = v.snapPoint({ x: 83, y: 102 }, {});
    assert.equal(result.point.x, 80);
    assert.equal(result.point.y, 100);
    v.mode = 'write';
    result = v.snapPoint({ x: 83, y: 102 }, {});
    assert.equal(result.point.x, 83);
    v.mode = 'connector';
    s.snapObjects = false;
    s.snapGrid = true;
    result = v.snapPoint({ x: 42, y: 38 }, {});
    assert.equal(result.point.x, 40);
    assert.equal(result.point.y, 40);
    result = v.snapPoint({ x: 42, y: 38 }, { altKey: true });
    assert.equal(result.point.x, 42);
    // Selection operations, polygon selection and layer copies/undo retain originals.
    s.selectionOperation = 'subtract';
    v.applySelectionOperation(new Set(['a']), new Set(['a', 'b']));
    assert.deepEqual([...v.selected], ['b']);
    s.selectionOperation = 'add';
    v.applySelectionOperation(new Set(['a']), new Set(['b']));
    assert.equal(v.selected.size, 2);
    s.selectionOperation = 'replace';
    v.startPolygonSelection();
    v.polySelection.points = [
      { x: -20, y: 90 },
      { x: 220, y: 90 },
      { x: 220, y: 110 },
      { x: -20, y: 110 }
    ];
    v.finishPolygonSelection();
    assert.ok(v.selected.has('a'));
    v.duplicateLayer('ink');
    const duplicate = v.s.doc.activeLayer;
    assert.notEqual(duplicate, 'ink');
    assert.equal(v.s.doc.elements.length, 4);
    assert.equal(v.s.doc.elements.filter((e) => e.layerId === duplicate).length, 2);
    v.undo();
    assert.equal(v.s.doc.elements.length, 2);
    assert.equal(v.s.doc.layers.length, 2);
    v.redo();
    assert.equal(v.s.doc.elements.length, 4);
    v.reorderLayer(duplicate, 'ink');
    assert.equal(v.s.doc.layers[1].id, duplicate);
    v.undo();
    assert.equal(v.s.doc.layers[2].id, duplicate);
    // Presets validate before mutating and normalize incompatible fields.
    v.importPresets({
      version: 1,
      presets: [{ name: 'Teste', kind: 'write', brush: { width: 3, unknown: 'discard' } }]
    });
    assert.equal(s.customPresets.length, 1);
    assert.equal(s.customPresets[0].brush.width, 3);
    assert.equal(s.customPresets[0].brush.unknown, undefined);
    assert.throws(() =>
      v.importPresets({ version: 1, presets: [{ name: 'bad', kind: 'not-a-tool', brush: {} }] })
    );
    assert.equal(s.customPresets.length, 1);
    v.openPresetLibrary();
    walk(v.flyout)
      .find((n) => n.tagName === 'BUTTON' && n.textContent === 'Duplicar')
      .click();
    assert.equal(s.customPresets.length, 2);
    walk(v.flyout)
      .find((n) => n.tagName === 'BUTTON' && n.textContent === 'Excluir')
      .click();
    assert.equal(s.customPresets.length, 1);
    assert.ok(
      v.fineSliderValue(5, 50, 160, 0, 10, 200, 0.1) < v.fineSliderValue(5, 50, 0, 0, 10, 200, 0.1)
    );
    v.closePanel();
    v.openRadial({ x: 450, y: 300 });
    v.radialArmed = true;
    let chosen = 0;
    v.radialItems[0].click = () => chosen++;
    v.radialDirection({ clientX: v.radialCenter.x, clientY: v.radialCenter.y - 100 });
    h.advance(200);
    v.finishRadialDirection();
    assert.equal(chosen, 1);
    v.radialArmed = true;
    v.radialDirection({ clientX: v.radialCenter.x, clientY: v.radialCenter.y });
    v.finishRadialDirection();
    assert.equal(chosen, 1);
    v.closeRadial();
    v.toggleNavigator();
    assert.equal(v.navigatorBox.hidden, false);
    v.toggleNavigator();
    assert.equal(v.navigatorBox.hidden, true);
    console.log(
      'PASS: spacing UI/export/migration/undo, backups disabled, raw QuickShape, tilt, snaps, polygon selection, layer duplication/order/history, presets, fine sliders, radial, navigator'
    );
  } finally {
    h.dispose();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
