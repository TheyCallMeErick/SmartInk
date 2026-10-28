'use strict';
const assert = require('node:assert/strict'),
  { setup, walk } = require('./harness.cjs');
const h = setup(),
  { view: v, Ink, ShapeKit: K, plugin, pointer, Brushes } = h;
const click = (root, text) => {
  const b = walk(root).find((n) => n.tagName === 'BUTTON' && n.textContent === text);
  assert.ok(b, text);
  b.click();
};
const stroke = (id, points) => ({
  id,
  type: 'stroke',
  layerId: 'ink',
  ...Brushes.strokeStyle(plugin.settings, 'write'),
  points: points.map((p, i) => ({
    ...p,
    p: p.p ?? 0.3 + (i / points.length) * 0.4,
    t: i * 8,
    tiltX: 12
  }))
});
try {
  // Every catalog item goes through normal validation/export, including parameter extremes.
  for (const [kind] of Object.entries(K.names))
    for (const opts of [{}, { sides: 32, tips: 16, sweep: 355, turns: 5, rounding: 0.5 }]) {
      const e = K.make(kind, { x: -40, y: -20 }, { x: 200, y: 170 }, opts, { layerId: 'ink' }),
        d = { ...Ink.fresh(), elements: [e] };
      assert.equal(Ink.parse(Ink.serialize(d)).elements[0].shapeKind, kind);
      assert.match(Ink.svg(d), /<path/);
      assert.ok(e.type === 'stroke' || Ink.pointHandles(e).length);
      assert.match(K.icon(e), /<svg/);
    }
  const square = K.make('square', { x: 0, y: 0 }, { x: 90, y: 40 });
  assert.equal(Ink.dist(square.corners[0], square.corners[1]), 40);
  assert.equal(Ink.dist(square.corners[0], square.corners[3]), 40);
  const hex = K.make('regular', { x: 0, y: 0 }, { x: 100, y: 100 }, { sides: 6 });
  const rotated = Ink.transform(hex, { angle: 0.4, dx: 30, dy: 50 });
  const rebuilt = K.rebuild(rotated, { sides: 8 });
  assert.equal(rebuilt.corners.length, 8);
  assert.ok(
    Math.abs(
      Math.atan2(
        rebuilt.shapeFrame[1].y - rebuilt.shapeFrame[0].y,
        rebuilt.shapeFrame[1].x - rebuilt.shapeFrame[0].x
      ) - 0.4
    ) < 1e-8
  );
  assert.equal(Ink.editPoint(rotated, 0, { x: 1, y: 2 }).shapeFrame, undefined);
  // Real pointer lifecycle: one undo step; Escape/cancel/stale document cannot commit.
  v.mode = 'primitive';
  v.directShapeKind = 'hexagon';
  v.down(pointer(100, 0));
  v.move({ ...pointer(220, 10), clientY: 200 });
  v.up({ ...pointer(220, 11), clientY: 200 });
  assert.equal(v.s.doc.elements.length, 1);
  assert.equal(v.s.doc.elements[0].corners.length, 6);
  v.undo();
  assert.equal(v.s.doc.elements.length, 0);
  v.redo();
  assert.equal(v.s.doc.elements.length, 1);
  v.mode = 'primitive';
  v.down(pointer(100, 20));
  v.move(pointer(180, 21));
  v.cancelGesture();
  assert.equal(v.s.doc.elements.length, 1);
  v.mode = 'primitive';
  v.down(pointer(100, 30));
  v.move(pointer(180, 31));
  v.s.revision++;
  v.finish(true);
  assert.equal(v.s.doc.elements.length, 1);
  // Improved open-circle and multi-stroke rectangle recognition.
  const circlePoints = Array.from({ length: 90 }, (_, i) => ({
      x: 200 + 60 * Math.cos((i / 89) * Math.PI * 1.82),
      y: 200 + 60 * Math.sin((i / 89) * Math.PI * 1.82)
    })),
    circle = stroke('circle-ink', circlePoints);
  assert.ok(
    Ink.recognizeGroups([circle]).some((c) => c.shape.type === 'circle'),
    'Small open contour recognized'
  );
  const edges = [
    [
      [0, 0],
      [100, 0]
    ],
    [
      [100, 0],
      [100, 80]
    ],
    [
      [100, 80],
      [0, 80]
    ],
    [
      [0, 80],
      [0, 0]
    ]
  ].map((pair, i) =>
    stroke(
      'edge' + i,
      Array.from({ length: 12 }, (_, j) => ({
        x: pair[0][0] + ((pair[1][0] - pair[0][0]) * j) / 11,
        y: pair[0][1] + ((pair[1][1] - pair[0][1]) * j) / 11
      }))
    )
  );
  assert.ok(Ink.recognizeGroups(edges).some((c) => c.shape.type === 'rectangle'));
  v.s.doc.elements = [circle];
  v.mode = 'write';
  v.recognizeIds([circle.id]);
  assert.ok(v.shapePopover);
  assert.equal(v.suggestion.hidden, true);
  assert.equal(v.s.doc.elements[0], circle);
  assert.ok(
    walk(v.shapePopover).some(
      (n) => n.className === 'si-shape-icon' && n.innerHTML.includes('<svg')
    )
  );
  click(v.shapePopover, 'Aplicar forma');
  assert.notEqual(v.s.doc.elements[0].type, 'stroke');
  assert.equal(v.shapePopover, null);
  v.undo();
  assert.equal(v.s.doc.elements[0], circle);
  v.recognizeIds([circle.id]);
  click(v.shapePopover, 'Manter desenho');
  assert.equal(v.s.doc.elements[0], circle);
  assert.equal(v.pending, null);
  // Joined endpoint orientation, continuous geometry, pressure, original immutability.
  const a = stroke('a', [
      { x: 0, y: 0 },
      { x: 10, y: 1 },
      { x: 20, y: 0 }
    ]),
    b = stroke('b', [
      { x: 40, y: 0 },
      { x: 30, y: -1 },
      { x: 22, y: 0 }
    ]),
    joined = K.join([a, b], true, 5);
  assert.equal(joined.points[0].x, 0);
  assert.equal(joined.points.at(-1).x, 40);
  assert.equal(joined.points[0].p, a.points[0].p);
  assert.equal(joined.points.at(-1).p, b.points[0].p);
  assert.equal(a.points.length, 3);
  assert.ok(joined.points.every((p, i) => !i || p.t > joined.points[i - 1].t));
  assert.throws(() => K.join([a, b], true, 1));
  v.s.doc.elements = [a, b];
  v.selected = new Set(['a', 'b']);
  v.previewInkOperation('Unir', () => [joined]);
  assert.equal(v.s.doc.elements.length, 2);
  v.closePanel();
  assert.equal(v.s.doc.elements.length, 2);
  v.previewInkOperation('Unir', () => [joined]);
  click(v.flyout, 'Aplicar alterações');
  assert.equal(v.s.doc.elements.length, 1);
  v.undo();
  assert.equal(v.s.doc.elements.length, 2);
  const long = stroke(
      'long',
      Array.from({ length: 101 }, (_, x) => ({ x, y: 0 }))
    ),
    deformed = K.deform(long, 50, { x: 50, y: 10 }, 20);
  assert.equal(deformed.points[50].y, 10);
  assert.equal(deformed.points[0].y, 0);
  assert.equal(deformed.points[50].p, long.points[50].p);
  assert.equal(deformed.points[50].tiltX, 12);
  v.s.doc.elements = [long];
  v.selected = new Set(['long']);
  v.curveTarget = 'long';
  v.mode = 'sculpt';
  v.down({ ...pointer(98, 50), clientY: 48 });
  v.move({ ...pointer(98, 60), clientY: 60 });
  v.up({ ...pointer(98, 61), clientY: 60 });
  assert.notEqual(v.s.doc.elements[0].points[50].y, 0);
  v.undo();
  assert.equal(v.s.doc.elements[0], long);
  const tidy = K.tidy([a, b], { baseline: true, slant: 5, strength: 0.5 });
  assert.equal(tidy.get('a').points[0].p, a.points[0].p);
  assert.equal(a.points[0].y, 0);
  const box1 = stroke(
      'box1',
      edges.flatMap((e) => e.points)
    ),
    box2 = Ink.transform({ ...box1, id: 'box2' }, { dx: 200 }),
    link = stroke(
      'link',
      Array.from({ length: 20 }, (_, i) => ({ x: 100 + (i / 19) * 100, y: 40 }))
    );
  v.s.doc.elements = [box1, box2, link];
  const diagram = v.diagramElements([box1, box2, link]),
    connection = diagram.find((e) => e.id === 'link');
  assert.ok(connection.bindings.start);
  assert.ok(connection.bindings.end);
  const moved = Ink.resolveConnections(
    diagram.map((e) => (e.id === 'box2' ? Ink.transform(e, { dx: 50 }) : e))
  );
  assert.equal(moved.find((e) => e.id === 'link').x2, 250);
  // Brush gesture does not draw, commits preferences once, cancel restores width.
  v.mode = 'write';
  v.heldKeys.add('KeyD');
  const width = plugin.settings.brushes.write.width,
    count = v.s.doc.elements.length;
  v.down(pointer(100, 70));
  v.move({ ...pointer(200, 80), clientY: 80 });
  v.finish(true);
  assert.ok(plugin.settings.brushes.write.width > width);
  assert.equal(v.s.doc.elements.length, count);
  const next = plugin.settings.brushes.write.width;
  v.down(pointer(100, 90));
  v.move(pointer(200, 100));
  v.cancelGesture();
  assert.equal(plugin.settings.brushes.write.width, next);
  v.heldKeys.clear();
  v.openShapeLibrary();
  assert.equal(v.panelKind, 'shape-library');
  assert.equal(
    walk(v.flyout).filter((n) => n.dataset?.shapeKind).length,
    Object.keys(K.names).length
  );
  walk(v.flyout)
    .find((n) => n.dataset?.shapeKind === 'rectangle')
    .click();
  assert.equal(v.mode, 'primitive');
  console.log(
    'PASS: all shape families/parameters/export, direct drawing/cancel/undo, open and multi-stroke recognition, nearby visual popover, continuous joins, local curve editing, pressure-preserving tidy and brush gesture'
  );
} finally {
  h.dispose();
}
