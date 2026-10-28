/* Floating contextual controls and clipboard images. No work on the pen hot path. */
(function installCanvasUsability(View) {
  const P = View.prototype,
    wrap = (name, fn) => {
      const old = P[name];
      P[name] = function (...args) {
        return fn.call(this, old, ...args);
      };
    };
  wrap('build', function (old, ...args) {
    const result = old.apply(this, args);
    // A child of the viewport, never a flex/grid row of the page.
    this.viewport.appendChild(this.suggestion);
    this.suggestion.setAttribute('role', 'group');
    this.suggestion.setAttribute('aria-label', 'Ações contextuais do desenho');
    this.listen(this.root, 'paste', (e) => {
      for (let node = e.target; node && node !== this.root; node = node.parentNode) {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName) || node.isContentEditable)
          return;
      }
      if (this.flyout?.contains(e.target) || !this.s || !this.editable()) return;
      const data = e.clipboardData;
      if (!data) return;
      const items = Array.from(data.items || []),
        files = items
          .filter((i) => i.kind === 'file')
          .map((i) => i.getAsFile())
          .filter(Boolean);
      if (!files.length) files.push(...Array.from(data.files || []));
      const images = files.filter((f) => f.type.startsWith('image/'));
      if (!images.length) return;
      e.preventDefault();
      e.stopPropagation();
      this.clipboardPromise = this.pasteImages(images);
    });
    return result;
  });
  wrap('updateSuggestion', function (old, ...args) {
    const result = old.apply(this, args);
    this.selectionExtraActions = [];
    if (this.suggestion && this.mode === 'select' && !this.pending) {
      if (!this.s || !this.selectedElements().length) {
        this.suggestion.hidden = true;
        return result;
      }
      // Feature extensions append their actions after the compact group. Keep them in More.
      for (const child of Array.from(this.suggestion.children)) {
        if (child.tagName === 'BUTTON') {
          this.selectionExtraActions.push(child);
          child.remove();
        }
      }
    }
    return result;
  });
  wrap('openSelectionActions', function (old, ...args) {
    const extra = this.selectionExtraActions?.slice() || [],
      result = old.apply(this, args);
    if (this.flyout)
      for (const b of extra) {
        b.className = 'si-menu-action';
        this.flyout.appendChild(b);
      }
    return result;
  });
  // Put explicit preview decisions together; keyboard activation is scoped to this panel.
  wrap('previewInkOperation', function (old, ...args) {
    const result = old.apply(this, args),
      panel = this.flyout;
    if (this.panelKind !== 'ink-preview' || !panel) return result;
    const buttons = Array.from(panel.children).filter((n) => n.tagName === 'BUTTON'),
      apply = buttons.find((b) => I18n.canonical(b) === 'Aplicar'),
      cancel = buttons.find((b) => I18n.canonical(b) === 'Cancelar');
    if (apply && cancel) {
      const actions = element(panel, 'div', 'si-confirm-actions');
      actions.appendChild(cancel);
      actions.appendChild(apply);
      apply.textContent = 'Aplicar alterações';
      apply.setAttribute('aria-keyshortcuts', 'Control+Enter Meta+Enter');
      for (const b of [apply, cancel])
        b.addEventListener('click', () => {
          if (!this.flyout) this.overlay.focus();
        });
      element(panel, 'small', 'si-muted', 'Ctrl/⌘ + Enter aplica · Esc cancela');
      panel.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.repeat && !e.isComposing) {
          e.preventDefault();
          e.stopPropagation();
          if (!apply.disabled && this.flyout === panel) apply.click();
        }
      });
    }
    return result;
  });
  P.decodePastedImage = function (file) {
    return new Promise((resolve, reject) => {
      const reader = new this.win.FileReader();
      reader.onerror = () => reject(new Error('Não foi possível ler a imagem copiada.'));
      reader.onabort = () => reject(new Error('Leitura da imagem cancelada.'));
      reader.onload = () => {
        const image = new this.win.Image();
        image.onerror = () => reject(new Error('Não foi possível decodificar a imagem copiada.'));
        image.onload = () => {
          try {
            const w = image.naturalWidth,
              h = image.naturalHeight;
            if (!w || !h || w * h > 40000000)
              throw new Error('Imagem inválida ou acima de 40 milhões de pixels.');
            resolve(this.prepareImage(image, String(reader.result)));
          } catch (error) {
            reject(error);
          }
        };
        image.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  };
  P.pasteImages = async function (files, options = {}) {
    if (this.pasteBusy) {
      new Notice('Aguarde a colagem em andamento.');
      return false;
    }
    try {
      if (!files.length || files.length > 8) throw new Error('Cole até 8 imagens de cada vez.');
      if (
        files.some(
          (f) =>
            !['image/png', 'image/jpeg', 'image/webp'].includes(f.type) || f.size > 8 * 1024 * 1024
        ) ||
        files.reduce((n, f) => n + f.size, 0) > 16 * 1024 * 1024
      )
        throw new Error('Use PNG, JPEG ou WebP: até 8 MB por imagem e 16 MB por colagem.');
      if (!this.s || !this.editable()) return false;
      const layer = this.activeLayer();
      if (layer.locked || !layer.visible)
        throw new Error('Escolha uma camada visível e desbloqueada.');
      this.finish(true);
      this.pasteBusy = true;
      const session = this.s,
        epoch = this.pasteEpoch || 0,
        size = this.size(),
        zoom = this.zoom,
        center =
          options.center || Ink.screenToWorld({ x: size.w / 2, y: size.h / 2 }, this.camera, zoom),
        prepared = [];
      // Decode sequentially to bound peak memory; insert all images as a single undo step.
      for (const file of files) prepared.push(await this.decodePastedImage(file));
      if (this.s !== session || (this.pasteEpoch || 0) !== epoch)
        throw new Error('A página mudou; cole a imagem novamente.');
      const current = session.doc.layers.find((l) => l.id === layer.id);
      if (!current || current.locked || !current.visible || !this.editable())
        throw new Error('A camada mudou ou foi bloqueada; cole novamente.');
      this.finish(true);
      const images = prepared.map((p, i) => {
        const scale = Math.min(1, (size.w * 0.8) / (p.w * zoom), (size.h * 0.8) / (p.h * zoom));
        return {
          id: Ink.uid(),
          type: 'image',
          src: p.src,
          cx: center.x + (i * 24) / zoom,
          cy: center.y + (i * 24) / zoom,
          imageW: Math.max(1, p.w * scale),
          imageH: Math.max(1, p.h * scale),
          angle: 0,
          width: 1,
          color: '#ffffff',
          opacity: 1,
          layerId: layer.id
        };
      });
      const after = [...session.doc.elements, ...images];
      Ink.parse(Ink.serialize({ ...session.doc, elements: after }));
      this.closePanel();
      this.nextHistoryLabel = images.length === 1 ? 'Colar imagem' : 'Colar imagens';
      this.commitElements(after);
      this.clearGroup();
      this.selected = new Set(images.map((e) => e.id));
      this.selectTool('select', false, false);
      this.updateSuggestion();
      this.requestRender();
      this.overlay.focus();
      this.showCanvasFeedback(
        images.length === 1 ? 'Imagem inserida' : images.length + ' imagens inseridas',
        true
      );
      return true;
    } catch (error) {
      new Notice(error.message || 'Não foi possível colar a imagem.');
      return false;
    } finally {
      this.pasteBusy = false;
    }
  };
  for (const name of ['onClose', 'onUnloadFile'])
    wrap(name, function (old, ...args) {
      this.pasteEpoch = (this.pasteEpoch || 0) + 1;
      return old.apply(this, args);
    });
})(InkView);
