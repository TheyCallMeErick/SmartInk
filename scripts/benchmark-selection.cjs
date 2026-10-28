'use strict';
// Same workload against any supplied build. Real JS geometry, mocked canvas (no GPU measurement).
const fs = require('node:fs'),
  path = require('node:path'),
  { performance } = require('node:perf_hooks');
let source = fs
  .readFileSync(path.join(__dirname, '../tests/stroke-start.cjs'), 'utf8')
  .split('view.down(pointer(120,0));')[0];
if (process.argv[2])
  source = source.replace(
    "path.join(__dirname,'../main.js')",
    JSON.stringify(path.resolve(process.argv[2]))
  );
const {
  view: v,
  Ink,
  Brushes,
  pointer
} = new Function('require', '__dirname', source + '\nreturn {view,Ink,Brushes,pointer};')(
  require,
  path.join(__dirname, '../tests')
);
let id = 0;
const frames = new Map();
v.win.requestAnimationFrame = (fn) => {
  frames.set(++id, fn);
  return id;
};
v.win.cancelAnimationFrame = (id) => frames.delete(id);
const elements = Array.from({ length: 500 }, (_, i) => ({
  id: 's' + i,
  type: 'stroke',
  layerId: 'ink',
  ...Brushes.strokeStyle(v.plugin.settings, 'write'),
  points: Array.from({ length: 128 }, (_, j) => ({
    x: (i % 25) * 28 + j / 5,
    y: Math.floor(i / 25) * 20 + Math.sin(j / 8) * 5,
    p: 0.5,
    t: j * 4
  }))
}));
v.s.doc.elements = elements;
v.mode = 'select';
v.selected = new Set(elements.map((e) => e.id));
v.plugin.settings.smartGuides = false;
v.render = () => {};
v.drawOverlay = () => {};
v.active = {
  mode: 'move-selection',
  pointer: 7,
  start: { x: 0, y: 0 },
  before: elements,
  revision: v.s.revision,
  selected: new Set(v.selected)
};
let copies = 0;
const transform = Ink.transform;
Ink.transform = (...args) => {
  copies++;
  return transform(...args);
};
const samples = [];
for (let i = 0; i < 30; i++) {
  const start = performance.now();
  for (let j = 0; j < 4; j++) v.move({ ...pointer(60 + i + j, 0), clientY: 70 + i });
  const work = [...frames.values()];
  frames.clear();
  work.forEach((fn) => fn());
  samples.push(performance.now() - start);
}
samples.sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      objects: 500,
      points: 64000,
      frames: 30,
      eventsPerFrame: 4,
      medianMs: +samples[15].toFixed(2),
      p95Ms: +samples[28].toFixed(2),
      geometryCopiesDuringDrag: copies,
      scope: 'drag processing only; rendering and overlay disabled; excludes GPU/physical input'
    },
    null,
    2
  )
);
v.cancelGesture();
clearTimeout(v.feedbackTimer);
