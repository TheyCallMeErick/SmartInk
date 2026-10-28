'use strict';
// Deterministic fake-clock test: no vault writes on each drawing edit; flush on idle/exit/manual.
const fs = require('node:fs'),
  vm = require('node:vm'),
  assert = require('node:assert/strict');
const path = require('node:path');
const code =
  fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8') +
  '\nglobalThis.__test={SmartInkPlugin,Ink,Brushes,InkView};';
let now = 0,
  nextId = 0;
const timers = new Map();
const setTimer = (fn, delay) => {
  const id = ++nextId;
  timers.set(id, { time: now + delay, fn });
  return id;
};
const clearTimer = (id) => timers.delete(id);
const context = {
  require: (n) => {
    assert.equal(n, 'obsidian');
    return {
      Plugin: class {},
      FileView: class {},
      TFile: class {},
      Notice: class {},
      PluginSettingTab: class {},
      Setting: class {},
      MarkdownRenderChild: class {},
      normalizePath: (x) => x
    };
  },
  module: { exports: {} },
  exports: {},
  console,
  URL,
  Blob,
  setTimeout: setTimer,
  clearTimeout: clearTimer
};
vm.runInNewContext(code, context, { filename: 'main.js' });
const { SmartInkPlugin, Ink, InkView } = context.__test;
const micro = () => new Promise((resolve) => setImmediate(resolve));
async function tick(ms) {
  const until = now + ms;
  while (true) {
    const due = [...timers.entries()]
      .filter(([, t]) => t.time <= until)
      .sort((a, b) => a[1].time - b[1].time)[0];
    if (!due) break;
    now = due[1].time;
    timers.delete(due[0]);
    due[1].fn();
    await micro();
  }
  now = until;
  await micro();
}
(async () => {
  const file = { path: 'Estudos.smartink' };
  let disk = Ink.serialize(Ink.fresh()),
    writes = 0;
  const vault = {
    read: async () => disk,
    process: async (_file, callback) => {
      writes++;
      disk = callback(disk);
    }
  };
  const plugin = new SmartInkPlugin();
  plugin.app = { vault };
  plugin.sessions = new Map();
  plugin.backupTail = Promise.resolve();
  plugin.renameTail = Promise.resolve();
  const s = await plugin.session(file);
  const view = Object.assign(Object.create(InkView.prototype), { plugin, s });
  const change = (background) => {
    s.doc.background = background;
    InkView.prototype.changed.call(view);
  };
  change('grid');
  await tick(3200);
  assert.equal(writes, 0, 'Do not save on every change');
  change('lines');
  await tick(4999);
  assert.equal(writes, 0, 'Last edit must reset entire 5s interval');
  await tick(1);
  assert.equal(writes, 1, 'Exactly one save after 5 quiet seconds');
  assert.equal(Ink.parse(disk).background, 'lines', 'Latest state must be saved');
  assert.equal(s.savedRevision, s.revision, 'Saved revision updated only after writing');
  change('plain');
  await tick(2000);
  assert.equal(writes, 1);
  await plugin.saveSession(s);
  assert.equal(writes, 2, 'Explicit save flushes immediately');
  assert.equal(timers.size, 0, 'Explicit save cancels pending timer');
  await tick(5000);
  assert.equal(writes, 2, 'No duplicate save after manual flush');
  change('dots');
  assert.equal(writes, 2);
  await plugin.onunload();
  assert.equal(writes, 3, 'Plugin unload flushes pending document');
  assert.equal(timers.size, 0, 'Unload must clear outstanding timers');
  assert.equal(Ink.parse(disk).background, 'dots');
  // Second instance: a pending write followed by a newer edit must not lose the newer revision.
  const pendingPlugin = new SmartInkPlugin();
  pendingPlugin.app = { vault };
  pendingPlugin.sessions = new Map();
  pendingPlugin.backupTail = Promise.resolve();
  pendingPlugin.renameTail = Promise.resolve();
  let release;
  const stalled = new Promise((resolve) => (release = resolve));
  let slowWrites = 0;
  vault.process = async (_file, callback) => {
    slowWrites++;
    await stalled;
    disk = callback(disk);
  };
  const s2 = await pendingPlugin.session(file),
    v2 = Object.assign(Object.create(InkView.prototype), { plugin: pendingPlugin, s: s2 });
  s2.doc.background = 'grid';
  InkView.prototype.changed.call(v2);
  await tick(5000);
  assert.equal(slowWrites, 1, 'Idle timer launches first write');
  s2.doc.background = 'plain';
  InkView.prototype.changed.call(v2);
  release();
  await micro();
  await tick(5000);
  assert.equal(slowWrites, 2, 'New edit during write is persisted after becoming idle');
  assert.equal(Ink.parse(disk).background, 'plain', 'The latest write wins in serialized queue');
  await pendingPlugin.onunload();
  console.log(
    'PASS: debounce 5000ms, restart on edits, manual flush, unload flush, serialized edits during write'
  );
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
