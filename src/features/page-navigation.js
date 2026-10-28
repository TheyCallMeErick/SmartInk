/* Lightweight notebook navigation; pages remain individual editable documents. */
(function installPageNavigation(View) {
  const P = View.prototype,
    wrap = (name, fn) => {
      const old = P[name];
      P[name] = function (...args) {
        return fn.call(this, old, ...args);
      };
    };
  P.goNotebookPage = async function (index) {
    const book = this.notebook,
      page = book?.doc.pages[index];
    if (!page || this.pageNavigating) return;
    this.pageNavigating = true;
    try {
      this.finish(false);
      await this.save();
      if (this.s?.error) throw new Error('Resolva o erro de salvamento antes de trocar de página.');
      const file = this.app.vault.getAbstractFileByPath(page.path);
      if (!file) throw new Error('Arquivo da página ausente.');
      await this.leaf.openFile(file);
    } catch (e) {
      new Notice(e.message);
    } finally {
      this.pageNavigating = false;
      this.renderPageNavigation();
    }
  };
  P.renderPageNavigation = function () {
    if (!this.root || !this.s) return;
    this.pageNavigation?.remove();
    this.pageNavigation = null;
    const book = this.notebook;
    if (!book) return;
    const index = book.doc.pages.findIndex((p) => p.path === this.s.file.path);
    if (index < 0) return;
    const bar = element(this.root, 'div', 'si-page-navigation');
    this.pageNavigation = bar;
    bar.setAttribute('aria-label', 'Navegação de páginas');
    const prev = button(bar, '‹', () => this.goNotebookPage(index - 1));
    prev.setAttribute('aria-label', 'Página anterior');
    prev.disabled = index === 0 || this.pageNavigating;
    button(bar, index + 1 + ' / ' + book.doc.pages.length, () => this.openNotebook());
    const next = button(bar, '›', () => this.goNotebookPage(index + 1));
    next.setAttribute('aria-label', 'Próxima página');
    next.disabled = index === book.doc.pages.length - 1 || this.pageNavigating;
    button(bar, 'Ajustar página', () =>
      this.fitRegion({ x: 0, y: 0, w: this.s.doc.width, h: this.s.doc.height })
    );
    if (this.s.doc.pdfSource)
      button(bar, 'PDF original', () => {
        const f = this.app.vault.getAbstractFileByPath(this.s.doc.pdfSource.path);
        if (f) void this.app.workspace.getLeaf(true).openFile(f);
      });
  };
  wrap('loadNotebook', async function (old, ...args) {
    const result = await old.apply(this, args);
    this.renderPageNavigation();
    return result;
  });
  wrap('changeNotebook', async function (old, ...args) {
    const result = await old.apply(this, args);
    this.renderPageNavigation();
    return result;
  });
  wrap('onLoadFile', async function (old, ...args) {
    const result = await old.apply(this, args);
    this.renderPageNavigation();
    if (this.s?.doc.pdfSource)
      this.fitRegion({ x: 0, y: 0, w: this.s.doc.width, h: this.s.doc.height });
    return result;
  });
  wrap('build', function (old, ...args) {
    const result = old.apply(this, args);
    this.listen(this.root, 'keydown', (e) => {
      if (
        e.target !== this.overlay ||
        !e.altKey ||
        !['PageUp', 'PageDown'].includes(e.code) ||
        !this.notebook
      )
        return;
      e.preventDefault();
      const index = this.notebook.doc.pages.findIndex((p) => p.path === this.s?.file.path);
      if (index >= 0) void this.goNotebookPage(index + (e.code === 'PageDown' ? 1 : -1));
    });
    return result;
  });
  for (const name of ['onUnloadFile', 'onClose'])
    wrap(name, function (old, ...args) {
      this.pageNavigation?.remove();
      this.pageNavigation = null;
      return old.apply(this, args);
    });
})(InkView);
