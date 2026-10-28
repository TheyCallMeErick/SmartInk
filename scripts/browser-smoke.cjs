'use strict';
// Optional integration test: actual Chromium DOM/Canvas, simulated Obsidian host.
// npm install --no-save playwright; npx playwright install chromium
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { chromium } = require(
  require.resolve('playwright', {
    paths: [process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || '', process.cwd()]
  })
);
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 850 } }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setContent(
      '<html><head><style>:root{--background-primary:#fff;--background-secondary:#f5f6f8;--background-modifier-border:#ccd0d5;--text-normal:#202020;--text-muted:#666;--interactive-accent:#0078d4;--font-interface:Arial}body{margin:0}#mount{height:850px}button,input,select{font:14px Arial;padding:6px;border:1px solid #ccd0d5;border-radius:5px}*{box-sizing:border-box}</style></head><body><div id="mount"></div></body></html>'
    );
    await page.addStyleTag({ content: fs.readFileSync(path.join(root, 'styles.css'), 'utf8') });
    await page.addScriptTag({
      content: `window.module={exports:{}};window.exports={};window.require=()=>({Plugin:class{},FileView:class{constructor(){this.contentEl=document.getElementById('mount');this.containerEl=this.contentEl;}},TFile:class{},Notice:class{constructor(m){console.log(m)}},PluginSettingTab:class{},Setting:class{},MarkdownRenderChild:class{},normalizePath:x=>x});`
    });
    await page.addScriptTag({
      content:
        fs.readFileSync(path.join(root, 'main.js'), 'utf8') +
        `;window.testApi={Ink,InkView,Brushes,ShapeKit};`
    });
    await page.evaluate(() => {
      const { Ink, InkView, Brushes } = testApi;
      const plugin = {
        settings: { ...Brushes.settings({}), uiLanguage: 'pt-BR' },
        savePreferences: async () => {},
        scheduleSessionSave: () => {},
        backup: async () => {},
        app: { vault: { getName: () => 'Test' } }
      };
      const v = (window.testView = new InkView(null, plugin));
      v.app = plugin.app;
      v.build();
      v.s = {
        doc: Ink.fresh(),
        revision: 0,
        savedRevision: 0,
        history: new Ink.History(),
        notify: () => v.refresh(),
        file: { path: 'test.smartink' }
      };
      v.refresh();
      v.render();
    });
    // Shared preferences and pane bounds, including resizing an already open form.
    for (const width of [1200, 360, 220]) {
      await page.setViewportSize({ width, height: 500 });
      await page.evaluate(() => {
        document.getElementById('mount').style.height = '500px';
        testView.openInterface();
      });
      await page.waitForTimeout(60);
      await page
        .getByRole('navigation', { name: 'Preferências' })
        .getByRole('button', { name: 'Atalhos e pincéis', exact: true })
        .click();
      const bounds = await page.locator('.si-flyout').boundingBox();
      assert.ok(
        bounds.x >= -1 &&
          bounds.y >= -1 &&
          bounds.x + bounds.width <= width + 1 &&
          bounds.y + bounds.height <= 501
      );
      assert.equal(await page.evaluate(() => testView.panelKind), 'workflow');
      await page.evaluate(() => {
        testView.setLayerDockOpen(true);
        testView.constrainFloatingUI();
      });
      const layers = await page.locator('.si-layer-sheet').boundingBox();
      assert.ok(
        layers.x >= -1 &&
          layers.y >= -1 &&
          layers.x + layers.width <= width + 1 &&
          layers.y + layers.height <= 501,
        `Layer sheet bounds at ${width}px: ${JSON.stringify(layers)}`
      );
      await page.evaluate(() => testView.setLayerDockOpen(false));
    }
    await page.setViewportSize({ width: 1200, height: 850 });
    await page.evaluate(() => {
      document.getElementById('mount').style.height = '850px';
      testView.closePanel();
      testView.render();
    });
    await page.getByRole('button', { name: 'Inserir forma geométrica', exact: true }).click();
    await page.getByRole('button', { name: 'Quadrado', exact: true }).click();
    const overlay = await page.locator('.si-overlay').boundingBox();
    assert.ok(overlay);
    await page.mouse.move(overlay.x + 140, overlay.y + 140);
    await page.mouse.down();
    await page.mouse.move(overlay.x + 300, overlay.y + 250, { steps: 12 });
    await page.mouse.up();
    assert.equal(await page.evaluate(() => testView.s.doc.elements[0].shapeKind), 'square');
    await page.evaluate(() => {
      const { Ink, Brushes } = testApi,
        v = testView;
      v.mode = 'write';
      const e = {
        id: 'circle-ink',
        type: 'stroke',
        layerId: 'ink',
        ...Brushes.strokeStyle(v.plugin.settings, 'write'),
        points: Array.from({ length: 100 }, (_, i) => ({
          x: 420 + 70 * Math.cos((i / 99) * 2 * Math.PI),
          y: 240 + 70 * Math.sin((i / 99) * 2 * Math.PI),
          p: 0.5,
          t: i * 10
        }))
      };
      v.s.doc.elements = [e];
      v.recognizeIds([e.id]);
      v.render();
    });
    const pop = page.getByRole('dialog', { name: 'Você queria um…?' });
    await pop.waitFor({ state: 'visible' });
    const box = await pop.boundingBox();
    assert.ok(
      box.x >= 0 && box.y >= 0 && box.x + box.width <= 1200 && box.y + box.height <= 850,
      'Popover in viewport'
    );
    if (process.env.SMART_INK_SCREENSHOT)
      await page.screenshot({ path: process.env.SMART_INK_SCREENSHOT });
    await pop.getByRole('button', { name: 'Círculo', exact: true }).click();
    await pop.getByRole('button', { name: 'Aplicar forma', exact: true }).click();
    assert.equal(await page.evaluate(() => testView.s.doc.elements[0].type), 'circle');
    await page.evaluate(() => testView.undo());
    assert.equal(await page.evaluate(() => testView.s.doc.elements[0].type), 'stroke');
    await page.getByRole('button', { name: 'Inserir forma geométrica', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Buscar forma' }).fill('hexágono');
    await page.getByRole('button', { name: 'Hexágono', exact: true }).click();
    if (process.env.SMART_INK_LIBRARY_SCREENSHOT)
      await page.screenshot({ path: process.env.SMART_INK_LIBRARY_SCREENSHOT });
    await page.evaluate(() => testView.closePanel());
    for (const layout of ['top', 'bottom', 'left', 'right']) {
      await page.evaluate((layout) => {
        const v = testView;
        v.plugin.settings.layout = layout;
        v.applyLayout();
        v.selected.clear();
        v.mode = 'select';
        v.updateSuggestion();
      }, layout);
      const before = await page.locator('.si-overlay').boundingBox();
      await page.evaluate(() => {
        testView.selected = new Set(testView.s.doc.elements.map((e) => e.id));
        testView.updateSuggestion();
      });
      assert.deepEqual(
        await page.locator('.si-overlay').boundingBox(),
        before,
        'Selection must not resize/move canvas: ' + layout
      );
      const bar = await page.locator('.si-suggestion').boundingBox();
      assert.ok(bar);
      assert.ok(
        Math.abs(bar.x + bar.width / 2 - (before.x + before.width / 2)) < 2,
        'Context bar centered'
      );
    }
    await page.evaluate(() => {
      const data = new DataTransfer(),
        bytes = Uint8Array.from(
          atob(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1cAAAAASUVORK5CYII='
          ),
          (c) => c.charCodeAt(0)
        );
      data.items.add(new File([bytes], 'clipboard.png', { type: 'image/png' }));
      testView.overlay.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
      );
      return testView.clipboardPromise;
    });
    assert.equal(await page.evaluate(() => testView.s.doc.elements.at(-1).type), 'image');
    // Native DOM capture order: copy/paste and staged Escape must not fall through to legacy handlers.
    await page.evaluate(() => {
      const data = new DataTransfer();
      testView.overlay.dispatchEvent(
        new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true })
      );
      window.selectionData = data;
      testView.selected.clear();
      testView.updateSuggestion();
      testView.overlay.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
      );
    });
    assert.equal(await page.evaluate(() => testView.selected.size), 1);
    await page.evaluate(() => {
      testView.openSelectionActions(testView.modeButtons.select);
      testView.overlay.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          bubbles: true,
          cancelable: true
        })
      );
    });
    assert.equal(await page.evaluate(() => testView.flyout), null);
    assert.equal(await page.evaluate(() => testView.selected.size), 1);
    await page.evaluate(() =>
      testView.overlay.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          bubbles: true,
          cancelable: true
        })
      )
    );
    assert.equal(await page.evaluate(() => testView.selected.size), 0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => {
      testView.selected = new Set(testView.s.doc.elements.map((e) => e.id));
      testView.mode = 'select';
      testView.updateSuggestion();
      testView.openSelectionActions(testView.modeButtons.select);
    });
    assert.equal(
      await page.locator('.si-flyout').evaluate((e) => getComputedStyle(e).animationName),
      'none'
    );
    await page
      .getByRole('button', { name: 'Colar na posição original', exact: true })
      .waitFor({ state: 'visible' });
    const controls = await page.locator('.si-suggestion .si-inline-icon').count();
    assert.ok(controls > 0, 'Context icons present');
    for (const width of [420, 1200]) {
      await page.setViewportSize({ width, height: 850 });
      await page.evaluate(() => {
        testView.closePanel();
        testView.plugin.settings.layout = 'top';
        testView.applyLayout();
        testView.updateSuggestion();
      });
      const bar = await page.locator('.si-suggestion').boundingBox();
      assert.ok(bar.x >= 0 && bar.x + bar.width <= width + 1, 'Toolbar fits narrow viewport');
    }
    if (process.env.SMART_INK_UI_DIR) {
      fs.mkdirSync(process.env.SMART_INK_UI_DIR, { recursive: true });
      await page.screenshot({
        path: path.join(process.env.SMART_INK_UI_DIR, 'selection-light.png')
      });
      await page.addStyleTag({
        content:
          ':root{--background-primary:#252525;--background-secondary:#303030;--text-normal:#eee;--text-muted:#bbb;--background-modifier-border:#555}'
      });
      await page.screenshot({
        path: path.join(process.env.SMART_INK_UI_DIR, 'selection-dark.png')
      });
    }
    assert.deepEqual(errors, []);
    console.log(
      'PASS: Chromium actual DOM/Canvas, direct drawing, recognition popover, selection/confirmation/undo, searchable shape library; Obsidian host simulated'
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
