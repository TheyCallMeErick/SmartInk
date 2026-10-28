import { watch } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from './build.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let timer;
await compile();
async function folders(base) {
  return [
    base,
    ...(
      await Promise.all(
        (await readdir(base, { withFileTypes: true }))
          .filter((d) => d.isDirectory())
          .map((d) => folders(join(base, d.name)))
      )
    ).flat()
  ];
}
for (const dir of await folders(join(root, 'src'))) {
  watch(dir, (type, file) => {
    if (!file || !/\.(?:js|css)$/.test(String(file))) return;
    clearTimeout(timer);
    timer = setTimeout(() => compile().catch((e) => console.error(e)), 120);
  });
}
console.log('Observando alterações em src/. Recarregue o Obsidian após o build. Ctrl+C para sair.');
