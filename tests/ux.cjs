'use strict';
// Additional Obsidian-independent tests for the radial, snapping and menu routing.
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
    this.clientWidth = 920;
    this.clientHeight = 690;
    this.textContent = '';
    this.value = '';
    this.parentNode = null;
    this.hidden = false;
    this.isConnected = true;
    this.disabled = false;
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
    return { left: 0, top: 0, right: 920, bottom: 690, width: 920, height: 690 };
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
doc.defaultView.Path2D = class {};
doc.defaultView.requestAnimationFrame = () => 1;
doc.defaultView.cancelAnimationFrame = () => {};
doc.defaultView.devicePixelRatio = 1;
const obsidian = {
  Plugin: class {},
  FileView: class {
    constructor() {
      this.contentEl = doc.createElement('div');
      this.containerEl = doc.createElement('div');
    }
  },
  TFile: class {},
  Notice: class {
    constructor(message) {
      this.message = message;
    }
  },
  PluginSettingTab: class {},
  Setting: class {},
  MarkdownRenderChild: class {},
  normalizePath: (s) => s
};
const path = require('node:path');
const code =
  fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8') +
  '\nglobalThis.__internals={Ink,Brushes,InkView};';
const context = {
  require: (name) => {
    assert.equal(name, 'obsidian');
    return obsidian;
  },
  module: { exports: {} },
  exports: {},
  console,
  URL,
  Blob,
  setTimeout,
  clearTimeout
};
vm.runInNewContext(code, context, { filename: 'main.js' });
const { Ink, Brushes, InkView } = context.__internals;
const settings = Brushes.settings({ snapOrigin: false, snapObjects: true, radialZoom: true });
assert.equal(settings.snapOrigin, false);
assert.equal(settings.snapObjects, true);
let saves = 0;
const plugin = {
  settings,
  savePreferences: async () => {
    saves++;
  },
  saveSession: async () => {},
  scheduleSessionSave: () => {},
  app: {}
};
const view = new InkView(null, plugin);
view.build();
assert.ok(view.pageButton, 'Kebab has a stable anchor');
assert.equal(
  Array.from(view.toolbar.children).filter((x) => (x.className || '').includes('si-toolbar-zoom'))
    .length,
  1,
  'No redundant view history toolbar'
);
view.s = {
  doc: Ink.fresh(),
  revision: 0,
  savedRevision: 0,
  history: new Ink.History(),
  notify: () => {},
  file: { path: 'ux.smartink' }
};
view.refresh();
// Test independent snapping: origin, other objects, overall master, alt and guide snapping.
view.mode = 'write';
const origin = { x: 50, y: 40 },
  p = { x: 54, y: 41 };
let found = view.snapPoint(p, {}, origin);
assert.equal(found.point.x, 54, 'Origin disabled without disabling snapping');
settings.snapOrigin = true;
found = view.snapPoint(p, {}, origin);
assert.equal(found.point.x, 50);
assert.equal(found.point.y, 40);
found = view.snapPoint(p, { altKey: true }, origin);
assert.equal(found.point.x, 54, 'Alt bypasses snapping');
settings.snapOrigin = false;
view.s.doc.elements.push({
  id: 'line',
  type: 'line',
  layerId: 'ink',
  x1: 100,
  y1: 105,
  x2: 180,
  y2: 105,
  width: 2,
  opacity: 1,
  color: '#000000'
});
view.mode = 'connector';
view.snapLock = null;
found = view.snapPoint({ x: 103, y: 106 }, {});
assert.equal(found.point.x, 100, 'Object snapping works independent of origin');
settings.snapObjects = false;
found = view.snapPoint({ x: 103, y: 106 }, {});
assert.equal(found.point.x, 103, 'Other objects disabled');
settings.snapObjects = true;
settings.snapPoints = false;
found = view.snapPoint({ x: 103, y: 106 }, {});
assert.equal(found.point.x, 103, 'Master snaps toggle works');
settings.snapPoints = true;
view.s.doc.drafting = { guides: [{ axis: 'x', value: 300 }], limit: null };
settings.guideSnap = true;
settings.guidesVisible = true;
assert.equal(view.constrainPoint({ x: 303, y: 400 }, 2).x, 300, 'Guide independent');
settings.guideSnap = false;
assert.equal(view.constrainPoint({ x: 303, y: 400 }, 2).x, 303);
settings.guideSnap = true;
// Precision UI exposes each separate switch; settings persist from the controls.
view.openPrecision();
assert.equal(view.panelKind, 'precision');
const labels = () => {
  const result = [];
  const visit = (n) => {
    if (n.tagName === 'LABEL') result.push(n);
    for (const child of n.children) visit(child);
  };
  visit(view.flyout);
  return result;
};
const label = (title) => {
  const l = labels().find((l) => l.children.some((ch) => ch.textContent === title));
  assert.ok(l, 'Missing label ' + title);
  return l;
};
const originInput = label('Fechar traço na própria origem').children[0];
originInput.checked = true;
originInput.handlers.change[0]();
assert.equal(settings.snapOrigin, true);
const masterInput = label('Ativar encaixe de pontos').children[0];
masterInput.checked = false;
masterInput.handlers.change[0]();
assert.equal(settings.snapPoints, false);
assert.equal(originInput.disabled, true);
masterInput.checked = true;
masterInput.handlers.change[0]();
assert.equal(originInput.disabled, false);
assert.ok(saves >= 3, 'Preference changes persist');
// Document menus are grouped; no per-document precision switches in Organizar.
view.openOrganize();
assert.equal(view.panelKind, 'organize');
const menuButtons = (p) => {
  const items = [];
  const walk = (n) => {
    if (n.tagName === 'BUTTON') items.push(n.textContent);
    for (const c of n.children) walk(c);
  };
  walk(p);
  return items;
};
assert.ok(menuButtons(view.flyout).includes('Texto'));
assert.ok(!menuButtons(view.flyout).some((x) => x.includes('Precisão')));
view.openPagePanel(view.pageButton);
assert.equal(view.panelKind, 'page');
const pageLabels = menuButtons(view.flyout);
for (const s of [
  'Precisão e encaixes',
  'Personalizar radial e zoom',
  'Réguas e guias desta página',
  'Cópias de recuperação',
  'Criar nota vinculada a esta página'
])
  assert.ok(pageLabels.includes(s), s);
