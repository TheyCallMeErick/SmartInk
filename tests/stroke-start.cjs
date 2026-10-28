'use strict';
// Regression for a first-move stutter: an emergency recovery backup must never
// serialize the entire document on the first pointermove of every stroke.
const fs = require('node:fs'),
  vm = require('node:vm'),
  assert = require('node:assert/strict'),
  path = require('node:path');
let now = 1_000_000,
  nextIdle = 0;
const idle = new Map(),
  backups = [];
class FakeDate extends Date {
  static now() {
    return now;
  }
}
class Classes {
  constructor() {
    this.values = new Set();
  }
  add(...v) {
    v.forEach((x) => this.values.add(x));
  }
  remove(...v) {
    v.forEach((x) => this.values.delete(x));
  }
  toggle(x, on) {
    if (on ?? !this.values.has(x)) this.add(x);
    else this.remove(x);
  }
  contains(x) {
    return this.values.has(x);
  }
}
const ctx = new Proxy({}, { get: (o, key) => o[key] || (() => {}) });
class Node {
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = doc || this;
    this.children = [];
    this.dataset = {};
    this.attrs = {};
    this.style = {
      setProperty(k, v) {
        this[k] = v;
      }
    };
    this.classList = new Classes();
    this.handlers = {};
    this.clientWidth = 900;
    this.clientHeight = 600;
    this.textContent = '';
    this.value = '';
    this.hidden = false;
    this.isConnected = true;
    this.captured = new Set();
  }
  appendChild(n) {
    if (n.parentNode) {
      const i = n.parentNode.children.indexOf(n);
      if (i >= 0) n.parentNode.children.splice(i, 1);
    }
    this.children.push(n);
    n.parentNode = this;
    return n;
  }
  replaceChildren(...ns) {
    this.children = [];
    ns.forEach((n) => this.appendChild(n));
  }
  addEventListener(k, fn) {
    (this.handlers[k] ||= []).push(fn);
  }
  removeEventListener() {}
  setAttribute(k, v) {
    this.attrs[k] = v;
  }
  getAttribute(k) {
    return this.attrs[k] || null;
  }
  focus() {}
  click() {}
  remove() {
    if (this.parentNode) {
      const i = this.parentNode.children.indexOf(this);
      if (i >= 0) this.parentNode.children.splice(i, 1);
      this.parentNode = null;
    }
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, right: 900, bottom: 600, width: 900, height: 600 };
  }
  contains(x) {
    for (; x; x = x.parentNode) if (x === this) return true;
    return false;
  }
  getContext() {
    return ctx;
  }
  setPointerCapture(id) {
    this.captured.add(id);
  }
  hasPointerCapture(id) {
    return this.captured.has(id);
  }
  releasePointerCapture(id) {
    this.captured.delete(id);
  }
}
const document = new Node('document');
document.defaultView = new Node('window', document);
const win = document.defaultView;
win.devicePixelRatio = 1;
win.requestAnimationFrame = () => 1;
win.cancelAnimationFrame = () => {};
win.requestIdleCallback = (fn, options) => {
  assert.equal(options.timeout, 2000);
  const id = ++nextIdle;
  idle.set(id, fn);
  return id;
};
win.cancelIdleCallback = (id) => idle.delete(id);
win.Path2D = class {
  constructor(d) {
    this.d = d;
  }
};
win.setTimeout = setTimeout;
win.clearTimeout = clearTimeout;
document.createElement = (t) => new Node(t, document);
document.createElementNS = (_, t) => new Node(t, document);
const obsidian = {
  Plugin: class {},
  FileView: class {
    constructor() {
      this.contentEl = document.createElement('div');
      this.containerEl = document.createElement('div');
    }
  },
  TFile: class {},
  Notice: class {},
  PluginSettingTab: class {},
  Setting: class {},
  MarkdownRenderChild: class {},
  normalizePath: (x) => x
};
const code =
  fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8') +
  '\nglobalThis.__test={Ink,InkView,Brushes};';
const sandbox = {
  require: (n) => {
    assert.equal(n, 'obsidian');
    return obsidian;
  },
  module: { exports: {} },
  exports: {},
  console,
  Date: FakeDate,
  URL,
  Blob,
  setTimeout,
  clearTimeout
};
vm.runInNewContext(code, sandbox, { filename: 'main.js' });
const { Ink, InkView, Brushes } = sandbox.__test;
const plugin = {
  settings: Brushes.settings({}),
  savePreferences: async () => {},
  scheduleSessionSave: () => {},
  backup: async (_session, doc, force) => {
    assert.equal(force, true);
    backups.push(doc);
  },
  app: {}
};
const view = new InkView(null, plugin);
view.build();
view.s = {
  doc: Ink.fresh(),
  revision: 0,
  savedRevision: 0,
  history: new Ink.History(),
  notify: () => {},
  file: { path: 'notes.smartink' }
};
const pointer = (x, t) => ({
  button: 0,
  pointerId: 7,
  pointerType: 'pen',
  pressure: 0.7,
  clientX: x,
  clientY: 100,
  timeStamp: t,
  preventDefault() {},
  altKey: false,
  shiftKey: false
});
view.down(pointer(120, 0));
assert.ok(view.active, 'Can start a stroke');
view.move(pointer(123, 4));
assert.equal(backups.length, 0, 'No backup on first move');
assert.equal(idle.size, 0, 'Do not even queue emergency backup for a short stroke');
now += 4500;
view.move(pointer(130, 10));
assert.equal(idle.size, 0, 'Only >5s continuous strokes are backed up');
now += 500;
view.move(pointer(140, 13));
assert.equal(backups.length, 0, 'Emergency backup must not block pointermove');
assert.equal(idle.size, 1, 'Long stroke schedules an idle backup');
const [id, fn] = idle.entries().next().value;
idle.delete(id);
fn();
assert.equal(backups.length, 1, 'Idle backup produces one snapshot');
assert.equal(backups[0].elements.length, 1, 'Recovery snapshot includes in-progress stroke');
now += 5100;
view.move(pointer(150, 18));
assert.equal(idle.size, 1, 'Another backup can be scheduled after 5s');
view.finish(false);
assert.equal(idle.size, 0, 'Ending stroke cancels pending idle snapshot');
view.down(pointer(160, 25));
view.move(pointer(162, 27));
assert.equal(backups.length, 1, 'Next stroke must also start without backup');
assert.equal(idle.size, 0, 'Previous stroke idle callback must not leak into next stroke');
view.finish(false);
console.log(
  'PASS: first stroke start has no emergency backup, >5s stroke idles, cancelled upon finish'
);
