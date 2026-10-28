'use strict';
const assert = require('node:assert/strict');
const { setup, walk } = require('./harness.cjs');
(async () => {
  const results = [],
    errors = [];
  const base = setup(),
    methods = Object.getOwnPropertyNames(Object.getPrototypeOf(base.view)).filter((k) =>
      /^open/.test(k)
    );
  base.dispose();
  for (const method of ['build', ...methods]) {
    const h = setup(),
      v = h.view;
    try {
      v.app.vault = {
        getFiles: () => [],
        getName: () => 'Test',
        getAbstractFileByPath: () => null
      };
      v.app.workspace = {};
      v.plugin.backupKey = () => 'test';
      v.app.metadataCache = { getFirstLinkpathDest: () => null };
      const shape = {
        ...h.ShapeKit.make('rectangle', { x: 20, y: 20 }, { x: 140, y: 100 }),
        layerId: 'ink'
      };
      v.s.doc.elements = [shape];
      v.selected = new Set([shape.id]);
      const stroke = {
        id: 'stroke',
        type: 'stroke',
        layerId: 'ink',
        ...h.Brushes.strokeStyle(v.plugin.settings, 'write'),
        points: Array.from({ length: 20 }, (_, i) => ({
          x: 20 + i,
          y: 20 + i * 2,
          p: 0.5,
          t: i * 10
        }))
      };
      if (
        [
          'openInkEditing',
          'openSampleComparison',
          'openDigitAssist',
          'openTidyWriting',
          'openDiagramRecognition'
        ].includes(method)
      ) {
        v.s.doc.elements = [stroke];
        v.selected = new Set([stroke.id]);
      }
      if (method === 'openImageOptions') {
        const image = {
          id: 'image',
          type: 'image',
          layerId: 'ink',
          src: 'data:image/png;base64,AAAA',
          cx: 100,
          cy: 100,
          imageW: 80,
          imageH: 60,
          angle: 0,
          opacity: 1,
          width: 1
        };
        v.s.doc.elements = [image];
        v.selected = new Set([image.id]);
      }
      if (method === 'openConnectorOptions') {
        const line = {
          ...h.ShapeKit.make('arrow', { x: 0, y: 0 }, { x: 100, y: 50 }),
          layerId: 'ink'
        };
        v.s.doc.elements = [line];
        v.selected = new Set([line.id]);
      }
      if (method === 'openRegionEditing') {
        const e = {
          id: 'region',
          type: 'region',
          layerId: 'ink',
          color: '#000000',
          width: 2,
          opacity: 1,
          geometry: [
            [
              [
                [0, 0],
                [100, 0],
                [100, 100],
                [0, 100],
                [0, 0]
              ]
            ]
          ]
        };
        v.s.doc.elements = [e];
        v.selected = new Set([e.id]);
      }
      if (method === 'openVectorNodes') {
        const e = { ...h.VectorOps.toPath(shape), layerId: 'ink' };
        v.s.doc.elements = [e];
        v.selected = new Set([e.id]);
      }
      if (method === 'openPdfImport')
        v.notebook = { file: { path: 'book.json' }, data: { pages: [] } };
      const args = {
        openBrushPanel: ['write'],
        openCalibration: ['write'],
        openPagePanel: [v.pageButton],
        openSelectionActions: [v.modeButtons.select],
        openLayerRowOptions: ['ink', v.layerToggle],
        openLayerDelete: ['ink'],
        openGapDiagnosis: [[shape], new Error('Test')],
        openOverlapPicker: [[shape]],
        openDigitReview: [[]]
      };
      if (method !== 'build') {
        if (!args[method] && v[method].length > 0) {
          results.push({ method, skipped: 'requires arguments' });
          continue;
        }
        await v[method](...(args[method] || []));
      }
      if (method !== 'build' && !v.flyout && !v.radial && !v.layerDockOpen) {
        results.push({ method, notOpened: true });
        continue;
      }
      const buttons = walk(
        method === 'build'
          ? v.root
          : v.settingsShell || v.flyout || v.radial || (v.layerDockOpen ? v.layerSheet : v.root)
      ).filter((n) => n.tagName === 'BUTTON');
      const unbound = buttons
        .filter(
          (b) =>
            !Object.keys(b.handlers).some((k) => ['click', 'pointerdown', 'keydown'].includes(k))
        )
        .map((b) => b.textContent || b.getAttribute('aria-label'));
      results.push({
        method,
        buttons: buttons.length,
        keyboardOnly: buttons.filter(
          (b) => !b.disabled && !b.handlers.click?.length && b.handlers.keydown?.length
        ).length,
        unbound
      });
    } catch (e) {
      errors.push({ method, error: e.message });
    } finally {
      clearTimeout(v.feedbackTimer);
      h.dispose();
    }
  }
  const unbound = results.flatMap((r) =>
    (r.unbound || []).map((label) => ({ method: r.method, label }))
  );
  const report = {
    panelsOpened: results.filter((r) => r.buttons !== undefined).length,
    buttonInstances: results.reduce((n, r) => n + (r.buttons || 0), 0),
    keyboardOnly: results.reduce((n, r) => n + (r.keyboardOnly || 0), 0),
    results,
    errors,
    unbound
  };
  if (process.env.BUTTON_AUDIT_REPORT)
    require('node:fs').writeFileSync(
      process.env.BUTTON_AUDIT_REPORT,
      JSON.stringify(report, null, 2)
    );
  assert.deepEqual(errors, []);
  assert.deepEqual(unbound, []);
  const h = setup();
  try {
    h.view.selected.clear();
    h.view.s.doc.elements = [];
    h.view.openImageOptions();
    assert.equal(h.view.flyout, null);
    h.view.openPagePanel(h.view.pageButton);
    const p = h.view.flyout;
    h.view.openImageOptions();
    assert.equal(h.view.flyout, p);
    assert.equal(
      walk(p).some((n) => n.textContent === 'Substituir imagem…'),
      false
    );
  } finally {
    h.dispose();
  }
  console.log(
    'PASS: ' +
      report.panelsOpened +
      ' panels, ' +
      report.buttonInstances +
      ' button instances bound, image panel stale-selection guard; guarded panels: ' +
      results
        .filter((r) => r.notOpened)
        .map((r) => r.method)
        .join(', ')
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
