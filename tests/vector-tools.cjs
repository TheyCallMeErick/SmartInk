'use strict';
const assert = require('node:assert/strict'),
  { setup, walk } = require('./harness.cjs');
const h = setup(),
  { view: v, Ink, VectorOps: V, Visible, Workflow, ShapeKit: K, Brushes, plugin, pointer } = h;
const style = { color: '#123456', width: 2, opacity: 1, layerId: 'ink' },
  line = (id, x1, y1, x2, y2) => ({ ...style, id, type: 'line', x1, y1, x2, y2 }),
  rect = (id, x, y, w, h) =>
    K.make('rectangle', { x, y }, { x: x + w, y: y + h }, {}, { ...style, id });
const click = (root, text) => {
    const b = walk(root).find((n) => n.tagName === 'BUTTON' && n.textContent === text);
    assert.ok(b, text);
    assert.ok(!b.disabled);
    b.click();
  },
  valid = (e) => Ink.parse(Ink.serialize({ ...Ink.fresh(), elements: [e] }));
try {
  // Boolean holes are real, survive parse, movement, selection and SVG; no artificial white patches.
  const outer = rect('outer', 0, 0, 100, 100),
    inner = rect('inner', 25, 25, 50, 50),
    hole = V.boolean([outer, inner], 'difference');
  valid(hole);
  assert.equal(hole.geometry[0].length, 2);
  assert.ok(Visible.contains(hole.geometry, { x: 10, y: 10 }));
  assert.ok(!Visible.contains(hole.geometry, { x: 50, y: 50 }));
  assert.ok(!Ink.hit(hole, { x: 50, y: 50 }, 1, true));
  assert.ok(Ink.hit(hole, { x: 10, y: 10 }, 1, true));
  assert.match(Ink.svg(valid(hole)), /fill-rule="evenodd"/);
  const moved = Ink.transform(hole, { dx: 200, angle: Math.PI / 2 });
  valid(moved);
  assert.ok(!Visible.contains(moved.geometry, { x: 150, y: 50 }));
  for (const op of ['union', 'intersection', 'xor'])
    valid(V.boolean([outer, rect('overlap', 50, 0, 100, 100)], op));
  assert.throws(() => V.boolean([outer, rect('remote', 200, 0, 10, 10)], 'intersection'));
  const corrupt = Ink.clone(hole);
  corrupt.geometry[0][0][0][0] = null;
  assert.throws(() => valid(corrupt));
  // Preview is reversible, stale confirmation fails, and boolean is one undo step.
  v.s.doc.elements = [outer, inner];
  v.selected = new Set(['outer', 'inner']);
  v.mode = 'select';
  v.openVectorTools();
  click(v.flyout, 'Subtrair da forma de trás');
  assert.equal(v.s.doc.elements.length, 2);
  assert.equal(v.stylePreview.elements.length, 1);
  click(v.flyout, 'Cancelar');
  assert.equal(v.s.doc.elements.length, 2);
  v.openVectorTools();
  click(v.flyout, 'Subtrair da forma de trás');
  click(v.flyout, 'Aplicar alterações');
  assert.equal(v.s.doc.elements.length, 1);
  v.undo();
  assert.equal(v.s.doc.elements.length, 2);
  v.redo();
  assert.equal(v.s.doc.elements.length, 1);
  v.previewInkOperation('stale', () => [outer]);
  v.s.revision++;
  click(v.flyout, 'Aplicar alterações');
  assert.equal(v.s.doc.elements[0].type, 'region');
  // Exact de Casteljau insertion preserves a cubic; node handle constraints and splits.
  let path = {
    ...style,
    id: 'curve',
    type: 'path',
    closed: false,
    fill: 'none',
    nodes: [
      { x: 0, y: 0, out: { x: 30, y: 80 }, kind: 'corner' },
      { x: 100, y: 0, in: { x: 70, y: 80 }, kind: 'corner' }
    ]
  };
  valid(path);
  assert.match(Ink.shapePath(path), / C /);
  const inserted = V.insert(path, 0);
  valid(inserted);
  for (const t of [0.1, 0.4, 0.5, 0.7, 0.9]) {
    const a = V.cubic(path.nodes[0], path.nodes[1], t),
      b =
        t <= 0.5
          ? V.cubic(inserted.nodes[0], inserted.nodes[1], t * 2)
          : V.cubic(inserted.nodes[1], inserted.nodes[2], t * 2 - 1);
    assert.ok(Ink.dist(a, b) < 1e-8);
  }
  const smooth = V.nodeKind(inserted, 1, 'symmetric'),
    edited = Ink.editPoint(smooth, 5, { x: 80, y: 80 }),
    n = edited.nodes[1];
  assert.ok(Math.abs(n.in.x + n.out.x - 2 * n.x) < 1e-8);
  assert.equal(V.split(inserted, 1).length, 2);
  assert.equal(V.remove(inserted, 1).nodes.length, 2);
  assert.equal(Ink.pointHandles(inserted).length, 7);
  valid(Ink.transform(edited, { dx: 5, angle: 0.3, scale: 2 }));
  const closedPath = V.toPath(outer),
    opened = V.split(closedPath, 1)[0];
  assert.equal(opened.closed, false);
  assert.equal(opened.nodes.length, 5);
  assert.equal(Ink.dist(opened.nodes[0], opened.nodes.at(-1)), 0);
  assert.match(
    Ink.svg(
      valid({
        ...style,
        id: 'dot',
        type: 'stroke',
        pressure: true,
        smoothing: 0.5,
        points: [{ x: 0, y: 0, p: 0.5, t: 0 }]
      })
    ),
    /fill-rule="nonzero"/
  );
  // Cut keeps pressure/tilt and yields independent fragments, including closed wrap-around interval.
  const stroke = {
      ...style,
      id: 'stroke',
      type: 'stroke',
      pressure: true,
      smoothing: 0.5,
      points: [
        { x: 0, y: 50, p: 0.2, t: 0, tiltX: 10 },
        { x: 100, y: 50, p: 0.8, t: 100, tiltX: 30 }
      ]
    },
    cutters = [line('c1', 25, 0, 25, 100), line('c2', 75, 0, 75, 100)],
    pieces = V.trim(stroke, cutters, { x: 50, y: 50 });
  assert.equal(pieces.length, 2);
  assert.equal(pieces[0].points.at(-1).x, 25);
  assert.ok(Math.abs(pieces[0].points.at(-1).p - 0.35) < 1e-9);
  assert.equal(pieces[1].points[0].tiltX, 25);
  pieces.forEach(valid);
  const semicircle = V.trim(
    { ...style, id: 'circle', type: 'circle', cx: 0, cy: 0, r: 50 },
    [line('axis', 0, -100, 0, 100)],
    { x: 50, y: 0 }
  );
  assert.equal(semicircle.length, 1);
  assert.ok(semicircle[0].nodes.every((p) => p.x < 1e-6));
  valid(semicircle[0]);
  // Planar fill: multi-stroke region, gaps, intersections, nested holes and no outside leak.
  const box = [
      line('a', 0, 0, 100, 0),
      line('b', 100, 0, 100, 100),
      line('c', 100, 100, 0, 100),
      line('d', 0, 100, 0, 0)
    ],
    filled = V.fill(box, { x: 50, y: 50 }, 0, style);
  valid(filled);
  assert.ok(Visible.contains(filled.geometry, { x: 50, y: 50 }));
  assert.throws(() => V.fill(box, { x: 150, y: 50 }, 0, style));
  assert.throws(() => V.fill(box.slice(0, 3), { x: 50, y: 50 }, 3, style));
  const gap = [...box.slice(0, 3), line('d', 0, 100, 0, 2)];
  assert.throws(() => V.fill(gap, { x: 50, y: 50 }, 0, style));
  valid(V.fill(gap, { x: 50, y: 50 }, 3, style));
  const splitFill = V.fill([...box, line('mid', 50, 0, 50, 100)], { x: 25, y: 50 }, 0, style);
  assert.ok(!Visible.contains(splitFill.geometry, { x: 75, y: 50 }));
  const nested = V.fill([outer, inner], { x: 10, y: 10 }, 0, style);
  assert.equal(nested.geometry[0].length, 2);
  assert.ok(!Visible.contains(nested.geometry, { x: 50, y: 50 }));
  // Repeated groups retain only internal connections; tangency follows circle movement.
  const connect = {
    ...line('link', 0, 0, 100, 100),
    connector: true,
    bindings: { start: { targetId: 'outer', index: 0 }, end: { targetId: 'external', index: 0 } }
  };
  const copies = V.repeat([outer, connect], { count: 2, dx: 150, dy: 0, angle: 0 });
  assert.equal(copies.length, 4);
  assert.equal(copies[1].bindings.start.targetId, copies[0].id);
  assert.equal(copies[1].bindings.end, undefined);
  assert.notEqual(copies[3].bindings.start.targetId, copies[0].id);
  const circle = { ...style, id: 'circ', type: 'circle', cx: 50, cy: 50, r: 20 },
    tangent = Workflow.constrain(
      { ...line('t', 0, 0, 100, 0), geometryRule: { kind: 'tangent', targetId: 'circ' } },
      circle,
      'tangent'
    );
  assert.equal(tangent.y1, 30);
  v.s.doc.elements = [circle, tangent];
  const updated = v.applyGeometryRules([{ ...circle, cy: 80 }, tangent]);
  assert.equal(updated[1].y1, 60);
  valid(updated[1]);
  // Pointer UI: hit-testing is delayed until pointer-up, cancel does nothing, fill is preview-only.
  v.s.doc.elements = box;
  v.selected = new Set(box.map((e) => e.id));
  v.mode = 'select';
  v.armVectorTool('region-fill');
  v.down({ ...pointer(98, 0), clientY: 98 });
  assert.equal(v.active.mode, 'vector-point');
  assert.equal(v.s.doc.elements.length, 4);
  v.finish(true);
  assert.equal(v.s.doc.elements.length, 4);
  assert.equal(v.stylePreview.elements.length, 5);
  click(v.flyout, 'Aplicar alterações');
  assert.equal(v.s.doc.elements.length, 5);
  v.undo();
  assert.equal(v.s.doc.elements.length, 4);
  // Continuing is opt-in, retains original style, one undo, cancel and Alt preserve originals.
  const original = {
    ...stroke,
    id: 'original',
    points: [
      { x: 50, y: 52, p: 0.3, t: 0 },
      { x: 100, y: 52, p: 0.7, t: 10 }
    ]
  };
  v.s.doc.elements = [original];
  v.selected.clear();
  v.mode = 'write';
  plugin.settings.continueInk = true;
  v.render();
  const event = { ...pointer(148, 20), buttons: 0 };
  v.move(event);
  assert.equal(v.hoverVector?.label, 'Continuar traço');
  const raw = Ink.serialize(v.s.doc);
  const histories = v.s.history.undoStack.length;
  v.down({ ...event, buttons: 1 });
  assert.ok(v.active.continuation);
  v.move(pointer(180, 30));
  v.finish(true);
  assert.equal(v.s.doc.elements.length, 1);
  assert.equal(v.s.doc.elements[0].id, original.id);
  assert.equal(v.s.doc.elements[0].points[0].p, 0.3);
  assert.equal(v.s.history.undoStack.length, histories + 1);
  v.undo();
  assert.equal(Ink.serialize(v.s.doc), raw);
  v.render();
  v.down(pointer(148, 40));
  assert.ok(v.active.continuation);
  v.move(pointer(180, 50));
  v.cancelGesture();
  assert.equal(v.s.doc.elements[0], original);
  v.down({ ...pointer(148, 60), altKey: true });
  assert.ok(!v.active.continuation);
  v.finish(true);
  assert.equal(v.s.doc.elements.length, 2);
  const prepend = V.continueStroke(
    original,
    {
      ...stroke,
      points: [
        { x: 50, y: 52, p: 0.3, t: 20 },
        { x: 20, y: 52, p: 0.5, t: 30 }
      ]
    },
    0
  );
  assert.equal(prepend.points[0].x, 20);
  assert.equal(prepend.points.at(-1).x, 100);
  assert.equal(prepend.points[1].p, 0.3);
  // Held QuickShape retains size when entering rotation, then applies 15-degree constraints.
  v.active = {
    pointer: 7,
    heldShape: outer,
    heldBase: outer,
    holdCenter: { x: 50, y: 50 },
    holdPoint: { x: 100, y: 50 }
  };
  v.move({ ...pointer(198, 100), clientY: 98 });
  const scaledWidth = Ink.elementBounds(v.active.heldShape).w;
  v.move({ ...pointer(198, 101), clientY: 98, altKey: true });
  assert.equal(Ink.elementBounds(v.active.heldShape).w, scaledWidth);
  v.move({ ...pointer(148, 102), clientY: 184.60254, altKey: true, shiftKey: true });
  assert.ok(v.hint.textContent.includes('60°'));
  v.active = null;
  assert.equal(Brushes.settings({ continueInk: true, hoverSnap: false }).continueInk, true);
  assert.equal(Brushes.settings({ hoverSnap: false }).hoverSnap, false);
  // Nodes panel is contextual and keyboard accessible via named controls.
  v.s.doc.elements = [inserted];
  v.selected = new Set([inserted.id]);
  v.openVectorNodes();
  assert.equal(v.pointEditing, inserted.id);
  assert.equal(v.panelKind, 'vector-nodes');
  click(v.flyout, 'Inserir nó no próximo segmento');
  assert.equal(v.s.doc.elements[0].nodes.length, 3);
  click(v.flyout, 'Aplicar alterações');
  assert.equal(v.s.doc.elements[0].nodes.length, 4);
  v.undo();
  assert.equal(v.s.doc.elements[0].nodes.length, 3);
  console.log(
    'PASS: vector booleans/holes/SVG/parse, reversible previews, exact Bézier insertion and handles, pressure-preserving trim, closed wrap trim, planar fill/gaps/holes, repetition bindings, persistent tangency, pointer fill and opt-in continuation/Alt/cancel/undo'
  );
} finally {
  h.dispose();
}
