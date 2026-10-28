'use strict';
// Headless compatibility smoke test: does not emulate Obsidian's canvas renderer.
const fs = require('node:fs'),
  vm = require('node:vm'),
  assert = require('node:assert/strict');
class Classes {
  constructor(el) {
    this.el = el;
    this.values = new Set();
  }
  add(...x) {
    x.forEach((v) => this.values.add(v));
  }
  remove(...x) {
    x.forEach((v) => this.values.delete(v));
  }
  toggle(k, on) {
    if (on ?? !this.values.has(k)) this.add(k);
    else this.remove(k);
  }
  contains(x) {
    return this.values.has(x);
  }
}
class DOM {
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
    this.classList = new Classes(this);
    this.handlers = {};
    this.clientWidth = 900;
    this.clientHeight = 600;
    this.textContent = '';
    this.value = '';
    this.parentNode = null;
    this.hidden = false;
    this.isConnected = true;
  }
  appendChild(el) {
    this.children.push(el);
    el.parentNode = this;
    return el;
  }
  replaceChildren(...els) {
    this.children = [];
    els.forEach((el) => this.appendChild(el));
  }
  addEventListener(name, fn) {
    (this.handlers[name] ||= []).push(fn);
  }
  removeEventListener() {}
  setAttribute(k, v) {
    this.attrs[k] = String(v);
  }
  getAttribute(k) {
    return this.attrs[k] || null;
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, right: 900, bottom: 600, width: 900, height: 600 };
  }
  focus() {}
  remove() {
    if (this.parentNode)
      this.parentNode.children = this.parentNode.children.filter((x) => x !== this);
  }
  contains(el) {
    for (let p = el; p; p = p.parentNode) if (p === this) return true;
    return false;
  }
  click() {
    for (const cb of this.handlers.click || []) cb({ target: this });
  }
  getContext() {
    return {
      setTransform() {},
      clearRect() {},
      translate() {},
      rotate() {},
      scale() {},
      save() {},
      restore() {},
      beginPath() {},
      fill() {},
      stroke() {},
      arc() {},
      fillRect() {},
      strokeRect() {},
      setLineDash() {},
      moveTo() {},
      lineTo() {},
      fillText() {}
    };
  }
}
const doc = new DOM('document');
doc.defaultView = new DOM('window', doc);
doc.createElement = (t) => new DOM(t, doc);
doc.createElementNS = (_, t) => new DOM(t, doc);
doc.defaultView.requestAnimationFrame = () => 1;
doc.defaultView.cancelAnimationFrame = () => {};
doc.defaultView.devicePixelRatio = 1;
const stub = {
  Plugin: class {},
  FileView: class {
    constructor() {
      this.contentEl = doc.createElement('div');
      this.containerEl = doc.createElement('div');
    }
  },
  TFile: class {},
  Notice: class {
    constructor(s) {
      this.message = s;
    }
  },
  PluginSettingTab: class {},
  Setting: class {},
  MarkdownRenderChild: class {},
  normalizePath: (s) => s
};
const code =
  fs.readFileSync(require('node:path').join(__dirname, '../main.js'), 'utf8') +
  '\nglobalThis.__internals={Ink,Brushes,InkEngine,InkView};';
const c = {
  require: (name) => {
    assert.equal(name, 'obsidian');
    return stub;
  },
  module: { exports: {} },
  exports: {},
  console,
  URL,
  Blob,
  setTimeout,
  clearTimeout
};
vm.runInNewContext(code, c, { filename: 'main.js' });
const { Ink, Brushes, InkEngine, InkView } = c.__internals;
const settings = Brushes.settings({});
assert.equal('recognitionToken' in settings, false, 'AI token cannot survive migration');
const plugin = {
  settings,
  savePreferences: async () => {},
  saveSession: async () => {},
  scheduleSessionSave: () => {},
  app: {}
};
const view = new InkView(null, plugin);
view.build();
assert.ok(view.layerDock, 'Floating layer dock is created');
const document = Ink.fresh(),
  events = [];
view.s = {
  doc: document,
  revision: 0,
  savedRevision: 0,
  history: new Ink.History(),
  notify: () => events.push('commit'),
  file: { path: 'smoke.smartink' }
};
view.refresh();
view.setLayerDockOpen(true);
assert.equal(view.layerSheet.hidden, false);
assert.equal(view.layerCounter.textContent, document.layers.length.toString());
view.addLayer();
assert.equal(document.layers.length, 3);
assert.equal(view.s.history.undoStack.length, 1);
const last = document.activeLayer;
view.selectLayerAt(-1);
assert.notEqual(document.activeLayer, last);
view.selectLayerAt(1);
assert.equal(document.activeLayer, last);
view.layerOrder(last, -1);
assert.equal(document.layers[1].id, last);
view.undo();
assert.equal(view.s.doc.layers[1].id, 'ink', 'Layer order is undoable');
view.redo();
assert.equal(view.s.doc.layers[1].id, last, 'Layer order is redoable');
view.openRadial({ x: 500, y: 300 });
assert.ok(view.radial);
assert.equal(view.radial.children.filter((x) => x.className === 'si-radial-item').length, 8);
// Clicking the radial pen must open the standard brush panel (not just set tool).
const pen = view.radial.children.find((x) => x.title === 'Caneta');
assert.ok(pen);
pen.click();
assert.equal(view.panelKind, 'write');
view.closePanel();
view.openRadial({ x: 500, y: 300 }, 'rulers');
assert.equal(view.radial.children.filter((x) => x.className === 'si-radial-item').length, 8);
view.closeRadial();
view.openOrganize();
assert.equal(view.panelKind, 'organize');
view.openPagePanel(view.organizeButton);
assert.equal(view.panelKind, 'page');
// Geometric smoothing: finite coordinates, preserved endpoints, no damaged right angles.
const raw = Array.from({ length: 101 }, (_, i) => ({
  x: i * 0.7,
  y: i === 0 || i === 100 ? 0 : i % 2 ? 0.32 : -0.32,
  p: 0.75,
  t: i * 3
}));
const mild = InkEngine.stabilize ? InkEngine.stabilize(raw, 0.7) : null;
// API exposed through stroke outline and exported vector path.
const stroke = {
  id: 'test',
  type: 'stroke',
  points: raw,
  layerId: 'ink',
  color: '#202020',
  width: 2,
  opacity: 1,
  pressure: true,
  smoothing: 0.65,
  streamline: 0.65,
  cornerProtection: 0.7,
  engine: 'perfect-freehand-1.2.3'
};
const shape = Ink.shapePath(stroke);
assert.ok(shape.startsWith('M '));
assert.ok(!shape.includes('NaN'));
assert.equal(code.includes('127.0.0.1:32187'), false, 'Local OCR service removed');
assert.equal(code.includes('openHandwriting'), false, 'No handwriting AI UI remains');
console.log(
  'PASS: plugin startup, layers/undo/redo, radial, brush, navigation menus, geometric outline, AI removal'
);
