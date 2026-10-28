/* Selection and clipboard workflow. All clipboard documents pass the normal parser. */
(function installSelectionWorkflow(View) {
  const P = View.prototype,
    MIME = 'application/x-smart-ink+json',
    PREFIX = 'SMARTINK-SELECTION/1\n';
  const wrap = (name, fn) => {
    const old = P[name];
    P[name] = function (...args) {
      return fn.call(this, old, ...args);
    };
  };
  const walk = (root) => [root, ...Array.from(root.children || []).flatMap(walk)];
  P.isTextTarget = function (target) {
    for (let n = target; n && n !== this.root; n = n.parentNode)
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(n.tagName) || n.isContentEditable) return true;
    return false;
  };
  P.showCanvasFeedback = function (message, undo = false) {
    if (!this.viewport) return;
    clearTimeout(this.feedbackTimer);
    this.canvasFeedback?.remove();
    const box = (this.canvasFeedback = element(this.viewport, 'div', 'si-canvas-feedback'));
    box.setAttribute('role', 'status');
    element(box, 'span', '', message);
    const session = this.s,
      revision = session?.revision;
    if (undo)
      button(box, 'Desfazer', () => {
        if (this.s === session && this.s.revision === revision) {
          this.undo();
          this.showCanvasFeedback('Operação desfeita');
        } else this.showCanvasFeedback('Use o histórico para desfazer esta operação.');
      });
    button(box, '×', () => {
      box.remove();
      clearTimeout(this.feedbackTimer);
    }).setAttribute('aria-label', 'Fechar mensagem');
    this.feedbackTimer = setTimeout(() => {
      box.remove();
      if (this.canvasFeedback === box) this.canvasFeedback = null;
    }, 6000);
    this.feedbackTimer?.unref?.();
  };
  P.selectionClipboardText = function () {
    this.finish(true);
    const chosen = this.selectedElements();
    if (!chosen.length) return null;
    const ids = new Set(chosen.map((e) => e.id)),
      elements = Ink.clone(chosen).map((e) => {
        if (e.bindings)
          for (const side of Object.keys(e.bindings))
            if (!ids.has(e.bindings[side].targetId)) delete e.bindings[side];
        if (e.geometryRule && !ids.has(e.geometryRule.targetId)) delete e.geometryRule;
        return e;
      });
    const doc = {
      ...Ink.fresh(),
      layers: Ink.clone(this.s.doc.layers),
      activeLayer: this.s.doc.activeLayer,
      elements
    };
    const json = Ink.serialize(doc);
    Ink.parse(json);
    return PREFIX + json;
  };
  P.copySelection = async function () {
    try {
      const text = this.selectionClipboardText();
      if (!text) return;
      await this.win.navigator.clipboard.writeText(text);
      this.showCanvasFeedback('Seleção copiada');
    } catch (error) {
      new Notice('Não foi possível copiar. Com o canvas em foco, use Ctrl/Cmd+C.');
    }
  };
  P.pasteSelection = function (text, placement = 'center') {
    try {
      if (!text?.startsWith(PREFIX)) return false;
      if (text.length > 40 * 1024 * 1024)
        throw new Error('Seleção copiada acima do limite de 40 MB.');
      if (!this.editable()) return false;
      const source = Ink.parse(text.slice(PREFIX.length)),
        layer = this.activeLayer();
      if (layer.locked || !layer.visible)
        throw new Error('Escolha uma camada visível e desbloqueada.');
      if (!source.elements.length) return false;
      this.finish(true);
      const bounds = Ink.bounds(source.elements),
        center =
          placement === 'original'
            ? { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 }
            : placement === 'cursor' && this.lastPointer
              ? this.point({ clientX: this.lastPointer.x, clientY: this.lastPointer.y })
              : this.worldCenter(),
        ids = new Map(source.elements.map((e) => [e.id, Ink.uid()]));
      const copies = Workflow.cloneGroups(source.elements).map((e) => {
        const copy = {
          ...Ink.transform(e, {
            dx: center.x - bounds.x - bounds.w / 2,
            dy: center.y - bounds.y - bounds.h / 2
          }),
          id: ids.get(e.id),
          layerId: layer.id,
          locked: false
        };
        if (copy.bindings) {
          copy.bindings = {};
          for (const [side, binding] of Object.entries(e.bindings))
            if (ids.has(binding.targetId))
              copy.bindings[side] = { ...binding, targetId: ids.get(binding.targetId) };
        }
        if (copy.geometryRule) {
          if (ids.has(copy.geometryRule.targetId))
            copy.geometryRule = {
              ...copy.geometryRule,
              targetId: ids.get(copy.geometryRule.targetId)
            };
          else delete copy.geometryRule;
        }
        return copy;
      });
      const after = [...this.s.doc.elements, ...copies];
      Ink.parse(Ink.serialize({ ...this.s.doc, elements: after }));
      this.nextHistoryLabel = 'Colar seleção';
      this.commitElements(after);
      this.selected = new Set(copies.map((e) => e.id));
      this.selectTool('select', false, false);
      this.showCanvasFeedback(copies.length + ' objeto(s) colado(s)', true);
      this.overlay.focus();
      return true;
    } catch (error) {
      new Notice(error.message);
      return false;
    }
  };
  P.returnToWriting = function () {
    this.finish(true);
    this.selectTool(this.plugin.settings.lastBrush, false, false);
    this.overlay.focus();
    this.showCanvasFeedback('Escrita: ' + Brushes.SPECS[this.mode].label);
  };
  P.fitSelection = function () {
    const box = this.selectionBox();
    if (!box) return;
    this.finish(true);
    this.fitRegion({ ...box, w: Math.max(1, box.w), h: Math.max(1, box.h) });
    this.showCanvasFeedback('Seleção enquadrada');
  };
  P.escapeOneLevel = function () {
    if (this.active) {
      const a = this.active;
      if (a.stroke || a.mode === 'erase') {
        this.stopHold();
        this.cancelStrokeBackup(a);
        if (a.mode === 'erase') this.s.doc.elements = a.before;
        this.active = null;
        if (this.overlay.hasPointerCapture(a.pointer))
          this.overlay.releasePointerCapture(a.pointer);
        this.render();
      } else this.cancelGesture();
      if (!this.active && this.overlay.hasPointerCapture(a.pointer))
        this.overlay.releasePointerCapture(a.pointer);
      this.smartLines = [];
      this.snapMarker = null;
      this.snapLock = null;
    } else if (this.pending) {
      this.clearGroup();
    } else if (this.flyout) {
      this.closePanel(true);
    } else if (this.radial) {
      this.closeRadial();
    } else if (
      this.pointEditing ||
      this.cropEditing ||
      this.regionEditing ||
      this.parameterEditing ||
      this.vectorTask ||
      this.polySelection
    ) {
      this.pointEditing =
        this.cropEditing =
        this.regionEditing =
        this.parameterEditing =
        this.vectorTask =
        this.polySelection =
          null;
      this.cancelGesture();
    } else if (this.selected.size) {
      this.selected.clear();
    } else if (this.focusMode) this.toggleFocus();
    this.updateSuggestion();
    this.drawOverlay();
  };
  wrap('build', function (old, ...args) {
    const result = old.apply(this, args);
    this.listen(
      this.root,
      'keydown',
      (e) => {
        if (e.isComposing) return;
        if (e.key === 'Escape' && e.target === this.settingsSearch && this.settingsSearch.value) {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.settingsSearch.value = '';
          this.searchSettings('');
          return;
        }
        if (
          e.key === 'Escape' &&
          e.target._siRestore &&
          e.target.getAttribute('aria-invalid') === 'true'
        ) {
          e.preventDefault();
          e.stopImmediatePropagation();
          e.target._siRestore();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.escapeOneLevel();
          return;
        }
        if (
          this.isTextTarget(e.target) ||
          e.target !== this.overlay ||
          e.repeat ||
          e.ctrlKey ||
          e.metaKey
        )
          return;
        if (e.code === this.plugin.settings.returnBrushKey && !e.altKey && !e.shiftKey) {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.returnToWriting();
        } else if (e.code === 'Digit2' && e.shiftKey && !e.altKey) {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.fitSelection();
        }
      },
      true
    );
    this.listen(this.root, 'copy', (e) => {
      if (
        this.isTextTarget(e.target) ||
        this.flyout?.contains(e.target) ||
        !this.s ||
        !e.clipboardData
      )
        return;
      try {
        const text = this.selectionClipboardText();
        if (!text) return;
        e.clipboardData.setData('text/plain', text);
        try {
          e.clipboardData.setData(MIME, text);
        } catch {}
        e.preventDefault();
        this.showCanvasFeedback('Seleção copiada');
      } catch (error) {
        new Notice(error.message);
      }
    });
    this.listen(
      this.root,
      'paste',
      (e) => {
        if (this.isTextTarget(e.target) || this.flyout?.contains(e.target) || !e.clipboardData)
          return;
        const text =
          e.clipboardData.getData?.(MIME) || e.clipboardData.getData?.('text/plain') || '';
        if (!text.startsWith(PREFIX)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        const placement = Date.now() <= (this.originalPasteUntil || 0) ? 'original' : 'center';
        this.originalPasteUntil = 0;
        this.pasteSelection(text, placement);
      },
      true
    );
    const hide = () => {
      this.dropMarker?.remove();
      this.dropMarker = null;
    };
    this.listen(this.viewport, 'dragover', (e) => {
      if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      const rect = this.viewport.getBoundingClientRect();
      if (!this.dropMarker) {
        this.dropMarker = element(
          this.viewport,
          'div',
          'si-drop-marker',
          'Solte para inserir imagem'
        );
        this.dropMarker.setAttribute('role', 'status');
      }
      this.dropMarker.style.left =
        Ink.clamp(e.clientX - rect.left, 10, Math.max(10, rect.width - 170)) + 'px';
      this.dropMarker.style.top =
        Ink.clamp(e.clientY - rect.top, 10, Math.max(10, rect.height - 40)) + 'px';
    });
    this.listen(this.viewport, 'dragleave', (e) => {
      if (!this.viewport.contains(e.relatedTarget)) hide();
    });
    this.listen(this.viewport, 'drop', (e) => {
      hide();
      if (e.dataTransfer?.files?.length) e.preventDefault();
      const images = Array.from(e.dataTransfer?.files || []).filter((f) =>
        f.type.startsWith('image/')
      );
      if (!images.length) return;
      e.preventDefault();
      e.stopPropagation();
      this.clipboardPromise = this.pasteImages(images, { center: this.point(e) });
    });
    this.listen(this.overlay, 'pointerleave', () => {
      this.selectionHover = null;
      this.drawOverlay();
    });
    return result;
  });
  P.selectionTolerance = function () {
    return this.selectionPointer === 'pen' ? 20 : 9;
  };
  P.selectionHandles = function (box, elements = this.selectedElements()) {
    if (elements.length === 1 && elements[0].type === 'image') {
      const e = elements[0],
        c = Math.cos(e.angle || 0),
        s = Math.sin(e.angle || 0);
      return [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1]
      ].map(([x, y]) => ({
        x: e.cx + (c * x * e.imageW) / 2 - (s * y * e.imageH) / 2,
        y: e.cy + (s * x * e.imageW) / 2 + (c * y * e.imageH) / 2
      }));
    }
    return this.handles(box);
  };
  wrap('down', function (old, e) {
    this.selectionPointer = e.pointerType;
    this.selectionHover = null;
    return old.call(this, e);
  });
  wrap('beginSelect', function (old, p, e) {
    const result = old.call(this, p, e),
      a = this.active;
    if (a?.mode === 'resize') {
      const box = Ink.bounds(a.before.filter((el) => a.selected.has(el.id)));
      a.resizeCenter = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    }
    return result;
  });
  wrap('move', function (old, e) {
    const a = this.active;
    if (a && e.pointerId === a.pointer && a.mode === 'move-selection' && !a.dragStarted) {
      if (Ink.dist(this.point(e), a.start) * this.zoom < this.plugin.settings.selectionSlop) {
        e.preventDefault();
        return;
      }
      a.dragStarted = true;
    }
    if (a?.mode === 'resize' && e.pointerId === a.pointer) {
      e.preventDefault();
      const p = this.point(e),
        origin = e.altKey ? a.resizeCenter : a.origin,
        chosen = a.before.filter((el) => a.selected.has(el.id)),
        image = chosen.length === 1 && chosen[0].type === 'image' ? chosen[0] : null;
      let transform;
      if (image && e.shiftKey && !image.erasures?.length) {
        const angle = image.angle || 0,
          c = Math.cos(angle),
          s = Math.sin(angle),
          local = (q) => ({
            x: c * (q.x - origin.x) + s * (q.y - origin.y),
            y: -s * (q.x - origin.x) + c * (q.y - origin.y)
          }),
          start = local(a.handle),
          now = local(p),
          sx = Ink.clamp(now.x / (start.x || 1), 0.05, 20),
          sy = Ink.clamp(now.y / (start.y || 1), 0.05, 20),
          center = local({ x: image.cx, y: image.cy });
        transform = (el) => ({
          ...el,
          cx: origin.x + c * center.x * sx - s * center.y * sy,
          cy: origin.y + s * center.x * sx + c * center.y * sy,
          imageW: image.imageW * sx,
          imageH: image.imageH * sy
        });
      } else {
        const scale = Ink.resizeScale(a.handle, p, origin);
        transform = (el) => Ink.transform(el, { scale, origin });
      }
      a.preview = Ink.resolveConnections(
        a.before.map((el) => (a.selected.has(el.id) ? transform(el) : el))
      );
      a.changed = Ink.dist(p, a.start) > 0.5 / this.zoom;
      this.render();
      return;
    }
    return old.call(this, e);
  });
  wrap('updateCursor', function (old, e) {
    this.selectionPointer = e.pointerType;
    const result = old.call(this, e),
      p = this.point(e),
      r = this.selectionTolerance() / this.zoom;
    this.spatial.sync(this.layerElements());
    const hit = this.spatial
      .query({ x: p.x - r, y: p.y - r, w: 2 * r, h: 2 * r })
      .reverse()
      .find((el) => this.selectionAllowed(el) && this.visible.hit(el, p, r));
    const next = hit && !this.selected.has(hit.id) ? hit : null;
    if (this.selectionHover?.id !== next?.id) {
      this.selectionHover = next;
      this.drawOverlay();
    }
    return result;
  });
  wrap('drawOverlay', function (old, ...args) {
    const result = old.apply(this, args);
    if (this.selectionHover && this.mode === 'select' && !this.active) {
      const b = this.visible.bounds([this.selectionHover]);
      if (b) {
        const ctx = this.overlay.getContext('2d');
        ctx.save();
        ctx.strokeStyle = '#0078d4';
        ctx.lineWidth = 1.5 / this.zoom;
        ctx.setLineDash([4 / this.zoom, 3 / this.zoom]);
        ctx.strokeRect(b.x, b.y, b.w, b.h);
        ctx.restore();
      }
    }
    return result;
  });
  wrap('updateSuggestion', function (old, ...args) {
    const result = old.apply(this, args);
    if (!this.suggestion || this.mode !== 'select' || this.pending || !this.s) return result;
    const selected = this.selectedElements();
    if (!selected.length) return result;
    this.suggestion.replaceChildren();
    element(this.suggestion, 'span', 'si-selection-count', selected.length + ' selecionado(s)');
    const group = element(this.suggestion, 'div', 'si-selection-buttons');
    const add = (label, fn) => button(group, label, fn);
    if (selected.length === 1 && selected[0].type === 'image')
      add('Recortar', () => this.beginVisualCrop());
    else if (selected.length === 1 && selected[0].type === 'text')
      add('Fonte e texto', () => this.openTextEditor(selected[0]));
    else {
      add(selected.every((e) => e.type === 'stroke') ? 'Cor e espessura' : 'Estilo', () =>
        this.openSelectionStyle()
      );
      if (selected.length === 1 && selected[0].shapeFrame)
        add('Parâmetros', () => this.openShapeParameters());
    }
    add('Copiar', () => this.copySelection());
    add('Enquadrar', () => this.fitSelection());
    add('Escrever', () => this.returnToWriting());
    const more = add('Mais', () => this.openSelectionActions(more));
    more.setAttribute('aria-label', 'Mais ações da seleção');
    more.setAttribute('aria-haspopup', 'dialog');
    return result;
  });
  wrap('openSelectionActions', function (old, ...args) {
    const result = old.apply(this, args);
    button(this.flyout, 'Enquadrar seleção (Shift+2)', () => {
      this.closePanel();
      this.fitSelection();
    });
    button(this.flyout, 'Voltar à visualização anterior', () => {
      this.closePanel();
      this.navigateView(false);
    });
    button(this.flyout, 'Voltar à escrita', () => this.returnToWriting());
    return result;
  });
  wrap('openBrushPanel', function (old, kind, selection = false) {
    const result = old.call(this, kind, selection);
    if (selection && this.flyout) {
      const panel = this.flyout,
        session = this.s,
        revision = this.s.revision,
        apply = walk(panel).find(
          (b) => b.tagName === 'BUTTON' && I18n.canonical(b) === 'Aplicar à seleção'
        );
      if (apply) {
        apply.setAttribute('aria-keyshortcuts', 'Control+Enter Meta+Enter');
        panel.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.repeat && !e.isComposing) {
            e.preventDefault();
            e.stopPropagation();
            if (this.flyout === panel) apply.click();
          }
        });
        apply.addEventListener('click', () => {
          if (!this.flyout && this.s === session && this.s.revision > revision)
            this.showCanvasFeedback('Estilo aplicado', true);
        });
      }
    }
    return result;
  });
  wrap('finish', function (old, ...args) {
    if (this.active?.mode === 'resize' && this.active.changed && this.active.preview) {
      try {
        Ink.parse(Ink.serialize({ ...this.s.doc, elements: this.active.preview }));
      } catch (error) {
        this.cancelGesture();
        new Notice(error.message);
        return;
      }
    }
    return old.apply(this, args);
  });
  wrap('openInterface', function (old, ...args) {
    const result = old.apply(this, args);
    this.numberField(
      this.flyout,
      'Movimento mínimo para arrastar seleção (px)',
      this.plugin.settings.selectionSlop,
      0,
      20,
      (v) => {
        this.plugin.settings.selectionSlop = v;
        void this.plugin.savePreferences();
      }
    );
    element(
      this.flyout,
      'p',
      'si-panel-copy',
      'Imagens: mantenha a proporção ao arrastar; Shift libera largura/altura; Alt usa o centro. Imagens com recortes de borracha preservam a proporção.'
    );
    return result;
  });
  wrap('openWorkflow', function (old, ...args) {
    const result = old.apply(this, args),
      b = button(this.flyout, 'Voltar à escrita: ' + this.plugin.settings.returnBrushKey);
    b.addEventListener('keydown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const s = this.plugin.settings;
      if (!/^Key[A-Z]$/.test(e.code)) return;
      const used = [
        ...Object.values(s.shortcuts),
        ...Object.values(s.quickKeys),
        s.radialKey,
        s.temporaryKey,
        s.brushAdjustKey,
        s.straightKey,
        s.proportionKey
      ];
      if (used.includes(e.code)) {
        new Notice('Tecla já utilizada.');
        return;
      }
      s.returnBrushKey = e.code;
      b.textContent = 'Voltar à escrita: ' + e.code;
      void this.plugin.savePreferences();
    });
    return result;
  });
  for (const [name, message] of [
    ['duplicateSelection', 'Seleção duplicada'],
    ['deleteSelection', 'Seleção excluída']
  ])
    wrap(name, function (old, ...args) {
      const session = this.s,
        revision = session?.revision,
        result = old.apply(this, args);
      if (this.s === session && session?.revision > revision)
        this.showCanvasFeedback(message, true);
      return result;
    });
  for (const name of ['onClose', 'onUnloadFile'])
    wrap(name, function (old, ...args) {
      clearTimeout(this.feedbackTimer);
      this.canvasFeedback?.remove();
      this.canvasFeedback = null;
      this.dropMarker?.remove();
      this.dropMarker = null;
      this.selectionHover = null;
      return old.apply(this, args);
    });
})(InkView);
