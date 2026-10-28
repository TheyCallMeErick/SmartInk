/* Frame-level caching, direct editing conveniences and bounded diagnostics. */
(function installFluidWorkflow(View) {
  const P = View.prototype,
    wrap = (name, fn) => {
      const old = P[name];
      P[name] = function (...args) {
        return fn.call(this, old, ...args);
      };
    },
    clock = () => globalThis.performance?.now?.() ?? Date.now();
  const walk = (root) => [root, ...Array.from(root.children || []).flatMap(walk)];
  P.retainTransformedPath = function (original, moved, tx) {
    if (Math.abs(moved.width - original.width * (tx.scale ?? 1)) > 1e-8) return;
    this.visible.retainTransform(original, moved, tx);
    const cached = this.pathCache.get(original);
    if (!cached) return;
    try {
      const path = new this.win.Path2D();
      if (!path.addPath) return;
      const k = tx.scale ?? 1,
        c = Math.cos(tx.angle || 0) * k,
        s = Math.sin(tx.angle || 0) * k,
        o = tx.origin || { x: 0, y: 0 };
      path.addPath(cached, {
        a: c,
        b: s,
        c: -s,
        d: c,
        e: (tx.dx || 0) + o.x - c * o.x + s * o.y,
        f: (tx.dy || 0) + o.y - s * o.x - c * o.y
      });
      this.pathCache.set(moved, path);
      this.boundsCache.set(moved, this.previewBounds(this.cachedBounds(original), tx));
    } catch {
      /* Older runtimes use the normal geometry builder. */
    }
  };
  P.recordTiming = function (name, ms) {
    this.phaseTimings ??= {};
    const samples = (this.phaseTimings[name] ??= []);
    samples.push(ms);
    if (samples.length > 120) samples.shift();
  };
  for (const [name, label] of [
    ['beginSelect', 'seleção'],
    ['flushMovingSelection', 'prévia'],
    ['render', 'desenho'],
    ['finish', 'confirmação']
  ])
    wrap(name, function (old, ...args) {
      const start = clock();
      try {
        return old.apply(this, args);
      } finally {
        this.recordTiming(label, clock() - start);
      }
    });
  wrap('save', async function (old, ...args) {
    const start = clock();
    try {
      return await old.apply(this, args);
    } finally {
      this.recordTiming('salvamento manual', clock() - start);
    }
  });
  P.performanceReport = function () {
    const report = {
      version: '0.21.0',
      objects: this.s?.doc.elements.length || 0,
      selected: this.selected.size,
      zoom: this.zoom,
      scope: 'JavaScript; não mede GPU nem latência física',
      phases: {}
    };
    for (const [key, values] of Object.entries(this.phaseTimings || {})) {
      const s = values.slice().sort((a, b) => a - b);
      report.phases[key] = {
        samples: s.length,
        medianMs: s[Math.floor(s.length / 2)],
        p95Ms: s[Math.floor((s.length - 1) * 0.95)]
      };
    }
    if (this.s?.saveTimings?.length) {
      const s = this.s.saveTimings.slice().sort((a, b) => a - b);
      report.phases.salvamento = {
        samples: s.length,
        medianMs: s[Math.floor(s.length / 2)],
        p95Ms: s[Math.floor((s.length - 1) * 0.95)]
      };
    }
    return report;
  };
  wrap('openPerformance', function (old, ...args) {
    const result = old.apply(this, args),
      panel = this.flyout;
    const area = element(panel, 'textarea');
    area.readOnly = true;
    area.value = JSON.stringify(this.performanceReport(), null, 2);
    area.setAttribute('aria-label', 'Relatório de desempenho sem conteúdo do desenho');
    button(panel, 'Copiar diagnóstico', async () => {
      try {
        await this.win.navigator.clipboard.writeText(area.value);
        this.showCanvasFeedback('Diagnóstico copiado');
      } catch {
        area.focus();
        area.select?.();
      }
    });
    button(panel, 'Limpar diagnóstico por etapa', () => {
      this.phaseTimings = {};
      if (this.s) this.s.saveTimings = [];
      this.openPerformance();
    });
    return result;
  });
  // Cache contiguous stationary runs, preserving interleaving with selected elements.
  wrap('paintMovingSelection', function (old, ctx, view) {
    const fast = this.active.fastMove,
      key = [
        this.canvas.width,
        this.canvas.height,
        this.camera.x,
        this.camera.y,
        this.camera.angle || 0,
        this.zoom,
        this.rasterRevision || 0
      ].join('|');
    if (fast.rasterKey !== key) {
      fast.rasterKey = key;
      fast.runs = [];
      let run = null;
      for (const record of fast.records) {
        const fixed = !record.moving && !fast.links.has(record.e.id);
        if (!run || run.fixed !== fixed) {
          run = { fixed, records: [] };
          fast.runs.push(run);
        }
        run.records.push(record);
      }
      const fixed = fast.runs.filter((r) => r.fixed);
      const budget = this.canvas.width * this.canvas.height * fixed.length;
      if (fixed.length <= 4 && budget <= 16000000)
        for (const run of fixed) {
          const canvas = this.root.ownerDocument.createElement('canvas'),
            context = this.prepare(canvas);
          for (const r of run.records) if (Ink.overlaps(r.b, view)) this.paint(context, r.e);
          run.canvas = canvas;
        }
    }
    const visible = [],
      records = fast.records;
    try {
      for (const run of fast.runs) {
        if (run.canvas) {
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(run.canvas, 0, 0);
          ctx.restore();
          for (const r of run.records) if (Ink.overlaps(r.b, view)) visible.push(r.e);
        } else {
          fast.records = run.records;
          visible.push(...old.call(this, ctx, view));
        }
      }
    } finally {
      fast.records = records;
    }
    return visible;
  });
  P.stopAutopan = function () {
    if (this.autopanFrame != null) this.win.cancelAnimationFrame(this.autopanFrame);
    this.autopanFrame = null;
    this.autopanInput = null;
    this.autopanTime = null;
  };
  P.armAutopan = function (e) {
    const a = this.active;
    if (
      !a ||
      !['move-selection', 'marquee', 'lasso'].includes(a.mode) ||
      a.nudge ||
      e.pointerId !== a.pointer
    )
      return;
    const r = this.overlay.getBoundingClientRect(),
      edge = 36,
      speed = (p, min, max) =>
        p < min + edge
          ? -Math.min(1, (min + edge - p) / edge)
          : p > max - edge
            ? Math.min(1, (p - max + edge) / edge)
            : 0;
    const vx = speed(e.clientX, r.left, r.right),
      vy = speed(e.clientY, r.top, r.bottom);
    if (!vx && !vy) {
      this.stopAutopan();
      return;
    }
    this.autopanInput = {
      clientX: e.clientX,
      clientY: e.clientY,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      altKey: !!e.altKey,
      shiftKey: !!e.shiftKey,
      button: 0,
      preventDefault() {}
    };
    if (this.autopanFrame != null) return;
    this.autopanFrame = this.win.requestAnimationFrame((time) => {
      this.autopanFrame = null;
      if (this.active !== a) {
        this.stopAutopan();
        return;
      }
      const dt = Math.min(32, Math.max(1, this.autopanTime ? time - this.autopanTime : 16));
      this.autopanTime = time;
      this.camera = {
        ...this.camera,
        x: this.camera.x - vx * dt * 0.45,
        y: this.camera.y - vy * dt * 0.45
      };
      const input = this.autopanInput;
      if (input) this.move(input);
    });
  };
  wrap('move', function (old, e) {
    const result = old.call(this, e);
    this.armAutopan(e);
    return result;
  });
  for (const name of ['finish', 'cancelGesture', 'onClose', 'onUnloadFile'])
    wrap(name, function (old, ...args) {
      this.stopAutopan();
      return old.apply(this, args);
    });
  P.nudgeSelection = function (dx, dy) {
    if (
      !this.editable() ||
      this.mode !== 'select' ||
      !this.selected.size ||
      (this.active && !this.active.nudge)
    )
      return;
    if (!this.active) {
      this.active = {
        mode: 'move-selection',
        nudge: true,
        pointer: -99,
        start: { x: 0, y: 0 },
        before: this.s.doc.elements,
        revision: this.s.revision,
        selected: new Set(this.selected),
        moveSession: this.s
      };
      this.prepareMovingSelection(this.active);
    }
    const a = this.active,
      fast = a.fastMove;
    fast.dx += dx;
    fast.dy += dy;
    fast.tx = { dx: fast.dx, dy: fast.dy };
    a.moveInput = { point: { x: fast.dx, y: fast.dy }, altKey: true };
    this.flushMovingSelection(a);
    this.requestRender();
  };
  P.pasteAt = async function (placement) {
    const session = this.s;
    try {
      const text = await this.win.navigator.clipboard.readText();
      if (this.s !== session) {
        new Notice('A página mudou; cole novamente.');
        return;
      }
      if (!this.pasteSelection(text, placement))
        this.showCanvasFeedback('Copie uma seleção Smart Ink primeiro.');
    } catch {
      new Notice('Use Ctrl/Cmd+V para colar; Ctrl/Cmd+Shift+V mantém a posição original.');
    }
  };
  P.replaceSelectedImage = function () {
    const target = this.selectedElements();
    if (target.length !== 1 || target[0].type !== 'image') return;
    const original = target[0],
      session = this.s,
      revision = session.revision,
      input = element(this.root, 'input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.style.display = 'none';
    input.addEventListener('cancel', () => input.remove());
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      try {
        if (
          file.size > 8 * 1024 * 1024 ||
          !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
        )
          throw new Error('Use PNG, JPEG ou WebP de até 8 MB.');
        const prepared = await this.decodePastedImage(file);
        if (this.s !== session || session.revision !== revision)
          throw new Error('O documento mudou; selecione a imagem novamente.');
        if (!this.editable() || !Ink.isEditable(session.doc, original)) return;
        const replacement = { ...original, src: prepared.src };
        delete replacement.crop;
        delete replacement.erasures;
        this.nextHistoryLabel = 'Substituir imagem';
        if (
          this.safeCommit(session.doc.elements.map((e) => (e.id === original.id ? replacement : e)))
        ) {
          this.closePanel();
          this.showCanvasFeedback('Imagem substituída', true);
        }
      } catch (error) {
        new Notice(error.message);
      }
    });
    input.click();
  };
  P.copySelectionImage = async function () {
    try {
      const selected = this.selectedElements();
      if (!selected.length) return;
      const bounds = Ink.expand(Ink.bounds(selected), 4),
        scale = Math.min(2, 4096 / Math.max(bounds.w, bounds.h)),
        w = Math.max(1, Math.ceil(bounds.w * scale)),
        h = Math.max(1, Math.ceil(bounds.h * scale));
      if (w * h > 16000000) throw new Error('Seleção muito grande para copiar como imagem.');
      const canvas = this.root.ownerDocument.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.translate(-bounds.x, -bounds.y);
      for (const e of this.layerElements(selected)) {
        if (e.type === 'image') {
          let image = this.imageCache.get(e.src);
          if (!image) {
            image = new this.win.Image();
            image.src = e.src;
            this.imageCache.set(e.src, image);
          }
          if (!image.complete || !image.naturalWidth) await image.decode();
        }
        this.paint(ctx, e);
      }
      const blob = await new Promise((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Não foi possível gerar PNG.'))),
          'image/png'
        )
      );
      if (!this.win.ClipboardItem || !this.win.navigator.clipboard?.write)
        throw new Error('Copiar PNG não está disponível neste ambiente. Use Exportar SVG.');
      await this.win.navigator.clipboard.write([new this.win.ClipboardItem({ 'image/png': blob })]);
      this.showCanvasFeedback('PNG transparente copiado');
    } catch (error) {
      new Notice(error.message);
    }
  };
  wrap('openSelectionActions', function (old, ...args) {
    const result = old.apply(this, args);
    button(this.flyout, 'Colar na posição original', () => this.pasteAt('original'));
    button(this.flyout, 'Colar na posição do cursor', () => this.pasteAt('cursor'));
    button(this.flyout, 'Copiar como PNG transparente', () => this.copySelectionImage());
    if (this.selectedElements().length === 1 && this.selectedElements()[0].type === 'image')
      button(this.flyout, 'Substituir imagem…', () => this.replaceSelectedImage());
    this.decorateActions(this.flyout);
    return result;
  });
  wrap('openImageOptions', function (old, ...args) {
    if (!this.selectedElements().some((e) => e.type === 'image')) return;
    const result = old.apply(this, args);
    if (this.panelKind !== 'image-options' || !this.flyout) return result;
    button(this.flyout, 'Substituir imagem…', () => this.replaceSelectedImage());
    this.decorateActions(this.flyout);
    return result;
  });
  wrap('openOrganize', function (old, ...args) {
    const result = old.apply(this, args);
    button(this.flyout, 'Colar na posição original', () => this.pasteAt('original'));
    button(this.flyout, 'Colar na posição do cursor', () => this.pasteAt('cursor'));
    this.decorateActions(this.flyout);
    return result;
  });
  const icons = {
    copy: 'M9 9h12v12H9z M15 9V3H3v12h6',
    paste: 'M8 5H4v17h16V5h-4 M8 3h8v4H8z',
    crop: 'M7 2v15h15 M2 7h15v15',
    fit: 'M3 9V3h6 M15 3h6v6 M21 15v6h-6 M9 21H3v-6',
    pen: 'M4 16 16 4l4 4L8 20H4z',
    image: 'M3 3h18v18H3z M3 17l6-6 4 4 3-3 5 5',
    check: 'm4 12 5 5L20 6',
    close: 'm5 5 14 14 M19 5 5 19',
    trash: 'M4 6h16 M8 6V3h8v3 M6 6l1 15h10l1-15',
    settings: 'M3 6h18 M3 12h18 M3 18h18 M8 3v6 M16 9v6 M10 15v6',
    more: 'M4 12h2 M11 12h2 M18 12h2'
  };
  P.decorateActions = function (root) {
    if (!root) return;
    for (const b of walk(root)) {
      if (b.tagName !== 'BUTTON' || b.dataset.siIcon) continue;
      const text = I18n.canonical(b) || '',
        key = /Copiar/.test(text)
          ? 'copy'
          : /Colar/.test(text)
            ? 'paste'
            : /Recort/.test(text)
              ? 'crop'
              : /Enquadr/.test(text)
                ? 'fit'
                : /Escrev|escrita/.test(text)
                  ? 'pen'
                  : /imagem|Imagem|PNG/.test(text)
                    ? 'image'
                    : /^(Aplicar|Confirmar|Concluir)/.test(text)
                      ? 'check'
                      : /^Cancelar/.test(text)
                        ? 'close'
                        : /^Excluir/.test(text)
                          ? 'trash'
                          : /Estilo|espessura|Parâmetros/.test(text)
                            ? 'settings'
                            : text === 'Mais'
                              ? 'more'
                              : null;
      if (!key || Array.from(b.children).some((c) => c.tagName.toLowerCase() === 'svg')) continue;
      const svg = b.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('width', '16');
      svg.setAttribute('height', '16');
      svg.setAttribute('aria-hidden', 'true');
      svg.classList.add('si-inline-icon');
      svg.innerHTML =
        '<path d="' +
        icons[key] +
        '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>';
      b.appendChild(svg);
      b.dataset.siIcon = key;
    }
  };
  wrap('updateSuggestion', function (old, ...args) {
    const result = old.apply(this, args);
    this.decorateActions(this.suggestion);
    return result;
  });
  wrap('makePanel', function (old, ...args) {
    const panel = old.apply(this, args);
    this.win.requestAnimationFrame(() => {
      if (this.flyout === panel) this.decorateActions(panel);
    });
    return panel;
  });
  wrap('build', function (old, ...args) {
    const result = old.apply(this, args);
    this.listen(
      this.root,
      'keydown',
      (e) => {
        if (this.isTextTarget(e.target) || e.target !== this.overlay || e.isComposing) return;
        if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV' && e.shiftKey)
          this.originalPasteUntil = Date.now() + 3000;
        const directions = {
            ArrowLeft: [-1, 0],
            ArrowRight: [1, 0],
            ArrowUp: [0, -1],
            ArrowDown: [0, 1]
          },
          d = directions[e.key];
        if (
          d &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.altKey &&
          this.mode === 'select' &&
          this.selected.size
        ) {
          e.preventDefault();
          e.stopImmediatePropagation();
          const step = e.shiftKey ? 10 : 1;
          this.nudgeSelection(d[0] * step, d[1] * step);
        }
      },
      true
    );
    this.listen(this.root, 'keyup', (e) => {
      if (e.key.startsWith('Arrow') && this.active?.nudge) this.finish(true);
    });

    return result;
  });
})(InkView);
(function measureSaving(Plugin) {
  const old = Plugin.prototype.saveSession;
  Plugin.prototype.saveSession = async function (session, ...args) {
    const start = globalThis.performance?.now?.() ?? Date.now();
    try {
      return await old.call(this, session, ...args);
    } finally {
      if (session) {
        session.saveTimings ??= [];
        session.saveTimings.push((globalThis.performance?.now?.() ?? Date.now()) - start);
        if (session.saveTimings.length > 120) session.saveTimings.shift();
      }
    }
  };
})(SmartInkPlugin);