// A radial has exactly 8 configurable actions and an independent zoom tool.
view.closePanel();
view.zoom = 1;
view.syncZoom();
view.openRadial({ x: 500, y: 300 });
let radial = view.radial;
assert.ok(radial);
assert.equal(radial.children.filter((x) => x.className === 'si-radial-item').length, 8);
const zoomBar = radial.children.find((x) => x.className === 'si-radial-zoom');
assert.ok(zoomBar, 'Zoom strip appears below radial');
const track = zoomBar.children.find((x) => x.className === 'si-radial-zoom-track');
assert.ok(track, 'Accessible zoom slider');
assert.equal(track.getAttribute('role'), 'slider');
assert.equal(track.getAttribute('aria-valuenow'), '100');
track.handlers.keydown[0]({ key: 'End', preventDefault() {}, stopPropagation() {} });
assert.equal(view.zoom, 8);
assert.equal(track.getAttribute('aria-valuenow'), '800');
track.handlers.keydown[0]({ key: 'Home', preventDefault() {}, stopPropagation() {} });
assert.equal(view.zoom, 0.1);
const initial = view.navBack.length;
track.handlers.pointerdown[0]({
  button: 0,
  pointerId: 1,
  clientX: 230,
  preventDefault() {},
  stopPropagation() {}
});
track.handlers.pointermove[0]({ clientX: 500, preventDefault() {} });
track.handlers.pointerup[0]();
assert.equal(view.navigating, false);
assert.equal(view.navBack.length, initial + 1, 'One navigation checkpoint per arc drag');
assert.equal(view.radial, radial, 'Zoom drag keeps radial open');
view.closeRadial();
settings.radialZoom = false;
view.openRadial({ x: 500, y: 300 });
assert.equal(
  view.radial.children.some((x) => x.className === 'si-radial-zoom'),
  false,
  'Zoom can be hidden in preferences'
);
// Layer delete atomic with undo: move content or remove it.
view.closeRadial();
view.addLayer();
const id = view.s.doc.activeLayer;
view.s.doc.elements.push({
  id: 'annotation',
  type: 'line',
  layerId: id,
  x1: 1,
  y1: 2,
  x2: 4,
  y2: 5,
  width: 2,
  color: '#000000',
  opacity: 1
});
let n = view.s.history.undoStack.length;
view.deleteLayer(id, false);
assert.equal(view.s.history.undoStack.length, n + 1);
assert.ok(view.s.doc.elements.some((x) => x.id === 'annotation'));
assert.ok(!view.s.doc.layers.some((l) => l.id === id));
view.undo();
assert.ok(view.s.doc.layers.some((l) => l.id === id));
assert.equal(view.s.doc.elements.find((x) => x.id === 'annotation').layerId, id);
view.deleteLayer(id, true);
assert.ok(!view.s.doc.elements.some((x) => x.id === 'annotation'));
view.undo();
assert.ok(view.s.doc.elements.some((x) => x.id === 'annotation'));
// The selection style palette must be the same comprehensive picker used by the pen.
view.mode = 'select';
const selected = {
  id: 'selected-ink',
  type: 'stroke',
  layerId: 'ink',
  color: '#202020',
  width: 2,
  opacity: 1,
  pressure: true,
  smoothing: 0.55,
  streamline: 0.25,
  cornerProtection: 0.5,
  points: [
    { x: 0, y: 0, p: 0.5, t: 0 },
    { x: 1, y: 1, p: 0.6, t: 10 },
    { x: 2, y: 0, p: 0.8, t: 20 }
  ]
};
const other = { ...selected, id: 'other-ink', color: '#666666' };
view.s.doc.elements = [selected, other];
view.selected = new Set([selected.id]);
const currentPenColor = settings.brushes.write.color;
view.openSelectionStyle();
assert.equal(view.panelKind, 'selection');
const palette = view.flyout.children.find((x) => x.className === 'si-palette');
assert.ok(palette, 'Selection has shared pen color palette');
const customColor = view.flyout.children.find((x) => x.className === 'si-custom-color');
assert.ok(customColor, 'Selection has custom color input');
const presets = view.flyout.children.find((x) => x.className === 'si-size-presets');
assert.equal(
  presets.children.length,
  Brushes.SPECS.write.presets.length,
  'Selection exposes pen thickness presets'
);
const choices = view.flyout.children.find((x) => x.className === 'si-style-choices');
assert.equal(choices.children.length, 3, 'Selection offers brush style presets');
const red = palette.children.find((x) => x.dataset.color === '#c42b1c');
assert.ok(red);
red.click();
assert.equal(view.s.doc.elements[0].color, '#202020', 'Selection preview does not commit');
assert.equal(view.stylePreview.elements[0].color, '#c42b1c', 'Selection preview reflects color');
assert.equal(
  view.stylePreview.elements[1].color,
  '#666666',
  'Unselected objects must remain unchanged'
);
const beforeUndo = view.s.history.undoStack.length;
view.closePanel();
assert.equal(view.stylePreview, null, 'Cancel discards the preview');
assert.equal(view.s.doc.elements[0].color, '#202020');
assert.equal(view.s.history.undoStack.length, beforeUndo);
view.openSelectionStyle();
const green = view.flyout.children
  .find((x) => x.className === 'si-palette')
  .children.find((x) => x.dataset.color === '#107c10');
