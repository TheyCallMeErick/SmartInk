'use strict';
const assert = require('node:assert/strict'),
  { setup, walk } = require('./harness.cjs');
const h = setup(),
  v = h.view;
try {
  v.root.getBoundingClientRect = () => ({
    left: 120,
    top: 80,
    right: 480,
    bottom: 340,
    width: 360,
    height: 260
  });
  v.root.clientWidth = 360;
  v.root.clientHeight = 260;
  v.win.innerWidth = 420;
  v.win.innerHeight = 300;
  const area = v.floatingArea();
  assert.equal(area.w, 284);
  assert.equal(area.h, 204);
  const p = v.makePanel(v.pageButton, 'Teste', 'test');
  p.getBoundingClientRect = () => ({ width: 280, height: 190 });
  p.style.left = '999px';
  p.style.top = '999px';
  v.constrainFloatingUI();
  assert.equal(parseFloat(p.style.left), 12);
  assert.equal(parseFloat(p.style.top), 22);
  assert.equal(p.style.maxHeight, '190px');
  v.win.visualViewport = { offsetLeft: 180, offsetTop: 100, width: 160, height: 90 };
  v.constrainFloatingUI();
  assert.equal(p.style.maxWidth, '144px');
  assert.equal(p.style.maxHeight, '74px');
  assert.equal(p.style.left, '68px');
  assert.equal(p.style.top, '28px');
  v.closePanel();
  assert.equal(v.pageButton.getAttribute('aria-expanded'), 'false');
  v.win.visualViewport = null;
  v.openPagePanel(v.pageButton);
  const nodes = walk(v.flyout);
  assert.equal(nodes.filter((n) => n.textContent === 'Espaço entre linhas / grade').length, 1);
  assert.equal(nodes.filter((n) => n.textContent === 'Criar backups automáticos').length, 1);
  assert.equal(
    nodes.some((n) => n.textContent === 'Pauta, grade e backups'),
    false
  );
  const backup = nodes.find((n) => n.textContent === 'Criar backups automáticos');
  assert.ok(
    walk(backup.parentNode.parentNode).some((n) => n.textContent === 'Arquivo e segurança')
  );
  v.openInterface();
  let nav = walk(v.flyout).find((n) => n.className === 'si-settings-nav');
  assert.ok(nav);
  assert.equal(
    walk(nav).find((n) => n.getAttribute('aria-current') === 'page').textContent,
    'Interface'
  );
  v.flyout.style.left = '25px';
  v.flyout.style.top = '20px';
  v.openWorkflow();
  nav = walk(v.flyout).find((n) => n.className === 'si-settings-nav');
  assert.equal(
    walk(nav).find((n) => n.getAttribute('aria-current') === 'page').textContent,
    'Atalhos e pincéis'
  );
  const current = v.flyout;
  for (const fn of v.win.handlers.resize || []) fn();
  assert.equal(v.flyout, current, 'Resize preserves an open form');
  v.setLayerDockOpen(true);
  assert.equal(v.layerSheet.style.position, 'fixed');
  assert.ok(parseFloat(v.layerSheet.style.maxHeight) <= area.h);
  assert.equal(v.flyout, null);
  v.openPrecision();
  assert.equal(v.layerDockOpen, false);
  assert.ok(v.flyout);
  v.openRadial({ x: 999, y: 999 });
  const scale = Number(v.radial.style['--si-radial-scale']);
  assert.ok(scale < 1);
  const y = parseFloat(v.radial.style.top);
  assert.ok(y - 150 * scale >= area.y - 0.01);
  assert.ok(y + 220 * scale <= area.y + area.h + 0.01);
  console.log(
    'PASS: pane/window/visual viewport containment, compact radial, layers, unified settings, backup grouping, resize preservation and expanded state'
  );
} finally {
  h.dispose();
}
