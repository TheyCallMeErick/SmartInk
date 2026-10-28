/* Experimental notebooks: a small CAS-protected index, independent editable .smartink pages.
 * PDF.js comes from Obsidian and is loaded only after the user selects an import.
 */
const Notebook = {
  parse(text) {
    if (text.length > 200000) throw new Error('Índice de caderno acima de 200 KB.');
    const d = JSON.parse(text);
    if (
      d.format !== 'smart-ink-book' ||
      d.version !== 1 ||
      typeof d.name !== 'string' ||
      d.name.length > 100 ||
      !Array.isArray(d.pages) ||
      d.pages.length > 100
    )
      throw new Error('Caderno inválido.');
    const seen = new Set();
    for (const p of d.pages) {
      if (
        !p ||
        typeof p.path !== 'string' ||
        !p.path.endsWith('.smartink') ||
        p.path.startsWith('/') ||
        p.path.includes('\\') ||
        p.path.includes(':') ||
        p.path.split('/').includes('..') ||
        typeof p.name !== 'string' ||
        p.name.length > 100 ||
        seen.has(p.path)
      )
        throw new Error('Página de caderno inválida.');
      seen.add(p.path);
    }
    return d;
  },
  reorder(book, from, to) {
    const next = Ink.clone(book);
    if (from < 0 || to < 0 || from >= next.pages.length || to >= next.pages.length) return next;
    const [page] = next.pages.splice(from, 1);
    next.pages.splice(to, 0, page);
    return next;
  }
};
(function installNotebook(View) {
  const P = View.prototype;
  P.loadNotebook = async function (path) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) throw new Error('Caderno não encontrado.');
    const baseline = await this.app.vault.read(file),
      doc = Notebook.parse(baseline);
    this.notebook = { file, baseline, doc, undo: [], redo: [], queue: Promise.resolve() };
    this.plugin.settings.lastNotebook = path;
    this.plugin.settings.notebookPaths = [
      ...new Set([...this.plugin.settings.notebookPaths, path])
    ].slice(-30);
    void this.plugin.savePreferences();
    return this.notebook;
  };
  P.changeNotebook = async function (next, history = true) {
    const book = this.notebook;
    if (!book || book.busy) throw new Error('Aguarde a gravação do caderno.');
    Notebook.parse(JSON.stringify(next));
    book.busy = true;
    const before = book.doc,
      text = JSON.stringify(next, null, 2);
    try {
      await this.app.vault.process(book.file, (current) => {
        if (current !== book.baseline)
          throw new Error('O caderno mudou externamente. Reabra antes de editar.');
        return text;
      });
      book.baseline = text;
      book.doc = next;
      if (history) {
        book.undo.push(before);
        if (book.undo.length > 50) book.undo.shift();
        book.redo = [];
      }
    } finally {
      book.busy = false;
    }
  };
  P.notebookHistory = async function (redo = false) {
    const book = this.notebook,
      from = redo ? book.redo : book.undo,
      to = redo ? book.undo : book.redo;
    if (!from.length) return;
    const before = book.doc,
      next = from.at(-1);
    await this.changeNotebook(next, false);
    from.pop();
    to.push(before);
  };
  P.createNotebook = async function (name) {
    const folder = this.s.file.path.includes('/')
        ? this.s.file.path.slice(0, this.s.file.path.lastIndexOf('/') + 1)
        : '',
      path = folder + 'Caderno-' + Ink.uid() + '.smartink-book.json',
      doc = {
        format: 'smart-ink-book',
        version: 1,
        name: String(name || 'Caderno').slice(0, 100),
        pages: [{ name: this.s.file.basename || 'Página 1', path: this.s.file.path }]
      };
    await this.app.vault.create(path, JSON.stringify(doc, null, 2));
    return this.loadNotebook(path);
  };
  P.addNotebookPage = async function (doc = Ink.fresh(), name = 'Nova página') {
    const book = this.notebook;
    if (!book || book.busy || book.doc.pages.length >= 100)
      throw new Error('Selecione um caderno com menos de 100 páginas.');
    const folder = book.file.path.includes('/')
        ? book.file.path.slice(0, book.file.path.lastIndexOf('/') + 1)
        : '',
      path = folder + 'Pagina-' + Ink.uid() + '.smartink';
    doc.id = Ink.uid();
    const text = Ink.serialize(doc);
    Ink.parse(text);
    await this.app.vault.create(path, text);
    try {
      await this.changeNotebook({
        ...book.doc,
        pages: [...book.doc.pages, { path, name: String(name).slice(0, 100) }]
      });
    } catch (e) {
      throw new Error(e.message + ' A página criada foi preservada em ' + path);
    }
    return path;
  };
  P.openNotebook = async function () {
    const session = this.s;
    if (!session) return;
    this.finish(false);
    const panel = this.makePanel(
      this.pageButton || this.organizeButton,
      'Caderno e páginas · experimental',
      'notebook'
    );
    element(
      panel,
      'p',
      'si-panel-copy',
      'Cada página continua sendo um arquivo Smart Ink editável. O índice apenas organiza a ordem. Remover do caderno preserva o arquivo e permite desfazer.'
    );
    const name = element(panel, 'input');
    name.placeholder = 'Nome do novo caderno';
    button(panel, 'Criar caderno com esta página', async () => {
      try {
        await this.createNotebook(name.value);
        if (this.flyout === panel) this.openNotebook();
      } catch (e) {
        new Notice(e.message);
      }
    });
    const paths = this.plugin.settings.notebookPaths;
    if (paths.length)
      this.choiceField(
        panel,
        'Abrir caderno',
        this.notebook?.file.path || '',
        [['', 'Escolha…'], ...paths.map((path) => [path, path])],
        async (path) => {
          if (!path) return;
          try {
            await this.loadNotebook(path);
            if (this.flyout === panel) this.openNotebook();
          } catch (e) {
            new Notice(e.message);
          }
        }
      );
    const pathInput = element(panel, 'input');
    pathInput.placeholder = 'Pasta/Caderno.smartink-book.json';
    button(panel, 'Abrir pelo caminho', async () => {
      try {
        await this.loadNotebook(pathInput.value);
        if (this.flyout === panel) this.openNotebook();
      } catch (e) {
        new Notice(e.message);
      }
    });
    const book = this.notebook;
    if (!book) return;
    element(panel, 'strong', '', book.doc.name);
    const action = (label, fn) =>
      button(panel, label, async () => {
        try {
          await fn();
          if (this.flyout === panel) this.openNotebook();
        } catch (e) {
          new Notice(e.message);
        }
      });
    action('+ Página em branco', () => this.addNotebookPage());
    action('Adicionar página atual', async () => {
      if (book.doc.pages.some((p) => p.path === session.file.path)) return;
      await this.changeNotebook({
        ...book.doc,
        pages: [
          ...book.doc.pages,
          { path: session.file.path, name: session.file.basename || 'Página' }
        ]
      });
    });
    action('Desfazer ordem / remoção', () => this.notebookHistory(false));
    action('Refazer ordem / remoção', () => this.notebookHistory(true));
    button(panel, 'Importar páginas de PDF…', () => this.openPdfImport());
    button(panel, 'Imprimir caderno / salvar PDF', () => this.printNotebook());
    const list = element(panel, 'div');
    book.doc.pages.forEach((page, index) => {
      const row = element(list, 'div', 'si-book-page'),
        input = element(row, 'input');
      input.value = page.name;
      input.setAttribute('aria-label', 'Nome da página');
      input.addEventListener('change', async () => {
        try {
          await this.changeNotebook({
            ...book.doc,
            pages: book.doc.pages.map((p, i) =>
              i === index ? { ...p, name: input.value.slice(0, 100) || p.name } : p
            )
          });
        } catch (e) {
          new Notice(e.message);
        }
      });
      button(row, 'Abrir', async () => {
        try {
          await this.save();
          if (this.s?.error)
            throw new Error('Resolva o erro de salvamento antes de trocar de página.');
          const file = this.app.vault.getAbstractFileByPath(page.path);
          if (!file) throw new Error('Arquivo da página não encontrado.');
          await this.leaf.openFile(file);
        } catch (e) {
          new Notice(e.message);
        }
      });
      for (const [label, delta] of [
        ['↑', -1],
        ['↓', 1]
      ])
        button(row, label, async () => {
          try {
            await this.changeNotebook(Notebook.reorder(book.doc, index, index + delta));
            this.openNotebook();
          } catch (e) {
            new Notice(e.message);
          }
        });
      button(row, 'Remover do caderno', async () => {
        try {
          await this.changeNotebook({
            ...book.doc,
            pages: book.doc.pages.filter((_, i) => i !== index)
          });
          this.openNotebook();
        } catch (e) {
          new Notice(e.message);
        }
      });
      button(row, 'Ver miniatura', async () => {
        try {
          const file = this.app.vault.getAbstractFileByPath(page.path);
          if (!file) throw new Error('Página não encontrada.');
          const live = await this.plugin.sessions.get(page.path),
            doc = live?.doc || Ink.parse(await this.app.vault.read(file));
          if (this.flyout !== panel) return;
          const thumb = element(row, 'div', 'si-thumbnail');
          thumb.innerHTML = Ink.svg(doc);
        } catch (e) {
          new Notice(e.message);
        }
      });
    });
  };
  P.openPdfImport = function () {
    if (!this.notebook) {
      new Notice('Crie ou abra um caderno primeiro.');
      return;
    }
    const panel = this.makePanel(this.pageButton, 'Importar PDF · experimental', 'pdf-import');
    element(
      panel,
      'p',
      'si-panel-copy',
      'Importa até 10 páginas por operação, uma de cada vez, como fundo bloqueado. As anotações continuam vetoriais. O PDF original não é modificado. Máximo 50 MB; renderização limitada a 1600 px por lado.'
    );
    const files = (this.app.vault.getFiles?.() || []).filter((f) =>
      f.path.toLowerCase().endsWith('.pdf')
    );
    let path = files[0]?.path || '',
      first = 1,
      last = 1;
    this.choiceField(
      panel,
      'PDF do vault',
      path,
      files.map((f) => [f.path, f.path]),
      (v) => (path = v)
    );
    this.numberField(panel, 'Primeira página', 1, 1, 10000, (v) => (first = Math.round(v)));
    this.numberField(panel, 'Última página', 1, 1, 10000, (v) => (last = Math.round(v)));
    const status = element(panel, 'p', 'si-panel-copy');
    const start = button(panel, 'Importar intervalo', async () => {
      start.disabled = true;
      try {
        await this.importPdfPages(path, first, last, (message) => (status.textContent = message));
        status.textContent = 'Importação concluída. Abra as páginas pelo caderno.';
      } catch (e) {
        status.textContent = e.message;
      } finally {
        start.disabled = false;
      }
    });
    button(panel, 'Cancelar importação', () => {
      this.pdfCancelled = true;
      this.pdfRenderTask?.cancel();
    });
  };
  P.importPdfPages = async function (path, first, last, progress = () => {}) {
    if (this.pdfImportBusy) throw new Error('Uma importação já está em andamento.');
    if (typeof loadPdfJs !== 'function')
      throw new Error('Esta versão do Obsidian não disponibiliza PDF.js. Atualize o aplicativo.');
    if (
      !Number.isInteger(first) ||
      !Number.isInteger(last) ||
      first < 1 ||
      last < first ||
      last - first >= 10
    )
      throw new Error('Escolha um intervalo de 1 a 10 páginas.');
    const book = this.notebook;
    if (!book || book.doc.pages.length + last - first + 1 > 100)
      throw new Error('Limite de 100 páginas no caderno.');
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file || !path.toLowerCase().endsWith('.pdf'))
      throw new Error('PDF não encontrado no vault.');
    if (file.stat?.size > 50000000) throw new Error('PDF acima de 50 MB.');
    this.pdfImportBusy = true;
    this.pdfCancelled = false;
    let loading, pdf;
    try {
      const bytes = await this.app.vault.readBinary(file);
      if (bytes.byteLength > 50000000) throw new Error('PDF acima de 50 MB.');
      const lib = await loadPdfJs();
      loading = lib.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false });
      pdf = await loading.promise;
      if (last > pdf.numPages)
        throw new Error('Intervalo excede ' + pdf.numPages + ' páginas do PDF.');
      for (let n = first; n <= last; n++) {
        while (this.active && !this.pdfCancelled && !this.disposed) {
          progress('Aguardando o fim do gesto…');
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        if (this.pdfCancelled || this.notebook !== book || this.disposed)
          throw new Error('Importação cancelada; páginas já criadas foram preservadas.');
        progress('Importando página ' + n + ' de ' + last + '…');
        const page = await pdf.getPage(n),
          base = page.getViewport({ scale: 1 }),
          scale = Math.min(1600 / base.width, 1600 / base.height, 2),
          viewport = page.getViewport({ scale }),
          canvas = this.root.ownerDocument.createElement('canvas');
        canvas.width = Math.max(1, Math.ceil(viewport.width));
        canvas.height = Math.max(1, Math.ceil(viewport.height));
        this.pdfRenderTask = page.render({
          canvasContext: canvas.getContext('2d'),
          viewport,
          background: '#ffffff'
        });
        await this.pdfRenderTask.promise;
        this.pdfRenderTask = null;
        if (this.pdfCancelled || this.notebook !== book || this.disposed)
          throw new Error('Importação cancelada.');
        const doc = Ink.fresh(),
          pageScale = Math.min(96 / 72, 1600 / Math.max(base.width, base.height)),
          w = Math.max(1, base.width * pageScale),
          h = Math.max(1, base.height * pageScale);
        doc.width = Math.max(100, w);
        doc.height = Math.max(100, h);
        doc.background = 'plain';
        doc.pdfSource = { path, page: n };
        doc.elements = [
          {
            id: Ink.uid(),
            type: 'image',
            src: canvas.toDataURL('image/png'),
            cx: doc.width / 2,
            cy: doc.height / 2,
            imageW: w,
            imageH: h,
            angle: 0,
            color: '#ffffff',
            width: 1,
            opacity: 1,
            layerId: 'background',
            locked: true
          }
        ];
        await this.addNotebookPage(doc, (file.basename || 'PDF') + ' · ' + n);
        canvas.width = canvas.height = 1;
        page.cleanup?.();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } finally {
      this.pdfImportBusy = false;
      this.pdfRenderTask = null;
      if (pdf) await pdf.destroy();
      else if (loading) await loading.destroy();
    }
  };
  P.printNotebook = async function () {
    const book = this.notebook;
    if (!book) return;
    try {
      await this.save();
      if (this.s?.error) throw new Error('Resolva o erro de salvamento antes de imprimir.');
      const pages = [];
      let bytes = 0;
      for (const page of book.doc.pages) {
        if (pages.length >= 100) throw new Error('Limite de 100 páginas.');
        const file = this.app.vault.getAbstractFileByPath(page.path);
        if (!file) throw new Error('Página ausente: ' + page.path);
        const live = await this.plugin.sessions.get(page.path),
          doc = live?.doc || Ink.parse(await this.app.vault.read(file)),
          bounds = { x: 0, y: 0, w: doc.width, h: doc.height },
          svg = Ink.svg(doc, '', { paper: true, bounds });
        bytes += svg.length;
        if (bytes > 30000000)
          throw new Error('Caderno acima de 30 MB para impressão. Exporte páginas separadamente.');
        pages.push({ svg, width: doc.width, height: doc.height });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      this.printFrame?.remove();
      const frame = element(this.root, 'iframe');
      frame.className = 'si-print-frame';
      this.printFrame = frame;
      frame.title = 'Imprimir caderno Smart Ink';
      frame.onload = () => {
        frame.contentWindow.focus();
        frame.contentWindow.print();
      };
      frame.srcdoc =
        '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}.page{break-after:page;overflow:hidden}.page:last-child{break-after:auto}svg{display:block;width:100%;height:100%}' +
        pages
          .map(
            (p, i) =>
              '@page ink' +
              i +
              '{size:' +
              (p.width / 96) * 25.4 +
              'mm ' +
              (p.height / 96) * 25.4 +
              'mm;margin:0}.ink' +
              i +
              '{page:ink' +
              i +
              ';width:' +
              (p.width / 96) * 25.4 +
              'mm;height:' +
              (p.height / 96) * 25.4 +
              'mm}'
          )
          .join('') +
        '</style></head><body>' +
        pages.map((p, i) => '<section class="page ink' + i + '">' + p.svg + '</section>').join('') +
        '</body></html>';
      this.cleanups.push(() => frame.remove());
    } catch (e) {
      new Notice(e.message);
    }
  };
  const close = P.onClose;
  P.onClose = async function (...args) {
    this.pdfCancelled = true;
    this.pdfRenderTask?.cancel();
    return close.apply(this, args);
  };
})(InkView);