green.click();
const actions = view.flyout.children.find((x) => x.className === 'si-selection-style-actions');
actions.children[0].click();
assert.equal(view.s.doc.elements[0].color, '#107c10', 'Apply commits the new color');
assert.equal(view.s.doc.elements[1].color, '#666666');
assert.equal(view.s.history.undoStack.length, beforeUndo + 1, 'A whole preview is one undo action');
assert.equal(
  settings.brushes.write.color,
  currentPenColor,
  'Editing the selection cannot change the active pen'
);
view.undo();
assert.equal(view.s.doc.elements[0].color, '#202020', 'Selection styling undo restores color');
// Style presets are previews, shape line style stays scoped to shapes.
view.openSelectionStyle();
const brushChoices = view.flyout.children.find((x) => x.className === 'si-style-choices');
brushChoices.children[2].click();
assert.equal(
  view.stylePreview.elements[0].opacity,
  settings.brushes.marker.opacity,
  'Marker preset previews opacity'
);
assert.equal(
  view.stylePreview.elements[0].width,
  settings.brushes.marker.width,
  'Marker preset previews width'
);
view.closePanel();
assert.equal(view.s.doc.elements[0].opacity, 1, 'Discarding preset preview restores stroke');
const line = {
  id: 'shape',
  type: 'line',
  layerId: 'ink',
  color: '#202020',
  width: 2,
  opacity: 1,
  x1: 0,
  y1: 0,
  x2: 40,
  y2: 0,
  dash: 'solid'
};
view.s.doc.elements = [selected, line];
view.selected = new Set(['shape']);
view.openSelectionStyle();
const dashRow = view.flyout.children.find(
  (x) => x.tagName === 'LABEL' && x.children.some((ch) => ch.textContent === 'Estilo da linha')
);
assert.ok(dashRow, 'Shape selection offers dash styles');
const dashSelect = dashRow.children.find((x) => x.tagName === 'SELECT');
dashSelect.value = 'dotted';
dashSelect.handlers.change[0]();
assert.equal(view.stylePreview.elements[1].dash, 'dotted');
assert.equal(view.s.doc.elements[1].dash, 'solid', 'Dashed style is preview-only until apply');
view.flyout.children.find((x) => x.className === 'si-selection-style-actions').children[0].click();
assert.equal(view.s.doc.elements[1].dash, 'dotted');
assert.equal(view.s.doc.elements[0].dash, undefined, 'Stroke cannot receive geometric dash');

assert.equal(code.includes('127.0.0.1:32187'), false);
console.log(
  'PASS: independent snap switches, guides, menu routing, curved zoom keyboard/drag/history, layer deletion/undo, legacy settings'
);
