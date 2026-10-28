/**
 * Smart Ink: deterministic, dependency-free Obsidian plugin build.
 *
 * We did not receive the original unbundled source from the upstream project.
 * The code from the distributed main.js was split into editable modules under
 * src/ in dependency order. Concatenation intentionally preserves the common
 * lexical scope so existing classes and shared globals keep working.
 *
 * External packages bundled into src/vendor are kept separate and accompanied
 * by THIRD-PARTY-NOTICES.txt; do not silently relicense them.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const javascriptModules = Object.freeze([
  'src/vendor/perfect-freehand.bundle.js',
  'src/core/ink-engine.js',
  'src/core/geometry.js',
  'src/core/document.js',
  'src/core/brushes.js',
  'src/core/i18n.js',
  'src/vendor/clipper.bundle.js',
  'src/core/visibility.js',
  'src/core/workflow.js',
  'src/core/shape-kit.js',
  'src/core/vector-ops.js',
  'src/core/refinement.js',
  'src/core/digit-assist.js',
  'src/features/legacy-features.js',
  'src/plugin/index.js',
  'src/features/quality-of-life.js',
  'src/features/evolution.js',
  'src/features/notebook.js',
  'src/features/shapes-and-ink.js',
  'src/features/page-navigation.js',
  'src/features/vector-tools.js',
  'src/features/refinement-ui.js',
  'src/features/digit-ui.js',
  'src/features/temporary-tools.js',
  'src/features/canvas-usability.js',
  'src/features/selection-workflow.js',
  'src/features/selection-performance.js',
  'src/features/fluid-workflow.js',
  'src/features/unified-ux.js',
  'src/features/shape-designer.js',
  'src/features/ux-polish.js',
  'src/features/settings-modal.js',
  'src/features/ux-guidance.js',
  'src/features/settings-catalog.js',
  'src/features/usability-refinement.js',
  'src/features/localization.js'
]);
export const cssModules = Object.freeze([
  'src/styles/base.css',
  'src/styles/quality-of-life.css',
  'src/styles/evolution.css',
  'src/styles/shapes-and-ink.css',
  'src/styles/canvas-usability.css',
  'src/styles/selection-workflow.css',
  'src/styles/fluid-workflow.css',
  'src/styles/unified-ux.css',
  'src/styles/shape-designer.css',
  'src/styles/ux-polish.css',
  'src/styles/settings-modal.css',
  'src/styles/ux-guidance.css',
  'src/styles/usability-refinement.css'
]);

export async function compile({ write = true } = {}) {
  const workerParts = [
    'src/vendor/perfect-freehand.bundle.js',
    'src/core/ink-engine.js',
    'src/core/geometry.js',
    'src/core/document.js',
    'src/vendor/clipper.bundle.js',
    'src/core/visibility.js',
    'src/core/workflow.js',
    'src/core/shape-kit.js',
    'src/core/vector-ops.js',
    'src/core/refinement.js'
  ];
  const workerSource =
    (await Promise.all(workerParts.map((p) => readFile(join(root, p), 'utf8')))).join('') +
    '\nself.onmessage=event=>{try{self.postMessage({result:Refinement.run(event.data.op,event.data.args)});}catch(error){self.postMessage({error:error.message});}};';
  const js =
    '/* Smart Ink 0.27.0 — editable source build */\n' +
    (await Promise.all(javascriptModules.map((p) => readFile(join(root, p), 'utf8')))).join('') +
    '\nconst SMART_INK_WORKER_SOURCE=' +
    JSON.stringify(workerSource) +
    ';\n';
  const css = (await Promise.all(cssModules.map((p) => readFile(join(root, p), 'utf8')))).join('');
  if (!/module\.exports\s*=\s*SmartInkPlugin\s*;/.test(js)) {
    throw new Error('Export principal do plugin não encontrado.');
  }
  if (!js.includes('installQualityOfLife')) {
    throw new Error('Camada de melhorias UX não encontrada.');
  }
  if (write) {
    await Promise.all([
      writeFile(join(root, 'main.js'), js, 'utf8'),
      writeFile(join(root, 'styles.css'), css, 'utf8')
    ]);
    console.log(
      `Build concluído: main.js (${js.length} caracteres), styles.css (${css.length} caracteres).`
    );
  }
  return { js, css };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await compile();
}
