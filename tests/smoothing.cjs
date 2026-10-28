const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm'),
  path = require('node:path');
const s = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
const part = s.slice(s.indexOf('function stabilize('), s.indexOf('function protectCorners('));
const run = vm.runInNewContext(
  'const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));' + part + 'stabilize;'
);
const pts = Array.from({ length: 140 }, (_, i) => ({
  x: i * 0.7,
  y: i === 0 || i === 139 ? 0 : i % 2 ? 0.36 : -0.36,
  p: 0.6,
  t: i * 2
}));
const sm = run(pts, 0.85);
const rms = (x) => Math.sqrt(x.slice(3, -3).reduce((a, p) => a + p.y * p.y, 0) / (x.length - 6));
const before = rms(pts),
  after = rms(sm);
assert.ok(after < before * 0.65, `Jitter reduction was insufficient: ${after}/${before}`);
assert.deepEqual(JSON.parse(JSON.stringify(sm[0])), pts[0]);
assert.deepEqual(JSON.parse(JSON.stringify(sm.at(-1))), pts.at(-1));
assert.ok(sm.every((p, i) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.p === pts[i].p));
const corner = [];
for (let i = 0; i <= 30; i++) corner.push({ x: i * 0.7, y: 0, p: 0.5, t: i });
for (let i = 1; i <= 30; i++) corner.push({ x: 21, y: i * 0.7, p: 0.5, t: 30 + i });
const smoothCorner = run(corner, 0.95);
const pivot = 30;
assert.ok(
  Math.hypot(smoothCorner[pivot].x - corner[pivot].x, smoothCorner[pivot].y - corner[pivot].y) <
    0.2,
  'Right-angle corner should remain sharp'
);
const noSmooth = run(pts, 0);
assert.deepEqual(JSON.parse(JSON.stringify(noSmooth)), pts);
const short = run(
  [
    { x: 2, y: 3, p: 0.3 },
    { x: 3, y: 4, p: 0.7 }
  ],
  1
);
assert.equal(short.length, 2);
console.log(
  'PASS: deterministic smoothing, jitter attenuation, corner protection, pressure and endpoints preserved'
);
