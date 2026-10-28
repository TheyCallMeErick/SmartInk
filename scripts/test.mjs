import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const test of [
  'smoke.cjs',
  'ux.cjs',
  'autosave.cjs',
  'stroke-start.cjs',
  'smoothing.cjs',
  'source-build.cjs',
  'evolution.cjs',
  'notebook.cjs',
  'shapes-and-ink.cjs',
  'vector-tools.cjs',
  'refinement.cjs',
  'canvas-usability.cjs',
  'selection-workflow.cjs',
  'selection-performance.cjs',
  'fluid-workflow.cjs',
  'unified-ux.cjs',
  'shape-designer.cjs',
  'ux-polish.cjs',
  'audit-buttons.cjs',
  'settings-modal.cjs',
  'ux-guidance.cjs',
  'refinement-027.cjs',
  'i18n.cjs'
]) {
  const result = spawnSync(process.execPath, [join(root, 'tests', test)], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('Todos os testes headless passaram.');
