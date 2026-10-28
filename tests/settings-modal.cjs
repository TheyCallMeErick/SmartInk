'use strict';
const assert = require('node:assert/strict'),
  { setup, walk } = require('./harness.cjs');
const h = setup(),
  v = h.view;
const inputs = (p) =>
  walk(p)
    .filter((n) => ['INPUT', 'SELECT', 'TEXTAREA'].includes(n.tagName))
    .map((n) => [
      n.tagName,
      n.type || '',
      n.getAttribute('aria-label') || n.placeholder || '',
      String(n.value),
      !!n.checked
    ]);
try {
  v.openBrushPanel('write');
  const cards = walk(v.flyout).filter((n) => n.className === 'si-profile-card');
  assert.equal(cards.length, 5);
  assert.ok(
    cards.every(
      (n) => n.children[0].tagName === 'SVG' && n.children[0].getAttribute('aria-hidden') === 'true'
    )
  );
  cards.find((n) => n.getAttribute('aria-label') === 'Desenho').click();
  assert.equal(v.plugin.settings.brushes.write.smoothing, 0.8);
  assert.equal(v.plugin.settings.brushes.write.streamline, 0.65);
  cards.find((n) => n.getAttribute('aria-label') === 'Letra pequena').click();
  assert.equal(v.plugin.settings.brushes.write.smoothing, 0.35);
  v.closePanel();
  const methods = [
      'openInterface',
      'openWorkflow',
      'openPresetLibrary',
      'openPrecision',
      'openRadialSettings',
      'openDeviceProfiles',
      'openNavigation'
    ],
    expected = {};
  for (const m of methods) {
    v[m]();
    expected[m] = inputs(v.flyout);
    v.closePanel();
  }
  let focused = false;
  v.pageButton.focus = () => (focused = true);
  v.openPagePanel(v.pageButton);
  const shell = v.settingsShell;
  assert.ok(shell);
  assert.equal(shell.getAttribute('aria-modal'), 'true');
  assert.equal(v.flyout.parentNode, shell);
  assert.equal(v.toolbar.inert, true);
  const pageInputs = inputs(v.flyout);
  assert.ok(pageInputs.length >= 4);
  assert.equal(v.settingsLinks.length, 8);
  for (const [i, m] of methods.entries()) {
    v.settingsLinks[i + 1].b.click();
    assert.equal(v.settingsShell, shell);
    assert.deepEqual(inputs(v.flyout), expected[m], m + ' retains all fields');
    assert.equal(v.settingsLinks[i + 1].b.getAttribute('aria-current'), 'page');
  }
  v.settingsLinks[0].b.click();
  assert.deepEqual(inputs(v.flyout), pageInputs);
  const paper = v.paper;
  paper.value = 'lines';
  paper.handlers.change[0]();
  assert.equal(v.s.doc.background, 'lines');
  v.settingsLinks[1].b.click();
  v.settingsLinks[0].b.click();
  assert.equal(v.paper.value, 'lines');
  v.floatingArea = () => ({ x: 8, y: 8, w: 304, h: 224 });
  v.constrainFloatingUI();
  assert.equal(shell.style.width, '304px');
  assert.equal(shell.style.height, '224px');
  assert.ok(shell.classList.contains('si-settings-compact'));
  // Tab wraps without reaching the inert canvas.
  const a = {
      disabled: false,
      hidden: false,
      getClientRects: () => [{}],
      focus: () => (focused = 'first')
    },
    b = { ...a, focus: () => (focused = 'last') };
  shell.querySelectorAll = () => [a, b];
  v.root.ownerDocument.activeElement = b;
  let prevented = false;
  shell.handlers.keydown[0]({
    key: 'Tab',
    stopPropagation() {},
    preventDefault: () => (prevented = true)
  });
  assert.equal(prevented, true);
  assert.equal(focused, 'first');
  v.closePanel(true);
  assert.equal(v.settingsShell, null);
  assert.equal(!!v.toolbar.inert, false);
  assert.equal(focused, true);
  v.openPagePanel(v.pageButton);
  v.openPagePanel(v.pageButton);
  assert.equal(v.settingsShell, null);
  assert.equal(v.flyout, null);
  v.openPagePanel(v.pageButton);
  focused = false;
  v.settingsBackdrop.handlers.pointerdown[0]({ preventDefault() {} });
  assert.equal(v.settingsShell, null);
  assert.equal(focused, true);
  console.log(
    'PASS: five icon cards invoke brush profiles; modal preserves fields across eight categories, saves page edits, traps focus, restores canvas, fits narrow panes and toggles closed'
  );
} finally {
  clearTimeout(v.feedbackTimer);
  h.dispose();
}
