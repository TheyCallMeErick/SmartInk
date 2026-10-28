'use strict';
const assert = require('node:assert/strict'),
  { setup, walk } = require('./harness.cjs');
(async () => {
  const h = setup(),
    v = h.view,
    find = (p, text) => walk(p).find((n) => n.tagName === 'BUTTON' && n.textContent === text),
    input = (p, label) =>
      walk(p).find((n) => n.tagName === 'INPUT' && n.getAttribute('aria-label') === label);
  try {
    v.openBrushPanel('write');
    let p = v.flyout,
      cards = walk(p).filter((n) => n.className === 'si-profile-card'),
      status = walk(p).find((n) => n.className === 'si-profile-status');
    assert.ok(cards.every((c) => c.parentNode.parentNode === p && c.children.length === 3));
    cards.find((c) => c.getAttribute('aria-label') === 'Desenho').click();
    assert.equal(cards[4].getAttribute('aria-pressed'), 'true');
    assert.equal(input(p, 'Suavização').value, '0.8');
    const smoothing = input(p, 'Suavização');
    smoothing.value = '.7';
    smoothing.handlers.input[0]();
    assert.match(status.textContent, /Personalizado/);
    assert.ok(cards.every((c) => c.getAttribute('aria-pressed') === 'false'));
    const before = JSON.stringify(v.s.doc),
      revision = v.s.revision,
      brush = { ...v.plugin.settings.brushes.write },
      pad = walk(p).find((n) => n.getAttribute('class') === 'si-brush-test-pad'),
      test = v.brushTest;
    const event = {
      pointerId: 81,
      pointerType: 'pen',
      button: 0,
      clientX: 50,
      clientY: 50,
      pressure: 0.2,
      timeStamp: 1,
      preventDefault() {}
    };
    pad.handlers.pointerdown[0](event);
    pad.handlers.pointermove[0]({ ...event, clientX: 100, pressure: 0.8, timeStamp: 5 });
    pad.handlers.pointerup[0]({ ...event, clientX: 120, pressure: 0, timeStamp: 8 });
    assert.equal(test.state.strokes.length, 1);
    assert.equal(test.state.strokes[0].at(-1).p, 0.8);
    assert.ok(pad.children[0].getAttribute('d'));
    assert.equal(JSON.stringify(v.s.doc), before);
    assert.equal(v.s.revision, revision);
    find(p, 'Limpar teste').click();
    assert.equal(test.state.strokes.length, 0);
    pad.handlers.pointerdown[0](event);
    pad.handlers.pointercancel[0](event);
    assert.equal(test.state.strokes.length, 0);
    find(p, 'Restaurar suavização').click();
    assert.equal(
      v.plugin.settings.brushes.write.smoothing,
      h.Brushes.settings({}).brushes.write.smoothing
    );
    assert.equal(v.plugin.settings.brushes.write.color, brush.color);
    assert.equal(v.plugin.settings.brushes.write.width, brush.width);
    v.plugin.settings.brushes.write.pressureGamma = 3;
    find(p, 'Restaurar pressão').click();
    assert.equal(v.plugin.settings.brushes.write.pressureGamma, 1);
    assert.equal(v.plugin.settings.brushes.write.width, brush.width);
    v.closePanel();
    assert.equal(test.state.active, null);
    const stroke = {
      id: 'pressure-test',
      type: 'stroke',
      layerId: 'ink',
      ...h.Brushes.strokeStyle(v.plugin.settings, 'write'),
      pressureMin: 0.3,
      pressureMax: 0.8,
      points: [
        { x: 0, y: 0, p: 0.4 },
        { x: 20, y: 20, p: 0.8 }
      ]
    };
    v.s.doc.elements = [stroke];
    v.selected = new Set([stroke.id]);
    v.openBrushPanel('write', true);
    find(v.flyout, 'Restaurar pressão').click();
    assert.equal(v.stylePreview.elements[0].pressureMin, 0);
    assert.equal(v.s.doc.elements[0].pressureMin, 0.3);
    find(v.flyout, 'Aplicar à seleção').click();
    assert.equal(v.s.doc.elements[0].pressureMin, 0);
    assert.equal(v.s.doc.elements[0].pressureMax, 1);

    v.openPagePanel(v.pageButton);
    v.settingsSearch.value = 'backup';
    v.searchSettings('backup');
    let results = walk(v.settingsSearchResults).filter((n) => n.tagName === 'BUTTON');
    assert.ok(results.length);
    results[0].click();
    assert.ok(v.settingsShell);
    assert.equal(v.panelKind, 'page');
    const backup = walk(v.flyout).find(
      (n) =>
        n.tagName === 'LABEL' && walk(n).some((c) => c.textContent === 'Criar backups automáticos')
    );
    assert.ok(backup.classList.contains('si-search-target'));
    assert.equal(backup.parentNode.open, true);
    v.searchSettings('curva de pressao');
    results = walk(v.settingsSearchResults).filter((n) => n.tagName === 'BUTTON');
    assert.ok(results.length >= 1);
    results.find((n) => n.textContent.startsWith('Curva de pressão ·')).click();
    assert.equal(v.panelKind, 'write');
    assert.ok(
      input(v.flyout, 'Curva de pressão').parentNode.classList.contains('si-search-target')
    );
    assert.equal(input(v.flyout, 'Curva de pressão').parentNode.parentNode.open, true);
    find(v.flyout, '← Voltar à categoria').click();
    assert.equal(v.panelKind, 'page');
    v.navigateSettings('interface');
    v.flyout.scrollTop = 120;
    let details = walk(v.flyout).find(
      (n) => n.tagName === 'DETAILS' && n.children[0]?.textContent === 'Gestos e botões avançados'
    );
    details.open = true;
    v.navigateSettings('workflow');
    v.navigateSettings('interface');
    assert.equal(v.flyout.scrollTop, 120);
    assert.ok(walk(v.flyout).some((n) => n.tagName === 'DETAILS' && n.open));
    const density = walk(v.flyout).find(
      (n) => n.tagName === 'SELECT' && n.children.some((c) => c.value === 'comfortable')
    );
    density.value = 'comfortable';
    density.handlers.change[0]();
    assert.equal(v.plugin.settings.largeControls, true);
    assert.ok(v.root.classList.contains('si-large-controls'));
    v.closePanel(true);
    assert.equal(v.plugin.settings.uiLastSettingsCategory, 'interface');
    v.openPagePanel(v.pageButton);
    assert.equal(v.panelKind, 'interface');
    assert.equal(v.flyout.scrollTop, 120);
    assert.equal(v.pageButton.getAttribute('aria-expanded'), 'true');
    v.navigateSettings('workflow');
    const favorites = JSON.stringify(v.plugin.settings.favorites);
    v.plugin.settings.shortcuts.write = 'KeyZ';
    find(v.flyout, 'Restaurar atalhos').click();
    assert.equal(v.plugin.settings.shortcuts.write, 'Digit1');
    assert.equal(JSON.stringify(v.plugin.settings.favorites), favorites);
    v.navigateSettings('precision');
    v.plugin.settings.snapPoints = false;
    v.openPrecision();
    assert.ok(
      walk(v.flyout)
        .filter((n) => n.tagName === 'INPUT' && n.disabled)
        .every((n) => n.title)
    );
    v.searchSettings('inexistente123');
    assert.ok(walk(v.settingsSearchResults).some((n) => /Nenhum resultado/.test(n.textContent)));
    v.searchSettings('');
    assert.ok(v.settingsLinks.every((x) => !x.b.hidden));
    // Preference feedback tracks the actual serialized writes, including failure.
    const messages = [],
      pending = [];
    const plugin = {
      settings: {},
      preferenceTail: Promise.resolve(),
      preferenceObservers: new Set([(s) => messages.push(s)]),
      saveData: () => new Promise((resolve, reject) => pending.push({ resolve, reject }))
    };
    const first = h.SmartInkPlugin.prototype.savePreferences.call(plugin);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(messages.at(-1), 'Salvando…');
    pending[0].resolve();
    await first;
    await Promise.resolve();
    assert.equal(messages.at(-1), 'Salvo');
    const second = h.SmartInkPlugin.prototype.savePreferences.call(plugin);
    await Promise.resolve();
    await Promise.resolve();
    pending[1].reject(new Error('disk'));
    await second.catch(() => {});
    await Promise.resolve();
    assert.equal(messages.at(-1), 'Não foi possível salvar');
    console.log(
      'PASS: profile active/custom states, synchronized fields, isolated pressure test, scoped resets, search/reveal, last category/scroll/details, density, disabled reasons and actual save/failure feedback'
    );
  } finally {
    clearTimeout(v.feedbackTimer);
    h.dispose();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
