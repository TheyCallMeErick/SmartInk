'use strict';
const assert = require('node:assert/strict'),
  { setup, walk } = require('./harness.cjs');
(async () => {
  const h = setup(),
    v = h.view;
  try {
    assert.equal(v.suggestion.parentNode, v.viewport);
    assert.ok(!v.root.children.includes(v.suggestion), 'Context bar is outside the page layout');
    v.mode = 'select';
    v.updateSuggestion();
    assert.equal(v.suggestion.hidden, true);
    const src = 'data:image/png;base64,iVBORw0KGgo=',
      image = {
        id: 'img',
        type: 'image',
        src,
        cx: 100,
        cy: 100,
        imageW: 100,
        imageH: 100,
        width: 1,
        color: '#ffffff',
        opacity: 1,
        angle: 0,
        layerId: v.s.doc.activeLayer
      };
    v.s.doc.elements = [image];
    v.selected = new Set(['img']);
    const camera = { ...v.camera },
      zoom = v.zoom;
    v.updateSuggestion();
    assert.equal(v.suggestion.hidden, false);
    assert.deepEqual({ ...v.camera }, camera);
    assert.equal(v.zoom, zoom);
    const extra = v.selectionExtraActions.map((b) => b.textContent);
    v.openSelectionActions(v.modeButtons.select);
    for (const label of extra)
      assert.ok(
        walk(v.flyout).some((n) => n.textContent === label),
        'Extension accessible in More'
      );
    v.closePanel();
    v.previewInkOperation('Teste', () => [{ ...image, cx: 200 }]);
    const panel = v.flyout,
      apply = walk(panel).find((b) => b.textContent === 'Aplicar alterações');
    assert.equal(apply.getAttribute('data-si-action'), 'confirm');
    assert.equal(v.s.doc.elements[0].cx, 100);
    panel.dispatchEvent({
      type: 'keydown',
      key: 'Enter',
      ctrlKey: true,
      preventDefault() {},
      stopPropagation() {}
    });
    assert.equal(v.s.doc.elements[0].cx, 200);
    v.undo();
    assert.equal(v.s.doc.elements[0].cx, 100);
    v.win.FileReader = class {
      readAsDataURL() {
        this.result = src;
        this.onload();
      }
    };
    v.win.Image = class {
      set src(_) {
        this.naturalWidth = 120;
        this.naturalHeight = 80;
        this.onload();
      }
    };
    const file = { type: 'image/png', size: 100 };
    assert.equal(await v.pasteImages([file, file]), true);
    assert.equal(v.s.doc.elements.length, 3);
    assert.equal(v.selected.size, 2);
    assert.equal(v.mode, 'select');
    assert.deepEqual({ ...v.camera }, camera);
    v.undo();
    assert.equal(v.s.doc.elements.length, 1);
    v.redo();
    assert.equal(v.s.doc.elements.length, 3);
    const before = v.s.doc.elements.length;
    assert.equal(await v.pasteImages([{ type: 'image/svg+xml', size: 100 }]), false);
    assert.equal(await v.pasteImages([{ ...file, size: 9 * 1024 * 1024 }]), false);
    assert.equal(v.s.doc.elements.length, before);
    let prevented = false,
      calls = 0;
    const original = v.pasteImages;
    v.pasteImages = async () => {
      calls++;
    };
    const event = (target) => ({
      type: 'paste',
      target,
      clipboardData: { items: [{ kind: 'file', getAsFile: () => file }] },
      preventDefault() {
        prevented = true;
      },
      stopPropagation() {}
    });
    v.root.dispatchEvent(event(h.document.createElement('textarea')));
    assert.equal(calls, 0);
    assert.equal(prevented, false);
    v.root.dispatchEvent(event(v.overlay));
    assert.equal(calls, 1);
    assert.equal(prevented, true);
    v.pasteImages = original;
    let release;
    v.decodePastedImage = () => new Promise((resolve) => (release = resolve));
    const pending = v.pasteImages([file]);
    v.s = { ...v.s, doc: h.Ink.clone(v.s.doc) };
    release({ src, w: 120, h: 80 });
    assert.equal(await pending, false);
    assert.equal(v.s.doc.elements.length, before);
    v.decodePastedImage = async () => {
      throw new Error('Invalid image');
    };
    assert.equal(await v.pasteImages([file]), false);
    assert.equal(v.pasteBusy, false);
    console.log(
      'PASS: floating control ownership, More actions, explicit confirmation/shortcut/undo, image clipboard routing, batch undo, invalid images and stale page guards'
    );
  } finally {
    h.dispose();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
