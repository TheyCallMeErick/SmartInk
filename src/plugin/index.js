'use strict';
const {
  Plugin,
  FileView,
  TFile,
  Notice: ObsidianNotice,
  PluginSettingTab,
  Setting,
  normalizePath,
  MarkdownRenderChild,
  loadPdfJs
} = require('obsidian');

class Notice extends ObsidianNotice {
  constructor(message, ...args) {
    super(typeof message === 'string' ? I18n.t(message) : message, ...args);
  }
}
const VIEW = 'smart-ink-view';
const SAVE_IDLE_MS = 5000; // Reset after every committed document edit; no vault writes during active drawing.
const element = (parent, tag, cls, text) => {
  const e = parent.ownerDocument.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  parent.appendChild(e);
  return e;
};
const button = (parent, text, action) => {
  const b = element(parent, 'button', '', text);
  b.type = 'button';
  if (/^(Aplicar|Confirmar|Concluir)(?: |$)/.test(text))
    b.setAttribute('data-si-action', 'confirm');
  if (/^(Cancelar|Manter desenho)/.test(text)) b.setAttribute('data-si-action', 'cancel');
  if (action)
    b.addEventListener('click', function (event) {
      if (b.dataset.siBusy === 'true') return;
      const result = action.call(this, event);
      if (result && typeof result.then === 'function') {
        const owned = !b.disabled;
        b.dataset.siBusy = 'true';
        b.setAttribute('aria-busy', 'true');
        if (owned) b.disabled = true;
        return Promise.resolve(result)
          .catch((error) => {
            new Notice('Não foi possível concluir: ' + (error?.message || 'tente novamente.'));
          })
          .finally(() => {
            b.dataset.siBusy = 'false';
            b.setAttribute('aria-busy', 'false');
            if (owned) b.disabled = false;
          });
      }
      return result;
    });
  return b;
};

class SmartInkPlugin extends Plugin {
  async onload() {
    this.settings = Brushes.settings(await this.loadData());
    I18n.locale = I18n.language(
      this.settings.uiLanguage,
      globalThis.document?.documentElement?.lang || globalThis.navigator?.language || 'pt-BR'
    );
    this.sessions = new Map();
    this.backupTail = Promise.resolve();
    this.renameTail = Promise.resolve();
    this.preferenceTail = Promise.resolve();
    this.registerView(VIEW, (leaf) => new InkView(leaf, this));
    this.registerExtensions(['smartink'], VIEW);
    this.registerMarkdownCodeBlockProcessor('smartink', (source, el, ctx) => {
      ctx.addChild(new InkEmbed(el, this, source.trim(), ctx.sourcePath));
    });
    this.addRibbonIcon('pen-tool', 'Smart Ink: nova página', () => this.createPage());
    this.addCommand({
      id: 'new-page',
      name: I18n.t('Nova página de escrita'),
      callback: () => this.createPage()
    });
    this.addCommand({
      id: 'save-page',
      name: I18n.t('Salvar página atual'),
      checkCallback: (checking) => {
        const v = this.app.workspace.getActiveViewOfType(InkView);
        if (!v) return false;
        if (!checking) v.save();
        return true;
      }
    });
    this.addSettingTab(new InkSettings(this.app, this));
    this.registerEvent(
      this.app.vault.on('rename', (file, old) => {
        const value = this.sessions.get(old);
        if (value) {
          this.sessions.delete(old);
          this.sessions.set(file.path, value);
          Promise.resolve(value).then((s) => (s.file = file));
        }
        this.renameTail = this.renameTail
          .then(() => this.rewriteReferences(old, file.path))
          .catch((e) => new Notice('Não foi possível atualizar referências: ' + e.message));
      })
    );
  }
  savePreferences() {
    const snapshot = Ink.clone(this.settings),
      epoch = (this.preferenceEpoch = (this.preferenceEpoch || 0) + 1);
    this.preferenceStatus = 'Salvando…';
    this.preferenceObservers?.forEach((fn) => fn(this.preferenceStatus));
    this.preferenceTail = this.preferenceTail.catch(() => {}).then(() => this.saveData(snapshot));
    this.preferenceTail.catch(
      (e) => new Notice('Não foi possível salvar as preferências do pincel: ' + e.message)
    );
    this.preferenceTail.then(
      () => {
        if (this.preferenceEpoch === epoch) {
          this.preferenceStatus = 'Salvo';
          this.preferenceObservers?.forEach((fn) => fn(this.preferenceStatus));
        }
      },
      () => {
        if (this.preferenceEpoch === epoch) {
          this.preferenceStatus = 'Não foi possível salvar';
          this.preferenceObservers?.forEach((fn) => fn(this.preferenceStatus));
        }
      }
    );
    return this.preferenceTail;
  }
  async createPage() {
    try {
      const folder = normalizePath(this.settings.folder || 'Smart Ink');
      let path = '';
      for (const part of folder.split('/').filter(Boolean)) {
        path = path ? path + '/' + part : part;
        if (!this.app.vault.getAbstractFileByPath(path)) await this.app.vault.createFolder(path);
      }
      const name = 'Página ' + new Date().toISOString().replace(/[:.]/g, '-');
      const file = await this.app.vault.create(
        folder + '/' + name + '.smartink',
        Ink.serialize(Ink.fresh())
      );
      await this.app.workspace.getLeaf(true).openFile(file);
    } catch (e) {
      new Notice('Não foi possível criar a página: ' + e.message);
    }
  }
  async session(file) {
    // A promise prevents two simultaneous openings from creating independent editors.
    if (this.sessions.has(file.path)) return await this.sessions.get(file.path);
    const loading = (async () => {
      const baseline = await this.app.vault.read(file),
        doc = Ink.parse(baseline);
      const s = {
        file,
        doc,
        history: new Ink.History(),
        listeners: new Set(),
        revision: 0,
        savedRevision: 0,
        error: null
      };
      s.queue = new Ink.SaveQueue(baseline, async (expected, next) => {
        await this.app.vault.process(s.file, (current) => {
          if (current !== expected)
            throw new Error(
              'O arquivo mudou fora deste editor. Sua versão será preservada em uma cópia.'
            );
          return next;
        });
      });
      s.notify = () => s.listeners.forEach((fn) => fn());
      return s;
    })();
    this.sessions.set(file.path, loading);
    try {
      const s = await loading;
      this.sessions.set(file.path, s);
      return s;
    } catch (e) {
      this.sessions.delete(file.path);
      throw e;
    }
  }
  scheduleSessionSave(s) {
    if (s.saveTimer) clearTimeout(s.saveTimer);
    s.saveTimer = setTimeout(() => {
      s.saveTimer = null;
      void this.saveSession(s);
    }, SAVE_IDLE_MS);
    s.notify();
  }
  cancelScheduledSave(s) {
    if (s.saveTimer) {
      clearTimeout(s.saveTimer);
      s.saveTimer = null;
    }
  }
  async saveSession(s) {
    this.cancelScheduledSave(s);
    if (s.revision <= s.savedRevision && !s.error) return;
    const rev = s.revision,
      text = Ink.serialize(s.doc);
    s.saving = (s.saving || 0) + 1;
    s.notify();
    try {
      const snapshot = Ink.parse(text);
      await s.queue.save(text);
      s.savedRevision = Math.max(s.savedRevision, rev);
      s.error = null;
      s.notify();
      void this.backup(s, snapshot, false, rev);
    } catch (e) {
      s.error = e.message;
      s.notify();
      if (!s.recoveryPromise) {
        // Freeze mutations on failure. Preserve the latest in-memory revision, not an older queued snapshot.
        const recoveryText = Ink.serialize(s.doc),
          base = s.file.path.replace(/\.smartink$/, '');
        s.recoveryPromise = this.app.vault
          .create(base + '-recuperado-' + Ink.uid() + '.smartink', recoveryText)
          .then((f) => {
            s.recoveryPath = f.path;
            s.notify();
            new Notice('Smart Ink: alterações preservadas em ' + f.path, 12000);
          })
          .catch((err) => {
            s.recoveryPromise = null;
            s.recoveryFailed = true;
            s.notify();
            new Notice('Falha ao salvar: ' + err.message + '. Use Baixar cópia JSON.', 15000);
          });
      }
      await s.recoveryPromise;
    } finally {
      s.saving = Math.max(0, (s.saving || 1) - 1);
      s.notify();
    }
  }
  backupKey(s) {
    let hash = 2166136261;
    for (const ch of s.file.path) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
    return encodeURIComponent(s.doc.id).slice(0, 80) + '-' + (hash >>> 0).toString(36);
  }
  backup(s, doc, force = false, revision = s.revision) {
    if (this.settings?.backupsEnabled === false) return Promise.resolve();
    if (
      !this.app.vault.getAbstractFileByPath ||
      !this.app.vault.createFolder ||
      s.file.path.startsWith('Smart Ink Backups/')
    )
      return Promise.resolve();
    const now = Date.now();
    if (!force && now - (s.lastBackup || 0) < 30000) return this.backupTail;
    s.lastBackup = now;
    const snapshot = Ink.clone(doc);
    snapshot.recoveryInfo = { source: s.file.path, savedAt: new Date(now).toISOString(), revision };
    const slot = Math.floor(now / 30000) % 3;
    this.backupTail = this.backupTail
      .catch(() => {})
      .then(async () => {
        if (this.settings?.backupsEnabled === false) return;
        Ink.parse(Ink.serialize(snapshot));
        const folder = 'Smart Ink Backups';
        if (!this.app.vault.getAbstractFileByPath(folder))
          await this.app.vault.createFolder(folder);
        const path = folder + '/' + this.backupKey(s) + '-' + slot + '.smartink',
          existing = this.app.vault.getAbstractFileByPath(path),
          text = Ink.serialize(snapshot);
        if (existing) await this.app.vault.process(existing, () => text);
        else await this.app.vault.create(path, text);
        s.backupError = null;
        s.notify();
      })
      .catch((e) => {
        s.backupError = 'Falha na recuperação: ' + e.message;
        s.notify();
      });
    return this.backupTail;
  }
  async rewriteReferences(oldPath, newPath) {
    if (!oldPath || oldPath === newPath) return;
    if (oldPath.endsWith('.smartink'))
      for (const file of this.app.vault.getMarkdownFiles?.() || [])
        await this.app.vault.process(file, (text) => Ink.renameEmbed(text, oldPath, newPath));
    if (oldPath.endsWith('.md')) {
      const oldName = oldPath.replace(/\.md$/, ''),
        newName = newPath.replace(/\.md$/, '');
      const rewrite = (doc) => {
        let changed = false;
        doc.elements = doc.elements.map((e) => {
          if (!e.noteLink) return e;
          const [name, ...suffix] = e.noteLink.split('#');
          if (name !== oldName && name !== oldPath) return e;
          changed = true;
          return { ...e, noteLink: newName + (suffix.length ? '#' + suffix.join('#') : '') };
        });
        return changed;
      };
      for (const file of this.app.vault.getFiles?.() || []) {
        if (!file.path.endsWith('.smartink') || file.path.startsWith('Smart Ink Backups/'))
          continue;
        const session = this.sessions.get(file.path);
        if (session) {
          const s = await session;
          if (s.error) continue;
          const before = s.doc.elements;
          if (rewrite(s.doc)) {
            s.history.push(before, s.doc.elements);
            s.revision++;
            s.notify();
            await this.saveSession(s);
          }
        } else
          await this.app.vault.process(file, (text) => {
            let doc;
            try {
              doc = Ink.parse(text);
            } catch {
              return text;
            }
            return rewrite(doc) ? Ink.serialize(doc) : text;
          });
      }
    }
  }
  async onunload() {
    for (const value of this.sessions.values()) {
      const s = await value;
      this.cancelScheduledSave(s);
      if (s.revision > s.savedRevision && !s.error) await this.saveSession(s);
    }
    await this.backupTail;
    await this.renameTail;
  }
}

