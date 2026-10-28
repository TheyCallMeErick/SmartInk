import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { compile, root } from './build.mjs';

async function walk(dir) {
  const list = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of list) {
    const path = join(dir, entry.name);
    files.push(...(entry.isDirectory() ? await walk(path) : [path]));
  }
  return files;
}

const sourceFiles = [
  ...(await walk(join(root, 'src'))),
  ...(await walk(join(root, 'scripts'))),
  ...(await walk(join(root, 'tests')))
].filter((p) => /\.(?:js|mjs|cjs)$/.test(p));
for (const filename of sourceFiles) {
  const r = spawnSync(process.execPath, ['--check', filename], { encoding: 'utf8' });
  if (r.status !== 0)
    throw new Error(`Erro de sintaxe em ${relative(root, filename)}:\n${r.stderr}`);
}
const { js, css } = await compile({ write: false });
for (const [name, expected] of [
  ['main.js', js],
  ['styles.css', css]
]) {
  const actual = await readFile(join(root, name), 'utf8');
  if (actual !== expected) throw new Error(`${name} desatualizado. Execute: npm run build`);
}
const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (manifest.version !== pkg.version)
  throw new Error('Versão do package.json e manifest.json diverge.');
if (manifest.id !== 'smart-ink' || !manifest.isDesktopOnly)
  throw new Error('Manifesto inesperado.');
console.log(
  `PASS: sintaxe de ${sourceFiles.length} fontes, build reproduzível, manifesto e versão consistentes.`
);
