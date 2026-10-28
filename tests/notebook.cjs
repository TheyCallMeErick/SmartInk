'use strict';
const assert = require('node:assert/strict'),
  { setup } = require('./harness.cjs');
let rendered = 0,
  destroyed = 0,
  active = 0,
  maxActive = 0;
const pdfFactory = async () => ({
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 3,
      getPage: async () => ({
        getViewport: ({ scale }) => ({ width: 600 * scale, height: 800 * scale }),
        render: () => {
          active++;
          maxActive = Math.max(maxActive, active);
          rendered++;
          return { promise: Promise.resolve().then(() => active--) };
        },
        cleanup() {}
      }),
      destroy: async () => destroyed++
    })
  })
});
const h = setup(pdfFactory),
  { view: v, plugin, Ink, Notebook } = h;
const disk = new Map([
  ['notes.smartink', Ink.serialize(v.s.doc)],
  ['reference.pdf', 'PDF']
]);
const file = (path) =>
  disk.has(path) ? { path, basename: path.split('.')[0], stat: { size: 100 } } : null;
plugin.sessions = new Map();
plugin.app.vault = {
  getAbstractFileByPath: file,
  read: async (f) => disk.get(f.path),
  readBinary: async () => new ArrayBuffer(4),
  create: async (path, text) => {
    assert.ok(!disk.has(path));
    disk.set(path, text);
    return file(path);
  },
  process: async (f, fn) => disk.set(f.path, fn(disk.get(f.path)))
};
(async () => {
  try {
    await v.createNotebook('Caderno teste');
    const book = v.notebook,
      indexPath = book.file.path;
    assert.equal(book.doc.pages.length, 1);
    const pagePath = await v.addNotebookPage();
    assert.equal(book.doc.pages.length, 2);
    assert.ok(Ink.parse(disk.get(pagePath)));
    await v.changeNotebook(Notebook.reorder(book.doc, 0, 1));
    assert.equal(book.doc.pages[0].path, pagePath);
    await v.notebookHistory();
    assert.equal(book.doc.pages[0].path, 'notes.smartink');
    await v.notebookHistory(true);
    assert.equal(book.doc.pages[0].path, pagePath);
    await v.changeNotebook({ ...book.doc, pages: book.doc.pages.slice(1) });
    assert.ok(disk.has(pagePath), 'Removing from index preserves page');
    await v.notebookHistory();
    assert.equal(book.doc.pages.length, 2);
    const baseline = book.baseline;
    disk.set(indexPath, baseline + ' ');
    await assert.rejects(v.changeNotebook({ ...book.doc, name: 'conflict' }), /externamente/);
    assert.equal(book.doc.name, 'Caderno teste');
    disk.set(indexPath, baseline);
    assert.throws(() =>
      Notebook.parse(
        JSON.stringify({ ...book.doc, pages: [{ name: 'bad', path: '../escape.smartink' }] })
      )
    );
    await assert.rejects(v.importPdfPages('reference.pdf', 1, 11), /1 a 10/);
    assert.equal(rendered, 0);
    const before = book.doc.pages.length;
    await v.importPdfPages('reference.pdf', 1, 2);
    assert.equal(book.doc.pages.length, before + 2);
    assert.equal(rendered, 2);
    assert.equal(maxActive, 1);
    assert.equal(destroyed, 1);
    assert.equal(v.pdfImportBusy, false);
    const imported = Ink.parse(disk.get(book.doc.pages.at(-1).path));
    assert.equal(imported.elements[0].type, 'image');
    assert.equal(imported.elements[0].layerId, 'background');
    assert.equal(imported.elements[0].locked, true);
    assert.ok(Math.abs(imported.width / imported.height - 0.75) < 1e-10);
    assert.equal(v.s.doc.elements.length, 0, 'Import does not replace current ink');
    await assert.rejects(v.importPdfPages('reference.pdf', 3, 4), /excede/);
    assert.equal(destroyed, 2);
    assert.equal(v.pdfImportBusy, false);
    let opened;
    plugin.saveSession = async () => {};
    v.leaf = { openFile: async (f) => (opened = f.path) };
    await v.goNotebookPage(0);
    assert.equal(opened, book.doc.pages[0].path);
    v.s.error = 'conflict';
    opened = null;
    await v.goNotebookPage(1);
    assert.equal(opened, null);
    v.s.error = null;
    await v.printNotebook();
    assert.ok(v.printFrame);
    assert.match(v.printFrame.srcdoc, /@page ink0/);
    assert.match(v.printFrame.srcdoc, /page ink0/);
    assert.ok(v.pageNavigation);
    console.log(
      'PASS: experimental notebooks create/reorder/remove/history/CAS and PDF limits, sequential mocked rendering, editable pages, cleanup'
    );
  } finally {
    h.dispose();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
