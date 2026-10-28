/** Build a ZIP distributable using only Node built-ins (portable, no `zip` binary). */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { deflateRawSync } from 'node:zlib';
import { join } from 'node:path';
import { root, compile } from './build.mjs';

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
function crc32(input) {
  let crc = 0xffffffff;
  for (const c of input) crc = crcTable[(crc ^ c) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function createZip(entries) {
  const records = [];
  const directory = [];
  let offset = 0;
  for (const { name, raw } of entries) {
    const filename = Buffer.from(name, 'utf8');
    const compressed = deflateRawSync(raw, { level: 9 });
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // Local file header
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // Deflate
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(33, 12); // 1980-01-01
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(filename.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(33, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    records.push(local, filename, compressed);
    directory.push(central, filename);
    offset += local.length + filename.length + compressed.length;
  }
  const dirBuffer = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dirBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...records, dirBuffer, end]);
}
await compile();
const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
const names = ['manifest.json', 'main.js', 'styles.css', 'THIRD-PARTY-NOTICES.txt'];
const entries = await Promise.all(
  names.map(async (filename) => ({
    name: 'smart-ink/' + filename,
    raw: await readFile(join(root, filename))
  }))
);
const zip = createZip(entries);
const output = join(root, 'releases', `smart-ink-${manifest.version}.zip`);
await mkdir(join(root, 'releases'), { recursive: true });
await writeFile(output, zip);
console.log(`Plugin empacotado: ${output} (${zip.length} bytes).`);
