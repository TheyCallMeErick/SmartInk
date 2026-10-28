'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  { performance } = require('node:perf_hooks');
const root = path.resolve(__dirname, '..'),
  source = fs
    .readFileSync(path.join(root, 'tests/stroke-start.cjs'), 'utf8')
    .split('view.down(pointer(120,0));')[0]
    .replace(
      "path.join(__dirname,'../main.js')",
      JSON.stringify(process.argv[2] || path.join(root, 'main.js'))
    );
const { view, Ink, pointer, backups } = new Function(
  'require',
  '__dirname',
  source + '\nreturn {view,Ink,pointer,backups};'
)(require, path.join(root, 'tests'));
view.render = () => {};
view.requestRender = () => {};
view.drawOverlay = () => {};
view.updateSuggestion = () => {};
view.s.doc.elements = Array.from({ length: 20000 }, (_, i) => ({
  id: 'l' + i,
  type: 'line',
  layerId: 'ink',
  x1: i * 3,
  y1: 300,
  x2: i * 3 + 10,
  y2: 310,
  color: '#202020',
  opacity: 1,
  width: 2
}));
const stats = (arr) => {
  arr.sort((a, b) => a - b);
  return {
    medianMs: +arr[Math.floor(arr.length * 0.5)].toFixed(4),
    p95Ms: +arr[Math.floor(arr.length * 0.95)].toFixed(4)
  };
};
const down = [],
  move = [],
  finish = [];
let clones = 0;
const clone = Ink.clone;
Ink.clone = (...args) => {
  clones++;
  return clone(...args);
};
for (let i = 0; i < 80; i++) {
  let t = performance.now();
  view.down(pointer(120, i * 100));
  down.push(performance.now() - t);
  t = performance.now();
  view.move(pointer(123, i * 100 + 4));
  move.push(performance.now() - t);
  t = performance.now();
  view.finish(false);
  finish.push(performance.now() - t);
  view.s.doc.elements = view.s.doc.elements.slice(0, 20000);
}
view.down(pointer(120, 9000));
const prolonged = [];
for (let i = 0; i < 800; i++) {
  const t = performance.now();
  view.move(pointer(123 + i * 0.3, 9004 + i * 4));
  prolonged.push(performance.now() - t);
}
view.finish(false);
const spatial = [];
for (let i = 0; i < 100; i++) {
  const t = performance.now();
  view.spatial.sync(view.s.doc.elements);
  view.spatial.query({ x: 100, y: 290, w: 500, h: 40 });
  spatial.push(performance.now() - t);
}
console.log(
  JSON.stringify(
    {
      kind: 'synthetic headless; no canvas/GPU or physical pen latency',
      objects: 20000,
      runs: 80,
      pointerDown: stats(down),
      firstMove: stats(move),
      finish: stats(finish),
      prolongedMoves: stats(prolonged),
      spatialQuery: stats(spatial),
      clonesDuringHandlers: clones,
      backupsDuringHandlers: backups.length
    },
    null,
    2
  )
);
