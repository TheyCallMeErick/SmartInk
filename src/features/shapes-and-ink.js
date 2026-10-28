/* Visual shape picker, nearby recognition choices and explicit ink editing. */
(function installShapesAndInk(View) {
  const P = View.prototype,
    wrap = (name, fn) => {
      const old = P[name];
      P[name] = function (...args) {
        return fn.call(this, old, ...args);
      };
    };
  const walk = (n) => [n, ...Array.from(n.children || []).flatMap(walk)];
  P.dismissShapePopover = function () {
    this.shapePopover?.remove();
    this.shapePopover = null;
    this.shapePopoverPending = null;
  };
  P.positionShapePopover = function () {
    const p = this.shapePopover;
    if (!p || !this.pending?.shape) return;
    const b = Ink.elementBounds(this.pending.shape),
      q = Ink.worldToScreen({ x: b.x + b.w / 2, y: b.y + b.h }, this.camera, this.zoom),
      size = { w: this.root.clientWidth, h: this.root.clientHeight },
      offset = this.overlay.getBoundingClientRect(),
      rootRect = this.root.getBoundingClientRect(),
      width = Math.min(340, Math.max(160, size.w - 16)),
      height = Math.min(p.offsetHeight || 230, Math.max(100, size.h - 16));
    p.style.width = width + 'px';
    p.style.maxHeight = Math.max(100, size.h - 16) + 'px';
    p.style.left =
      Ink.clamp(q.x + offset.left - rootRect.left - width / 2, 8, Math.max(8, size.w - width - 8)) +
      'px';
    p.style.top =
      Ink.clamp(q.y + offset.top - rootRect.top + 16, 8, Math.max(8, size.h - height - 8)) + 'px';
  };
  P.renderShapePopover = function () {
    const pending = this.pending;
    if (!pending?.shape || !pending.candidates?.length) {
      this.dismissShapePopover();
      return;
    }
    if (this.shapePopoverPending === pending) {
      this.positionShapePopover();
      return;
    }
    this.dismissShapePopover();
    const panel = element(this.root, 'div', 'si-shape-popover');
    this.shapePopover = panel;
    this.shapePopoverPending = pending;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Você queria um…?');
    const heading = element(panel, 'div', 'si-shape-popover-heading');
    element(heading, 'strong', '', 'Você queria um…?');
    button(heading, '×', () => this.keepOriginalShape()).setAttribute(
      'aria-label',
      'Manter desenho original'
    );
    const grid = element(panel, 'div', 'si-shape-grid');
    pending.candidates.forEach((candidate, index) => {
      const shape = this.correctedShape(
          candidate.shape,
          this.s.doc.elements.find((e) => e.id === pending.sourceId) || pending.shape
        ),
        b = button(grid, '', () => {
          if (this.pending !== pending) return;
          this.chooseCandidate(index);
          for (const item of grid.children) {
            item.classList.toggle('is-selected', Number(item.dataset.index) === index);
            item.setAttribute('aria-pressed', String(Number(item.dataset.index) === index));
          }
        });
      b.dataset.index = String(index);
      b.className = 'si-shape-tile';
      b.setAttribute('aria-label', ShapeKit.label(shape));
      b.setAttribute('aria-pressed', String(index === pending.index));
      b.classList.toggle('is-selected', index === pending.index);
      element(b, 'span', 'si-shape-icon').innerHTML = ShapeKit.icon(shape);
      element(b, 'span', '', ShapeKit.label(shape));
    });
    const actions = element(panel, 'div', 'si-shape-actions');
    button(actions, 'Aplicar forma', () => {
      if (this.pending === pending) {
        this.accept();
        this.overlay.focus();
      }
    });
    button(actions, 'Manter desenho', () => this.keepOriginalShape());
    element(
      panel,
      'small',
      'si-muted',
      'Escolha uma miniatura para comparar. Enter aplica; Esc mantém.'
    );
    this.positionShapePopover();
  };
  P.keepOriginalShape = function () {
    this.clearGroup();
    this.updateSuggestion();
    this.drawOverlay();
    this.overlay.focus();
  };
  wrap('updateSuggestion', function (old, ...args) {
    if (this.pending?.shape && this.suggestion) {
      this.suggestion.replaceChildren();
      this.suggestion.hidden = true;
      this.renderShapePopover();
      return;
    }
    this.dismissShapePopover();
    const result = old.apply(this, args);
    if (this.mode === 'select' && this.suggestion) {
      const selected = this.selectedElements();
      if (selected.some((e) => e.type === 'stroke')) {
        button(this.suggestion, 'Editar tinta', () => this.openInkEditing());
        button(this.suggestion, 'Interpretar diagrama', () => this.openDiagramRecognition());
      }
      if (selected.length === 1 && selected[0].shapeFrame)
        button(this.suggestion, 'Parâmetros da forma', () => this.openShapeParameters());
    }
    return result;
  });
  wrap('clearGroup', function (old, ...args) {
    this.dismissShapePopover();
    return old.apply(this, args);
  });
  wrap('render', function (old, ...args) {
    const out = old.apply(this, args);
    this.positionShapePopover();
    return out;
  });
  P.shapeOptionFields = function (panel, kind, opts, change) {
    const field = (label, key, min, max, step = 1) =>
      this.numberField(
        panel,
        label,
        opts[key],
        min,
        max,
        (v) => {
          opts[key] = v;
          change?.();
        },
        step
      );
    if (kind === 'regular') field('Número de lados', 'sides', 3, 32);
    if (kind === 'star') {
      field('Número de pontas', 'tips', 3, 16);
      field('Raio interno / externo', 'inner', 0.1, 0.9, 0.05);
    }
    if (kind === 'rounded') field('Arredondamento relativo', 'rounding', 0.01, 0.5, 0.01);
    if (['parallelogram', 'trapezoid', 'right-trapezoid'].includes(kind))
      field('Deslocamento relativo', 'skew', 0.05, 0.45, 0.05);
    if (['arc', 'sector', 'segment'].includes(kind)) {
      field('Ângulo inicial (°)', 'start', -360, 360);
      field('Abertura (°)', 'sweep', 5, 355);
    }
    if (kind === 'spiral') field('Número de voltas', 'turns', 0.25, 5, 0.25);
  };
  P.openShapeLibrary = function () {
    this.finish(false);
    const panel = this.makePanel(this.insertShapeButton, 'Desenhar formas', 'shape-library'),
      session = this.s;
    let kind = this.directShapeKind || 'rectangle',
      opts = ShapeKit.options(this.directShapeOptions);
    const preview = element(panel, 'div', 'si-shape-current'),
      settings = element(panel, 'div');
    const update = () => {
      preview.replaceChildren();
      element(preview, 'span', 'si-shape-icon').innerHTML = ShapeKit.icon(
        ShapeKit.make(kind, { x: 0, y: 0 }, { x: 90, y: 65 }, opts)
      );
      element(preview, 'strong', '', ShapeKit.names[kind]);
      settings.replaceChildren();
      this.shapeOptionFields(settings, kind, opts, () => {
        updatePreview();
      });
    };
    const updatePreview = () => {
      preview.children[0].innerHTML = ShapeKit.icon(
        ShapeKit.make(kind, { x: 0, y: 0 }, { x: 90, y: 65 }, opts)
      );
    };
    const search = element(panel, 'input');
    search.type = 'search';
    search.placeholder = 'Buscar forma…';
    search.setAttribute('aria-label', 'Buscar forma');
    const groups = [];
    for (const [name, items] of ShapeKit.families) {
      const section = element(panel, 'details', 'si-shape-family');
      section.open = ['Quadriláteros', 'Círculos, elipses e partes'].includes(name);
      element(section, 'summary', '', name);
      const grid = element(section, 'div', 'si-shape-grid');
      for (const [key, label] of items) {
        const b = button(grid, '', () => {
          kind = key;
          update();
          for (const item of walk(panel).filter((n) => n.dataset?.shapeKind))
            item.setAttribute('aria-pressed', String(item.dataset.shapeKind === key));
        });
        b.className = 'si-shape-tile';
        b.dataset.shapeKind = key;
        b.setAttribute('aria-label', label);
        b.setAttribute('aria-pressed', String(key === kind));
        element(b, 'span', 'si-shape-icon').innerHTML = ShapeKit.icon(
          ShapeKit.make(key, { x: 0, y: 0 }, { x: 90, y: 65 }, opts)
        );
        element(b, 'span', '', label);
      }
      groups.push(section);
    }
    search.addEventListener('input', () => {
      const q = search.value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
      for (const section of groups) {
        let found = false;
        for (const tile of walk(section).filter((n) => n.dataset?.shapeKind)) {
          tile.hidden = !ShapeKit.names[tile.dataset.shapeKind]
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .includes(q);
          if (!tile.hidden) found = true;
        }
        section.hidden = !found;
        if (q && found) section.open = true;
      }
    });
    button(panel, 'Desenhar por arraste', () => {
      if (this.s !== session) return;
      this.directShapeKind = kind;
      this.directShapeOptions = ShapeKit.options(opts);
      this.clearGroup();
      this.selected.clear();
      this.closePanel();
      this.mode = 'primitive';
      this.updateTools();
      this.hint.textContent =
        ShapeKit.names[kind] +
        ': arraste no canvas. Shift restringe proporções; Alt desenha a partir do centro. Esc cancela.';
      this.overlay.focus();
    });
    element(
      panel,
      'small',
      'si-panel-copy',
      'Triângulos podem pertencer a mais de uma classe. Polígonos livres são editáveis pelos vértices. Arcos, espirais e cantos arredondados são aproximações poligonais.'
    );
    update();
  };
  P.openShapeParameters = function () {
    const e = this.selectedElements()[0];
    if (!e?.shapeFrame || !ShapeKit.names[e.shapeKind]) return;
    const panel = this.makePanel(
        this.insertShapeButton,
        'Parâmetros: ' + ShapeKit.label(e),
        'shape-parameters'
      ),
      session = this.s,
      revision = session.revision,
      opts = ShapeKit.options(e.shapeOptions);
    const preview = () => {
      if (this.s !== session) return;
      const next = ShapeKit.rebuild(e, opts);
      this.stylePreview = {
        revision,
        elements: session.doc.elements.map((x) => (x.id === e.id ? next : x))
      };
      this.requestRender();
    };
    this.shapeOptionFields(panel, e.shapeKind, opts, preview);
    element(
      panel,
      'p',
      'si-panel-copy',
      'Use o cursor para mover, girar e redimensionar. Editar vértices converte a forma em geometria livre.'
    );
    button(panel, 'Aplicar', () => {
      if (this.s !== session || session.revision !== revision) {
        new Notice('A página mudou; reabra os parâmetros.');
        return;
      }
      const next = ShapeKit.rebuild(e, opts);
      this.closePanel();
      this.safeCommit(session.doc.elements.map((x) => (x.id === e.id ? next : x)));
    });
    button(panel, 'Editar pontos livremente', () => {
      this.closePanel();
      this.startPointEditing();
    });
    button(panel, 'Cancelar', () => this.closePanel());
  };
  P.openInkEditing = function () {
    const chosen = this.selectedElements().filter((e) => e.type === 'stroke'),
      p = this.makePanel(this.organizeButton, 'Editar tinta', 'ink-edit');
    if (!chosen.length) return;
    button(p, 'Modelar trecho da curva', () => {
      if (chosen.length !== 1) {
        new Notice('Selecione um traço para modelar.');
        return;
      }
      if (chosen[0].erasures?.length || chosen[0].points.length > 20000) {
        new Notice('Use um traço sem recortes e com até 20 mil pontos.');
        return;
      }
      this.closePanel();
      this.curveTarget = chosen[0].id;
      this.mode = 'sculpt';
      this.updateTools();
      this.hint.textContent =
        'Arraste um trecho do traço para ajustar a curva. Esc sai; Desfazer restaura.';
    });
    this.numberField(
      p,
      'Raio da edição local',
      this.sculptRadius || 60,
      5,
      500,
      (v) => (this.sculptRadius = v)
    );
    let gap = 40,
      smooth = true;
    this.numberField(p, 'Distância máxima para unir extremidades', gap, 1, 500, (v) => (gap = v));
    this.toggleField(p, 'Transição suave na união', true, (v) => (smooth = v));
    button(p, 'Unir dois traços', () =>
      this.previewInkOperation('União de traços', () => {
        const merged = ShapeKit.join(chosen, smooth, gap),
          remove = new Set(chosen.map((e) => e.id));
        return [...this.s.doc.elements.filter((e) => !remove.has(e.id)), merged];
      })
    );
    button(p, 'Ajustar escrita com prévia…', () => this.openTidyWriting());
    element(
      p,
      'p',
      'si-panel-copy',
      'A união usa as extremidades mais próximas e o estilo do primeiro traço. Recortes de borracha não são unidos.'
    );
  };
  P.previewInkOperation = function (title, build) {
    try {
      const session = this.s,
        revision = session.revision,
        after = build();
      Ink.parse(Ink.serialize({ ...session.doc, elements: after }));
      const p = this.makePanel(this.organizeButton, title, 'ink-preview');
      this.stylePreview = { revision, elements: after };
      this.requestRender();
      element(
        p,
        'p',
        'si-panel-copy',
        'A prévia não altera o original. Confirme para registrar uma operação no histórico.'
      );
      button(p, 'Aplicar', () => {
        if (this.s !== session || session.revision !== revision) {
          new Notice('A página mudou. Refaça a prévia.');
          this.closePanel();
          return;
        }
        this.closePanel();
        this.nextHistoryLabel = title;
        this.safeCommit(after);
      });
      button(p, 'Cancelar', () => this.closePanel());
    } catch (e) {
      new Notice(e.message);
    }
  };
  P.openTidyWriting = function () {
    const selected = this.selectedElements(),
      session = this.s,
      revision = session.revision,
      p = this.makePanel(this.organizeButton, 'Ajustar escrita · sem OCR', 'tidy-ink'),
      opts = { baseline: true, height: false, slant: 0, strength: 0.35 };
    let result;
    const preview = () => {
      if (this.s !== session) return;
      const changes = ShapeKit.tidy(selected, opts);
      result = session.doc.elements.map((e) => changes.get(e.id) || e);
      this.stylePreview = { revision, elements: result };
      this.requestRender();
    };
    element(
      p,
      'p',
      'si-panel-copy',
      'Selecione uma linha ou poucas palavras. Este ajuste geométrico não reconhece letras; confira acentos e descendentes antes de aplicar.'
    );
    this.toggleField(p, 'Aproximar bases dos traços', true, (v) => {
      opts.baseline = v;
      preview();
    });
    this.toggleField(p, 'Uniformizar alturas suavemente', false, (v) => {
      opts.height = v;
      preview();
    });
    this.numberField(p, 'Correção de inclinação (°)', 0, -20, 20, (v) => {
      opts.slant = v;
      preview();
    });
    this.numberField(
      p,
      'Intensidade',
      0.35,
      0,
      1,
      (v) => {
        opts.strength = v;
        preview();
      },
      0.05
    );
    button(p, 'Aplicar ajuste', () => {
      if (this.s !== session || session.revision !== revision) {
        new Notice('A página mudou. Reabra o ajuste.');
        return;
      }
      this.closePanel();
      this.safeCommit(result);
    });
    button(p, 'Cancelar', () => this.closePanel());
    preview();
  };
  // Explicit selection operation: recognition and attachment run outside pen handlers.
  P.diagramElements = function (selected) {
    if (selected.length > 150) throw new Error('Selecione até 150 traços por operação.');
    const replacements = new Map(),
      closed = [],
      lines = [];
    for (const e of selected) {
      if (e.type !== 'stroke' || e.erasures?.length) continue;
      const c = Ink.recognizeGroups([e]).filter(
        (c) => c.score <= this.plugin.settings.quickShapeMaxError
      )[0];
      if (!c) continue;
      const shape = { ...this.correctedShape(c.shape, e), id: e.id };
      replacements.set(e.id, shape);
      (['line', 'arrow'].includes(shape.type) ? lines : closed).push(shape);
    }
    if (!closed.length)
      throw new Error('Selecione caixas ou outras formas fechadas junto às ligações.');
    for (const e of lines) {
      const bindings = {};
      for (const [side, x, y] of [
        ['start', 'x1', 'y1'],
        ['end', 'x2', 'y2']
      ]) {
        const p = { x: e[x], y: e[y] },
          anchor = Ink.snapAnchor(p, closed, 24 / this.zoom);
        if (anchor) bindings[side] = { targetId: anchor.targetId, index: anchor.index };
      }
      replacements.set(e.id, {
        ...e,
        connector: true,
        route: 'straight',
        startArrow: false,
        endArrow: e.type === 'arrow',
        bindings
      });
    }
    return Ink.resolveConnections(this.s.doc.elements.map((e) => replacements.get(e.id) || e));
  };
  P.openDiagramRecognition = function () {
    const selected = this.selectedElements();
    this.previewInkOperation('Interpretar diagrama', () => this.diagramElements(selected));
  };
  wrap('down', function (old, e) {
    if (this.active) return old.call(this, e);
    const custom = e.button === 0 && !this.spaceDown && !this.temporaryMode;
    if (!custom) return old.call(this, e);
    if (
      Brushes.SPECS[this.mode] &&
      this.heldKeys.has(this.plugin.settings.brushAdjustKey || 'KeyD')
    ) {
      e.preventDefault();
      this.closePanel();
      this.overlay.setPointerCapture(e.pointerId);
      const kind = this.mode;
      this.active = {
        mode: 'brush-adjust',
        pointer: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        kind,
        beforeBrush: { ...this.plugin.settings.brushes[kind] }
      };
      return;
    }
    if (this.mode !== 'primitive' && this.mode !== 'sculpt') return old.call(this, e);
    if (
      !this.editable() ||
      this.activeLayer()?.locked ||
      !this.activeLayer()?.visible ||
      (this.plugin.settings.penOnly && e.pointerType !== 'pen') ||
      e.pointerType === 'touch'
    )
      return;
    e.preventDefault();
    this.closePanel();
    this.overlay.focus();
    this.overlay.setPointerCapture(e.pointerId);
    const p = this.point(e);
    if (this.mode === 'primitive') {
      if (this.s.doc.elements.length >= 20000) {
        new Notice('Limite de 20 mil objetos.');
        return;
      }
      const limit = this.drafting().limit;
      if (limit && !Ink.contains(limit, p)) return;
      const start = Ink.boundedPoint(this.snapPoint(p, e, null, new Set(), true).point, limit, 2);
      this.active = {
        mode: 'primitive',
        pointer: e.pointerId,
        start,
        revision: this.s.revision,
        session: this.s,
        id: Ink.uid()
      };
      this.move(e);
      return;
    }
    const target = this.s.doc.elements.find(
      (e) => e.id === this.curveTarget && Ink.isEditable(this.s.doc, e)
    );
    if (!target) return;
    let index = 0,
      d = Infinity;
    target.points.forEach((q, i) => {
      const n = Ink.dist(p, q);
      if (n < d) {
        d = n;
        index = i;
      }
    });
    if (d > 15 / this.zoom) return;
    this.active = {
      mode: 'sculpt',
      pointer: e.pointerId,
      session: this.s,
      revision: this.s.revision,
      target,
      index,
      start: p,
      before: this.s.doc.elements,
      changed: false
    };
  });
  wrap('move', function (old, e) {
    const a = this.active;
    if (!a || a.pointer !== e.pointerId) return old.call(this, e);
    if (a.mode === 'brush-adjust') {
      e.preventDefault();
      Brushes.updateBrush(this.plugin.settings, a.kind, {
        width: a.beforeBrush.width * Math.pow(2, (e.clientX - a.x) / 100),
        opacity: Ink.clamp(a.beforeBrush.opacity - (e.clientY - a.y) / 250, 0.05, 1)
      });
      this.hoverPoint = this.point(e);
      this.hint.textContent =
        'Espessura ' +
        this.plugin.settings.brushes[a.kind].width.toFixed(1) +
        ' · Opacidade ' +
        Math.round(this.plugin.settings.brushes[a.kind].opacity * 100) +
        '%';
      this.drawOverlay();
      return;
    }
    if (a.mode === 'primitive') {
      e.preventDefault();
      let start = a.start,
        end = this.snapPoint(this.point(e), e, null, new Set(), true).point;
      if (this.shapeFixedSize) {
        const d = this.shapeDraftSize || { w: 160, h: 100 };
        end = {
          x: start.x + (end.x < start.x ? -1 : 1) * d.w,
          y: start.y + (end.y < start.y ? -1 : 1) * d.h
        };
      }
      if (e.shiftKey) {
        const n = Math.min(Math.abs(end.x - start.x), Math.abs(end.y - start.y));
        end = {
          ...end,
          x: start.x + Math.sign(end.x - start.x) * n,
          y: start.y + Math.sign(end.y - start.y) * n
        };
      }
      if (e.altKey) start = { x: 2 * start.x - end.x, y: 2 * start.y - end.y };
      start = Ink.boundedPoint(start, this.drafting().limit, 2);
      end = Ink.boundedPoint(end, this.drafting().limit, 2);
      a.previewShape = ShapeKit.make(
        this.directShapeKind || 'rectangle',
        start,
        end,
        this.directShapeOptions,
        {
          ...Brushes.strokeStyle(this.plugin.settings, this.plugin.settings.lastBrush),
          id: a.id,
          layerId: this.s.doc.activeLayer
        }
      );
      a.distance = Ink.dist(start, end);
      this.drawOverlay();
      return;
    }
    if (a.mode === 'sculpt') {
      e.preventDefault();
      const p = this.point(e),
        q = a.target.points[a.index],
        target = { x: q.x + p.x - a.start.x, y: q.y + p.y - a.start.y };
      a.changed = Ink.dist(p, a.start) > 0.1;
      const next = ShapeKit.deform(a.target, a.index, target, this.sculptRadius || 60);
      a.preview = a.before.map((e) => (e === a.target ? next : e));
      this.requestRender();
      return;
    }
    return old.call(this, e);
  });
  wrap('finish', function (old, commit, ...args) {
    const a = this.active;
    if (!a || !['primitive', 'sculpt', 'brush-adjust'].includes(a.mode))
      return old.call(this, commit, ...args);
    this.active = null;
    if (this.overlay.hasPointerCapture(a.pointer)) this.overlay.releasePointerCapture(a.pointer);
    this.snapMarker = null;
    this.snapLock = null;
    if (a.mode === 'brush-adjust') {
      if (!commit) Brushes.updateBrush(this.plugin.settings, a.kind, a.beforeBrush);
      else void this.plugin.savePreferences();
      this.updateTools();
      this.drawOverlay();
      return;
    }
    if (commit && this.s === a.session && this.s.revision === a.revision) {
      if (a.mode === 'primitive' && a.distance > 3 / this.zoom) {
        this.commitElements([...this.s.doc.elements, a.previewShape]);
        this.selected = new Set([a.previewShape.id]);
      } else if (a.mode === 'sculpt' && a.changed) this.commitElements(a.preview);
    }
    this.updateSuggestion();
    this.requestRender();
  });
  wrap('cancelGesture', function (old, ...args) {
    if (['primitive', 'sculpt', 'brush-adjust'].includes(this.active?.mode))
      return this.finish(false);
    if (this.mode === 'sculpt' || this.mode === 'primitive') {
      this.mode = 'select';
      this.curveTarget = null;
      this.updateTools();
    }
    return old.apply(this, args);
  });
  wrap('drawOverlay', function (old, ...args) {
    old.apply(this, args);
    if (this.active?.previewShape)
      this.paint(this.overlay.getContext('2d'), this.active.previewShape, true);
    if (this.mode === 'sculpt') {
      const e = (this.active?.preview || this.s?.doc.elements || []).find(
        (e) => e.id === this.curveTarget
      );
      if (e) {
        const ctx = this.overlay.getContext('2d');
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#0078d4';
        ctx.lineWidth = 1.5 / this.zoom;
        const step = Math.max(1, Math.floor(e.points.length / 12));
        for (let i = 0; i < e.points.length; i += step) {
          const p = e.points[i];
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4 / this.zoom, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  });
  wrap('openWorkflow', function (old, ...args) {
    old.apply(this, args);
    const b = button(
      this.flyout,
      'Segurar e arrastar: ajustar pincel · ' + (this.plugin.settings.brushAdjustKey || 'KeyD')
    );
    b.addEventListener('keydown', (e) => {
      if (!/^Key[A-Z]$/.test(e.code)) return;
      e.preventDefault();
      const s = this.plugin.settings;
      if (
        [
          ...Object.values(s.shortcuts),
          ...Object.values(s.quickKeys),
          s.radialKey,
          s.temporaryKey,
          s.straightKey
        ].includes(e.code)
      ) {
        new Notice('Tecla já usada.');
        return;
      }
      s.brushAdjustKey = e.code;
      void this.plugin.savePreferences();
      b.textContent = 'Segurar e arrastar: ajustar pincel · ' + e.code;
    });
  });
  wrap('build', function (old, ...args) {
    const result = old.apply(this, args);
    this.insertShapeButton = button(this.toolbar, '', () => this.openShapeLibrary());
    this.insertShapeButton.className = 'si-tool-button';
    this.toolGraphic(this.insertShapeButton, 'shapes');
    element(this.insertShapeButton, 'span', 'si-tool-label', 'Inserir forma');
    this.insertShapeButton.setAttribute('aria-label', 'Inserir forma geométrica');
    this.insertShapeButton.title = 'Escolher uma forma e desenhar por arraste';
    this.toolbar.insertBefore?.(this.insertShapeButton, this.shapeButton);
    this.listen(this.root, 'keydown', (e) => {
      if (e.key === 'Escape' && this.shapePopover) this.keepOriginalShape();
    });
    return result;
  });
  for (const name of ['onUnloadFile', 'onClose'])
    wrap(name, function (old, ...args) {
      this.dismissShapePopover();
      this.curveTarget = null;
      return old.apply(this, args);
    });
})(InkView);