class InkView extends FileView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.mode = plugin.settings.lastBrush || 'write';
    this.shapeAssist = false;
    this.zoom = 1;
    this.active = null;
    this.pending = null;
    this.frame = 0;
    this.cleanups = [];
    this.flyout = null;
    this.keepPanel = false;
    this.pointEditing = null;
    this.snapLock = null;
    this.camera = { x: 48, y: 48 };
    this.selected = new Set();
    this.shapeGroup = [];
    this.pathCache = new WeakMap();
    this.boundsCache = new WeakMap();
    this.spaceDown = false;
    this.heldKeys = new Set();
    this.visible = new Visible.VisibleCache();
    this.spatial = new Visible.SpatialIndex();
    this.inkPaths = new WeakMap();
    this.visiblePaths = new WeakMap();
    this.renderStats = [];
    this.stylePreview = null;
    this.imageCache = new Map();
    this.snapMarker = null;
    this.smartLines = [];
  }
  getViewType() {
    return VIEW;
  }
  getDisplayText() {
    return this.file ? this.file.basename : 'Smart Ink';
  }
  getIcon() {
    return 'pen-tool';
  }
  async onOpen() {
    this.build();
  }
  async onLoadFile(file) {
    if (!this.root) this.build();
    this.releaseSession();
    this.clearGroup();
    this.selected.clear();
    try {
      this.s = await this.plugin.session(file);
      this.listener = () => this.refresh();
      this.s.listeners.add(this.listener);
      this.refresh();
      this.fit();
    } catch (e) {
      this.s = null;
      this.status.textContent = e.message;
      this.status.classList.add('is-error');
      new Notice('Smart Ink: ' + e.message);
    }
  }
  async onUnloadFile() {
    this.closePanel();
    this.finish(false);
    await this.save();
    this.releaseSession();
  }
  releaseSession() {
    if (this.s && this.listener) {
      const s = this.s;
      s.listeners.delete(this.listener);
      if (!s.listeners.size && s.revision === s.savedRevision && !s.error)
        this.plugin.sessions.delete(s.file.path);
    }
    this.s = null;
    this.listener = null;
  }
  async onClose() {
    this.closePanel();
    this.finish(false);
    await this.save();
    this.releaseSession();
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
    if (this.frame) this.win.cancelAnimationFrame(this.frame);
  }
  listen(target, event, fn, options) {
    target.addEventListener(event, fn, options);
    this.cleanups.push(() => target.removeEventListener(event, fn, options));
  }
  build() {
    this.contentEl.replaceChildren();
    this.root = element(this.contentEl, 'div', 'si-root');
    this.win = this.root.ownerDocument.defaultView;
    const header = element(this.root, 'div', 'si-header');
    element(header, 'strong', '', 'Smart Ink');
    element(header, 'span', 'si-badge', '0.27');
    this.status = element(header, 'span', 'si-status', 'Abra ou crie uma página.');
    button(header, 'Exportar', () => this.openExportOptions()).className = 'si-export';
    const more = button(header, '•••', () => this.openPagePanel(more));
    this.pageButton = more;
    more.className = 'si-icon-button';
    more.title = 'Página, salvamento e recuperação';
    more.setAttribute('aria-label', more.title);
    this.toolbar = element(this.root, 'div', 'si-toolbar');
    this.toolbar.setAttribute('aria-label', 'Ferramentas de desenho');
    this.modeButtons = {};
    this.penGroups = {};
    for (const [kind, spec] of Object.entries(Brushes.SPECS)) {
      const group = element(this.toolbar, 'div', 'si-pen-group');
      this.penGroups[kind] = group;
      const b = button(group, '', () => this.selectTool(kind));
      b.className = 'si-pen-button';
      b.title = spec.label + ' — toque novamente para cores e espessura';
      b.setAttribute('aria-label', b.title);
      b.setAttribute('aria-haspopup', 'dialog');
      this.toolGraphic(b, kind);
      element(b, 'span', 'si-tool-label', spec.label);
      this.modeButtons[kind] = b;
      const arrow = button(group, '⌄', () => {
        this.selectTool(kind, true);
      });
      arrow.className = 'si-pen-arrow';
      arrow.title = 'Configurar ' + spec.label.toLowerCase();
      arrow.setAttribute('aria-label', arrow.title);
      arrow.setAttribute('aria-haspopup', 'dialog');
    }
    element(this.toolbar, 'span', 'si-divider');
    for (const [kind, label, icon] of [
      ['connector', 'Conector', 'connector'],
      ['select', 'Cursor', 'cursor'],
      ['lasso', 'Laço', 'lasso'],
      ['erase', 'Borracha', 'eraser'],
      ['pan', 'Mover', 'hand']
    ]) {
      const b = button(this.toolbar, '', () => this.selectTool(kind));
      b.className = 'si-tool-button';
      this.toolGraphic(b, icon);
      element(b, 'span', 'si-tool-label', label);
      b.title = label + (kind === 'erase' ? ' — toque novamente para opções' : ' folha');
      b.setAttribute('aria-label', b.title);
      this.modeButtons[kind] = b;
    }
    element(this.toolbar, 'span', 'si-divider');
    this.shapeButton = button(this.toolbar, '', () => {
      this.finish(false);
      this.shapeAssist = !this.shapeAssist;
      this.clearGroup();
      if (this.shapeAssist && !Brushes.SPECS[this.mode]) this.mode = this.plugin.settings.lastBrush;
      this.closePanel();
      this.updateTools();
      this.drawOverlay();
    });
    this.shapeButton.className = 'si-tool-button';
    this.toolGraphic(this.shapeButton, 'shapes');
    element(this.shapeButton, 'span', 'si-tool-label', 'Reconhecer');
    this.shapeButton.title = 'Reconhecer formas desenhadas em um ou vários traços';
    this.organizeButton = button(this.toolbar, 'Organizar', () => this.openOrganize());
    this.organizeButton.className = 'si-drafting-button';
    this.draftingButton = button(this.toolbar, 'Réguas e guias', () => this.openDraftingPanel());
    this.draftingButton.className = 'si-drafting-button';
    this.favoriteBar = element(this.toolbar, 'div', 'si-favorites');
    const zoomBox = element(this.toolbar, 'div', 'si-toolbar-zoom');
    button(zoomBox, '−', () => this.setZoom(this.zoom / 1.2)).setAttribute(
      'aria-label',
      'Diminuir zoom'
    );
    this.zoomText = button(zoomBox, '100%', () => this.setZoom(1));
    this.zoomText.title = 'Voltar a 100%';
    this.zoomText.className = 'si-zoom';
    button(zoomBox, '+', () => this.setZoom(this.zoom * 1.2)).setAttribute(
      'aria-label',
      'Aumentar zoom'
    );
    this.zoomRange = element(zoomBox, 'input');
    this.zoomRange.type = 'range';
    this.zoomRange.min = String(Math.log2(0.1));
    this.zoomRange.max = '3';
    this.zoomRange.step = '.05';
    this.zoomRange.value = '0';
    this.zoomRange.setAttribute('aria-label', 'Zoom de 10 a 800 por cento');
    this.zoomRange.addEventListener('input', () => this.setZoom(2 ** Number(this.zoomRange.value)));
    button(zoomBox, 'Enquadrar', () => this.fit());
    element(this.toolbar, 'span', 'si-toolbar-spacer');
    this.undoButton = button(this.toolbar, '↶', () => this.undo());
    this.undoButton.className = 'si-icon-button';
    this.undoButton.title = 'Desfazer (Ctrl+Z)';
    this.undoButton.setAttribute('aria-label', 'Desfazer');
    this.redoButton = button(this.toolbar, '↷', () => this.redo());
    this.redoButton.className = 'si-icon-button';
    this.redoButton.title = 'Refazer (Ctrl+Shift+Z)';
    this.redoButton.setAttribute('aria-label', 'Refazer');
    this.suggestion = element(this.root, 'div', 'si-suggestion');
    this.viewport = element(this.root, 'div', 'si-viewport');
    this.stage = element(this.viewport, 'div', 'si-stage');
    this.canvas = element(this.stage, 'canvas', 'si-canvas');
    this.overlay = element(this.stage, 'canvas', 'si-overlay');
    this.overlay.tabIndex = 0;
    this.overlay.setAttribute('aria-label', 'Área de escrita');
    const footer = element(this.root, 'div', 'si-footer');
    this.hint = element(
      footer,
      'span',
      'si-hint',
      'Canvas infinito · Ctrl + roda: zoom · Espaço + arrastar: navegar · V: cursor'
    );
    this.listen(this.overlay, 'pointerdown', (e) => this.down(e));
    this.listen(this.overlay, 'pointermove', (e) => this.move(e));
    this.listen(this.overlay, 'pointerup', (e) => this.up(e));
    this.listen(this.overlay, 'pointercancel', () => this.cancelGesture());
    this.listen(this.overlay, 'lostpointercapture', () => {
      if (this.active) this.finish(false);
    });
    this.listen(this.overlay, 'pointerleave', () => {
      this.hoverPoint = null;
      this.drawOverlay();
    });
    this.listen(this.overlay, 'dblclick', (e) => {
      if (this.pointEditing || this.regionEditing || this.parameterEditing) return;
      const p = this.point(e),
        text = this.layerElements()
          .slice()
          .reverse()
          .find(
            (x) =>
              x.type === 'text' &&
              Ink.isEditable(this.s.doc, x) &&
              this.visible.hit(x, p, 5 / this.zoom)
          );
      if (text) {
        this.openTextEditor(text);
        return;
      }
      const target = this.layerElements()
        .slice()
        .reverse()
        .find((x) => x.noteLink && this.visible.hit(x, p, 5 / this.zoom));
      if (target) void this.app.workspace.openLinkText(target.noteLink, this.s.file.path, false);
    });
    this.listen(this.overlay, 'contextmenu', (e) => e.preventDefault());
    this.listen(this.win, 'blur', () => this.finish(false));
    this.listen(
      this.root.ownerDocument,
      'pointerdown',
      (e) => {
        if (this.radial && !this.radial.contains(e.target)) this.closeRadial();
        if (
          this.flyout &&
          !(
            ['shape-inspector', 'shape-parameters'].includes(this.panelKind) &&
            this.overlay.contains(e.target)
          ) &&
          e.target !== this.settingsBackdrop &&
          !this.settingsShell?.contains(e.target) &&
          !this.flyout.contains(e.target) &&
          !this.toolbar.contains(e.target) &&
          !header.contains(e.target)
        )
          this.closePanel();
      },
      true
    );
    this.listen(this.win, 'resize', () => {
      this.constrainFloatingUI?.();
      this.render();
    });
    this.listen(this.overlay, 'wheel', (e) => this.wheel(e), { passive: false });
    this.listen(this.root, 'keyup', (e) => {
      this.endTemporary(e.code);
      this.heldKeys.delete(e.key);
      this.heldKeys.delete(e.code);
      if (e.code === 'Space') this.spaceDown = false;
    });
    this.listen(this.win, 'blur', () => {
      this.spaceDown = false;
      this.heldKeys.clear();
      if (this.temporaryMode) {
        this.mode = this.temporaryMode;
        this.temporaryMode = null;
        this.updateTools();
      }
    });
    if (this.win.ResizeObserver) {
      const observer = new this.win.ResizeObserver(() => this.render());
      observer.observe(this.viewport);
      this.cleanups.push(() => observer.disconnect());
    }
    this.listen(this.root, 'keydown', (e) => {
      if (e.isComposing || e.target.isContentEditable) return;
      this.heldKeys.add(e.key);
      this.heldKeys.add(e.code);
      if (e.code === this.plugin.settings.straightKey && e.target === this.overlay) {
        e.preventDefault();
        return;
      }
      if (e.code === this.plugin.settings.radialKey && e.target === this.overlay && !e.repeat) {
        e.preventDefault();
        this.openRadial();
        return;
      }
      if (e.key === 'Escape' && this.radial) {
        e.preventDefault();
        this.closeRadial();
        return;
      }
      if (e.key === 'Tab' && this.active?.heldShape) {
        e.preventDefault();
        this.cycleHeldShape();
        return;
      }
      if (e.key === 'Escape' && this.flyout) {
        e.preventDefault();
        e.stopPropagation();
        this.closePanel(true);
        return;
      }
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.stopPropagation();
        e.shiftKey ? this.redo() : this.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        e.stopPropagation();
        this.save();
      } else if (e.key === 'Escape') {
        this.pointEditing = null;
        this.cropEditing = null;
        if (this.focusMode) this.toggleFocus();
        this.cancelGesture();
        this.clearGroup();
        this.selected.clear();
        this.updateSuggestion();
        this.drawOverlay();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === 'a' &&
        e.target === this.overlay
      ) {
        e.preventDefault();
        this.clearGroup();
        this.mode = 'select';
        this.selected = new Set(this.editableObjects().map((x) => x.id));
        this.updateTools();
        this.drawOverlay();
      } else if (e.key === 'Enter' && this.pending && e.target === this.overlay) {
        e.preventDefault();
        this.accept();
      } else if (e.target === this.overlay && !e.ctrlKey && !e.metaKey) {
        if (e.code === 'Space') {
          e.preventDefault();
          this.spaceDown = true;
          this.beginTemporary('pan', e.code);
        }
        if (e.code === this.plugin.settings.temporaryKey && !e.repeat) {
          e.preventDefault();
          this.beginTemporary('erase', e.code);
        }
        const action = Object.entries(this.plugin.settings.shortcuts).find(
          ([, code]) => code === e.code
        )?.[0];
        if (action && !e.repeat) {
          e.preventDefault();
          if (action === 'focus') this.toggleFocus();
          else this.selectTool(action, false, false);
        }
        if (['Delete', 'Backspace'].includes(e.key) && this.mode === 'select') {
          e.preventDefault();
          this.deleteSelection();
        }
        if (['[', ']'].includes(e.key) && Brushes.SPECS[this.mode]) {
          e.preventDefault();
          const b = this.plugin.settings.brushes[this.mode],
            step = Brushes.SPECS[this.mode].step;
          this.setBrush({ width: b.width + (e.key === ']' ? step : -step) }, true);
        }
      }
    });
    this.updateTools();
    this.applyLayout();
  }
  toolGraphic(parent, kind) {
    const svg = parent.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 32 42');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('si-tool-svg');
    const parts = {
      connector:
        '<path d="M5 34L27 10m-10 0h10v10" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="5" cy="34" r="3" fill="none" stroke="currentColor"/>',
      lasso:
        '<path d="M22 33c-5 5-15-1-15-8 0-10 19-15 22-6 2 8-12 14-19 9-5-4-2-8 2-6 5 3 2 14-2 17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="3 2"/>',
      cursor:
        '<path d="M7 5v28l7-7 6 12 5-2-6-12h10z" fill="var(--si-tool-body)" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
      write:
        '<path d="M11 12h10v19l-5 8-5-8z" fill="var(--si-ink)"/><path d="M11 12h10v13H11z" fill="var(--si-tool-body)" stroke="currentColor" stroke-width="1.4"/><path d="M12 5h8v7h-8z" fill="var(--si-ink)"/><path d="M16 34v5" stroke="currentColor" stroke-width="1.8"/><path d="M23 13v11" stroke="currentColor" stroke-width="1.4"/>',
      pencil:
        '<path d="M10 10h12v19l-6 11-6-11z" fill="var(--si-ink)"/><path d="M10 28l6 12 6-12z" fill="#dcc39e"/><path d="M13.5 35l2.5 5 2.5-5z" fill="var(--si-ink)"/><path d="M10 10h12V6a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2z" fill="#dc969b"/><path d="M10 10h12v4H10z" fill="#bdc2c7"/><path d="M14 15v13" stroke="white" stroke-opacity=".5"/>',
      marker:
        '<path d="M8 8h16v18l-4 5h-8l-4-5z" fill="var(--si-tool-body)" stroke="currentColor" stroke-width="1.3"/><path d="M8 17h16v8H8zM12 30h8v6l-8 4zM9 3h14v5H9z" fill="var(--si-ink)"/>',
      eraser:
        '<path d="m7 27 10-16a3 3 0 0 1 4-1l6 4a3 3 0 0 1 1 4L17 35H9l-2-2a5 5 0 0 1 0-6z" fill="var(--si-tool-body)" stroke="currentColor" stroke-width="1.5"/><path d="m8 25 12 8-3 2H9l-2-2a5 5 0 0 1 0-6z" fill="#d69ba2"/><path d="M6 36h21" stroke="currentColor" stroke-width="1.5"/>',
      hand: '<path d="M9 24V13c0-3 4-3 4 0v8-13c0-3 4-3 4 0v13-10c0-3 4-3 4 0v11-6c0-3 4-3 4 0v11c0 8-4 12-10 12-4 0-6-2-8-6l-4-8c-1-3 2-5 4-2l2 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
      shapes:
        '<rect x="5" y="8" width="17" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="21" cy="28" r="8" fill="var(--si-tool-body)" stroke="currentColor" stroke-width="1.5"/>'
    };
    svg.innerHTML = parts[kind] || parts.write;
    parent.appendChild(svg);
  }
  selectTool(kind, open = false, toggle = true) {
    this.finish(false);
    this.pointEditing = null;
    this.cropEditing = null;
    this.snapLock = null;
    const same = this.mode === kind;
    this.mode = kind;
    this.clearGroup();
    if (!['select', 'lasso'].includes(kind)) this.selected.clear();
    if (Brushes.SPECS[kind]) {
      this.plugin.settings.lastBrush = kind;
      void this.plugin.savePreferences();
    }
    const shouldOpen = open || (same && toggle);
    const already = this.panelKind === kind;
    this.closePanel();
    this.updateTools();
    this.drawOverlay();
    if (shouldOpen && !already) {
      if (Brushes.SPECS[kind]) this.openBrushPanel(kind);
      else if (kind === 'erase') this.openEraserPanel();
    }
  }
  closePanel(focus = false) {
    this.closeRadial();
    if (this.stylePreview) {
      this.stylePreview = null;
      this.requestRender();
    }
    if (this.flyout && Brushes.SPECS[this.panelKind]) void this.plugin.savePreferences();
    if (this.panelAnchor) this.panelAnchor.setAttribute('aria-expanded', 'false');
    if (this.flyout) this.flyout.remove();
    this.flyout = null;
    this.panelKind = null;
    for (const b of Object.values(this.modeButtons || {})) b.setAttribute('aria-expanded', 'false');
    if (focus && this.panelAnchor) this.panelAnchor.focus();
    this.panelAnchor = null;
    this.previewPath = null;
  }
  makePanel(anchor, title, kind) {
    this.closePanel();
    this.panelKind = kind;
    this.panelAnchor = anchor;
    anchor.setAttribute('aria-expanded', 'true');
    const panel = element(this.root, 'div', 'si-flyout');
    this.flyout = panel;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', title);
    panel.tabIndex = -1;
    const heading = element(panel, 'div', 'si-flyout-title');
    element(heading, 'strong', '', title);
    const close = button(heading, '×', () => this.closePanel(true));
    close.setAttribute('aria-label', 'Fechar painel');
    const rootRect = this.root.getBoundingClientRect(),
      r = anchor.getBoundingClientRect();
    panel.style.left =
      Ink.clamp(r.left - rootRect.left - 40, 8, Math.max(8, this.root.clientWidth - 304)) + 'px';
    const top = Ink.clamp(
      r.bottom - rootRect.top + 8,
      8,
      Math.max(8, this.root.clientHeight - 240)
    );
    panel.style.top = top + 'px';
    panel.style.maxHeight = Math.max(100, this.root.clientHeight - top - 12) + 'px';
    const position = this.plugin.settings.panelPositions[kind];
    if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
      panel.style.left = Ink.clamp(position.x, 8, Math.max(8, this.root.clientWidth - 304)) + 'px';
      panel.style.top = Ink.clamp(position.y, 8, Math.max(8, this.root.clientHeight - 120)) + 'px';
      panel.style.maxHeight =
        Math.max(100, this.root.clientHeight - parseFloat(panel.style.top) - 12) + 'px';
    }
    let drag = null;
    heading.addEventListener('pointerdown', (e) => {
      if (
        this.settingsShell?.contains(panel) ||
        e.target.closest?.('button') ||
        e.target.tagName === 'BUTTON'
      )
        return;
      e.preventDefault();
      heading.setPointerCapture?.(e.pointerId);
      drag = {
        x: e.clientX,
        y: e.clientY,
        left: parseFloat(panel.style.left),
        top: parseFloat(panel.style.top)
      };
    });
    heading.addEventListener('pointermove', (e) => {
      if (!drag) return;
      panel.style.left =
        Ink.clamp(drag.left + e.clientX - drag.x, 8, Math.max(8, this.root.clientWidth - 304)) +
        'px';
      panel.style.top =
        Ink.clamp(drag.top + e.clientY - drag.y, 8, Math.max(8, this.root.clientHeight - 120)) +
        'px';
      panel.style.maxHeight =
        Math.max(100, this.root.clientHeight - parseFloat(panel.style.top) - 12) + 'px';
    });
    heading.addEventListener('pointermove', () => this.constrainFloatingUI?.());
    heading.addEventListener('pointerup', () => {
      if (!drag) return;
      drag = null;
      this.plugin.settings.panelPositions[kind] = {
        x: parseFloat(panel.style.left),
        y: parseFloat(panel.style.top)
      };
      void this.plugin.savePreferences();
    });
    heading.addEventListener('pointercancel', () => (drag = null));
    return panel;
  }
  // The pen and selection share the very same picker. In selection mode edits
  // affect a reversible preview, never the current pen preset or the document
  // until Apply is pressed.
  openBrushPanel(kind, selection = false) {
    const spec = Brushes.SPECS[kind];
    const chosen = selection ? this.selectedElements() : [];
    if (selection && !chosen.length) return;
    const selectedIds = selection ? new Set(chosen.map((e) => e.id)) : null;
    const selectedStrokes = chosen.some((e) => e.type === 'stroke');
    const selectedShapes = chosen.some((e) => !['stroke', 'image', 'text'].includes(e.type));
    const sample = selection ? chosen.find((e) => e.type === 'stroke') || chosen[0] : null;
    const base = selection
      ? { ...this.plugin.settings.brushes[kind], ...sample }
      : this.plugin.settings.brushes[kind];
    const patch = {};
    const panel = this.makePanel(
      selection ? this.modeButtons.select : this.modeButtons[kind],
      selection ? 'Estilo da seleção' : spec.label,
      selection ? 'selection' : kind
    );
    if (selection) {
      this.stylePreview = {
        session: this.s,
        revision: this.s.revision,
        elements: this.s.doc.elements
      };
      element(
        panel,
        'p',
        'si-panel-copy',
        `${chosen.length} objeto(s) · escolha cor, espessura ou um estilo rápido. Visualize e aplique tudo de uma vez; a caneta atual não será modificada.`
      );
    }
    let previewPath, hexLabel, widthLabel, widthSlider, opacitySlider, profileStatus, testPad;
    const profileButtons = [],
      fineFields = [];
    const swatches = [],
      sizes = [];
    const current = () => (selection ? { ...base, ...patch } : this.plugin.settings.brushes[kind]);
    const repaint = () => {
      const b = current();
      if (previewPath) {
        previewPath.setAttribute('stroke', b.color);
        previewPath.setAttribute('stroke-width', String(b.width));
        previewPath.setAttribute('opacity', String(b.opacity));
        const demo = {
          ...b,
          type: 'stroke',
          points: Array.from({ length: 90 }, (_, i) => ({
            x: 16 + i * 2.5,
            y: 27 + 13 * Math.sin(i / 13),
            p: 0.1 + (0.85 * i) / 89,
            t: i * 8
          }))
        };
        previewPath.setAttribute('d', Ink.inkPath(demo));
        previewPath.setAttribute('fill', b.color);
        previewPath.setAttribute('stroke', 'none');
      }
      for (const { input, output, key, initial, restore } of fineFields) {
        if (input.type === 'checkbox') input.checked = !!b[key];
        else input.value = String(b[key]);
        if (output) output.textContent = String(b[key]);
        if (restore) {
          restore.hidden = b[key] === initial;
          input.parentNode.classList.toggle('si-field-changed', b[key] !== initial);
        }
      }
      const mixedProfiles =
        selection &&
        chosen
          .filter((e) => e.type === 'stroke')
          .some(
            (e) =>
              Math.abs((patch.streamline ?? e.streamline ?? base.streamline) - b.streamline) >
                0.00001 ||
              Math.abs((patch.smoothing ?? e.smoothing ?? base.smoothing) - b.smoothing) > 0.00001
          );
      let activeProfile = mixedProfiles ? 'Valores variados' : 'Personalizado';
      for (const item of profileButtons) {
        const active =
          !mixedProfiles &&
          Math.abs(b.streamline - item.streamline) < 0.00001 &&
          Math.abs(b.smoothing - item.smoothing) < 0.00001;
        item.button.setAttribute('aria-pressed', String(active));
        if (active) activeProfile = item.title;
      }
      if (profileStatus) profileStatus.textContent = 'Perfil de suavização: ' + activeProfile;
      testPad?.redraw();
      if (hexLabel) hexLabel.textContent = String(b.color).toUpperCase();
      if (widthLabel)
        widthLabel.textContent = Number(b.width).toFixed(1).replace(/\.0$/, '') + ' px';
      if (widthSlider)
        widthSlider.value = String(
          Ink.clamp(b.width, Number(widthSlider.min), Number(widthSlider.max))
        );
      if (opacitySlider) opacitySlider.value = String(b.opacity);
      for (const sw of swatches) {
        const active = sw.dataset.color?.toLowerCase() === b.color?.toLowerCase();
        sw.classList.toggle('is-selected', active);
        sw.setAttribute('aria-pressed', String(active));
      }
      for (const btt of sizes) {
        btt.setAttribute('aria-pressed', String(Number(btt.dataset.width) === b.width));
        btt.style.setProperty('--si-ink', b.color);
      }
    };
    const change = (values, persist = false) => {
      if (selection) {
        Object.assign(patch, values);
        if (this.stylePreview?.revision === this.s.revision) {
          this.stylePreview.elements = this.styledElements(patch, selectedIds);
          this.requestRender();
        }
      } else {
        Brushes.updateBrush(this.plugin.settings, kind, values);
        this.updateTools();
        if (persist) void this.plugin.savePreferences();
      }
      repaint();
    };
    const preview = element(panel, 'div', 'si-preview');
    const svg = panel.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 256 54');
    svg.setAttribute('aria-label', 'Prévia do traço');
    previewPath = panel.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
    previewPath.setAttribute('stroke-linecap', 'round');
    svg.appendChild(previewPath);
    preview.appendChild(svg);
    if (selection) {
      element(panel, 'div', 'si-section-title', 'Estilos rápidos');
      const styles = element(panel, 'div', 'si-style-choices');
      for (const [preset, title] of [
        ['write', 'Caneta'],
        ['pencil', 'Lápis'],
        ['marker', 'Marca-texto']
      ]) {
        const target = this.plugin.settings.brushes[preset];
        const btn = button(styles, title, () => {
          change({
            color: target.color,
            width: target.width,
            opacity: target.opacity,
            pressure: target.pressure,
            smoothing: target.smoothing,
            streamline: target.streamline,
            cornerProtection: target.cornerProtection,
            minWidth: target.minWidth,
            pressureGamma: target.pressureGamma,
            adaptiveInk: target.adaptiveInk
          });
        });
        btn.title = 'Aplicar o estilo ' + title.toLowerCase() + ' à seleção';
      }
    }
    const colorsHead = element(panel, 'div', 'si-section-title');
    element(colorsHead, 'span', '', 'Cores');
    hexLabel = element(colorsHead, 'span', 'si-muted');
    const palette = element(panel, 'div', 'si-palette');
    palette.setAttribute('role', 'group');
    palette.setAttribute('aria-label', 'Paleta de cores');
    const addSwatch = (parent, color, name) => {
      const sw = button(parent, '', () => {
        change({ color }, !selection);
        if (!selection) {
          Brushes.rememberColor(this.plugin.settings, color);
          void this.plugin.savePreferences();
          this.commitPanel();
        }
      });
      sw.className = 'si-swatch';
      sw.style.setProperty('--swatch', color);
      sw.title = name + ' ' + color;
      sw.setAttribute('aria-label', sw.title);
      sw.dataset.color = color;
      swatches.push(sw);
    };
    for (const [color, name] of Brushes.PALETTE) addSwatch(palette, color, name);
    if (this.plugin.settings.recentColors.length) {
      element(panel, 'div', 'si-section-title', 'Recentes');
      const recent = element(panel, 'div', 'si-recent');
      for (const color of this.plugin.settings.recentColors)
        addSwatch(recent, color, 'Cor recente');
    }
    const customLabel = element(panel, 'label', 'si-custom-color');
    element(customLabel, 'span', '', '+ Cor personalizada');
    const custom = element(customLabel, 'input');
    custom.type = 'color';
    custom.value = current().color;
    custom.setAttribute('aria-label', 'Escolher cor personalizada');
    custom.addEventListener('change', () => {
      change({ color: custom.value }, !selection);
      if (!selection) {
        Brushes.rememberColor(this.plugin.settings, custom.value);
        void this.plugin.savePreferences();
        this.commitPanel();
      }
    });
    const thickness = element(panel, 'div', 'si-section-title');
    element(thickness, 'span', '', 'Espessura');
    widthLabel = element(thickness, 'output');
    const sliderRow = element(panel, 'div', 'si-slider-row');
    element(sliderRow, 'span', 'si-dot si-dot-small');
    widthSlider = element(sliderRow, 'input');
    widthSlider.type = 'range';
    widthSlider.min = String(spec.min);
    widthSlider.max = String(selection ? Math.max(spec.max, Math.min(100, base.width)) : spec.max);
    widthSlider.step = String(spec.step);
    widthSlider.setAttribute('aria-label', 'Espessura em pixels');
    element(sliderRow, 'span', 'si-dot si-dot-large');
    widthSlider.addEventListener('input', () => change({ width: Number(widthSlider.value) }));
    widthSlider.addEventListener('change', () => {
      if (!selection) void this.plugin.savePreferences();
    });
    const presets = element(panel, 'div', 'si-size-presets');
    for (const size of spec.presets) {
      const p = button(presets, '', () => {
        change({ width: size }, !selection);
        if (!selection) this.commitPanel();
      });
      const dot = element(p, 'span');
      dot.style.width = Math.min(size, 23) + 'px';
      dot.style.height = Math.min(size, 23) + 'px';
      p.title = size + ' px';
      p.setAttribute('aria-label', 'Espessura ' + size + ' pixels');
      p.dataset.width = String(size);
      sizes.push(p);
    }
    const opacityRow = element(panel, 'label', 'si-check-row si-quick-opacity');
    element(opacityRow, 'span', '', 'Opacidade');
    opacitySlider = element(opacityRow, 'input');
    opacitySlider.type = 'range';
    opacitySlider.min = '.1';
    opacitySlider.max = '1';
    opacitySlider.step = '.05';
    opacitySlider.setAttribute('aria-label', 'Opacidade');
    opacitySlider.addEventListener('input', () => change({ opacity: Number(opacitySlider.value) }));
    opacitySlider.addEventListener('change', () => {
      if (!selection) void this.plugin.savePreferences();
    });
    if (selection && selectedShapes) {
      const styleRow = element(panel, 'label', 'si-check-row');
      element(styleRow, 'span', '', 'Estilo da linha');
      const dash = element(styleRow, 'select');
      for (const [value, label] of [
        ['solid', 'Contínua'],
        ['dashed', 'Tracejada'],
        ['dotted', 'Pontilhada']
      ]) {
        const option = element(dash, 'option', '', label);
        option.value = value;
      }
      dash.value =
        chosen.find((e) => !['stroke', 'image', 'text'].includes(e.type))?.dash || 'solid';
      dash.addEventListener('change', () => change({ dash: dash.value }));
    }
    if (!selection || selectedStrokes) {
      profileStatus = element(panel, 'p', 'si-profile-status');
      profileStatus.setAttribute('role', 'status');
      const profiles = element(panel, 'div', 'si-profile-row');
      for (const [title, streamline, smoothing] of [
        ['Letra pequena', 0.08, 0.35],
        ['Escrita', 0.15, 0.55],
        ['Caligrafia', 0.35, 0.65],
        ['Diagramas', 0.1, 0.45],
        ['Desenho', 0.65, 0.8]
      ]) {
        const card = this.profileCard(profiles, title, () =>
          change({ streamline, smoothing }, !selection)
        );
        this.addProfilePreview(card, { ...current(), streamline, smoothing });
        profileButtons.push({ button: card, title, streamline, smoothing });
      }
      testPad = this.createBrushTest(panel, current);
    }
    const advanced = element(panel, 'details', 'si-advanced');
    element(
      advanced,
      'summary',
      '',
      selection ? 'Ajustes finos dos traços' : 'Mais opções do pincel'
    );
    if (!selection || selectedStrokes) {
      if (kind !== 'marker' || selection) {
        const pressureRow = element(advanced, 'label', 'si-check-row'),
          pressure = element(pressureRow, 'input');
        pressure.type = 'checkbox';
        pressure.checked = !!current().pressure;
        fineFields.push({ input: pressure, key: 'pressure' });
        element(pressureRow, 'span', '', 'Usar pressão da caneta');
        pressure.addEventListener('change', () => change({ pressure: pressure.checked }, true));
      }
      const field = (title, key, min, max, step) => {
        const row = element(advanced, 'label', 'si-check-row');
        element(row, 'span', '', title);
        const input = element(row, 'input');
        input.type = 'range';
        input.min = String(min);
        input.max = String(max);
        input.step = String(step);
        input.value = String(current()[key]);
        input.setAttribute('aria-label', title);
        const output = element(row, 'output', 'si-muted', String(current()[key]));
        const initial = current()[key],
          restore = button(row, '↶', () => change({ [key]: initial }, !selection));
        restore.title = 'Restaurar ' + title + ' ao valor de abertura';
        restore.setAttribute('aria-label', restore.title);
        fineFields.push({ input, output, key, initial, restore });
        this.parameterHelp?.(row, key);
        input.addEventListener('input', () => {
          output.textContent = input.value;
          change({ [key]: Number(input.value) });
        });
        input.addEventListener('change', () => {
          if (!selection) void this.plugin.savePreferences();
        });
      };
      field('Suavização', 'smoothing', 0, 1, 0.05);
      for (const [key, title, min, max, step] of [
        ['cornerProtection', 'Preservar mudanças de direção', 0, 1, 0.05],
        ['streamline', 'Estabilização', 0, 1, 0.05],
        ['minWidth', 'Espessura mínima (fração)', 0.05, 1, 0.05],
        ['pressureGamma', 'Curva de pressão', 0.25, 4, 0.05]
      ])
        field(title, key, min, max, step);
      const defaults = Brushes.settings({}).brushes[kind];
      for (const [title, keys] of [
        ['suavização', ['streamline', 'smoothing', 'cornerProtection']],
        ['pressão', ['pressure', 'pressureMin', 'pressureMax', 'pressureGamma', 'minWidth']]
      ]) {
        button(advanced, 'Restaurar ' + title, () => {
          const apply = () =>
            change(Object.fromEntries(keys.map((key) => [key, defaults[key]])), !selection);
          if (selection) apply();
          else this.withBrushUndo(kind, keys, apply);
        });
      }
      element(
        advanced,
        'p',
        'si-panel-copy',
        'Restaurar afeta somente o grupo indicado. Cor, espessura e os outros ajustes são preservados.'
      );
      if (!selection) {
        const comparison = element(advanced, 'label', 'si-check-row'),
          compare = element(comparison, 'input');
        compare.type = 'checkbox';
        compare.checked = this.plugin.settings.compareInk;
        element(comparison, 'span', '', 'Comparar pontos originais durante escrita');
        compare.addEventListener('change', () => {
          this.plugin.settings.compareInk = compare.checked;
          void this.plugin.savePreferences();
        });
        button(advanced, 'Testar e calibrar pressão', () => this.openCalibration(kind)).className =
          'si-full-width';
      }
      element(
        advanced,
        'p',
        'si-panel-copy',
        'A estabilização reduz tremores, mas valores altos podem arredondar letras pequenas.'
      );
    } else
      element(
        advanced,
        'p',
        'si-panel-copy',
        'Ajustes de suavização e pressão só se aplicam a traços de tinta.'
      );
    if (selection) {
      const actions = element(panel, 'div', 'si-selection-style-actions');
      const apply = button(actions, 'Aplicar à seleção', () => {
        if (
          !this.stylePreview ||
          this.stylePreview.session !== this.s ||
          this.stylePreview.revision !== this.s.revision
        ) {
          new Notice('O documento mudou. Reabra o estilo para aplicar.');
          this.closePanel();
          return;
        }
        this.stylePreview = null;
        this.applySelectionStyle(patch, selectedIds);
        if (patch.color) {
          Brushes.rememberColor(this.plugin.settings, patch.color);
          void this.plugin.savePreferences();
        }
        this.closePanel();
        this.overlay.focus({ preventScroll: true });
      });
      apply.className = 'si-full-width si-apply-style';
      button(actions, 'Cancelar alterações', () => this.closePanel());
      element(
        panel,
        'p',
        'si-panel-copy',
        'Prévia reversível · Aplicar registra uma única ação no histórico · Esc cancela.'
      );
    } else {
      const pin = element(panel, 'label', 'si-check-row si-pin'),
        pinInput = element(pin, 'input');
      pinInput.type = 'checkbox';
      pinInput.checked = this.keepPanel;
      element(pin, 'span', '', 'Manter painel aberto ao escolher');
      pinInput.addEventListener('change', () => (this.keepPanel = pinInput.checked));
    }
    if (!selection) {
      this.previewPath = previewPath;
      this.hexLabel = hexLabel;
      this.widthLabel = widthLabel;
      this.widthSlider = widthSlider;
      this.swatches = swatches;
      this.sizePresets = sizes;
    }
    repaint();
    panel.focus();
  }
  setBrush(patch, persist) {
    if (!Brushes.SPECS[this.mode]) return;
    Brushes.updateBrush(this.plugin.settings, this.mode, patch);
    this.updateTools();
    this.updateBrushPreview();
    if (persist) void this.plugin.savePreferences();
  }
  updateBrushPreview() {
    if (!this.flyout || !this.previewPath || !Brushes.SPECS[this.mode]) return;
    const b = this.plugin.settings.brushes[this.mode];
    this.previewPath.setAttribute('stroke', b.color);
    this.previewPath.setAttribute('stroke-width', String(b.width));
    this.previewPath.setAttribute('opacity', String(b.opacity));
    const demo = {
      ...b,
      type: 'stroke',
      points: Array.from({ length: 90 }, (_, i) => ({
        x: 16 + i * 2.5,
        y: 27 + 13 * Math.sin(i / 13),
        p: 0.1 + (0.85 * i) / 89,
        t: i * 8
      }))
    };
    this.previewPath.setAttribute('d', Ink.inkPath(demo));
    this.previewPath.setAttribute('fill', b.color);
    this.previewPath.setAttribute('stroke', 'none');
    this.hexLabel.textContent = b.color.toUpperCase();
    this.widthLabel.textContent = b.width + ' px';
    this.widthSlider.value = String(b.width);
    for (const sw of this.swatches) {
      const selected = sw.dataset.color === b.color;
      sw.classList.toggle('is-selected', selected);
      sw.setAttribute('aria-pressed', String(selected));
      sw.textContent = selected ? '✓' : '';
    }
    for (const p of this.sizePresets) {
      p.setAttribute('aria-pressed', String(Number(p.dataset.width) === b.width));
      p.style.setProperty('--si-ink', b.color);
    }
  }
  commitPanel() {
    if (!this.keepPanel) {
      this.closePanel();
      this.overlay.focus({ preventScroll: true });
    }
  }
  openEraserPanel() {
    const panel = this.makePanel(this.modeButtons.erase, 'Borracha', 'erase');
    element(
      panel,
      'p',
      'si-panel-copy',
      'Parcial remove somente a região tocada, inclusive nas formas. Objeto remove o elemento inteiro.'
    );
    const row = element(panel, 'label', 'si-check-row');
    element(row, 'span', '', 'Modo');
    const type = element(row, 'select');
    for (const [value, text] of [
      ['partial', 'Parcial'],
      ['object', 'Objeto inteiro']
    ]) {
      const o = element(type, 'option', '', text);
      o.value = value;
    }
    type.value = this.plugin.settings.eraserMode;
    type.addEventListener('change', () => {
      this.plugin.settings.eraserMode = type.value;
      void this.plugin.savePreferences();
    });
    const label = element(panel, 'label', 'si-check-row');
    element(label, 'span', '', 'Área da borracha');
    const input = element(label, 'input');
    input.type = 'range';
    input.min = '4';
    input.max = '40';
    input.value = String(this.plugin.settings.eraserSize);
    input.setAttribute('aria-label', 'Raio da borracha');
    input.addEventListener('input', () => (this.plugin.settings.eraserSize = Number(input.value)));
    input.addEventListener('change', () => {
      void this.plugin.savePreferences();
      this.commitPanel();
    });
    const eraseAll = button(panel, 'Apagar toda a tinta', () => {
      if (!this.editable()) return;
      this.finish(false);
      const before = this.s.doc.elements;
      if (before.length) {
        this.s.doc.elements = before.filter(
          (e) => !Ink.isEditable(this.s.doc, e) || ['image', 'text'].includes(e.type)
        );
        this.s.history.push(before, this.s.doc.elements);
        this.pending = null;
        this.changed();
        this.updateSuggestion();
      }
      this.closePanel();
      new Notice('Tinta apagada. Use Desfazer para recuperar.');
    });
    eraseAll.className = 'si-full-width';
    panel.focus();
  }
  openPagePanel(anchor) {
    if (this.panelKind === 'page') {
      this.closePanel();
      return;
    }
    const panel = this.makePanel(anchor, 'Página e preferências', 'page');
    const row = element(panel, 'label', 'si-check-row');
    element(row, 'span', '', 'Papel');
    this.paper = element(row, 'select');
    for (const [v, t] of [
      ['dots', 'Pontos'],
      ['grid', 'Grade'],
      ['lines', 'Pautado'],
      ['plain', 'Liso']
    ]) {
      const o = element(this.paper, 'option', '', t);
      o.value = v;
    }
    this.paper.value = this.s?.doc.background || 'dots';
    this.paper.addEventListener('change', () => {
      if (this.editable()) {
        this.s.doc.background = this.paper.value;
        this.changed();
      }
    });
    const pen = element(panel, 'label', 'si-check-row');
    const penOnly = element(pen, 'input');
    penOnly.type = 'checkbox';
    penOnly.checked = this.plugin.settings.penOnly;
    element(pen, 'span', '', 'Desenhar somente com caneta');
    penOnly.addEventListener('change', () => {
      this.plugin.settings.penOnly = penOnly.checked;
      void this.plugin.savePreferences();
    });
    for (const [label, fn] of [
      ['Diagnóstico de desempenho', () => this.openPerformance()],
      ['Salvar agora', () => this.save()],
      ['Exportar SVG + nota', () => this.exportNote()],
      ['Baixar cópia editável', () => this.download()],
      [
        'Abrir recuperação',
        async () => {
          const f =
            this.s?.recoveryPath && this.app.vault.getAbstractFileByPath(this.s.recoveryPath);
          if (f instanceof TFile) await this.app.workspace.getLeaf(true).openFile(f);
          else new Notice('Nenhuma cópia de recuperação disponível.');
        }
      ]
    ])
      button(panel, label, () => {
        this.closePanel();
        fn();
      }).className = 'si-menu-action';
    panel.focus();
  }
  openSelectionStyle() {
    if (!this.selectedElements().length) return;
    // Use the same picker as the pen without changing the active tool.
    this.openBrushPanel('write', true);
  }
  styledElements(patch, selectedIds = this.selected) {
    const allowed = {};
    if (/^#[0-9a-f]{6}$/i.test(patch.color || '')) allowed.color = patch.color;
    for (const [k, min, max] of [
      ['width', 0.5, 10000],
      ['opacity', 0.05, 1],
      ['smoothing', 0, 1],
      ['streamline', 0, 1],
      ['cornerProtection', 0, 1],
      ['minWidth', 0.05, 1],
      ['pressureGamma', 0.25, 4],
      ['pressureMin', 0, 0.95],
      ['pressureMax', 0.05, 1]
    ]) {
      if (Number.isFinite(patch[k])) allowed[k] = Ink.clamp(patch[k], min, max);
    }
    if (typeof patch.pressure === 'boolean') allowed.pressure = patch.pressure;
    if (typeof patch.adaptiveInk === 'boolean') allowed.adaptiveInk = patch.adaptiveInk;
    if (['solid', 'dashed', 'dotted'].includes(patch.dash)) allowed.dash = patch.dash;
    if (!Object.keys(allowed).length) return this.s.doc.elements;
    const before = this.s.doc.elements;
    const after = before.map((e) => {
      if (!selectedIds.has(e.id) || !Ink.isEditable(this.s.doc, e)) return e;
      const p = { ...allowed };
      if (e.type !== 'stroke') {
        for (const key of [
          'smoothing',
          'streamline',
          'cornerProtection',
          'minWidth',
          'pressureGamma',
          'pressureMin',
          'pressureMax',
          'pressure',
          'adaptiveInk'
        ])
          delete p[key];
        if (e.type === 'image' || e.type === 'text') delete p.width;
        if (e.type === 'image') delete p.color;
      } else delete p.dash;
      if (['text', 'image'].includes(e.type)) delete p.dash;
      if (
        e.type === 'stroke' &&
        [
          'smoothing',
          'streamline',
          'cornerProtection',
          'minWidth',
          'pressureGamma',
          'pressureMin',
          'pressureMax',
          'pressure',
          'adaptiveInk'
        ].some((k) => k in p)
      ) {
        p.engine = 'perfect-freehand-1.2.3';
      }
      if (e.type === 'stroke' && ('pressureMin' in p || 'pressureMax' in p)) {
        const low = p.pressureMin ?? e.pressureMin ?? 0;
        p.pressureMax = Math.max(low + 0.05, p.pressureMax ?? e.pressureMax ?? 1);
      }
      if (Object.keys(p).every((k) => e[k] === p[k])) return e;
      return { ...e, ...p };
    });
    return after.every((e, i) => e === before[i]) ? before : after;
  }
  applySelectionStyle(patch, selectedIds = this.selected) {
    if (!this.editable()) return;
    const before = this.s.doc.elements,
      after = this.styledElements(patch, selectedIds);
    if (after === before) return;
    this.s.doc.elements = after;
    this.s.history.push(before, after);
    this.clearGroup();
    this.changed();
    this.updateSuggestion();
  }
  openPerformance() {
    const panel = this.makePanel(this.draftingButton, 'Desempenho observado', 'performance'),
      samples = this.renderStats.slice(),
      sorted = samples.map((s) => s.ms).sort((a, b) => a - b),
      latest = samples.at(-1);
    element(
      panel,
      'p',
      'si-panel-copy',
      samples.length
        ? 'Últimos ' +
            samples.length +
            ' quadros · média ' +
            (sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(1) +
            ' ms · p95 ' +
            sorted[Math.floor((sorted.length - 1) * 0.95)] +
            ' ms · objetos no quadro ' +
            latest.objects +
            '/' +
            latest.total
        : 'Navegue e desenhe para registrar quadros.'
    );
    element(
      panel,
      'p',
      'si-panel-copy',
      'Mede o trabalho JavaScript do canvas principal; não mede a latência física da caneta, composição da tela ou overlay ao escrever.'
    );
    button(panel, 'Atualizar leitura', () => this.openPerformance());
    button(panel, 'Limpar medições', () => {
      this.renderStats = [];
      this.openPerformance();
    });
  }
  openSampleComparison() {
    const originals = this.selectedElements().filter((e) => e.type === 'stroke');
    if (!originals.length) return;
    const revision = this.s.revision,
      panel = this.makePanel(this.modeButtons.select, 'Comparar a mesma amostra', 'samples');
    panel.classList.add('si-wide-panel');
    element(
      panel,
      'p',
      'si-panel-copy',
      'Os mesmos pontos aparecem em três versões. Nada muda na nota até aplicar. Use letras pequenas, acentos e curvas da sua mesa.'
    );
    const row = element(panel, 'div', 'si-comparison'),
      canvases = [];
    for (const title of ['Atual', 'Escrita', 'Seu ajuste']) {
      const cell = element(row, 'div');
      element(cell, 'strong', '', title);
      const c = element(cell, 'canvas', 'si-sample');
      c.width = 400;
      c.height = 280;
      canvases.push(c);
    }
    const patch = { streamline: 0.35, smoothing: 0.65, cornerProtection: 0.5 },
      b = Ink.bounds(originals),
      draw = () => {
        canvases.forEach((c, i) => {
          const ctx = c.getContext('2d');
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, 400, 280);
          const scale = Math.min(360 / Math.max(b.w, 1), 240 / Math.max(b.h, 1));
          ctx.translate(200 - (b.x + b.w / 2) * scale, 140 - (b.y + b.h / 2) * scale);
          ctx.scale(scale, scale);
          for (const e of originals) {
            const adjusted = i
              ? {
                  ...e,
                  engine: 'perfect-freehand-1.2.3',
                  ...(i === 1 ? { streamline: 0.15, smoothing: 0.55 } : patch)
                }
              : e;
            this.paint(ctx, adjusted);
          }
        });
      };
    for (const [key, title] of [
      ['cornerProtection', 'Preservar mudanças de direção', 0, 1, 0.05],
      ['streamline', 'Estabilização'],
      ['smoothing', 'Suavização']
    ]) {
      const label = element(panel, 'label', 'si-check-row');
      element(label, 'span', '', title);
      const input = element(label, 'input');
      input.type = 'range';
      input.min = '0';
      input.max = '1';
      input.step = '.05';
      input.value = String(patch[key]);
      input.addEventListener('input', () => {
        patch[key] = Number(input.value);
        draw();
      });
    }
    const info = element(panel, 'textarea');
    info.placeholder = 'Opcional: modelo da mesa, sistema, driver e o que incomoda no traço';
    info.setAttribute('aria-label', 'Contexto da amostra');
    button(panel, 'Aplicar ajuste à seleção', () => {
      if (this.s.revision !== revision) {
        new Notice('O desenho mudou. Reabra a comparação.');
        return;
      }
      this.applySelectionStyle(patch);
      this.closePanel();
    });
    button(panel, 'Salvar cópia da amostra', async () => {
      try {
        const doc = Ink.fresh();
        doc.elements = Ink.clone(originals).map((e) => ({ ...e, layerId: 'ink' }));
        doc.sampleInfo = {
          environment: this.win.navigator?.userAgent || 'indisponível',
          description: info.value || '',
          comparison: patch,
          pluginVersion: '0.13.1'
        };
        const path =
          this.s.file.path.replace(/\.smartink$/, '') + '-amostra-' + Ink.uid() + '.smartink';
        await this.app.vault.create(path, Ink.serialize(doc));
        new Notice('Amostra salva: ' + path + '. Você pode anexar esse arquivo na conversa.');
      } catch (e) {
        new Notice('Não foi possível salvar a amostra: ' + e.message);
      }
    });
    button(panel, 'Fechar sem alterar', () => this.closePanel());
    draw();
  }
  openCalibration(kind) {
    const panel = this.makePanel(this.modeButtons[kind], 'Teste e calibração', 'calibration');
    element(
      panel,
      'p',
      'si-panel-copy',
      'Desenhe aqui com pressão leve e forte. Esta área não é salva na nota. A calibração exige caneta com pressão real.'
    );
    const canvas = element(panel, 'canvas', 'si-calibration');
    canvas.width = 512;
    canvas.height = 320;
    canvas.style.width = '100%';
    canvas.style.height = '160px';
    canvas.style.touchAction = 'none';
    const state = { strokes: [], active: null, min: 1, max: 0, count: 0 };
    const status = element(panel, 'p', 'si-panel-copy', 'Aguardando amostras da caneta…');
    const draw = () => {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, 512, 320);
      for (const points of [...state.strokes, ...(state.active ? [state.active] : [])]) {
        ctx.fillStyle = this.plugin.settings.brushes[kind].color;
        ctx.globalAlpha = this.plugin.settings.brushes[kind].opacity;
        ctx.fill(
          new this.win.Path2D(
            Ink.inkPath({
              ...Brushes.strokeStyle(this.plugin.settings, kind),
              width: this.plugin.settings.brushes[kind].width * 2,
              points
            })
          )
        );
      }
    };
    const sample = (e) => {
      const r = canvas.getBoundingClientRect();
      if (e.pointerType === 'pen' && e.pressure > 0) {
        state.min = Math.min(state.min, e.pressure);
        state.max = Math.max(state.max, e.pressure);
        state.count++;
        status.textContent =
          'Pressão: ' +
          Math.round(e.pressure * 100) +
          '% · faixa ' +
          Math.round(state.min * 100) +
          '–' +
          Math.round(state.max * 100) +
          '%';
      }
      return {
        x: ((e.clientX - r.left) * 512) / r.width,
        y: ((e.clientY - r.top) * 320) / r.height,
        p: e.pressure > 0 ? e.pressure : 0.5,
        t: e.timeStamp,
        ...(e.pointerType === 'pen'
          ? {
              tiltX: Number.isFinite(e.tiltX) ? Ink.clamp(e.tiltX, -90, 90) : 0,
              tiltY: Number.isFinite(e.tiltY) ? Ink.clamp(e.tiltY, -90, 90) : 0
            }
          : {})
      };
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' || state.active) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      state.pointer = e.pointerId;
      state.active = [sample(e)];
      draw();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (state.active && e.pointerId === state.pointer) {
        state.active.push(sample(e));
        draw();
      }
    });
    const end = (e) => {
      if (state.active && e.pointerId === state.pointer) {
        state.strokes.push(state.active);
        state.active = null;
        draw();
      }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    button(panel, 'Aplicar faixa capturada', () => {
      if (state.count < 10 || state.max - state.min < 0.15) {
        status.textContent =
          'Faça mais traços leves e fortes; precisamos de pelo menos 10 amostras e 15% de variação.';
        return;
      }
      Brushes.updateBrush(this.plugin.settings, kind, {
        pressureMin: Math.max(0, state.min - 0.03),
        pressureMax: Math.min(1, state.max + 0.03)
      });
      void this.plugin.savePreferences();
      status.textContent = 'Faixa aplicada. Continue desenhando para testar.';
      draw();
    });
    button(panel, 'Restaurar pressão padrão', () => {
      Brushes.updateBrush(this.plugin.settings, kind, {
        pressureMin: 0,
        pressureMax: 1,
        pressureGamma: 1,
        minWidth: 0.2
      });
      void this.plugin.savePreferences();
      draw();
    });
    button(panel, 'Limpar teste', () => {
      state.strokes = [];
      state.active = null;
      state.min = 1;
      state.max = 0;
      state.count = 0;
      status.textContent = 'Aguardando amostras da caneta…';
      draw();
    });
    button(panel, 'Voltar ao pincel', () => this.openBrushPanel(kind));
  }
  layerElements(elements = this.s.doc.elements) {
    const layers = this.s.doc.layers;
    if (this.layerCache?.source === elements && this.layerCache.layers === layers)
      return this.layerCache.elements;
    const ordered = Ink.renderElements(this.s.doc, elements);
    this.layerCache = { source: elements, layers, elements: ordered };
    return ordered;
  }
  editableObjects() {
    return this.s.doc.elements.filter((e) => Ink.isEditable(this.s.doc, e));
  }
  activeLayer() {
    return this.s.doc.layers.find((l) => l.id === this.s.doc.activeLayer) || this.s.doc.layers[0];
  }
  commitElements(after) {
    if (!this.editable()) return;
    const before = this.s.doc.elements;
    after = Ink.resolveConnections(after);
    this.s.doc.elements = after;
    this.s.history.push(before, after);
    this.changed();
    this.updateSuggestion();
  }
  commitMeta(patch) {
    if (!this.editable()) return;
    this.finish(false);
    const keys = [
        'layers',
        'activeLayer',
        'template',
        'background',
        'drafting',
        'regions',
        'linkedStyle',
        'paperSpacing',
        'gridStyle'
      ],
      before = {},
      after = {};
    for (const k of keys) {
      if (this.s.doc[k] !== undefined) before[k] = Ink.clone(this.s.doc[k]);
    }
    Object.assign(this.s.doc, patch);
    for (const k of keys) {
      if (this.s.doc[k] !== undefined) after[k] = Ink.clone(this.s.doc[k]);
    }
    this.s.history.push(this.s.doc.elements, this.s.doc.elements);
    Object.assign(this.s.history.undoStack.at(-1), { metaBefore: before, metaAfter: after });
    this.selected = new Set(
      [...this.selected].filter((id) =>
        this.s.doc.elements.some((e) => e.id === id && Ink.isEditable(this.s.doc, e))
      )
    );
    this.changed();
    this.updateSuggestion();
  }
  restoreMeta(meta) {
    for (const k of [
      'layers',
      'activeLayer',
      'template',
      'background',
      'drafting',
      'regions',
      'linkedStyle',
      'paperSpacing',
      'gridStyle'
    ]) {
      if (meta[k] === undefined) delete this.s.doc[k];
      else this.s.doc[k] = Ink.clone(meta[k]);
    }
  }
  openOrganize() {
    const panel = this.makePanel(this.organizeButton, 'Organizar e conectar', 'organize');
    for (const [title, fn] of [
      ['Inserir texto', () => this.openTextEditor()],
      ['Inserir espaço', () => this.startSpace()],
      ['Elementos reutilizáveis', () => this.openAssets()],
      ['Regiões e minimapa', () => this.openRegions()],
      ['Interface e gestos', () => this.openInterface()],
      ['Precisão e escrita', () => this.openPrecision()],
      ['Atalhos e favoritos', () => this.openWorkflow()],
      ['Copiar bloco para uma nota', () => this.copyEmbed()],
      ['Recuperação', () => this.openRecovery()],
      ['Inserir imagem', () => this.chooseImage()],
      ['Camadas', () => this.openLayers()],
      ['Modelos de página', () => this.openTemplates()],
      ['Criar nota com prévia automática', () => this.createLinkedNote()]
    ])
      button(panel, title, fn).className = 'si-menu-action';
    for (const [key, title] of [
      ['snapPoints', 'Encaixar em pontos e fechar contornos'],
      ['smartGuides', 'Guias inteligentes ao mover'],
      ['holdShapes', 'Corrigir ao segurar (com Formas ativo)']
    ]) {
      const row = element(panel, 'label', 'si-check-row'),
        check = element(row, 'input');
      check.type = 'checkbox';
      check.checked = this.plugin.settings[key];
      element(row, 'span', '', title);
      check.addEventListener('change', () => {
        this.plugin.settings[key] = check.checked;
        void this.plugin.savePreferences();
      });
    }
    element(
      panel,
      'p',
      'si-panel-copy',
      'Alt suspende encaixes durante o gesto. O conector prende as extremidades às âncoras realçadas. Arraste a alça acima da seleção para girar; Shift encaixa em 15°.'
    );
  }
  openLayers() {
    const panel = this.makePanel(this.organizeButton, 'Camadas', 'layers');
    element(
      panel,
      'p',
      'si-panel-copy',
      'A ordem abaixo vai do fundo para a frente. Camadas ocultas não são exportadas; bloqueadas não podem ser editadas.'
    );
    for (const layer of this.s.doc.layers) {
      const row = element(panel, 'div', 'si-layer-row');
      const name = element(row, 'input');
      name.type = 'text';
      name.value = layer.name;
      name.setAttribute('aria-label', 'Nome da camada');
      name.addEventListener('change', () => {
        this.commitMeta({
          layers: this.s.doc.layers.map((l) =>
            l.id === layer.id ? { ...l, name: name.value.slice(0, 200) || 'Camada' } : l
          )
        });
      });
      button(row, layer.id === this.s.doc.activeLayer ? 'Ativa' : 'Usar', () => {
        this.commitMeta({ activeLayer: layer.id });
        this.openLayers();
      });
      button(row, layer.visible ? 'Ocultar' : 'Mostrar', () => {
        this.commitMeta({
          layers: this.s.doc.layers.map((l) =>
            l.id === layer.id ? { ...l, visible: !l.visible } : l
          )
        });
        this.openLayers();
      });
      button(row, layer.locked ? 'Desbloquear' : 'Bloquear', () => {
        this.commitMeta({
          layers: this.s.doc.layers.map((l) =>
            l.id === layer.id ? { ...l, locked: !l.locked } : l
          )
        });
        this.openLayers();
      });
      for (const [text, delta] of [
        ['↓', -1],
        ['↑', 1]
      ])
        button(row, text, () => {
          const layers = this.s.doc.layers.slice(),
            i = layers.findIndex((l) => l.id === layer.id),
            j = i + delta;
          if (j < 0 || j >= layers.length) return;
          [layers[i], layers[j]] = [layers[j], layers[i]];
          this.commitMeta({ layers });
          this.openLayers();
        });
      if (this.s.doc.layers.length > 1)
        button(row, 'Excluir camada…', () => this.openLayerDelete(layer.id));
      button(row, 'Mover seleção aqui', () => {
        if (layer.locked || !layer.visible) {
          new Notice('Mostre e desbloqueie a camada primeiro.');
          return;
        }
        const ids = new Set(this.selectedElements().map((e) => e.id));
        this.commitElements(
          this.s.doc.elements.map((e) => (ids.has(e.id) ? { ...e, layerId: layer.id } : e))
        );
      });
    }
    button(panel, '+ Nova camada', () => {
      if (this.s.doc.layers.length >= 50) return;
      const l = {
        id: Ink.uid(),
        name: 'Camada ' + (this.s.doc.layers.length + 1),
        visible: true,
        locked: false
      };
      this.commitMeta({ layers: [...this.s.doc.layers, l], activeLayer: l.id });
      this.openLayers();
    });
    const locked = this.s.doc.elements.filter((e) => e.locked);
    if (locked.length)
      button(panel, 'Desbloquear objetos da camada ativa', () => {
        this.commitElements(
          this.s.doc.elements.map((e) =>
            (e.layerId || 'ink') === this.s.doc.activeLayer ? { ...e, locked: false } : e
          )
        );
      });
  }
  openTemplates() {
    const panel = this.makePanel(this.organizeButton, 'Modelos de página', 'templates');
    element(
      panel,
      'p',
      'si-panel-copy',
      'Altera apenas as referências do papel; preserva sua tinta. Cornell e perguntas/respostas se repetem por blocos de 900 × 1200 unidades.'
    );
    for (const [key, title, bg] of [
      ['plain', 'Liso', 'plain'],
      ['ruled', 'Pautado', 'lines'],
      ['grid', 'Quadriculado', 'grid'],
      ['cornell', 'Cornell', 'lines'],
      ['cards', 'Fichas', 'plain'],
      ['qa', 'Pergunta e resposta', 'lines']
    ])
      button(panel, title, () => {
        this.commitMeta({ template: key, background: bg });
        this.closePanel();
      }).className = 'si-menu-action';
  }
  drawTemplate(ctx, view) {
    const type = this.s.doc.template;
    if (!['cornell', 'cards', 'qa'].includes(type)) return;
    ctx.save();
    ctx.strokeStyle = '#a9b4c7';
    ctx.fillStyle = '#718097';
    ctx.lineWidth = 1 / this.zoom;
    ctx.font = 12 / this.zoom + 'px sans-serif';
    const W = type === 'cards' ? 450 : 900,
      H = type === 'cards' ? 300 : 1200;
    let count = 0;
    for (let y = Math.floor(view.y / H) * H; y < view.y + view.h; y += H)
      for (let x = Math.floor(view.x / W) * W; x < view.x + view.w; x += W) {
        if (count++ > 500) break;
        ctx.strokeRect(x + 20, y + 20, W - 40, H - 40);
        if (type === 'cornell') {
          ctx.beginPath();
          ctx.moveTo(x + 240, y + 20);
          ctx.lineTo(x + 240, y + 960);
          ctx.moveTo(x + 20, y + 960);
          ctx.lineTo(x + W - 20, y + 960);
          ctx.stroke();
          ctx.fillText('Palavras-chave', x + 35, y + 50);
          ctx.fillText('Anotações', x + 255, y + 50);
          ctx.fillText('Resumo', x + 35, y + 990);
        } else if (type === 'qa') {
          ctx.beginPath();
          ctx.moveTo(x + 20, y + 400);
          ctx.lineTo(x + W - 20, y + 400);
          ctx.stroke();
          ctx.fillText('Pergunta', x + 35, y + 50);
          ctx.fillText('Resposta', x + 35, y + 430);
        } else ctx.fillText('Ficha', x + 35, y + 50);
      }
    ctx.restore();
  }
  chooseImage() {
    this.closePanel();
    const input = element(this.root, 'input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      if (
        file.size > 8 * 1024 * 1024 ||
        !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
      ) {
        new Notice('Use PNG, JPEG ou WebP de até 8 MB.');
        return;
      }
      const session = this.s,
        reader = new this.win.FileReader();
      reader.onload = () => {
        const image = new this.win.Image();
        image.onload = () => {
          if (this.s !== session) {
            new Notice('A página mudou; insira a imagem novamente.');
            return;
          }
          try {
            if (image.naturalWidth * image.naturalHeight > 40000000)
              throw new Error('Imagem acima de 40 milhões de pixels.');
            const prepared = this.prepareImage(image, String(reader.result));
            this.insertImageData(prepared.src, prepared.w, prepared.h);
          } catch (e) {
            new Notice(e.message);
          }
        };
        image.onerror = () => new Notice('Não foi possível decodificar a imagem.');
        image.src = String(reader.result);
      };
      reader.onerror = () => new Notice('Não foi possível ler a imagem.');
      reader.readAsDataURL(file);
    });
    input.click();
  }
  insertImageData(src, w, h) {
    if (!this.editable()) return;
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1 || w * h > 40000000)
      throw new Error('Imagem acima de 40 milhões de pixels ou dimensões inválidas.');
    const layer = this.activeLayer();
    if (layer.locked || !layer.visible)
      throw new Error('Escolha uma camada visível e desbloqueada.');
    const size = this.size(),
      center = Ink.screenToWorld({ x: size.w / 2, y: size.h / 2 }, this.camera, this.zoom),
      scale = Math.min(1, (size.w * 0.8) / (w * this.zoom), (size.h * 0.8) / (h * this.zoom));
    const e = {
      id: Ink.uid(),
      type: 'image',
      src,
      cx: center.x,
      cy: center.y,
      imageW: Math.max(1, w * scale),
      imageH: Math.max(1, h * scale),
      angle: 0,
      width: 1,
      color: '#ffffff',
      opacity: 1,
      layerId: layer.id
    };
    const after = [...this.s.doc.elements, e];
    Ink.parse(Ink.serialize({ ...this.s.doc, elements: after }));
    this.commitElements(after);
    this.selected = new Set([e.id]);
    this.mode = 'select';
    this.updateTools();
    this.render();
  }
  openObjectOptions() {
    const chosen = this.selectedElements();
    if (!chosen.length) return;
    const ids = new Set(chosen.map((e) => e.id)),
      panel = this.makePanel(this.modeButtons.select, 'Objetos e links', 'objects');
    const input = element(panel, 'input');
    input.type = 'text';
    input.placeholder = 'Pasta/Nota ou Nota#Seção';
    input.value = chosen[0].noteLink || '';
    input.setAttribute('aria-label', 'Nota de destino');
    button(panel, 'Salvar link na seleção', () => {
      let link = input.value.trim();
      const [note, ...section] = link.split('#'),
        resolved = this.app.metadataCache?.getFirstLinkpathDest(note, this.s.file.path);
      if (resolved)
        link = resolved.path.replace(/\.md$/, '') + (section.length ? '#' + section.join('#') : '');
      if (link.length > 2048 || /[\r\n<>]/.test(link)) {
        new Notice('Nome de nota inválido.');
        return;
      }
      this.commitElements(
        this.s.doc.elements.map((e) => (ids.has(e.id) ? { ...e, noteLink: link } : e))
      );
      this.closePanel();
    });
    button(panel, 'Abrir nota vinculada', () => {
      if (input.value.trim())
        void this.app.workspace.openLinkText(input.value.trim(), this.s.file.path, false);
    });
    button(panel, 'Bloquear seleção', () => {
      this.commitElements(
        this.s.doc.elements.map((e) => (ids.has(e.id) ? { ...e, locked: true } : e))
      );
      this.selected.clear();
      this.closePanel();
    });
    button(panel, 'Desconectar extremidades', () => {
      this.commitElements(
        this.s.doc.elements.map((e) => {
          if (!ids.has(e.id)) return e;
          const next = { ...e };
          delete next.bindings;
          return next;
        })
      );
      this.closePanel();
    });
    const label = element(panel, 'label', 'si-check-row');
    element(label, 'span', '', 'Rotação (graus)');
    const angle = element(label, 'input');
    angle.type = 'number';
    angle.value = '15';
    button(panel, 'Girar seleção', () => {
      const a = Number(angle.value);
      if (!Number.isFinite(a)) return;
      const b = this.selectionBox();
      if (!b) return;
      this.commitElements(
        this.s.doc.elements.map((e) =>
          ids.has(e.id)
            ? Ink.transform(e, {
                angle: (a * Math.PI) / 180,
                origin: { x: b.x + b.w / 2, y: b.y + b.h / 2 }
              })
            : e
        )
      );
      this.closePanel();
    });
  }
  snapPoint(p, event = {}, selfStart = null, exclude = new Set(), force = false) {
    this.snapMarker = null;
    const prefs = this.plugin.settings;
    if (!prefs.snapPoints || event.altKey) {
      this.snapLock = null;
      return { point: p, anchor: null };
    }
    const radius = prefs.snapRadius / this.zoom,
      writing = Brushes.SPECS[this.mode] && !this.shapeAssist && !force,
      candidates =
        !prefs.snapObjects || (writing && !prefs.snapWriting)
          ? []
          : this.layerElements().filter(
              (e) => !exclude.has(e.id) && ((this.mode !== 'connector' && !force) || !e.bindings)
            );
    let anchor = Ink.pickAnchor(p, candidates, radius, prefs.snapTypes, this.snapLock);
    if (
      prefs.snapOrigin &&
      selfStart &&
      Ink.dist(p, selfStart) < radius * (this.snapLock?.self ? 1.8 : 1)
    )
      anchor = { ...selfStart, self: true };
    if (!anchor) {
      this.snapLock = null;
      return { point: p, anchor: null };
    }
    this.snapLock = anchor;
    this.snapMarker = anchor;
    return {
      point: { ...p, x: anchor.x, y: anchor.y },
      anchor: anchor.self ? null : { targetId: anchor.targetId, index: anchor.index }
    };
  }

  armHold(a, p) {
    if (a.holdTimer && a.holdAnchor && Ink.dist(p, a.holdAnchor) < 3 / this.zoom) return;
    if (a.holdTimer) clearTimeout(a.holdTimer);
    a.holdAnchor = p;
    if (!a.recognize || !this.plugin.settings.holdShapes || a.straight || a.rawPoints.length < 5)
      return;
    a.holdTimer = setTimeout(() => {
      if (this.active !== a || a.heldShape) return;
      a.holdCandidates = Ink.recognizeGroups([a.stroke]).filter(
        (c) => c.score <= this.plugin.settings.quickShapeMaxError
      );
      a.holdCandidateIndex = 0;
      const candidate = a.holdCandidates[0];
      if (!candidate) return;
      a.heldShape = this.correctedShape(candidate.shape, a.stroke);
      this.hint.textContent =
        'Forma corrigida · Tab alterna candidatos · solte e confirme Aplicar · Desfazer recupera a tinta.';
      a.heldBase = a.heldShape;
      a.holdPoint = p;
      a.holdCenter = Ink.bounds([a.heldShape]);
      a.holdCenter = {
        x: a.holdCenter.x + a.holdCenter.w / 2,
        y: a.holdCenter.y + a.holdCenter.h / 2
      };
      this.drawOverlay();
    }, this.plugin.settings.holdDelay);
  }
  correctedShape(candidate, stroke, preserveEnds = true) {
    const shape = {
      ...candidate,
      id: Ink.uid(),
      color: stroke.color,
      width: stroke.width,
      opacity: stroke.opacity,
      layerId: stroke.layerId
    };
    if (shape.type === 'line' && preserveEnds) {
      const first = stroke.points[0],
        last = stroke.points.at(-1);
      shape.x1 = first.x;
      shape.y1 = first.y;
      shape.x2 = last.x;
      shape.y2 = last.y;
    }
    return shape;
  }
  cycleHeldShape() {
    const a = this.active;
    if (!a?.holdCandidates?.length) return;
    a.holdCandidateIndex = (a.holdCandidateIndex + 1) % a.holdCandidates.length;
    a.heldShape = this.correctedShape(a.holdCandidates[a.holdCandidateIndex].shape, a.stroke);
    a.heldBase = a.heldShape;
    const b = Ink.bounds([a.heldShape]);
    a.holdCenter = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    this.drawOverlay();
  }
  stopHold() {
    if (this.active?.holdTimer) clearTimeout(this.active.holdTimer);
  }
  rotationHandle(b) {
    return { x: b.x + b.w / 2, y: b.y - 28 / this.zoom };
  }
  async createLinkedNote() {
    if (!this.s) return;
    this.finish(false);
    await this.save();
    if (this.s.error) {
      new Notice('Resolva o erro de salvamento antes de vincular a página.');
      return;
    }
    try {
      const source = this.s.file,
        path = source.path.replace(/\.smartink$/, '') + '-nota-' + Ink.uid() + '.md',
        link = this.app.fileManager.generateMarkdownLink(source, path, '', 'Editar desenho');
      const note = await this.app.vault.create(
        path,
        '# Anotação Smart Ink\n\n```smartink\n' + source.path + '\n```\n\n' + link + '\n'
      );
      await this.app.workspace.getLeaf(true).openFile(note);
    } catch (e) {
      new Notice('Não foi possível criar a nota: ' + e.message);
    }
  }
  worldCenter() {
    const s = this.size();
    return Ink.screenToWorld({ x: s.w / 2, y: s.h / 2 }, this.camera, this.zoom);
  }
  openRadial(position) {
    if (!this.s) return;
    this.finish(false);
    this.closePanel();
    const root = this.root.getBoundingClientRect(),
      center = position ||
        this.lastPointer || {
          x: root.left + this.root.clientWidth / 2,
          y: root.top + this.root.clientHeight / 2
        },
      menu = element(this.root, 'div', 'si-radial');
    this.radial = menu;
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-label', 'Ferramentas perto da caneta');
    const x = Ink.clamp(center.x - root.left, 140, Math.max(140, this.root.clientWidth - 140)),
      y = Ink.clamp(center.y - root.top, 140, Math.max(140, this.root.clientHeight - 140));
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    const defaultEntries = [
      ['Caneta', () => this.selectTool('write', false, false)],
      ['Borracha', () => this.selectTool('erase', false, false)],
      ['Cursor', () => this.selectTool('select', false, false)],
      ['Laço', () => this.selectTool('lasso', false, false)],
      ['Cor', () => this.openBrushPanel(this.plugin.settings.lastBrush)],
      [
        'Mais fino',
        () =>
          this.setBrush(
            { width: this.plugin.settings.brushes[this.plugin.settings.lastBrush].width - 1 },
            true
          )
      ],
      [
        'Mais grosso',
        () =>
          this.setBrush(
            { width: this.plugin.settings.brushes[this.plugin.settings.lastBrush].width + 1 },
            true
          )
      ],
      ['Desfazer', () => this.undo()]
    ];
    const entries = this.radialEntries(defaultEntries);
    entries.forEach(([label, fn], i) => {
      const b = button(menu, label, () => {
        this.closeRadial();
        fn();
      });
      const a = (i * Math.PI) / 4 - Math.PI / 2;
      b.style.left = Math.cos(a) * 96 + 140 + 'px';
      b.style.top = Math.sin(a) * 96 + 140 + 'px';
    });
    const close = button(menu, 'Fechar', () => this.closeRadial());
    close.className = 'si-radial-close';
    close.focus();
  }
  closeRadial() {
    this.radial?.remove();
    this.radial = null;
  }
  openTextEditor(existing = null) {
    const session = this.s;
    if (!session) return;
    const panel = this.makePanel(
        this.organizeButton,
        existing ? 'Editar texto' : 'Inserir texto',
        'text'
      ),
      input = element(panel, 'textarea');
    input.value = existing?.text || '';
    input.maxLength = 10000;
    input.placeholder = 'Título, legenda ou explicação';
    input.setAttribute('aria-label', 'Texto do objeto');
    let size = existing?.fontSize || 24,
      align = existing?.align || 'left',
      bold = existing?.bold || false,
      color = existing?.color || this.plugin.settings.brushes.write.color;
    this.numberField(panel, 'Tamanho', size, 4, 200, (v) => (size = v));
    this.choiceField(
      panel,
      'Alinhamento',
      align,
      [
        ['left', 'Esquerda'],
        ['center', 'Centro'],
        ['right', 'Direita']
      ],
      (v) => (align = v)
    );
    this.toggleField(panel, 'Negrito', bold, (v) => (bold = v));
    const picker = element(panel, 'input');
    picker.type = 'color';
    picker.value = color;
    picker.addEventListener('change', () => (color = picker.value));
    button(panel, 'Aplicar texto', () => {
      if (this.s !== session || !this.editable()) return;
      const current = existing && this.s.doc.elements.find((e) => e.id === existing.id);
      if (existing && (!current || !Ink.isEditable(this.s.doc, current))) {
        new Notice('O objeto mudou ou foi bloqueado.');
        return;
      }
      const layer = this.activeLayer();
      if (!existing && (layer.locked || !layer.visible)) {
        new Notice('Escolha uma camada visível e desbloqueada.');
        return;
      }
      const text = input.value.slice(0, 10000);
      if (!text.trim()) return;
      const lines = text.split('\n'),
        ctx = this.canvas.getContext('2d');
      ctx.font = (bold ? 'bold ' : '') + size + 'px sans-serif';
      const width =
          Math.max(
            20,
            ...lines.map((line) => ctx.measureText?.(line)?.width || line.length * size * 0.65)
          ) + 8,
        height = lines.length * size * 1.25 + 8;
      const object = {
        ...(current || {}),
        id: existing?.id || Ink.uid(),
        type: 'text',
        ...(existing ? { cx: current.cx, cy: current.cy } : this.centerProperties()),
        text,
        fontSize: size,
        align,
        bold,
        color,
        width: 1,
        opacity: existing?.opacity || 1,
        imageW: width,
        imageH: height,
        angle: existing?.angle || 0,
        layerId: existing?.layerId || layer.id
      };
      this.commitElements(
        existing
          ? this.s.doc.elements.map((e) => (e.id === existing.id ? object : e))
          : [...this.s.doc.elements, object]
      );
      this.mode = 'select';
      this.selected = new Set([object.id]);
      this.closePanel();
      this.updateTools();
      this.drawOverlay();
    });
    input.focus();
  }
  centerProperties() {
    const p = this.worldCenter();
    return { cx: p.x, cy: p.y };
  }
  beginVisualCrop() {
    this.finish(false);
    const e = this.selectedElements().find((e) => e.type === 'image');
    if (!e) return;
    this.cropEditing = e.id;
    this.pointEditing = null;
    this.closePanel();
    this.mode = 'select';
    this.hint.textContent =
      'Recorte: arraste um canto. Prévia durante o gesto; solte e confirme Aplicar. Esc encerra. Desfazer restaura.';
    this.drawOverlay();
  }
  cropDown(p, event) {
    const e = this.s.doc.elements.find(
      (e) => e.id === this.cropEditing && Ink.isEditable(this.s.doc, e)
    );
    if (!e) return false;
    const index = Ink.imageCorners(e).findIndex((q) => Ink.dist(q, p) < 12 / this.zoom);
    if (index < 0) return false;
    this.active = {
      mode: 'crop',
      pointer: event.pointerId,
      element: e,
      index,
      start: p,
      before: this.s.doc.elements.slice(),
      revision: this.s.revision
    };
    return true;
  }
  cropMove(p) {
    const a = this.active,
      next = Ink.cropImage(a.element, a.index, p);
    a.preview = Ink.resolveConnections(a.before.map((e) => (e.id === next.id ? next : e)));
    a.changed = Ink.dist(p, a.start) > 0.2 / this.zoom;
    this.render();
  }
  startSpace() {
    this.finish(false);
    this.mode = 'space';
    this.closePanel();
    this.updateTools();
    this.hint.textContent =
      'Inserir espaço: arraste para baixo a partir da faixa desejada. Objetos inteiros abaixo dela serão deslocados. Esc cancela.';
  }
  beginSpace(p, event) {
    const ids = Ink.expandGroups(
      this.editableObjects(),
      new Set(
        this.editableObjects()
          .filter((e) => Ink.elementBounds(e).y >= p.y)
          .map((e) => e.id)
      )
    );
    this.active = {
      mode: 'space',
      pointer: event.pointerId,
      start: p,
      before: this.s.doc.elements.slice(),
      revision: this.s.revision,
      ids,
      dy: 0
    };
  }
  spaceMove(p) {
    const a = this.active;
    a.dy = Math.max(0, p.y - a.start.y);
    a.preview = Ink.resolveConnections(
      a.before.map((e) => (a.ids.has(e.id) ? Ink.transform(e, { dy: a.dy }) : e))
    );
    a.changed = a.dy > 0.5 / this.zoom;
    this.render();
  }
  openAssets() {
    const panel = this.makePanel(this.organizeButton, 'Elementos reutilizáveis', 'assets'),
      name = element(panel, 'input');
    name.placeholder = 'Nome do elemento';
    button(panel, 'Salvar seleção como elemento', () => {
      const selected = this.selectedElements();
      if (!selected.length) {
        new Notice('Selecione objetos primeiro.');
        return;
      }
      const ids = new Set(selected.map((e) => e.id)),
        doc = Ink.fresh();
      doc.elements = Ink.clone(selected).map((e) => {
        e.layerId = 'ink';
        e.locked = false;
        if (e.geometryRule?.targetId && !ids.has(e.geometryRule.targetId)) delete e.geometryRule;
        if (e.bindings)
          for (const key of Object.keys(e.bindings))
            if (!ids.has(e.bindings[key].targetId)) delete e.bindings[key];
        return e;
      });
      const text = Ink.serialize(doc);
      if (text.length > 2000000) {
        new Notice('Seleção acima de 2 MB. Reduza imagens ou divida o elemento.');
        return;
      }
      const assets = this.plugin.settings.assets;
      if (assets.length >= 20 || JSON.stringify(assets).length + text.length > 10000000) {
        new Notice('Limite de 20 elementos ou 10 MB atingido. Remova um item antes.');
        return;
      }
      Ink.parse(text);
      assets.push({ id: Ink.uid(), name: (name.value || 'Elemento').slice(0, 100), doc });
      void this.plugin.savePreferences();
      this.openAssets();
    });
    for (const asset of this.plugin.settings.assets) {
      let doc;
      try {
        doc = Ink.parse(Ink.serialize(asset.doc));
      } catch {
        continue;
      }
      const card = element(panel, 'div', 'si-asset-card'),
        thumb = element(card, 'div', 'si-thumbnail');
      thumb.innerHTML = Ink.svg(doc);
      button(card, String(asset.name), () => this.insertAsset(doc));
      button(card, 'Remover', () => {
        this.plugin.settings.assets = this.plugin.settings.assets.filter((a) => a.id !== asset.id);
        void this.plugin.savePreferences();
        this.openAssets();
      });
    }
    element(
      panel,
      'p',
      'si-panel-copy',
      'Os elementos ficam nas preferências do plugin deste vault. Inserir cria objetos independentes e preserva conexões internas.'
    );
  }
  insertAsset(doc) {
    if (!this.editable()) return;
    const layer = this.activeLayer();
    if (layer.locked || !layer.visible) {
      new Notice('Escolha uma camada visível e desbloqueada.');
      return;
    }
    doc = Ink.parse(Ink.serialize(doc));
    const b = Ink.bounds(doc.elements);
    if (!b) return;
    const center = this.worldCenter(),
      ids = new Map(doc.elements.map((e) => [e.id, Ink.uid()])),
      groups = new Map(doc.elements.filter((e) => e.groupId).map((e) => [e.groupId, Ink.uid()])),
      copies = doc.elements.map((e) => {
        const copy = {
          ...Ink.transform(e, { dx: center.x - b.x - b.w / 2, dy: center.y - b.y - b.h / 2 }),
          id: ids.get(e.id),
          layerId: layer.id,
          locked: false
        };
        if (e.groupId) copy.groupId = groups.get(e.groupId);
        if (copy.geometryRule?.targetId) {
          if (ids.has(copy.geometryRule.targetId))
            copy.geometryRule = {
              ...copy.geometryRule,
              targetId: ids.get(copy.geometryRule.targetId)
            };
          else delete copy.geometryRule;
        }
        if (copy.bindings) {
          copy.bindings = {};
          for (const [key, b] of Object.entries(e.bindings))
            if (ids.has(b.targetId)) copy.bindings[key] = { ...b, targetId: ids.get(b.targetId) };
        }
        return copy;
      });
    this.commitElements([...this.s.doc.elements, ...copies]);
    this.selected = new Set(copies.map((e) => e.id));
    this.mode = 'select';
    this.closePanel();
    this.updateTools();
    this.drawOverlay();
  }
  async openVisualRecovery() {
    const session = this.s,
      panel = this.makePanel(this.organizeButton, 'Comparar recuperação', 'visual-recovery');
    panel.classList.add('si-wide-panel');
    element(
      panel,
      'p',
      'si-panel-copy',
      'Escolha uma cópia para comparar na mesma escala e recuperar como nova página. O original é preservado.'
    );
    const id = this.plugin.backupKey(session),
      files = (this.app.vault.getFiles?.() || []).filter(
        (f) => f.path.startsWith('Smart Ink Backups/' + id + '-') && f.path.endsWith('.smartink')
      );
    if (!files.length) element(panel, 'p', '', 'Nenhuma cópia disponível ainda.');
    for (const file of files) {
      try {
        const saved = Ink.parse(await this.app.vault.read(file));
        if (this.flyout !== panel || this.s !== session) return;
        const card = element(panel, 'div', 'si-recovery-card');
        element(
          card,
          'strong',
          '',
          saved.recoveryInfo?.savedAt
            ? new Date(saved.recoveryInfo.savedAt).toLocaleString('pt-BR')
            : file.basename
        );
        const bounds = Ink.expand(
            Ink.bounds([...session.doc.elements, ...saved.elements]) || {
              x: 0,
              y: 0,
              w: 800,
              h: 600
            },
            20
          ),
          row = element(card, 'div', 'si-comparison');
        for (const [title, doc] of [
          ['Atual', session.doc],
          ['Cópia', saved]
        ]) {
          const column = element(row, 'div');
          element(column, 'span', '', title);
          const thumb = element(column, 'div', 'si-thumbnail');
          thumb.innerHTML = Ink.svg(doc, '', { paper: true, bounds });
        }
        element(
          card,
          'p',
          '',
          session.doc.elements.length + ' objetos atuais / ' + saved.elements.length + ' na cópia'
        );
        button(card, 'Recuperar como nova página', async () => {
          try {
            const restored = Ink.clone(saved);
            restored.id = Ink.uid();
            delete restored.recoveryInfo;
            const path =
                session.file.path.replace(/\.smartink$/, '') +
                '-restaurado-' +
                Ink.uid() +
                '.smartink',
              file = await this.app.vault.create(path, Ink.serialize(restored));
            await this.app.workspace.getLeaf(true).openFile(file);
          } catch (e) {
            new Notice('Não foi possível recuperar: ' + e.message);
          }
        });
      } catch (e) {
        if (this.flyout === panel)
          element(panel, 'p', 'si-error', file.basename + ': ' + e.message);
      }
    }
  }
  openRegions() {
    const panel = this.makePanel(this.organizeButton, 'Regiões e minimapa', 'regions'),
      name = element(panel, 'input');
    name.placeholder = 'Nome da região';
    const add = (selection) => {
      const dims = this.size(),
        tl = Ink.screenToWorld({ x: 0, y: 0 }, this.camera, this.zoom),
        b = selection ? this.selectionBox() : this.viewportBounds();
      if (!b) {
        new Notice('Selecione objetos primeiro.');
        return;
      }
      const regions = this.s.doc.regions || [];
      if (regions.length >= 100) return;
      this.commitMeta({
        regions: [
          ...regions,
          {
            id: Ink.uid(),
            name: (name.value || 'Região ' + (regions.length + 1)).slice(0, 100),
            ...b,
            w: Math.max(1, b.w),
            h: Math.max(1, b.h)
          }
        ]
      });
      this.openRegions();
    };
    button(panel, 'Marcar área visível', () => add(false));
    button(panel, 'Marcar seleção', () => add(true));
    this.miniMap = element(panel, 'canvas', 'si-minimap');
    this.miniMap.width = 280;
    this.miniMap.height = 180;
    this.miniMap.setAttribute('aria-label', 'Minimapa: clique para navegar');
    this.miniMap.addEventListener('pointerdown', (e) => {
      if (!this.mapBounds) return;
      const rect = this.miniMap.getBoundingClientRect(),
        p = {
          x: ((e.clientX - rect.left) * 280) / rect.width,
          y: ((e.clientY - rect.top) * 180) / rect.height
        },
        b = this.mapBounds,
        world = { x: b.x + p.x / b.scale, y: b.y + p.y / b.scale },
        dims = this.size();
      this.rememberView();
      this.centerView(world);
      this.render();
    });
    for (const region of this.s.doc.regions || []) {
      const row = element(panel, 'div', 'si-layer-row');
      button(row, region.name, () => this.fitRegion(region));
      const rename = element(row, 'input');
      rename.value = region.name;
      rename.setAttribute('aria-label', 'Nome da região');
      rename.addEventListener('change', () =>
        this.commitMeta({
          regions: this.s.doc.regions.map((r) =>
            r.id === region.id ? { ...r, name: rename.value.slice(0, 100) || r.name } : r
          )
        })
      );
      button(row, 'Remover', () => {
        this.commitMeta({ regions: this.s.doc.regions.filter((r) => r.id !== region.id) });
        this.openRegions();
      });
    }
    this.drawMinimap();
  }
  fitRegion(b) {
    this.finish(false);
    const size = this.size();
    this.zoom = Ink.clamp(Math.min((size.w - 60) / b.w, (size.h - 60) / b.h), 0.1, 8);
    this.camera = {
      x: size.w / 2 - (b.x + b.w / 2) * this.zoom,
      y: size.h / 2 - (b.y + b.h / 2) * this.zoom
    };
    this.syncZoom();
    this.render();
  }
  drawMinimap() {
    if (this.panelKind !== 'regions' || !this.miniMap) return;
    const ctx = this.miniMap.getContext('2d'),
      size = this.size(),
      tl = Ink.screenToWorld({ x: 0, y: 0 }, this.camera, this.zoom),
      view = this.viewportBounds(),
      objects = this.layerElements(),
      content = Ink.bounds(objects),
      b = content
        ? Ink.pointBounds([
            { x: content.x, y: content.y },
            { x: content.x + content.w, y: content.y + content.h },
            { x: view.x, y: view.y },
            { x: view.x + view.w, y: view.y + view.h }
          ])
        : view,
      padded = Ink.expand(b, 20),
      scale = Math.min(280 / padded.w, 180 / padded.h);
    this.mapBounds = { ...padded, scale };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, 280, 180);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 280, 180);
    ctx.scale(scale, scale);
    ctx.translate(-padded.x, -padded.y);
    for (const e of objects) {
      const r = Ink.elementBounds(e);
      ctx.fillStyle = e.color;
      ctx.fillRect(r.x, r.y, Math.max(r.w, 1 / scale), Math.max(r.h, 1 / scale));
    }
    ctx.strokeStyle = '#0078d4';
    ctx.lineWidth = 2 / scale;
    ctx.beginPath();
    [
      { x: 0, y: 0 },
      { x: size.w, y: 0 },
      { x: size.w, y: size.h },
      { x: 0, y: size.h }
    ]
      .map((p) => Ink.screenToWorld(p, this.camera, this.zoom))
      .forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.stroke();
  }
  openDiagram() {
    const panel = this.makePanel(this.organizeButton, 'Formatar diagrama', 'diagram');
    const patch = (values) => {
      const ids = new Set(this.selectedElements().map((e) => e.id));
      this.commitElements(
        this.s.doc.elements.map((e) => (ids.has(e.id) ? { ...e, ...values } : e))
      );
    };
    const color = element(panel, 'input');
    color.type = 'color';
    color.value = '#dceeff';
    button(panel, 'Preencher formas', () => {
      const ids = new Set(
        this.selectedElements()
          .filter((e) => ['circle', 'ellipse', 'rectangle', 'triangle'].includes(e.type))
          .map((e) => e.id)
      );
      this.commitElements(
        this.s.doc.elements.map((e) => (ids.has(e.id) ? { ...e, fill: color.value } : e))
      );
    });
    button(panel, 'Remover preenchimento', () => patch({ fill: 'none' }));
    this.choiceField(
      panel,
      'Linha',
      'solid',
      [
        ['solid', 'Contínua'],
        ['dashed', 'Tracejada'],
        ['dotted', 'Pontilhada']
      ],
      (dash) => {
        const ids = new Set(
          this.selectedElements()
            .filter((e) => !['image', 'text', 'stroke'].includes(e.type))
            .map((e) => e.id)
        );
        this.commitElements(this.s.doc.elements.map((e) => (ids.has(e.id) ? { ...e, dash } : e)));
      }
    );
    for (const [op, title] of [
      ['left', 'Alinhar à esquerda'],
      ['right', 'Alinhar à direita'],
      ['top', 'Alinhar acima'],
      ['bottom', 'Alinhar abaixo'],
      ['center-x', 'Centralizar horizontalmente'],
      ['center-y', 'Centralizar verticalmente'],
      ['distribute-x', 'Distribuir horizontalmente'],
      ['distribute-y', 'Distribuir verticalmente']
    ])
      button(panel, title, () =>
        this.commitElements(
          Ink.arrange(this.s.doc.elements, new Set(this.selectedElements().map((e) => e.id)), op)
        )
      );
    button(panel, 'Trazer à frente na camada', () => this.reorderSelection(true));
    button(panel, 'Enviar ao fundo na camada', () => this.reorderSelection(false));
  }
  reorderSelection(front) {
    const ids = new Set(this.selectedElements().map((e) => e.id)),
      elements = this.s.doc.elements,
      after = [];
    for (const layer of this.s.doc.layers) {
      const group = elements.filter((e) => (e.layerId || 'ink') === layer.id),
        selected = group.filter((e) => ids.has(e.id)),
        rest = group.filter((e) => !ids.has(e.id));
      after.push(...(front ? [...rest, ...selected] : [...selected, ...rest]));
    }
    this.commitElements(after);
  }
  openInterface() {
    const panel = this.makePanel(this.organizeButton, 'Interface e gestos', 'interface'),
      s = this.plugin.settings,
      save = () => {
        this.applyLayout();
        void this.plugin.savePreferences();
      };
    this.choiceField(
      panel,
      'Barra de ferramentas',
      s.layout,
      [
        ['top', 'Superior'],
        ['bottom', 'Inferior'],
        ['left', 'Lateral esquerda'],
        ['right', 'Lateral direita']
      ],
      (v) => {
        s.layout = v;
        save();
      }
    );
    this.toggleField(panel, 'Modo canhoto (barra à direita)', s.leftHanded, (v) => {
      s.leftHanded = v;
      if (v) s.layout = 'right';
      save();
    });
    this.choiceField(
      panel,
      'Densidade dos controles',
      s.largeControls ? 'comfortable' : 'compact',
      [
        ['compact', 'Compacta'],
        ['comfortable', 'Confortável · mesa digitalizadora']
      ],
      (v) => {
        s.largeControls = v === 'comfortable';
        save();
      }
    );
    this.toggleField(panel, 'Botão secundário abre menu radial', s.radialButton, (v) => {
      s.radialButton = v;
      save();
    });
    const radial = button(panel, 'Tecla do menu radial: ' + s.radialKey);
    radial.addEventListener('keydown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!/^Key[A-Z]$/.test(e.code)) return;
      if (
        e.code === s.returnBrushKey ||
        e.code === s.brushAdjustKey ||
        Object.values(s.quickKeys || {}).includes(e.code) ||
        Object.values(s.shortcuts).includes(e.code) ||
        e.code === s.temporaryKey ||
        e.code === s.straightKey
      ) {
        new Notice('Tecla já utilizada.');
        return;
      }
      s.radialKey = e.code;
      save();
      radial.textContent = 'Tecla do menu radial: ' + e.code;
    });
    for (const [key, label] of [
      ['scratch', 'Riscar para apagar'],
      ['undo', 'Gesto para desfazer'],
      ['lasso', 'Laço temporário']
    ])
      this.toggleField(panel, label, s.gestures[key], (v) => {
        s.gestures[key] = v;
        save();
      });
    element(
      panel,
      'p',
      'si-panel-copy',
      'Gestos desligados por padrão. Com Alt segurado: zigue-zague apaga objetos tocados; traço horizontal para a esquerda desfaz. Com Shift segurado: laço temporário. Se o gesto não for reconhecido, nada muda. Arraste o título de um painel para guardar sua posição.'
    );
    button(panel, 'Restaurar posições dos painéis', () => {
      s.panelPositions = {};
      void this.plugin.savePreferences();
      this.openInterface();
    });
  }
  applyLayout() {
    const s = this.plugin.settings;
    this.root.dataset.layout = s.layout;
    this.root.classList.toggle('si-left-handed', s.leftHanded);
    this.root.classList.toggle('si-large-controls', s.largeControls);
    this.render();
  }
  finishGesture(a) {
    const settings = this.plugin.settings.gestures;
    if (settings.scratch && Ink.scribbleGesture(a.points)) {
      const ids = new Set(
        this.editableObjects()
          .filter((e) =>
            Ink.resample(a.points, 200).some((p) => this.visible.hit(e, p, 10 / this.zoom))
          )
          .map((e) => e.id)
      );
      if (ids.size) this.commitElements(this.s.doc.elements.filter((e) => !ids.has(e.id)));
      else new Notice('Nenhum objeto tocado pelo gesto.');
    } else if (settings.undo && Ink.undoGesture(a.points)) this.undo();
    else new Notice('Gesto não reconhecido; desenho preservado.');
    this.drawOverlay();
  }
  addConnectorPoint() {
    const e = this.selectedElements()[0];
    if (!e?.connector) return;
    const points =
      e.route === 'polyline'
        ? e.waypoints || []
        : e.route === 'curve'
          ? [Ink.connectorLabelPoint(e)]
          : Ink.connectorBody(e).slice(1, -1);
    if (points.length >= 20) {
      new Notice('Limite de 20 pontos intermediários.');
      return;
    }
    const last = points.at(-1) || { x: e.x1, y: e.y1 },
      waypoints = [...points, { x: (last.x + e.x2) / 2, y: (last.y + e.y2) / 2 }];
    this.commitElements(
      this.s.doc.elements.map((x) => (x.id === e.id ? { ...x, route: 'polyline', waypoints } : x))
    );
    this.startPointEditing();
  }

  numberField(panel, title, value, min, max, change, step = 1) {
    const row = element(panel, 'label', 'si-check-row');
    element(row, 'span', '', title);
    const input = element(row, 'input');
    input.type = 'number';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.addEventListener('change', () => {
      const n = Number(input.value);
      if (Number.isFinite(n)) change(Ink.clamp(n, min, max));
    });
    return input;
  }
  toggleField(panel, title, value, change) {
    const row = element(panel, 'label', 'si-check-row'),
      input = element(row, 'input');
    input.type = 'checkbox';
    input.checked = value;
    element(row, 'span', '', title);
    input.addEventListener('change', () => change(input.checked));
    return input;
  }
  choiceField(panel, title, value, choices, change) {
    const row = element(panel, 'label', 'si-check-row');
    element(row, 'span', '', title);
    const select = element(row, 'select');
    for (const [key, label] of choices) {
      const option = element(select, 'option', '', label);
      option.value = key;
    }
    select.value = value;
    select.addEventListener('change', () => change(select.value));
    return select;
  }
  openPrecision() {
    const panel = this.makePanel(this.organizeButton, 'Precisão e escrita', 'precision'),
      s = this.plugin.settings,
      save = () => void this.plugin.savePreferences();
    this.toggleField(panel, 'Atrair escrita livre para outros objetos', s.snapWriting, (v) => {
      s.snapWriting = v;
      save();
    });
    for (const [key, label] of [
      ['endpoints', 'Extremidades'],
      ['corners', 'Cantos'],
      ['midpoints', 'Meios de lado / pontos cardinais']
    ])
      this.toggleField(panel, label, s.snapTypes[key], (v) => {
        s.snapTypes[key] = v;
        save();
      });
    this.numberField(panel, 'Raio do encaixe (pixels)', s.snapRadius, 3, 24, (v) => {
      s.snapRadius = v;
      save();
    });
    this.numberField(
      panel,
      'Espera para corrigir forma (ms)',
      s.holdDelay,
      300,
      2000,
      (v) => {
        s.holdDelay = v;
        save();
      },
      50
    );
    element(
      panel,
      'p',
      'si-panel-copy',
      'Escrita livre fecha seu próprio contorno. Formas e conectores atraem outros objetos. Depois do encaixe, afaste 1,8× o raio para soltar. Alt suspende.'
    );
    button(panel, 'Testar sua escrita', () => this.openCalibration(s.lastBrush));
  }
  groupSelection(ungroup = false) {
    const ids = new Set(this.selectedElements().map((e) => e.id));
    if (!ids.size || (!ungroup && ids.size < 2)) return;
    const group = Ink.uid();
    this.commitElements(
      this.s.doc.elements.map((e) => {
        if (!ids.has(e.id)) return e;
        const out = { ...e };
        if (ungroup) delete out.groupId;
        else out.groupId = group;
        return out;
      })
    );
  }
  expandSelection() {
    this.selected = Ink.expandGroups(this.editableObjects(), this.selected);
  }
  startPointEditing() {
    this.finish(false);
    const e = this.selectedElements()[0];
    if (this.selectedElements().length !== 1 || !Ink.pointHandles(e).length) {
      new Notice('Selecione uma linha, conector, polígono, círculo ou elipse.');
      return;
    }
    this.pointEditing = e.id;
    this.closePanel();
    this.drawOverlay();
    this.hint.textContent =
      'Arraste os pontos. Extremidades de conectores podem ser reconectadas; Alt solta o encaixe. Esc encerra.';
  }
  pointEditDown(p, event) {
    if (!this.pointEditing) return false;
    const e = this.s.doc.elements.find(
      (e) => e.id === this.pointEditing && Ink.isEditable(this.s.doc, e)
    );
    if (!e) {
      this.pointEditing = null;
      return false;
    }
    const h = Ink.pointHandles(e).find((h) => Ink.dist(h, p) < 10 / this.zoom);
    if (!h) return false;
    this.active = {
      mode: 'point-edit',
      pointer: event.pointerId,
      before: this.s.doc.elements.slice(),
      revision: this.s.revision,
      element: e,
      index: h.index,
      start: p
    };
    return true;
  }
  pointEditMove(p, event) {
    const a = this.active;
    const snap =
      a.index >= 2
        ? { point: p, anchor: null }
        : this.snapPoint(p, event, null, new Set([a.element.id]), true);
    let next = Ink.editPoint(a.element, a.index, snap.point);
    if (next.connector && a.index < 2 && snap.anchor)
      next.bindings = { ...next.bindings, [a.index === 0 ? 'start' : 'end']: snap.anchor };
    a.preview = Ink.resolveConnections(a.before.map((e) => (e.id === next.id ? next : e)));
    a.changed = Ink.dist(a.start, p) > 0.2 / this.zoom;
    this.render();
  }
  openConnectorOptions() {
    const chosen = this.selectedElements().filter((e) => ['line', 'arrow'].includes(e.type));
    if (!chosen.length) return;
    const ids = new Set(chosen.map((e) => e.id)),
      panel = this.makePanel(this.organizeButton, 'Conectores', 'connectors');
    const patch = (values) =>
      this.commitElements(
        this.s.doc.elements.map((e) =>
          ids.has(e.id) ? { ...e, connector: true, headLength: e.headLength || 16, ...values } : e
        )
      );
    this.choiceField(
      panel,
      'Caminho',
      chosen[0].route || 'straight',
      [
        ['straight', 'Reto'],
        ['curve', 'Curvo'],
        ['elbow', 'Cotovelo'],
        ['polyline', 'Pontos intermediários']
      ],
      (route) => patch({ route })
    );
    this.toggleField(panel, 'Seta no início', !!chosen[0].startArrow, (startArrow) =>
      patch({ startArrow })
    );
    this.toggleField(panel, 'Seta no fim', chosen[0].endArrow !== false, (endArrow) =>
      patch({ endArrow })
    );
    const label = element(panel, 'input');
    label.type = 'text';
    label.maxLength = 300;
    label.value = chosen[0].label || '';
    label.placeholder = 'Rótulo do conector';
    button(panel, 'Aplicar rótulo', () => patch({ label: label.value.slice(0, 300) }));
    button(panel, 'Adicionar ponto intermediário', () => this.addConnectorPoint());
    button(panel, 'Remover último ponto intermediário', () => {
      const selected = this.selectedElements()[0];
      if (selected?.waypoints?.length) {
        this.commitElements(
          this.s.doc.elements.map((e) =>
            e.id === selected.id ? { ...e, waypoints: e.waypoints.slice(0, -1) } : e
          )
        );
        this.startPointEditing();
      }
    });
    button(panel, 'Editar / reconectar extremidades', () => this.startPointEditing());
  }
  deleteLayer(id, removeObjects = false) {
    if (!this.editable()) return;
    if (this.s.doc.layers.length <= 1) return;
    const target =
      this.s.doc.layers.find((l) => l.id !== id && !l.locked && l.visible) ||
      this.s.doc.layers.find((l) => l.id !== id);
    const before = this.s.doc.elements,
      old = Ink.clone({ layers: this.s.doc.layers, activeLayer: this.s.doc.activeLayer });
    const elements = removeObjects
      ? before.filter((e) => (e.layerId || 'ink') !== id)
      : before.map((e) => ((e.layerId || 'ink') === id ? { ...e, layerId: target.id } : e));
    const layers = this.s.doc.layers.filter((l) => l.id !== id),
      activeLayer = this.s.doc.activeLayer === id ? target.id : this.s.doc.activeLayer;
    this.commitElements(elements);
    Object.assign(this.s.doc, { layers, activeLayer });
    Object.assign(this.s.history.undoStack.at(-1), {
      layerBefore: old,
      layerAfter: Ink.clone({ layers, activeLayer })
    });
    this.changed();
    this.openLayers();
  }
  openLayerDelete(id) {
    const layer = this.s.doc.layers.find((l) => l.id === id),
      panel = this.makePanel(this.organizeButton, 'Remover camada', 'remove-layer');
    element(
      panel,
      'p',
      'si-panel-copy',
      'Camada: ' +
        layer.name +
        '. Escolha o destino do conteúdo. Ambas as ações podem ser desfeitas.'
    );
    button(panel, 'Mover objetos para outra camada e remover', () => this.deleteLayer(id, false));
    button(panel, 'Excluir camada e seus objetos', () => this.deleteLayer(id, true));
  }
  openImageOptions() {
    const image = this.selectedElements().find((e) => e.type === 'image');
    if (!image) return;
    const panel = this.makePanel(
        this.organizeButton,
        'Imagem: recorte e opacidade',
        'image-options'
      ),
      crop = { ...(image.crop || { x: 0, y: 0, w: 1, h: 1 }) };
    for (const [key, title] of [
      ['x', 'Esquerda (%)'],
      ['y', 'Topo (%)'],
      ['w', 'Largura (%)'],
      ['h', 'Altura (%)']
    ])
      this.numberField(
        panel,
        title,
        crop[key] * 100,
        key === 'w' || key === 'h' ? 1 : 0,
        100,
        (v) => (crop[key] = v / 100)
      );
    button(panel, 'Recortar arrastando os cantos', () => this.beginVisualCrop());
    button(panel, 'Aplicar recorte', () => {
      if (crop.x + crop.w > 1 || crop.y + crop.h > 1) {
        new Notice('O recorte precisa ficar dentro de 100% da imagem.');
        return;
      }
      const old = image.crop || { x: 0, y: 0, w: 1, h: 1 };
      this.commitElements(
        this.s.doc.elements.map((e) =>
          e.id === image.id
            ? {
                ...e,
                crop: { ...crop },
                imageW: Math.max(1, (e.imageW * crop.w) / old.w),
                imageH: Math.max(1, (e.imageH * crop.h) / old.h)
              }
            : e
        )
      );
      this.closePanel();
    });
    this.numberField(panel, 'Opacidade (%)', image.opacity * 100, 5, 100, (v) =>
      this.commitElements(
        this.s.doc.elements.map((e) => (e.id === image.id ? { ...e, opacity: v / 100 } : e))
      )
    );
    button(panel, 'Restaurar imagem completa', () => {
      this.commitElements(
        this.s.doc.elements.map((e) => {
          if (e.id !== image.id) return e;
          const c = e.crop || { w: 1, h: 1 },
            out = { ...e, imageW: e.imageW / c.w, imageH: e.imageH / c.h };
          delete out.crop;
          return out;
        })
      );
      this.closePanel();
    });
  }
  prepareImage(image, src) {
    const max = this.plugin.settings.imageMax,
      ratio = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
    if (ratio === 1) return { src, w: image.naturalWidth, h: image.naturalHeight };
    const canvas = this.root.ownerDocument.createElement('canvas');
    canvas.width = Math.round(image.naturalWidth * ratio);
    canvas.height = Math.round(image.naturalHeight * ratio);
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return { src: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height };
  }
  openWorkflow() {
    const panel = this.makePanel(this.organizeButton, 'Atalhos e favoritos', 'workflow'),
      s = this.plugin.settings;
    const name = element(panel, 'input');
    name.placeholder = 'Nome do pincel favorito';
    button(panel, 'Salvar pincel atual nos favoritos', () => {
      s.favorites = [
        ...s.favorites,
        {
          name: (name.value || Brushes.SPECS[s.lastBrush].label).slice(0, 40),
          kind: s.lastBrush,
          brush: Ink.clone(s.brushes[s.lastBrush])
        }
      ].slice(-8);
      void this.plugin.savePreferences();
      this.renderFavorites();
      this.openWorkflow();
    });
    s.favorites.forEach((f, i) => {
      const row = element(panel, 'div', 'si-layer-row');
      button(row, f.name, () => {
        Brushes.updateBrush(s, f.kind, f.brush);
        this.selectTool(f.kind, false, false);
        void this.plugin.savePreferences();
        this.closePanel();
      });
      button(row, 'Remover', () => {
        s.favorites.splice(i, 1);
        void this.plugin.savePreferences();
        this.renderFavorites();
        this.openWorkflow();
      });
    });
    for (const [action, title] of [
      ['write', 'Caneta'],
      ['pencil', 'Lápis'],
      ['marker', 'Marca-texto'],
      ['erase', 'Borracha'],
      ['select', 'Cursor'],
      ['lasso', 'Laço'],
      ['connector', 'Conector'],
      ['focus', 'Modo foco'],
      ['temporaryKey', 'Segurar: borracha temporária']
    ]) {
      const b = button(
        panel,
        title + ': ' + (action === 'temporaryKey' ? s.temporaryKey : s.shortcuts[action])
      );
      b.addEventListener('keydown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!/^(Key[A-Z]|Digit[0-9]|F[1-9]|F1[0-2])$/.test(e.code)) return;
        if (
          e.code === s.returnBrushKey ||
          e.code === s.brushAdjustKey ||
          Object.values(s.quickKeys || {}).includes(e.code) ||
          e.code === s.radialKey ||
          e.code === s.straightKey ||
          Object.entries(s.shortcuts).some(([k, v]) => k !== action && v === e.code) ||
          (action !== 'temporaryKey' && s.temporaryKey === e.code)
        ) {
          new Notice('Tecla já utilizada.');
          return;
        }
        if (action === 'temporaryKey') s.temporaryKey = e.code;
        else s.shortcuts[action] = e.code;
        void this.plugin.savePreferences();
        b.textContent = title + ': ' + e.code;
      });
    }
    element(
      panel,
      'p',
      'si-panel-copy',
      'Clique em um atalho e pressione a nova tecla. Espaço navega temporariamente. O modo foco mantém um botão visível para sair.'
    );
    this.numberField(
      panel,
      'Lado máximo de imagens importadas',
      s.imageMax,
      512,
      8192,
      (v) => {
        s.imageMax = v;
        void this.plugin.savePreferences();
      },
      128
    );
  }
  renderFavorites() {
    if (!this.favoriteBar) return;
    this.favoriteBar.replaceChildren();
    this.favoriteBar.hidden = !this.plugin.settings.favorites.length;
    for (const f of this.plugin.settings.favorites) {
      const b = button(this.favoriteBar, f.name, () => {
        Brushes.updateBrush(this.plugin.settings, f.kind, f.brush);
        this.selectTool(f.kind, false, false);
        void this.plugin.savePreferences();
      });
      b.dataset.siUserText = 'true';
      b.style.borderBottom = '3px solid ' + f.brush.color;
      b.title = f.name + ' · ' + f.brush.width + ' px';
    }
  }
  toggleFocus() {
    this.focusMode = !this.focusMode;
    this.root.classList.toggle('si-focus', this.focusMode);
    if (!this.focusExit) {
      this.focusExit = button(this.root, 'Sair do foco', () => this.toggleFocus());
      this.focusExit.className = 'si-focus-exit';
    }
    this.focusExit.hidden = !this.focusMode;
    this.closePanel();
    this.render();
  }
  async copyEmbed() {
    const text = '```smartink\n' + this.s.file.path + '\n```';
    try {
      await this.win.navigator.clipboard.writeText(text);
      new Notice('Bloco copiado. Cole na nota desejada.');
    } catch {
      const panel = this.makePanel(this.organizeButton, 'Copiar incorporação', 'embed-copy'),
        area = element(panel, 'textarea');
      area.value = text;
      area.readOnly = true;
      area.focus();
      area.select?.();
      element(panel, 'p', '', 'Copie este bloco e cole na nota.');
    }
  }
  openExportOptions() {
    this.finish(false);
    const panel = this.makePanel(this.organizeButton, 'Exportar e imprimir', 'export-options'),
      options = { paper: true, selection: false, width: 794, height: 1123, margin: 38 };
    this.toggleField(panel, 'Incluir pautas e modelo', true, (v) => (options.paper = v));
    this.toggleField(panel, 'Somente seleção', false, (v) => (options.selection = v));
    this.choiceField(
      panel,
      'Papel',
      'a4',
      [
        ['a4', 'A4 retrato'],
        ['a4land', 'A4 paisagem'],
        ['letter', 'Carta']
      ],
      (v) => {
        [options.width, options.height] =
          v === 'a4land' ? [1123, 794] : v === 'letter' ? [816, 1056] : [794, 1123];
      }
    );
    this.numberField(panel, 'Margem (pixels a 96 dpi)', 38, 0, 150, (v) => (options.margin = v));
    const document = () => {
      const d = Ink.clone(this.s.doc);
      if (options.selection) {
        d.elements = d.elements.filter((e) => this.selected.has(e.id));
        if (!d.elements.length) throw new Error('Selecione os objetos primeiro.');
        const selectedIds = new Set(d.elements.map((e) => e.id));
        d.elements = d.elements.map((e) => {
          if (!e.bindings) return e;
          const out = { ...e, bindings: {} };
          for (const [k, v] of Object.entries(e.bindings))
            if (selectedIds.has(v.targetId)) out.bindings[k] = v;
          return out;
        });
      }
      return d;
    };
    button(panel, 'Salvar SVG', async () => {
      try {
        const d = document(),
          path = this.s.file.path.replace(/\.smartink$/, '') + '-export-' + Ink.uid() + '.svg';
        await this.app.vault.create(path, Ink.svg(d, this.app.vault.getName?.() || '', options));
        new Notice('SVG salvo: ' + path);
      } catch (e) {
        new Notice(e.message);
      }
    });
    button(panel, 'Imprimir / salvar como PDF', () => {
      try {
        this.printDocument(document(), options);
      } catch (e) {
        new Notice(e.message);
      }
    });
    element(
      panel,
      'p',
      'si-panel-copy',
      'A impressão divide o desenho em páginas na escala de 96 unidades por polegada. No diálogo do sistema, selecione Salvar como PDF e desative cabeçalhos/rodapés.'
    );
  }
  printDocument(d, options) {
    if (this.printFrame) this.printFrame.remove();
    const result = Ink.printPages(d, options),
      frame = element(this.root, 'iframe');
    frame.className = 'si-print-frame';
    this.printFrame = frame;
    frame.title = 'Prévia de impressão Smart Ink';
    frame.onload = () => {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    };
    frame.srcdoc =
      '<!doctype html><html><head><meta charset="utf-8"><title>Smart Ink</title><style>@page{size:' +
      result.width +
      'px ' +
      result.height +
      'px;margin:0}body{margin:0}.page{box-sizing:border-box;width:' +
      result.width +
      'px;height:' +
      result.height +
      'px;padding:' +
      result.margin +
      'px;break-after:page;overflow:hidden}.page:last-child{break-after:auto}svg{display:block;width:100%;height:100%}</style></head><body>' +
      result.pages.map((svg) => '<section class="page">' + svg + '</section>').join('') +
      '</body></html>';
    this.cleanups.push(() => frame.remove());
  }
  openRecovery() {
    const panel = this.makePanel(this.organizeButton, 'Cópias de recuperação', 'recovery');
    element(
      panel,
      'p',
      'si-panel-copy',
      'Até três versões por página, em Smart Ink Backups. Abrir uma cópia não substitui o original. Durante traços longos, uma cópia de emergência pode ser criada a cada 5 segundos; alterações salvas têm cópias periódicas a cada 30 segundos. A página principal só é salva após 5 segundos sem edições, salvo comando manual ou fechamento.'
    );
    button(panel, 'Comparar cópias visualmente', () => this.openVisualRecovery());
    const id = this.plugin.backupKey(this.s);
    for (const file of (this.app.vault.getFiles?.() || [])
      .filter(
        (f) => f.path.startsWith('Smart Ink Backups/' + id + '-') && f.path.endsWith('.smartink')
      )
      .sort((a, b) => (b.stat?.mtime || 0) - (a.stat?.mtime || 0)))
      button(panel, file.basename, () => this.app.workspace.getLeaf(true).openFile(file));
    button(panel, 'Criar ponto de recuperação agora', async () => {
      await this.plugin.backup(this.s, this.s.doc, true);
      this.openRecovery();
    });
    if (this.s.backupError) element(panel, 'p', 'si-error', this.s.backupError);
  }

  drafting() {
    return this.s?.doc.drafting || { guides: [], limit: null };
  }
  setDrafting(value) {
    if (!this.editable()) return;
    const before = Ink.clone(this.drafting());
    this.s.history.push(this.s.doc.elements, this.s.doc.elements);
    Object.assign(this.s.history.undoStack.at(-1), {
      draftBefore: before,
      draftAfter: Ink.clone(value)
    });
    this.s.doc.drafting = value;
    this.changed();
  }
  straightHeld(e) {
    const key = this.plugin.settings.straightKey;
    return !!(
      { Control: e.ctrlKey, Shift: e.shiftKey, Alt: e.altKey, Meta: e.metaKey }[key] ||
      this.heldKeys.has(key)
    );
  }
  constrainPoint(p, width) {
    const prefs = this.plugin.settings,
      d = this.drafting();
    if (prefs.guidesVisible && prefs.guideSnap) p = Ink.snapGuides(p, d.guides, 7 / this.zoom);
    return Ink.boundedPoint(p, d.limit, width);
  }
  openDraftingPanel() {
    this.finish(false);
    const panel = this.makePanel(this.draftingButton, 'Réguas, guias e linha reta', 'drafting');
    const label = element(panel, 'label', 'si-check-row');
    element(label, 'span', '', 'Segurar para linha reta');
    const key = element(label, 'select');
    for (const k of ['Control', 'Shift', 'Alt', 'Meta']) {
      const o = element(
        key,
        'option',
        '',
        k === 'Control' ? 'Ctrl' : k === 'Meta' ? 'Meta / Cmd' : k
      );
      o.value = k;
    }
    if (!['Control', 'Shift', 'Alt', 'Meta'].includes(this.plugin.settings.straightKey)) {
      const o = element(key, 'option', '', this.plugin.settings.straightKey);
      o.value = this.plugin.settings.straightKey;
    }
    key.value = this.plugin.settings.straightKey;
    key.addEventListener('change', () => {
      this.plugin.settings.straightKey = key.value;
      void this.plugin.savePreferences();
    });
    const capture = button(panel, 'Personalizar tecla…', () => {
      capture.textContent = 'Pressione uma letra, F1–F12 ou modificador';
      capture.focus();
    });
    capture.addEventListener('keydown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const k = ['Control', 'Shift', 'Alt', 'Meta'].includes(e.key) ? e.key : e.code;
      if (!/^(Control|Shift|Alt|Meta|Key[A-Z]|F[1-9]|F1[0-2])$/.test(k)) return;
      this.plugin.settings.straightKey = k;
      void this.plugin.savePreferences();
      capture.textContent = 'Tecla: ' + k;
      this.heldKeys.clear();
    });
    element(
      panel,
      'p',
      'si-panel-copy',
      'Segure a tecla durante o traço: direção em passos de 15°. Solte para retomar o traço livre. O transferidor mostra o ângulo; 0° aponta à direita e 90° para cima.'
    );
    for (const [field, title] of [
      ['guidesVisible', 'Mostrar guias'],
      ['guideSnap', 'Encaixar nos alinhamentos']
    ]) {
      const l = element(panel, 'label', 'si-check-row'),
        c = element(l, 'input');
      c.type = 'checkbox';
      c.checked = this.plugin.settings[field];
      element(l, 'span', '', title);
      c.addEventListener('change', () => {
        this.plugin.settings[field] = c.checked;
        void this.plugin.savePreferences();
        this.drawOverlay();
      });
    }
    const ruler = this.drafting().ruler;
    button(panel, ruler ? 'Remover régua rotacionável' : 'Adicionar régua rotacionável', () => {
      const d = Ink.clone(this.drafting()),
        size = this.size(),
        center = Ink.screenToWorld({ x: size.w / 2, y: size.h / 2 }, this.camera, this.zoom);
      if (d.ruler) delete d.ruler;
      else d.ruler = { ...center, angle: 0, length: 400 / this.zoom, enabled: true };
      this.setDrafting(d);
      this.openDraftingPanel();
    }).className = 'si-menu-action';
    if (ruler) {
      const row = element(panel, 'label', 'si-check-row'),
        enabled = element(row, 'input');
      enabled.type = 'checkbox';
      enabled.checked = ruler.enabled;
      element(row, 'span', '', 'Limitar traço à borda da régua');
      enabled.addEventListener('change', () =>
        this.setDrafting({
          ...this.drafting(),
          ruler: { ...this.drafting().ruler, enabled: enabled.checked }
        })
      );
      for (const [field, title, value] of [
        ['angle', 'Ângulo (graus)', (ruler.angle * 180) / Math.PI],
        ['length', 'Comprimento', ruler.length]
      ]) {
        const label = element(panel, 'label', 'si-check-row');
        element(label, 'span', '', title);
        const input = element(label, 'input');
        input.type = 'number';
        input.value = String(Math.round(value));
        input.addEventListener('change', () => {
          const n = Number(input.value);
          if (!Number.isFinite(n)) return;
          this.setDrafting({
            ...this.drafting(),
            ruler: {
              ...this.drafting().ruler,
              [field]: field === 'angle' ? ((n % 360) * Math.PI) / 180 : Ink.clamp(n, 20, 100000)
            }
          });
        });
      }
      element(
        panel,
        'p',
        'si-panel-copy',
        'Em Editar guias: arraste o centro da régua para mover; arraste a ponta para girar e ajustar o comprimento. Shift encaixa em 15°. Alt suspende a régua ao desenhar.'
      );
    }
    const add = (axis) => {
      const d = Ink.clone(this.drafting());
      if (d.guides.length >= 100) return;
      const size = this.size(),
        center = Ink.screenToWorld({ x: size.w / 2, y: size.h / 2 }, this.camera, this.zoom);
      d.guides.push({ axis, value: center[axis] });
      this.setDrafting(d);
      this.mode = 'drafting';
      this.closePanel();
      this.updateTools();
    };
    button(panel, '+ Guia horizontal', () => add('y')).className = 'si-menu-action';
    button(panel, '+ Guia vertical', () => add('x')).className = 'si-menu-action';
    button(panel, 'Editar guias e delimitador', () => {
      this.mode = 'drafting';
      this.closePanel();
      this.updateTools();
      this.hint.textContent =
        'Réguas: arraste uma guia; Alt + clique remove. Arraste a área para mover e os cantos para ajustar. V: cursor; 1: caneta.';
      this.drawOverlay();
    }).className = 'si-menu-action';
    button(panel, 'Remover todas as guias', () => {
      this.setDrafting({ ...this.drafting(), guides: [] });
    }).className = 'si-menu-action';
    button(
      panel,
      this.drafting().limit ? 'Remover área delimitadora' : 'Adicionar área delimitadora',
      () => {
        const d = Ink.clone(this.drafting()),
          size = this.size(),
          p = Ink.screenToWorld({ x: 60, y: 60 }, this.camera, this.zoom);
        d.limit = d.limit
          ? null
          : {
              ...p,
              w: Math.max(40, (size.w - 120) / this.zoom),
              h: Math.max(40, (size.h - 120) / this.zoom)
            };
        this.setDrafting(d);
        this.mode = 'drafting';
        this.closePanel();
        this.updateTools();
      }
    ).className = 'si-menu-action';
    element(
      panel,
      'p',
      'si-panel-copy',
      'O delimitador restringe novos traços e suspende as sugestões automáticas de formas. Conteúdo existente e objetos movidos pelo cursor não são recortados. Guias e área ficam salvas nesta página.'
    );
  }
  beginDrafting(p, e) {
    const d = Ink.clone(this.drafting()),
      limit = d.limit,
      index = this.plugin.settings.guidesVisible
        ? d.guides.findIndex((g) => Math.abs(p[g.axis] - g.value) < 8 / this.zoom)
        : -1,
      corner = limit ? this.handles(limit).findIndex((q) => Ink.dist(q, p) < 10 / this.zoom) : -1;
    if (d.ruler) {
      const r = d.ruler,
        end = { x: r.x + Math.cos(r.angle) * r.length, y: r.y + Math.sin(r.angle) * r.length },
        kind =
          Ink.dist(p, end) < 12 / this.zoom
            ? 'rulerEnd'
            : Ink.dist(p, r) < 14 / this.zoom
              ? 'rulerMove'
              : null;
      if (kind) {
        this.active = { mode: 'drafting', pointer: e.pointerId, start: p, draft: d, kind };
        return;
      }
    }
    if (e.altKey && index >= 0) {
      d.guides.splice(index, 1);
      this.setDrafting(d);
      return;
    }
    const kind =
      corner >= 0
        ? 'corner'
        : index >= 0
          ? 'guide'
          : limit && Ink.contains(limit, p)
            ? 'limit'
            : null;
    if (!kind) return;
    this.active = {
      mode: 'drafting',
      pointer: e.pointerId,
      start: p,
      draft: d,
      kind,
      index,
      corner
    };
  }
  moveDrafting(p, event = {}) {
    const a = this.active,
      d = Ink.clone(a.draft),
      dx = p.x - a.start.x,
      dy = p.y - a.start.y;
    if (a.kind === 'rulerMove') {
      d.ruler.x += dx;
      d.ruler.y += dy;
    } else if (a.kind === 'rulerEnd') {
      const r = d.ruler,
        q = event.shiftKey ? Ink.snapAngle(r, p) : p;
      r.angle = Math.atan2(q.y - r.y, q.x - r.x);
      r.length = Ink.clamp(Ink.dist(r, q), 20, 100000);
    } else if (a.kind === 'guide') d.guides[a.index].value = p[d.guides[a.index].axis];
    else if (a.kind === 'limit') {
      d.limit.x += dx;
      d.limit.y += dy;
    } else {
      const fixed = this.handles(a.draft.limit)[(a.corner + 2) % 4],
        b = Ink.pointBounds([fixed, p]);
      if (b.w < 20 || b.h < 20) return;
      d.limit = b;
    }
    a.previewDraft = d;
    this.drawOverlay();
  }
  drawDrafting(ctx) {
    const d = this.active?.previewDraft || this.drafting(),
      vb = this.viewportBounds(),
      w = vb.w * this.zoom,
      h = vb.h * this.zoom,
      tl = { x: vb.x, y: vb.y };
    ctx.save();
    ctx.lineWidth = 1 / this.zoom;
    ctx.setLineDash([5 / this.zoom, 4 / this.zoom]);
    ctx.strokeStyle = '#cc5599';
    if (this.plugin.settings.guidesVisible)
      for (const g of d.guides) {
        ctx.beginPath();
        if (g.axis === 'x') {
          ctx.moveTo(g.value, tl.y);
          ctx.lineTo(g.value, tl.y + h / this.zoom);
        } else {
          ctx.moveTo(tl.x, g.value);
          ctx.lineTo(tl.x + w / this.zoom, g.value);
        }
        ctx.stroke();
      }
    if (d.limit) {
      const b = d.limit;
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 2 / this.zoom;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.setLineDash([]);
      ctx.font = 12 / this.zoom + 'px sans-serif';
      ctx.fillStyle = '#a65a00';
      ctx.fillText(
        I18n.t('Área de escrita') + ' · ' + Math.round(b.w) + ' × ' + Math.round(b.h),
        b.x,
        b.y - 8 / this.zoom
      );
      if (this.mode === 'drafting')
        for (const p of this.handles(b))
          ctx.fillRect(p.x - 4 / this.zoom, p.y - 4 / this.zoom, 8 / this.zoom, 8 / this.zoom);
    }
    if (d.ruler) {
      const r = d.ruler;
      ctx.save();
      ctx.translate(r.x, r.y);
      ctx.rotate(r.angle);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(0,120,212,.10)';
      ctx.fillRect(0, 0, r.length, 28 / this.zoom);
      ctx.strokeStyle = r.enabled ? '#0078d4' : '#888888';
      ctx.strokeRect(0, 0, r.length, 28 / this.zoom);
      const step = Math.max(10, Math.ceil(10 / this.zoom / 10) * 10);
      for (let x = 0; x <= r.length; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, (Math.round(x / step) % 5 ? 6 : 12) / this.zoom);
        ctx.stroke();
      }
      ctx.font = 12 / this.zoom + 'px sans-serif';
      ctx.fillStyle = '#0078d4';
      ctx.fillText(
        Math.round((r.angle * 180) / Math.PI) + '° · ' + Math.round(r.length),
        18 / this.zoom,
        23 / this.zoom
      );
      if (this.mode === 'drafting')
        for (const x of [0, r.length]) {
          ctx.beginPath();
          ctx.arc(x, 0, 6 / this.zoom, 0, Math.PI * 2);
          ctx.fill();
        }
      ctx.restore();
    }
    const a = this.active;
    if (a?.straight && a.stroke?.points?.length > 1) {
      const p = a.stroke.points[0],
        r = 70 / this.zoom;
      ctx.setLineDash([]);
      ctx.strokeStyle = '#0078d4';
      ctx.lineWidth = 1 / this.zoom;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 24; i++) {
        const angle = (i * Math.PI) / 12,
          inner = r - (i % 6 ? 5 : 10) / this.zoom;
        ctx.beginPath();
        ctx.moveTo(p.x + inner * Math.cos(angle), p.y + inner * Math.sin(angle));
        ctx.lineTo(p.x + r * Math.cos(angle), p.y + r * Math.sin(angle));
        ctx.stroke();
      }
      ctx.font = 13 / this.zoom + 'px sans-serif';
      ctx.fillStyle = '#0078d4';
      ctx.fillText(
        ((Math.round((-a.angle * 180) / Math.PI) + 360) % 360) + '°',
        p.x + 12 / this.zoom,
        p.y - 12 / this.zoom
      );
    }
    ctx.restore();
  }
  editable() {
    return this.s && !this.s.error;
  }
  updateTools() {
    this.renderFavorites();
    for (const [m, b] of Object.entries(this.modeButtons)) {
      b.classList.toggle('is-active', m === this.mode);
      b.setAttribute('aria-pressed', String(m === this.mode));
      if (this.penGroups?.[m]) {
        const brush = this.plugin.settings.brushes[m];
        this.penGroups[m].classList.toggle('is-active', m === this.mode);
        this.penGroups[m].style.setProperty('--si-ink', brush.color);
        b.title =
          Brushes.SPECS[m].label +
          ' · ' +
          brush.width +
          ' px · ' +
          brush.color.toUpperCase() +
          ' — toque novamente para configurar';
      }
    }
    if (this.shapeButton) {
      this.shapeButton.classList.toggle('is-active', this.shapeAssist);
      this.shapeButton.setAttribute('aria-pressed', String(this.shapeAssist));
    }
    if (this.overlay)
      this.overlay.style.cursor =
        this.mode === 'pan'
          ? 'grab'
          : this.mode === 'erase'
            ? 'cell'
            : this.mode === 'select'
              ? 'default'
              : 'crosshair';
    if (this.suggestion) this.updateSuggestion();
  }
  size() {
    return {
      w: Math.max(1, this.viewport.clientWidth),
      h: Math.max(1, this.viewport.clientHeight)
    };
  }
  fit() {
    if (!this.s) return;
    this.finish(false);
    const { w, h } = this.size(),
      b = Ink.bounds(this.s.doc.elements);
    if (b) {
      this.zoom = Ink.clamp(
        Math.min((w - 100) / Math.max(40, b.w), (h - 100) / Math.max(40, b.h)),
        0.1,
        2
      );
      this.camera = {
        x: w / 2 - (b.x + b.w / 2) * this.zoom,
        y: h / 2 - (b.y + b.h / 2) * this.zoom
      };
    } else {
      this.zoom = 1;
      this.camera = { x: 48, y: 48 };
    }
    this.syncZoom();
    this.render();
  }
  syncZoom() {
    if (this.zoomText) this.zoomText.textContent = Math.round(this.zoom * 100) + '%';
    if (this.zoomRange) this.zoomRange.value = String(Math.log2(this.zoom));
  }
  setZoom(z, anchor) {
    if (!this.s) return;
    this.finish(false);
    const { w, h } = this.size(),
      next = Ink.clamp(z, 0.1, 8);
    this.camera = Ink.zoomAt(this.camera, this.zoom, next, anchor || { x: w / 2, y: h / 2 });
    this.zoom = next;
    this.syncZoom();
    this.render();
  }
  local(e) {
    const r = this.overlay.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  point(e) {
    const p = Ink.screenToWorld(this.local(e), this.camera, this.zoom);
    return {
      ...p,
      p:
        e.pointerType === 'pen'
          ? e.pressure > 0
            ? e.pressure
            : (this.active?.rawPoints?.at(-1)?.p ?? 0.5)
          : 0.5,
      t: e.timeStamp,
      ...(e.pointerType === 'pen'
        ? {
            tiltX: Number.isFinite(e.tiltX) ? Ink.clamp(e.tiltX, -90, 90) : 0,
            tiltY: Number.isFinite(e.tiltY) ? Ink.clamp(e.tiltY, -90, 90) : 0
          }
        : {})
    };
  }
  wheel(e) {
    if (!this.s || this.active) return;
    e.preventDefault();
    const factor = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.size().h : 1;
    if (e.ctrlKey || e.metaKey)
      this.setZoom(this.zoom * Math.exp(-e.deltaY * factor * 0.002), this.local(e));
    else {
      this.camera.x -= (e.shiftKey ? e.deltaY : e.deltaX) * factor;
      this.camera.y -= (e.shiftKey ? 0 : e.deltaY) * factor;
      this.render();
    }
  }
  selectedElements() {
    return this.s
      ? this.s.doc.elements.filter((e) => this.selected.has(e.id) && Ink.isEditable(this.s.doc, e))
      : [];
  }
  selectionBox() {
    return this.visible.bounds(this.selectedElements());
  }
  handles(b) {
    return [
      { x: b.x, y: b.y },
      { x: b.x + b.w, y: b.y },
      { x: b.x + b.w, y: b.y + b.h },
      { x: b.x, y: b.y + b.h }
    ];
  }
  down(e) {
    if (e.button === 2 && this.plugin.settings.radialButton) {
      e.preventDefault();
      this.openRadial({ x: e.clientX, y: e.clientY });
      return;
    }
    if (
      !this.editable() ||
      this.active ||
      e.pointerType === 'touch' ||
      (this.plugin.settings.penOnly &&
        e.pointerType !== 'pen' &&
        !['select', 'lasso', 'pan', 'drafting', 'space'].includes(this.mode))
    )
      return;
    if (e.button !== 0 && e.button !== 5 && e.button !== 1) return;
    e.preventDefault();
    this.closePanel();
    this.overlay.focus({ preventScroll: true });
    this.overlay.setPointerCapture(e.pointerId);
    if (this.mode === 'drafting') {
      this.beginDrafting(this.point(e), e);
      return;
    }
    let mode = e.button === 5 ? 'erase' : e.button === 1 || this.spaceDown ? 'pan' : this.mode;
    let p = this.point(e);
    if (
      (Brushes.SPECS[mode] || mode === 'connector') &&
      (this.activeLayer().locked || !this.activeLayer().visible)
    ) {
      new Notice('Escolha uma camada visível e desbloqueada.');
      return;
    }
    const startSnap =
      Brushes.SPECS[mode] || mode === 'connector'
        ? this.snapPoint(p, e)
        : { point: p, anchor: null };
    p = startSnap.point;
    if (
      Brushes.SPECS[mode] &&
      e.altKey &&
      (this.plugin.settings.gestures.scratch || this.plugin.settings.gestures.undo)
    ) {
      this.clearGroup();
      this.active = { mode: 'gesture', pointer: e.pointerId, points: [p] };
      return;
    }
    if (Brushes.SPECS[mode] && e.shiftKey && this.plugin.settings.gestures.lasso) {
      this.lassoReturn = mode;
      mode = 'lasso';
    }
    if (mode === 'space') {
      this.beginSpace(p, e);
      return;
    }
    if (mode === 'connector') {
      this.active = {
        mode,
        pointer: e.pointerId,
        start: p,
        startAnchor: startSnap.anchor,
        before: this.s.doc.elements.slice(),
        connector: {
          id: Ink.uid(),
          type: 'arrow',
          connector: true,
          route: 'straight',
          startArrow: false,
          endArrow: true,
          label: '',
          x1: p.x,
          y1: p.y,
          x2: p.x,
          y2: p.y,
          headLength: 16 / this.zoom,
          ...Brushes.strokeStyle(this.plugin.settings, this.plugin.settings.lastBrush),
          layerId: this.s.doc.activeLayer
        }
      };
      this.drawOverlay();
      return;
    }
    if (mode === 'lasso') {
      this.clearGroup();
      this.active = {
        mode: 'lasso',
        pointer: e.pointerId,
        points: [p],
        selected: e.shiftKey ? new Set(this.selected) : new Set(),
        previous: new Set(this.selected)
      };
      this.drawOverlay();
      return;
    }
    if (mode === 'select' && this.cropEditing && this.cropDown(p, e)) return;
    if (mode === 'select' && this.pointEditDown(p, e)) return;
    if (mode === 'select') {
      this.beginSelect(p, e);
      return;
    }
    this.pending = null;
    if (mode !== 'pan') this.selected.clear();
    this.updateSuggestion();
    const brushKind = Brushes.SPECS[mode] ? mode : this.plugin.settings.lastBrush;
    if (Brushes.SPECS[mode] && this.drafting().limit && !Ink.contains(this.drafting().limit, p)) {
      if (this.overlay.hasPointerCapture(e.pointerId))
        this.overlay.releasePointerCapture(e.pointerId);
      return;
    }
    const brushWidth = Brushes.strokeStyle(this.plugin.settings, brushKind).width,
      limit = this.drafting().limit;
    if (Brushes.SPECS[mode] && limit && Math.min(limit.w, limit.h) < brushWidth * 2) {
      new Notice('Aumente a área delimitadora ou reduza a espessura do pincel.');
      if (this.overlay.hasPointerCapture(e.pointerId))
        this.overlay.releasePointerCapture(e.pointerId);
      return;
    }
    let constrained = this.constrainPoint(p, brushWidth);
    const ruler = this.drafting().ruler;
    if (ruler?.enabled && !e.altKey)
      constrained = Ink.boundedPoint(
        Ink.rulerPoint(constrained, ruler, brushWidth),
        limit,
        brushWidth
      );
    this.active = {
      inputStats: { events: 0, coalesced: 0, maxGap: 0, lastTime: e.timeStamp },
      eraseIndex: mode === 'erase' ? new Visible.SpatialIndex() : null,
      startAnchor: startSnap.anchor,
      pointer: e.pointerId,
      mode,
      straight: this.straightHeld(e),
      rawPoints: [constrained],
      recognize:
        (this.shapeAssist || this.activeLayer()?.drawingAssist) &&
        mode !== 'marker' &&
        !this.drafting().limit,
      startX: e.clientX,
      startY: e.clientY,
      lastBackup: Date.now(),
      camera: { ...this.camera },
      before: this.s.doc.elements.slice(),
      changed: false,
      stroke: {
        id: Ink.uid(),
        type: 'stroke',
        layerId: this.s.doc.activeLayer,
        ...Brushes.strokeStyle(this.plugin.settings, brushKind),
        pressure:
          e.pointerType === 'pen' && Brushes.strokeStyle(this.plugin.settings, brushKind).pressure,
        points: [constrained]
      }
    };
    if (Brushes.SPECS[mode]) this.status.textContent = 'Escrevendo · traço ainda em andamento';
    if (mode === 'erase') {
      this.active.eraseIndex.sync(this.s.doc.elements);
      this.clearGroup();
      this.erase(p);
    }
    this.drawOverlay();
  }
  beginSelect(p, e) {
    this.clearGroup();
    const b = this.selectionBox(),
      corners = b ? this.selectionHandles(b) : [],
      index = this.nearestSelectionHandle(p, corners);
    const base = {
      pointer: e.pointerId,
      start: p,
      before: this.s.doc.elements.slice(),
      revision: this.s.revision,
      changed: false
    };
    if (
      b &&
      Ink.dist(p, this.rotationHandle(b)) < this.selectionTolerance() / this.zoom &&
      (index < 0 || Ink.dist(p, this.rotationHandle(b)) < Ink.dist(p, corners[index]))
    ) {
      this.active = {
        ...base,
        mode: 'rotate',
        origin: { x: b.x + b.w / 2, y: b.y + b.h / 2 },
        selected: new Set(this.selected)
      };
      return;
    }
    if (index >= 0) {
      this.active = {
        ...base,
        mode: 'resize',
        origin: corners[(index + 2) % 4],
        handle: corners[index],
        selected: new Set(this.selected)
      };
      return;
    }
    this.spatial.sync(this.layerElements());
    const hits = this.spatial
        .query({
          x: p.x - this.selectionTolerance() / this.zoom,
          y: p.y - this.selectionTolerance() / this.zoom,
          w: (2 * this.selectionTolerance()) / this.zoom,
          h: (2 * this.selectionTolerance()) / this.zoom
        })
        .reverse()
        .filter(
          (x) =>
            this.selectionAllowed(x) &&
            this.visible.hit(x, p, this.selectionTolerance() / this.zoom)
        ),
      top = this.cycleHit(hits, p, e);
    if (e.shiftKey && top) {
      const group = this.groupIds(new Set([top.id])),
        remove = this.selected.has(top.id);
      for (const id of group) remove ? this.selected.delete(id) : this.selected.add(id);
      this.updateSuggestion();
      this.drawOverlay();
      return;
    }
    if (top && (!this.selected.has(top.id) || e.altKey))
      this.selected = e.altKey ? new Set([top.id]) : this.groupIds(new Set([top.id]));
    if (top || (b && Ink.contains(b, p))) {
      this.active = { ...base, mode: 'move-selection', selected: new Set(this.selected) };
    } else {
      if (!e.shiftKey) this.selected.clear();
      this.active = { ...base, mode: 'marquee', end: p, selected: new Set(this.selected) };
    }
    this.updateSuggestion();
    this.drawOverlay();
  }
  move(e) {
    this.lastPointer = { x: e.clientX, y: e.clientY };
    const a = this.active;
    if (!a || e.pointerId !== a.pointer || !this.s) {
      if (this.mode === 'select' && this.s) this.updateCursor(e);
      if ((this.mode === 'erase' || Brushes.SPECS[this.mode]) && this.s) {
        this.hoverPoint = this.point(e);
        this.drawOverlay();
      }
      return;
    }
    e.preventDefault();
    if (a.mode === 'gesture') {
      a.points.push(this.point(e));
      this.drawOverlay();
      return;
    }
    if (a.mode === 'crop') {
      this.cropMove(this.point(e));
      return;
    }
    if (a.mode === 'space') {
      this.spaceMove(this.point(e));
      return;
    }
    if (a.mode === 'point-edit') {
      this.pointEditMove(this.point(e), e);
      return;
    }
    if (a.mode === 'connector') {
      let p = this.point(e);
      if (this.straightHeld(e)) p = Ink.snapAngle(a.start, p);
      const snapped = this.snapPoint(p, e);
      a.endAnchor = snapped.anchor;
      a.connector = { ...a.connector, x2: snapped.point.x, y2: snapped.point.y };
      this.drawOverlay();
      return;
    }
    if (a.heldShape) {
      const p = this.point(e),
        base = a.heldBase;
      if (base.type === 'line') {
        const q = this.snapPoint(p, e).point;
        a.heldShape = { ...base, x2: q.x, y2: q.y };
      } else {
        const scale = Ink.clamp(
          Ink.dist(a.holdCenter, p) / Math.max(1, Ink.dist(a.holdCenter, a.holdPoint)),
          0.2,
          5
        );
        a.heldShape = Ink.transform(base, { scale, origin: a.holdCenter });
      }
      this.drawOverlay();
      return;
    }
    if (a.mode === 'lasso') {
      const p = this.point(e);
      if (Ink.dist(p, a.points.at(-1)) > 2 / this.zoom) a.points.push(p);
      this.drawOverlay();
      return;
    }
    if (a.mode === 'drafting') {
      this.moveDrafting(this.point(e), e);
      return;
    }
    if (a.mode === 'pan') {
      this.camera = {
        ...a.camera,
        x: a.camera.x + e.clientX - a.startX,
        y: a.camera.y + e.clientY - a.startY
      };
      this.render();
      return;
    }
    const p = this.point(e);
    if (a.mode === 'marquee') {
      a.end = p;
      const rect = Ink.pointBounds([a.start, p]);
      this.selected = new Set(a.selected);
      this.spatial.sync(this.s.doc.elements);
      for (const el of this.spatial.query(rect))
        if (this.selectionAllowed(el) && this.selectionHit(el, this.handles(rect)))
          this.selected.add(el.id);
      this.expandSelection();
      this.updateSuggestion();
      this.drawOverlay();
      return;
    }
    if (['move-selection', 'resize', 'rotate'].includes(a.mode)) {
      let tx;
      if (a.mode === 'rotate') {
        let angle =
          Math.atan2(p.y - a.origin.y, p.x - a.origin.x) -
          Math.atan2(a.start.y - a.origin.y, a.start.x - a.origin.x);
        if (e.shiftKey) angle = (Math.round(angle / (Math.PI / 12)) * Math.PI) / 12;
        tx = { angle, origin: a.origin };
      } else if (a.mode === 'resize')
        tx = { scale: Ink.resizeScale(a.handle, p, a.origin), origin: a.origin };
      else {
        tx = { dx: p.x - a.start.x, dy: p.y - a.start.y };
        this.smartLines = [];
        if (this.plugin.settings.smartGuides && !e.altKey) {
          const b = Ink.bounds(a.before.filter((x) => a.selected.has(x.id))),
            others = this.layerElements(a.before)
              .filter((x) => !a.selected.has(x.id))
              .map(Ink.elementBounds);
          const result = Ink.alignMove(b, others, tx.dx, tx.dy, 7 / this.zoom);
          tx = { dx: result.dx, dy: result.dy };
          this.smartLines = result.guides;
        }
      }
      a.preview = Ink.resolveConnections(
        a.before.map((el) => {
          if (!a.selected.has(el.id)) return el;
          const moved = Ink.transform(el, tx);
          if (moved.bindings) {
            moved.bindings = { ...moved.bindings };
            for (const key of ['start', 'end'])
              if (moved.bindings[key] && !a.selected.has(moved.bindings[key].targetId))
                delete moved.bindings[key];
          }
          return moved;
        })
      );
      a.changed = Ink.dist(p, a.start) > 0.5 / this.zoom;
      this.render();
      return;
    }
    let events = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    if (!events.length) events = [e];
    if (a.inputStats) {
      a.inputStats.events++;
      a.inputStats.coalesced += events.length;
      a.inputStats.maxGap = Math.max(a.inputStats.maxGap, e.timeStamp - a.inputStats.lastTime);
      a.inputStats.lastTime = e.timeStamp;
    }
    for (const v of events) {
      const q = this.point(v);
      if (a.mode === 'erase') this.erase(q);
      else {
        let point = this.constrainPoint(q, a.stroke.width);
        const snapped = this.snapPoint(
          point,
          e,
          a.rawPoints.length >= 3 &&
            (a.originDeparted ||
              (a.originDeparted =
                Ink.dist(point, a.rawPoints[0]) >
                (this.plugin.settings.snapRadius * 2) / this.zoom))
            ? a.rawPoints[0]
            : null
        );
        point = snapped.point;
        a.endAnchor = snapped.anchor;
        const ruler = this.drafting().ruler;
        if (ruler?.enabled && !e.altKey) point = Ink.rulerPoint(point, ruler, a.stroke.width);
        point = Ink.boundedPoint(point, this.drafting().limit, a.stroke.width);
        if (Ink.dist(point, a.rawPoints.at(-1)) > 0.1 / this.zoom) a.rawPoints.push(point);
        a.straight = this.straightHeld(e);
        if (a.straight) {
          const start = a.rawPoints[0],
            end = Ink.snapAngle(start, q);
          const snap = this.snapPoint(end, e);
          if (snap.anchor) {
            end.x = snap.point.x;
            end.y = snap.point.y;
            a.endAnchor = snap.anchor;
          }
          a.angle = end.angle;
          a.stroke.points = [
            start,
            Ink.boundedRay(start, end, this.drafting().limit, a.stroke.width)
          ];
        } else a.stroke.points = a.rawPoints;
        if (ruler?.enabled && !e.altKey) {
          a.stroke.points = [a.rawPoints[0], point];
          a.straight = true;
          a.angle = ruler.angle;
          a.recognize = false;
        }
        this.armHold(a, point);
      }
    }
    // Never create an emergency vault backup on the first pointermove of a new stroke.
    // Only continuously active strokes older than five seconds need intermediate recovery.
    // The snapshot is taken in an idle callback when available, not in the input handler.
    if (
      a.stroke &&
      a.mode !== 'erase' &&
      a.rawPoints.length > 1 &&
      Date.now() - a.lastBackup >= 5000
    ) {
      a.lastBackup = Date.now();
      this.scheduleStrokeBackup(a);
    }
    if (!this.frame)
      this.frame = this.win.requestAnimationFrame(() => {
        this.frame = 0;
        this.drawOverlay();
      });
  }
  scheduleStrokeBackup(a) {
    if (this.plugin.settings.backupsEnabled === false || a.strokeBackupIdle || !this.s) return;
    const session = this.s;
    const run = () => {
      a.strokeBackupIdle = null;
      if (
        this.plugin.settings.backupsEnabled === false ||
        this.active !== a ||
        this.s !== session ||
        !a.stroke
      )
        return;
      // Snapshot the current tip rather than holding references to mutable input arrays.
      const stroke = { ...a.stroke, points: a.stroke.points.slice() };
      const continuation = a.continuation;
      const elements = continuation
        ? session.doc.elements.map((e) =>
            e === continuation.object ? VectorOps.continueStroke(e, stroke, continuation.index) : e
          )
        : [...session.doc.elements, stroke];
      void this.plugin.backup(session, { ...session.doc, elements }, true);
    };
    if (typeof this.win.requestIdleCallback === 'function') {
      a.strokeBackupIdle = {
        kind: 'idle',
        id: this.win.requestIdleCallback(run, { timeout: 2000 })
      };
    } else {
      a.strokeBackupIdle = { kind: 'timeout', id: this.win.setTimeout(run, 0) };
    }
  }
  cancelStrokeBackup(a) {
    const task = a?.strokeBackupIdle;
    if (!task) return;
    a.strokeBackupIdle = null;
    if (task.kind === 'idle') this.win.cancelIdleCallback?.(task.id);
    else this.win.clearTimeout(task.id);
  }
  updateCursor(e) {
    const p = this.point(e),
      b = this.selectionBox();
    if (b) {
      const i = this.selectionHandles(b).findIndex(
        (q) => Ink.dist(p, q) < this.selectionTolerance() / this.zoom
      );
      if (i >= 0) {
        this.overlay.style.cursor = i % 2 ? 'nesw-resize' : 'nwse-resize';
        return;
      }
      if (Ink.contains(b, p)) {
        this.overlay.style.cursor = 'move';
        return;
      }
    }
    this.overlay.style.cursor = 'default';
  }
  up(e) {
    if (!this.active || e.pointerId !== this.active.pointer) return;
    this.move(e);
    this.finish(true);
  }
  cancelGesture() {
    this.stopHold();
    const a = this.active;
    if (!a) return;
    this.cancelStrokeBackup(a);
    if (a.mode === 'connector') {
      this.active = null;
      this.drawOverlay();
      return;
    }
    if (a.mode === 'gesture') {
      this.active = null;
      this.drawOverlay();
      return;
    }
    if (a.mode === 'lasso') {
      this.active = null;
      if (this.lassoReturn) {
        this.mode = this.lassoReturn;
        this.lassoReturn = null;
      }
      this.selected = a.previous;
      this.drawOverlay();
      return;
    }
    if (a.mode === 'drafting') {
      this.active = null;
      this.render();
      return;
    }
    if (
      ['move-selection', 'resize', 'rotate', 'point-edit', 'crop', 'space', 'marquee'].includes(
        a.mode
      )
    ) {
      this.active = null;
      if (this.overlay.hasPointerCapture(a.pointer)) this.overlay.releasePointerCapture(a.pointer);
      if (a.mode === 'marquee') this.selected = a.selected;
      this.render();
      this.updateSuggestion();
    } else this.finish(false);
  }
  finish(recognition) {
    const a = this.active;
    if (!a || !this.s) return;
    this.stopHold();
    this.cancelStrokeBackup(a);
    this.active = null;
    this.smartLines = [];
    this.snapMarker = null;
    this.snapLock = null;
    if (this.overlay.hasPointerCapture(a.pointer)) this.overlay.releasePointerCapture(a.pointer);
    if (a.mode === 'gesture') {
      if (recognition) this.finishGesture(a);
      else this.drawOverlay();
      return;
    }
    if (a.mode === 'connector') {
      if (
        Ink.dist(
          { x: a.connector.x1, y: a.connector.y1 },
          { x: a.connector.x2, y: a.connector.y2 }
        ) >
        2 / this.zoom
      ) {
        const e = { ...a.connector, bindings: {} };
        if (a.startAnchor) e.bindings.start = a.startAnchor;
        if (a.endAnchor) e.bindings.end = a.endAnchor;
        this.commitElements([...this.s.doc.elements, e]);
      }
      this.drawOverlay();
      return;
    }
    if (a.mode === 'lasso') {
      this.selected = new Set(a.selected);
      if (a.points.length >= 3)
        for (const e of this.s.doc.elements)
          if (this.selectionAllowed(e) && this.selectionHit(e, a.points)) this.selected.add(e.id);
      this.expandSelection();
      this.mode = this.lassoReturn || 'select';
      this.lassoReturn = null;
      this.updateTools();
      this.drawOverlay();
      return;
    }
    if (a.mode === 'drafting') {
      if (a.previewDraft) this.setDrafting(a.previewDraft);
      this.render();
      return;
    }
    if (a.mode === 'pan' || a.mode === 'marquee') {
      this.drawOverlay();
      return;
    }
    if (['move-selection', 'resize', 'rotate', 'point-edit', 'crop', 'space'].includes(a.mode)) {
      if (a.changed && a.preview) {
        if (a.revision !== this.s.revision) {
          new Notice('O desenho mudou em outra aba; a transformação foi cancelada.');
          this.render();
          return;
        }
        this.s.doc.elements = a.preview;
        this.s.history.push(a.before, a.preview);
        this.changed();
      }
      this.render();
      return;
    }
    if (a.mode === 'erase') {
      if (a.changed) {
        this.s.history.push(a.before, this.s.doc.elements);
        this.changed();
      }
    } else {
      if (a.straight && a.stroke.points.length > 1) {
        const first = a.stroke.points[0],
          last = a.stroke.points.at(-1);
        a.stroke = {
          id: a.stroke.id,
          layerId: a.stroke.layerId,
          type: 'line',
          color: a.stroke.color,
          width: a.stroke.width,
          opacity: a.stroke.opacity,
          x1: first.x,
          y1: first.y,
          x2: last.x,
          y2: last.y
        };
        a.recognize = false;
      }
      if (a.inputStats)
        a.stroke.inputStats = {
          events: a.inputStats.events,
          coalesced: a.inputStats.coalesced,
          maxGap: a.inputStats.maxGap
        };
      const before = this.s.doc.elements;
      this.s.doc.elements = [...before, a.stroke];
      this.s.history.push(before, this.s.doc.elements);
      this.changed();
      if (recognition && a.heldShape) {
        this.pending = {
          sourceIds: [a.stroke.id],
          sourceId: a.stroke.id,
          candidates: a.holdCandidates || [{ shape: a.heldShape, score: 0 }],
          index: a.holdCandidateIndex || 0,
          shape: a.heldShape
        };
        a.recognize = false;
      }
      if (recognition && (a.recognize || a.mode === 'shape')) {
        // Keep an explicit local group until applied, dismissed, or spatially separated.
        const existing = this.s.doc.elements.filter((e) => this.shapeGroup.includes(e.id)),
          oldBox = Ink.bounds(existing),
          newBox = Ink.elementBounds(a.stroke);
        if (
          oldBox &&
          !Ink.overlaps(
            Ink.expand(oldBox, Math.max(35 / this.zoom, Math.hypot(oldBox.w, oldBox.h) * 0.3)),
            newBox
          )
        )
          this.shapeGroup = [];
        this.shapeGroup.push(a.stroke.id);
        const ids = this.shapeGroup.slice(),
          session = this.s,
          revision = session.revision;
        setTimeout(() => {
          if (this.s === session && session.revision === revision && !this.active)
            this.recognizeIds(ids);
        }, 0);
      }
    }
    this.updateSuggestion();
    this.drawOverlay();
  }
  clearGroup() {
    this.shapeGroup = [];
    this.pending = null;
  }
  recognizeIds(ids, forced = null) {
    const strokes = this.s.doc.elements.filter(
      (e) =>
        ids.includes(e.id) &&
        Ink.isEditable(this.s.doc, e) &&
        e.type === 'stroke' &&
        !e.erasures?.length
    );
    if (!strokes.length) {
      this.pending = null;
      return;
    }
    const candidates = Ink.recognizeGroups(strokes, forced).filter(
        (c) => forced || c.score <= this.plugin.settings.quickShapeMaxError
      ),
      style = strokes[0];
    this.pending = {
      sourceIds: strokes.map((s) => s.id),
      sourceId: style.id,
      candidates,
      index: 0,
      shape: candidates[0]
        ? this.correctedShape(candidates[0].shape, style, strokes.length === 1)
        : null
    };
    this.updateSuggestion();
    this.drawOverlay();
  }
  chooseCandidate(index) {
    if (!this.pending) return;
    const p = this.pending,
      source = this.s.doc.elements.find((e) => e.id === p.sourceId);
    if (!source || !p.candidates[index]) return;
    p.index = index;
    p.shape = this.correctedShape(p.candidates[index].shape, source, p.sourceIds.length === 1);
    this.updateSuggestion();
    this.drawOverlay();
  }
  erase(p) {
    const a = this.active,
      from = a.lastErase || p,
      r = this.plugin.settings.eraserSize / this.zoom,
      before = this.s.doc.elements;
    const candidates = a.eraseIndex
      ? new Set(a.eraseIndex.query(Ink.expand(Ink.pointBounds([from, p]), r)).map((e) => e.id))
      : new Set(before.map((e) => e.id));
    let after;
    if (this.plugin.settings.eraserMode === 'object') {
      after = before.filter(
        (e) =>
          !Ink.isEditable(this.s.doc, e) ||
          ['image', 'text'].includes(e.type) ||
          !candidates.has(e.id) ||
          !this.visible.hit(e, p, r)
      );
    } else
      after = before.map((e) =>
        Ink.isEditable(this.s.doc, e) && !['image', 'text'].includes(e.type) && candidates.has(e.id)
          ? Ink.erasePart(e, from, p, r)
          : e
      );
    a.lastErase = p;
    if (after.length !== before.length || after.some((e, i) => e !== before[i])) {
      this.s.doc.elements = after;
      a.changed = true;
      this.requestRender();
    }
  }
  changed() {
    this.s.doc.elements = Ink.resolveConnections(this.s.doc.elements);
    this.s.revision++;
    this.plugin.scheduleSessionSave(this.s);
  }
  refresh() {
    if (!this.s) return;
    if (this.s.error && this.active) this.finish(false);
    const ids = new Set(
      this.s.doc.elements.filter((e) => Ink.isEditable(this.s.doc, e)).map((e) => e.id)
    );
    this.selected = new Set([...this.selected].filter((id) => ids.has(id)));
    if (this.pending && !this.pending.sourceIds?.every((id) => ids.has(id))) this.clearGroup();
    if (this.paper) this.paper.value = this.s.doc.background;
    this.status.classList.toggle('is-error', !!this.s.error);
    this.status.textContent = this.s.backupError
      ? 'Aviso: cópia de recuperação falhou · menu •••'
      : this.active?.stroke
        ? 'Escrevendo · traço ainda em andamento'
        : this.s.error
          ? this.s.recoveryPath
            ? 'Cópia recuperada criada · menu •••'
            : 'Falha ao salvar · baixe uma cópia no menu •••'
          : this.s.revision === this.s.savedRevision
            ? 'Salvo no vault'
            : this.s.saving
              ? 'Salvando…'
              : this.s.saveTimer
                ? 'Pendente · salva após 5 s sem alterações'
                : 'Alterações pendentes';
    this.undoButton.disabled = !this.s.history.undoStack.length || !!this.s.error;
    this.redoButton.disabled = !this.s.history.redoStack.length || !!this.s.error;
    this.requestRender();
  }
  updateSuggestion() {
    if (!this.suggestion) return;
    this.suggestion.replaceChildren();
    this.suggestion.hidden = !this.pending && !this.shapeAssist && this.mode !== 'select';
    const labels = {
      line: 'Linha',
      circle: 'Círculo',
      ellipse: 'Elipse',
      rectangle: 'Retângulo',
      triangle: 'Triângulo',
      arrow: 'Seta',
      polygon: 'Polígono'
    };
    if (this.mode === 'drafting' && !this.pending) {
      this.suggestion.hidden = false;
      element(
        this.suggestion,
        'span',
        '',
        'Réguas: arraste guias ou a área; cantos ajustam o limite. Alt + clique remove uma guia.'
      );
      button(this.suggestion, 'Concluir', () => {
        this.selectTool(this.plugin.settings.lastBrush, false, false);
      });
      return;
    }
    if (this.pending) {
      const p = this.pending;
      element(this.suggestion, 'span', 'si-group-count', p.sourceIds.length + ' traço(s)');
      if (p.shape) {
        for (let i = 0; i < p.candidates.length; i++) {
          const b = button(this.suggestion, labels[p.candidates[i].shape.type], () =>
            this.chooseCandidate(i)
          );
          b.classList.toggle('si-candidate-active', i === p.index);
          b.setAttribute('aria-pressed', String(i === p.index));
        }
        button(this.suggestion, 'Aplicar ↵', () => this.accept()).className = 'si-apply';
      } else
        element(
          this.suggestion,
          'span',
          '',
          'Sem correspondência segura. Continue o desenho ou escolha o tipo:'
        );
      const type = element(this.suggestion, 'select');
      type.setAttribute('aria-label', 'Corrigir como outra forma');
      let option = element(type, 'option', '', 'Corrigir como…');
      option.value = '';
      for (const [value, label] of Object.entries(labels)) {
        const o = element(type, 'option', '', label);
        o.value = value;
      }
      type.addEventListener('change', () => {
        if (type.value) this.recognizeIds(p.sourceIds, type.value);
      });
      button(this.suggestion, 'Manter / novo grupo', () => {
        this.clearGroup();
        this.updateSuggestion();
        this.drawOverlay();
      });
      return;
    }
    if (this.mode === 'select') {
      const selected = this.selectedElements();
      element(
        this.suggestion,
        'span',
        '',
        selected.length
          ? selected.length + ' objeto(s) · arraste para mover; cantos para redimensionar'
          : 'Clique em um objeto ou arraste uma caixa para selecionar. Shift adiciona à seleção.'
      );
      if (selected.length) {
        button(this.suggestion, 'Formatar diagrama', () => this.openDiagram());
        if (selected.length === 1 && selected[0].type === 'text')
          button(this.suggestion, 'Editar texto', () => this.openTextEditor(selected[0]));
        if (selected.some((e) => e.type === 'stroke' && !e.erasures?.length))
          button(this.suggestion, 'Reconhecer seleção', () =>
            this.recognizeIds([...this.selected])
          );
        if (selected.some((e) => e.type === 'stroke'))
          button(this.suggestion, 'Comparar suavização', () => this.openSampleComparison());
        button(this.suggestion, 'Editar pontos', () => this.startPointEditing());
        button(this.suggestion, 'Agrupar', () => this.groupSelection());
        button(this.suggestion, 'Desagrupar', () => this.groupSelection(true));
        if (selected.some((e) => ['line', 'arrow'].includes(e.type)))
          button(this.suggestion, 'Conectores', () => this.openConnectorOptions());
        if (selected.some((e) => e.type === 'image'))
          button(this.suggestion, 'Imagem', () => this.openImageOptions());
        button(this.suggestion, 'Objetos / links', () => this.openObjectOptions());
        button(this.suggestion, 'Estilo da seleção', () => this.openSelectionStyle());
        button(this.suggestion, 'Duplicar', () => this.duplicateSelection());
        button(this.suggestion, 'Excluir', () => this.deleteSelection());
      }
    } else if (this.shapeAssist)
      element(
        this.suggestion,
        'span',
        '',
        'Formas · desenhe em um ou vários traços; escolha e aplique a sugestão. Letras ficam preservadas até você confirmar.'
      );
  }
  accept() {
    if (!this.editable() || !this.pending?.shape) return;
    this.finish(false);
    const pending = this.pending,
      before = this.s.doc.elements,
      ids = new Set(pending.sourceIds || [pending.sourceId]);
    if (![...ids].every((id) => before.some((e) => e.id === id && Ink.isEditable(this.s.doc, e)))) {
      this.clearGroup();
      this.updateSuggestion();
      return;
    }
    let added = false;
    const after = [];
    for (const e of before) {
      if (ids.has(e.id)) {
        if (!added) {
          after.push(pending.shape);
          added = true;
        }
      } else after.push(e);
    }
    this.s.doc.elements = after;
    this.s.history.push(before, after);
    this.selected = new Set([pending.shape.id]);
    this.clearGroup();
    this.changed();
    this.updateSuggestion();
  }
  deleteSelection() {
    if (!this.editable() || !this.selected.size) return;
    this.finish(false);
    const before = this.s.doc.elements,
      after = before.filter((e) => !this.selected.has(e.id) || !Ink.isEditable(this.s.doc, e));
    if (after.length === before.length) return;
    this.s.doc.elements = after;
    this.s.history.push(before, after);
    this.selected.clear();
    this.clearGroup();
    this.changed();
    this.updateSuggestion();
  }
  duplicateSelection() {
    if (!this.editable() || !this.selected.size) return;
    const selected = this.selectedElements(),
      groups = new Map(selected.filter((e) => e.groupId).map((e) => [e.groupId, Ink.uid()])),
      ids = new Map(selected.map((e) => [e.id, Ink.uid()])),
      copies = selected.map((e) => {
        const copy = {
          ...Ink.transform(e, { dx: 24 / this.zoom, dy: 24 / this.zoom }),
          id: ids.get(e.id)
        };
        if (copy.groupId) copy.groupId = groups.get(copy.groupId);
        if (copy.bindings) {
          copy.bindings = {};
          for (const [side, b] of Object.entries(e.bindings))
            if (ids.has(b.targetId)) copy.bindings[side] = { ...b, targetId: ids.get(b.targetId) };
          if (!Object.keys(copy.bindings).length) delete copy.bindings;
        }
        return copy;
      });
    this.commitElements([...this.s.doc.elements, ...copies]);
    this.selected = new Set(copies.map((e) => e.id));
    this.updateSuggestion();
  }
  undo() {
    if (!this.editable()) return;
    this.finish(false);
    const operation = this.s.history.undoStack.at(-1),
      next = this.s.history.undo();
    if (next) {
      if (operation.layerBefore) Object.assign(this.s.doc, Ink.clone(operation.layerBefore));
      if (operation.metaBefore) this.restoreMeta(operation.metaBefore);
      if (operation.draftBefore) this.s.doc.drafting = Ink.clone(operation.draftBefore);
      this.s.doc.elements = next;
      this.clearGroup();
      this.changed();
      this.updateSuggestion();
    }
  }
  redo() {
    if (!this.editable()) return;
    this.finish(false);
    const operation = this.s.history.redoStack.at(-1),
      next = this.s.history.redo();
    if (next) {
      if (operation.layerAfter) Object.assign(this.s.doc, Ink.clone(operation.layerAfter));
      if (operation.metaAfter) this.restoreMeta(operation.metaAfter);
      if (operation.draftAfter) this.s.doc.drafting = Ink.clone(operation.draftAfter);
      this.s.doc.elements = next;
      this.clearGroup();
      this.changed();
      this.updateSuggestion();
    }
  }
  async save() {
    if (!this.s) return;
    this.finish(false);
    await this.plugin.saveSession(this.s);
  }
  prepare(canvas) {
    const { w, h } = this.size(),
      ratio = Math.min(this.win.devicePixelRatio || 1, 2),
      width = Math.round(w * ratio),
      height = Math.round(h * ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.translate(this.camera.x, this.camera.y);
    ctx.rotate(this.camera.angle || 0);
    ctx.scale(this.zoom, this.zoom);
    return ctx;
  }
  cachedBounds(e) {
    if (!this.boundsCache.has(e)) this.boundsCache.set(e, Ink.elementBounds(e));
    return this.boundsCache.get(e);
  }
  requestRender() {
    if (this.renderPending) return;
    if (!this.win?.requestAnimationFrame) {
      this.render();
      return;
    }
    this.renderPending = true;
    this.win.requestAnimationFrame(() => {
      this.renderPending = false;
      if (this.s) this.render();
    });
  }
  paint(ctx, e, preview = false) {
    if (e.type === 'text') {
      ctx.save();
      ctx.globalAlpha = e.opacity;
      ctx.translate(e.cx, e.cy);
      ctx.rotate(e.angle || 0);
      ctx.font = (e.bold ? 'bold ' : '') + e.fontSize + 'px sans-serif';
      ctx.fillStyle = e.color;
      ctx.textAlign = e.align;
      const x = e.align === 'left' ? -e.imageW / 2 + 4 : e.align === 'right' ? e.imageW / 2 - 4 : 0;
      e.text
        .split('\n')
        .forEach((line, i) =>
          ctx.fillText(line, x, -e.imageH / 2 + e.fontSize + 4 + i * e.fontSize * 1.25)
        );
      ctx.restore();
      return;
    }
    if (e.type === 'image') {
      let image = this.imageCache.get(e.src);
      if (!image) {
        if (!this.win.Image) return;
        image = new this.win.Image();
        image.onload = () => {
          this.rasterRevision = (this.rasterRevision || 0) + 1;
          this.requestRender();
        };
        image.src = e.src;
        this.imageCache.set(e.src, image);
      }
      if (image.complete && image.naturalWidth) {
        ctx.save();
        ctx.globalAlpha = e.opacity;
        ctx.translate(e.cx, e.cy);
        ctx.rotate(e.angle || 0);
        const c = e.crop || { x: 0, y: 0, w: 1, h: 1 };
        ctx.drawImage(
          image,
          c.x * image.naturalWidth,
          c.y * image.naturalHeight,
          c.w * image.naturalWidth,
          c.h * image.naturalHeight,
          -e.imageW / 2,
          -e.imageH / 2,
          e.imageW,
          e.imageH
        );
        ctx.restore();
      }
      return;
    }
    ctx.save();
    let clipped = null;
    if (e.erasures?.length > 8 && this.active?.mode !== 'erase' && (!e.fill || e.fill === 'none')) {
      const v = this.visible.get(e);
      if (v.geometry) {
        if (!this.visiblePaths.has(e)) this.visiblePaths.set(e, new this.win.Path2D(v.path));
        clipped = this.visiblePaths.get(e);
      }
    }
    if (e.erasures?.length && !clipped) {
      const b = Ink.expand(Ink.elementBounds(e), 10);
      for (const cut of e.erasures) {
        const inverse = new this.win.Path2D(
          `M ${b.x} ${b.y} h ${b.w} v ${b.h} h ${-b.w} Z ` + Ink.capsulePath(cut)
        );
        ctx.clip(inverse, 'evenodd');
      }
    }
    ctx.globalAlpha = preview ? 0.7 : e.opacity;
    ctx.fillStyle = preview ? '#0078d4' : e.color;
    ctx.strokeStyle = preview ? '#0078d4' : e.color;
    ctx.lineWidth = e.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (preview) ctx.setLineDash([8 / this.zoom, 6 / this.zoom]);
    else ctx.setLineDash(Ink.dashArray(e));
    let path = clipped || this.pathCache.get(e);
    if (!path) {
      const signature = [
          e.engine,
          e.width,
          e.smoothing,
          e.pressure,
          e.streamline,
          e.pressureMin,
          e.pressureMax,
          e.pressureGamma,
          e.minWidth,
          e.cornerProtection
        ].join('|'),
        shared = e.type === 'stroke' ? this.inkPaths.get(e.points) : null;
      path =
        shared?.signature === signature && e !== this.active?.stroke
          ? shared.path
          : new this.win.Path2D(Ink.shapePath(e));
      if (e !== this.active?.stroke) {
        this.pathCache.set(e, path);
        if (e.type === 'stroke') this.inkPaths.set(e.points, { signature, path });
      }
    }
    if (clipped) ctx.fill(path, 'evenodd');
    else if (e.type === 'stroke') ctx.fill(path);
    else {
      if (e.fill && e.fill !== 'none') {
        ctx.fillStyle = e.fill;
        ctx.fill(path, 'evenodd');
        ctx.fillStyle = e.color;
      }
      ctx.stroke(path);
    }
    if (e.connector && e.label) {
      const p = Ink.connectorLabelPoint(e);
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 5;
      ctx.strokeText(e.label, p.x, p.y - 8);
      ctx.fillText(e.label, p.x, p.y - 8);
    }
    ctx.restore();
  }
  render() {
    if (!this.s || !this.canvas) return;
    const start = Date.now(),
      ctx = this.prepare(this.canvas),
      { w, h } = this.size(),
      view = this.viewportBounds();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(view.x, view.y, view.w, view.h);
    ctx.strokeStyle = '#e6e9ef';
    ctx.fillStyle = '#cbd1da';
    ctx.lineWidth = 1 / this.zoom;
    const spacing = this.s.doc.paperSpacing || 28,
      step = spacing * Math.max(1, 2 ** Math.ceil(Math.log2(12 / (spacing * this.zoom)))),
      x0 = Math.floor(view.x / step) * step,
      y0 = Math.floor(view.y / step) * step,
      bg = this.s.doc.background;
    if (bg === 'dots') {
      for (let y = y0; y < view.y + view.h; y += step)
        for (let x = x0; x < view.x + view.w; x += step) {
          ctx.beginPath();
          ctx.arc(x, y, Math.max(0.6, 1 / this.zoom), 0, Math.PI * 2);
          ctx.fill();
        }
    } else if (bg === 'grid' && this.s.doc.gridStyle === 'isometric') {
      this.drawIsometric(ctx, view, step);
    } else if (bg !== 'plain') {
      ctx.beginPath();
      for (let y = y0; y < view.y + view.h; y += step) {
        ctx.moveTo(view.x, y);
        ctx.lineTo(view.x + view.w, y);
      }
      if (bg === 'grid')
        for (let x = x0; x < view.x + view.w; x += step) {
          ctx.moveTo(x, view.y);
          ctx.lineTo(x, view.y + view.h);
        }
      ctx.stroke();
    }
    this.drawTemplate(ctx, view);
    const els = this.layerElements(
      this.stylePreview?.elements || this.active?.preview || this.s.doc.elements
    );
    let visible;
    if (this.active?.fastMove) {
      visible = this.paintMovingSelection(ctx, view);
    } else {
      this.spatial.sync(els);
      visible = this.spatial.query(view);
      for (const e of visible) this.paint(ctx, e);
    }
    this.drawOverlay();
    this.renderStats.push({ ms: Date.now() - start, objects: visible.length, total: els.length });
    if (this.renderStats.length > 120) this.renderStats.shift();
    this.drawMinimap();
  }
  drawOverlay() {
    if (!this.s) return;
    const ctx = this.prepare(this.overlay),
      a = this.active;
    this.drawDrafting(ctx);
    if (a?.mode === 'space') {
      const size = this.size(),
        tl = Ink.screenToWorld({ x: 0, y: 0 }, this.camera, this.zoom);
      ctx.save();
      ctx.fillStyle = 'rgba(0,120,212,.10)';
      ctx.fillRect(tl.x, a.start.y, size.w / this.zoom, a.dy || 1 / this.zoom);
      ctx.strokeStyle = '#0078d4';
      ctx.lineWidth = 1 / this.zoom;
      ctx.beginPath();
      ctx.moveTo(tl.x, a.start.y);
      ctx.lineTo(tl.x + size.w / this.zoom, a.start.y);
      ctx.stroke();
      ctx.restore();
    }
    const crop = (a?.preview || this.s.doc.elements).find((e) => e.id === this.cropEditing);
    if (crop) {
      if (a?.mode === 'crop') {
        ctx.save();
        ctx.globalAlpha = 0.2;
        this.paint(ctx, { ...a.element, opacity: 0.2 });
        ctx.restore();
      }
      ctx.save();
      ctx.strokeStyle = '#ff9800';
      ctx.fillStyle = '#fff';
      ctx.lineWidth = 2 / this.zoom;
      const corners = Ink.imageCorners(crop);
      ctx.beginPath();
      corners.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.stroke();
      for (const p of corners) {
        ctx.fillRect(p.x - 5 / this.zoom, p.y - 5 / this.zoom, 10 / this.zoom, 10 / this.zoom);
        ctx.strokeRect(p.x - 5 / this.zoom, p.y - 5 / this.zoom, 10 / this.zoom, 10 / this.zoom);
      }
      ctx.restore();
    }
    if (a?.mode === 'gesture') {
      ctx.save();
      ctx.strokeStyle = '#dd44aa';
      ctx.lineWidth = 2 / this.zoom;
      ctx.beginPath();
      a.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      ctx.restore();
    }

    const vb = this.viewportBounds(),
      dims = { w: vb.w * this.zoom, h: vb.h * this.zoom },
      tl = { x: vb.x, y: vb.y };
    ctx.save();
    ctx.strokeStyle = '#dd44aa';
    ctx.lineWidth = 1 / this.zoom;
    ctx.setLineDash([4 / this.zoom, 3 / this.zoom]);
    for (const g of this.smartLines) {
      ctx.beginPath();
      if (g.axis === 'x') {
        ctx.moveTo(g.value, tl.y);
        ctx.lineTo(g.value, tl.y + dims.h / this.zoom);
      } else {
        ctx.moveTo(tl.x, g.value);
        ctx.lineTo(tl.x + dims.w / this.zoom, g.value);
      }
      ctx.stroke();
      if (g.spacing !== undefined) {
        ctx.font = 12 / this.zoom + 'px sans-serif';
        ctx.fillStyle = '#dd44aa';
        ctx.fillText(I18n.t('Espaços iguais'), tl.x + 15 / this.zoom, tl.y + 25 / this.zoom);
      }
    }
    ctx.setLineDash([]);
    if (this.snapMarker) {
      const target = this.s.doc.elements.find((e) => e.id === this.snapMarker.targetId);
      if (target) {
        const box = Ink.elementBounds(target);
        ctx.strokeRect(box.x, box.y, box.w, box.h);
      }
      ctx.beginPath();
      ctx.arc(this.snapMarker.x, this.snapMarker.y, 6 / this.zoom, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = 12 / this.zoom + 'px sans-serif';
      ctx.fillStyle = '#0078d4';
      ctx.fillText(
        I18n.t(
          this.snapMarker.self
            ? 'Início do traço'
            : target
              ? { endpoints: 'Extremidade', corners: 'Canto', midpoints: 'Ponto central' }[
                  Ink.anchorKind(target, this.snapMarker)
                ]
              : 'Ponto'
        ),
        this.snapMarker.x + 10 / this.zoom,
        this.snapMarker.y - 10 / this.zoom
      );
    }
    ctx.restore();
    const pointTarget = (a?.preview || this.s.doc.elements).find((e) => e.id === this.pointEditing);
    if (pointTarget) {
      ctx.save();
      if (pointTarget.connector && pointTarget.route === 'curve') {
        const controls = Ink.pointHandles(pointTarget).filter((p) => p.control);
        ctx.strokeStyle = '#b07a22';
        ctx.lineWidth = 1 / this.zoom;
        ctx.setLineDash([4 / this.zoom, 3 / this.zoom]);
        ctx.beginPath();
        ctx.moveTo(pointTarget.x1, pointTarget.y1);
        ctx.lineTo(controls[0].x, controls[0].y);
        ctx.moveTo(pointTarget.x2, pointTarget.y2);
        ctx.lineTo(controls[1].x, controls[1].y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#0078d4';
      ctx.lineWidth = 1.5 / this.zoom;
      for (const p of Ink.pointHandles(pointTarget)) {
        ctx.beginPath();
        ctx.fillStyle = p.control ? '#ffcb73' : '#fff';
        ctx.arc(p.x, p.y, 5 / this.zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
    if (a?.connector) this.paint(ctx, a.connector);
    if (this.mode === 'erase' && this.hoverPoint) {
      ctx.save();
      ctx.strokeStyle = '#777';
      ctx.lineWidth = 1 / this.zoom;
      ctx.beginPath();
      ctx.arc(
        this.hoverPoint.x,
        this.hoverPoint.y,
        this.plugin.settings.eraserSize / this.zoom,
        0,
        Math.PI * 2
      );
      ctx.stroke();
      ctx.restore();
    }
    if (a?.mode === 'lasso') {
      ctx.save();
      ctx.strokeStyle = '#0078d4';
      ctx.fillStyle = 'rgba(0,120,212,.08)';
      ctx.lineWidth = 1 / this.zoom;
      ctx.setLineDash([5 / this.zoom, 4 / this.zoom]);
      ctx.beginPath();
      a.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    if (this.plugin.settings.compareInk && a?.stroke && a.mode !== 'erase' && a.mode !== 'pan') {
      ctx.save();
      ctx.strokeStyle = '#e45b76';
      ctx.lineWidth = 1 / this.zoom;
      ctx.beginPath();
      (a.rawPoints || a.stroke.points).forEach((p, i) =>
        i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)
      );
      ctx.stroke();
      ctx.restore();
    }
    if (a?.stroke && !['erase', 'pan'].includes(a.mode)) this.paint(ctx, a.heldShape || a.stroke);
    if (this.pending?.shape) this.paint(ctx, this.pending.shape, true);
    if (
      this.mode === 'select' ||
      (this.selected.size && Brushes.SPECS[this.mode]) ||
      a?.mode === 'resize' ||
      a?.mode === 'move-selection' ||
      a?.mode === 'rotate'
    ) {
      const elements = (this.stylePreview?.elements || a?.preview || this.s.doc.elements).filter(
          (e) => this.selected.has(e.id)
        ),
        b = this.visible.bounds(elements);
      if (b) {
        const rh = this.rotationHandle(b);
        ctx.strokeStyle = '#0078d4';
        ctx.lineWidth = 1 / this.zoom;
        ctx.beginPath();
        ctx.moveTo(b.x + b.w / 2, b.y);
        ctx.lineTo(rh.x, rh.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(rh.x, rh.y, 5 / this.zoom, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = '#0078d4';
        ctx.lineWidth = 1.3 / this.zoom;
        ctx.setLineDash([]);
        ctx.strokeRect(b.x, b.y, b.w, b.h);
        const size = 9 / this.zoom;
        for (const p of this.selectionHandles(b, elements)) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
          ctx.strokeRect(p.x - size / 2, p.y - size / 2, size, size);
        }
      }
      if (a?.mode === 'marquee') {
        const r = Ink.pointBounds([a.start, a.end]);
        ctx.fillStyle = 'rgba(0,120,212,.09)';
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = '#0078d4';
        ctx.lineWidth = 1 / this.zoom;
        ctx.setLineDash([4 / this.zoom, 4 / this.zoom]);
        ctx.strokeRect(r.x, r.y, r.w, r.h);
      }
    }
  }
  download() {
    if (!this.s) return;
    this.finish(false);
    const blob = new this.win.Blob([Ink.serialize(this.s.doc)], { type: 'application/json' }),
      url = this.win.URL.createObjectURL(blob);
    const a = element(this.root, 'a');
    a.href = url;
    a.download = (this.file?.basename || 'pagina') + '-copia.smartink';
    a.click();
    a.remove();
    this.win.setTimeout(() => this.win.URL.revokeObjectURL(url), 1000);
  }
  async exportNote() {
    if (!this.s) return;
    this.finish(false);
    await this.save();
    try {
      const base = this.s.file.path.replace(/\.smartink$/, '') + '-export-' + Ink.uid(),
        image = await this.app.vault.create(base + '.svg', Ink.svg(this.s.doc));
      const source =
        (this.s.recoveryPath && this.app.vault.getAbstractFileByPath(this.s.recoveryPath)) ||
        this.s.file;
      const notePath = base + '.md',
        imageLink = this.app.fileManager.generateMarkdownLink(
          image,
          notePath,
          '',
          'Prévia Smart Ink'
        ),
        sourceLink = this.app.fileManager.generateMarkdownLink(
          source,
          notePath,
          '',
          'Editar página'
        );
      const note = await this.app.vault.create(
        notePath,
        '# Anotação Smart Ink\n\n!' +
          imageLink +
          '\n\n' +
          sourceLink +
          '\n\nEsta prévia é uma exportação estática. Exporte novamente após editar.\n'
      );
      await this.app.workspace.getLeaf(true).openFile(note);
      new Notice('SVG e nota criados.');
    } catch (e) {
      new Notice('Erro na exportação: ' + e.message);
    }
  }
}
class InkEmbed extends MarkdownRenderChild {
  constructor(el, plugin, path, sourcePath) {
    super(el);
    this.plugin = plugin;
    this.path = path;
    this.sourcePath = sourcePath;
    this.version = 0;
    this.disposed = false;
  }
  onload() {
    this.registerEvent(
      this.plugin.app.vault.on('modify', (file) => {
        if (file === this.file || file.path === this.path) void this.render();
      })
    );
    this.registerEvent(
      this.plugin.app.vault.on('rename', (file) => {
        if (file === this.file) this.path = file.path;
      })
    );
    this.registerEvent(
      this.plugin.app.vault.on('delete', (file) => {
        if (file === this.file) {
          this.version++;
          this.containerEl.textContent = 'A página Smart Ink foi removida.';
        }
      })
    );
    void this.render();
  }
  onunload() {
    this.disposed = true;
    this.version++;
  }
  async render() {
    const version = ++this.version,
      app = this.plugin.app;
    try {
      if (!this.path || /[\r\n]/.test(this.path))
        throw new Error('Informe um caminho .smartink no bloco.');
      const file =
        this.file ||
        app.metadataCache?.getFirstLinkpathDest(this.path, this.sourcePath) ||
        app.vault.getAbstractFileByPath(this.path);
      if (!(file instanceof TFile) || !file.path.endsWith('.smartink'))
        throw new Error('Página Smart Ink não encontrada: ' + this.path);
      this.file = file;
      const doc = Ink.parse(await app.vault.read(file));
      if (this.disposed || version !== this.version) return;
      this.containerEl.replaceChildren();
      const preview = element(this.containerEl, 'div', 'si-embed');
      preview.innerHTML = Ink.svg(doc, app.vault.getName?.() || '', { paper: true });
      preview.addEventListener('click', (e) => {
        const link = e.target.closest?.('[data-note-link]');
        if (link) {
          e.preventDefault();
          void app.workspace.openLinkText(link.getAttribute('data-note-link'), file.path, false);
        }
      });
      button(this.containerEl, 'Editar desenho', () => app.workspace.getLeaf(true).openFile(file));
    } catch (e) {
      if (!this.disposed && version === this.version) this.containerEl.textContent = e.message;
    }
  }
}
class InkSettings extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    this.containerEl.replaceChildren();
    element(this.containerEl, 'h2', '', 'Smart Ink — padrões para novas abas');
    new Setting(this.containerEl).setName('Pasta das páginas').addText((t) =>
      t.setValue(this.plugin.settings.folder).onChange(async (v) => {
        this.plugin.settings.folder = v.trim() || 'Smart Ink';
        await this.plugin.savePreferences();
      })
    );
    new Setting(this.containerEl)
      .setName('Aceitar somente caneta')
      .setDesc(
        'Desative se seu driver identificar a mesa como mouse. Toque não desenha neste protótipo.'
      )
      .addToggle((t) =>
        t.setValue(this.plugin.settings.penOnly).onChange(async (v) => {
          this.plugin.settings.penOnly = v;
          await this.plugin.savePreferences();
        })
      );
    element(
      this.containerEl,
      'p',
      '',
      'Toque novamente na ferramenta ativa para escolher cores, espessura, pressão e suavização. Cada pincel guarda suas preferências automaticamente.'
    );
    element(
      this.containerEl,
      'p',
      '',
      'Funciona offline. Formas: linha, círculo, elipse, retângulo, triângulo e seta, com seleção e confirmação. Não inclui OCR ou sugestões de objetos.'
    );
  }
}
module.exports = SmartInkPlugin;

installFeatures(InkView, Ink, Brushes, { element, button, Notice });
