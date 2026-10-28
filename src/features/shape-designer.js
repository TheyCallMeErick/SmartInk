/* Compact gallery and a reversible property inspector, using existing geometry/history. */
(function installShapeDesigner(View) {
  const P = View.prototype,
    wrap = (name, fn) => {
      const old = P[name];
      P[name] = function (...args) {
        return fn.call(this, old, ...args);
      };
    };
  const fold = (s) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  P.activatePrimitive = function (kind) {
    this.finish(false);
    this.directShapeKind = kind;
    this.directShapeOptions = ShapeKit.options(this.directShapeOptions);
    this.clearGroup();
    this.selected.clear();
    this.closePanel();
    this.mode = 'primitive';
    this.updateTools();
    this.updateSuggestion();
    this.hint.textContent =
      ShapeKit.names[kind] +
      ': arraste para desenhar · Shift: proporções · Alt: centro · Esc: sair';
    this.overlay.focus({ preventScroll: true });
  };
  P.openShapeLibrary = function () {
    this.finish(false);
    const session = this.s,
      p = this.makePanel(this.insertShapeButton, 'Inserir forma', 'shape-library');
    p.classList.add('si-shape-gallery');
    const search = element(p, 'input', 'si-shape-search');
    search.type = 'search';
    search.placeholder = 'Buscar forma…';
    search.setAttribute('aria-label', 'Buscar forma');
    element(p, 'p', 'si-panel-copy', 'Escolha uma forma e arraste no canvas.');
    const groups = [];
    for (const [name, items] of ShapeKit.families) {
      const section = element(p, 'section', 'si-shape-category');
      element(section, 'h3', '', name);
      const grid = element(section, 'div', 'si-shape-grid');
      const tiles = [];
      for (const [key, label] of items) {
        const b = button(grid, '', () => {
          if (this.s === session) this.activatePrimitive(key);
        });
        b.className = 'si-shape-tile';
        b.dataset.shapeKind = key;
        b.title = label;
        b.setAttribute('aria-label', label);
        b.setAttribute('aria-pressed', String(key === this.directShapeKind));
        element(b, 'span', 'si-shape-icon').innerHTML = ShapeKit.icon(
          ShapeKit.make(key, { x: 0, y: 0 }, { x: 90, y: 65 }, this.directShapeOptions)
        );
        element(b, 'span', '', label);
        tiles.push([b, fold(label + ' ' + name)]);
      }
      groups.push([section, tiles]);
    }
    const empty = element(p, 'p', 'si-panel-copy', 'Nenhuma forma encontrada. Tente outro nome.');
    empty.hidden = true;
    search.addEventListener('input', () => {
      this.shapeGalleryQuery = search.value;
      const q = fold(search.value.trim());
      let count = 0;
      for (const [section, tiles] of groups) {
        let visible = 0;
        for (const [tile, text] of tiles) {
          tile.hidden = !text.includes(q);
          if (!tile.hidden) visible++;
        }
        section.hidden = !visible;
        count += visible;
      }
      empty.hidden = !!count;
      this.scheduleFloatingLayout();
    });
    search.value = this.shapeGalleryQuery || '';
    search.dispatchEvent(new this.win.Event('input'));
    p.scrollTop = this.shapeGalleryScroll || 0;
    p.addEventListener('scroll', () => {
      this.shapeGalleryScroll = p.scrollTop;
    });
    search.focus({ preventScroll: true });
    this.scheduleFloatingLayout();
  };
  P.shapePropertyFields = function (p, kind, opts, changed) {
    if (['rectangle', 'square', 'quadrilateral', 'rounded'].includes(kind))
      this.numberField(
        p,
        'Arredondamento (%)',
        (kind === 'rounded' ? opts.rounding : opts.corner) * 100,
        kind === 'rounded' ? 1 : 0,
        50,
        (v) => {
          opts[kind === 'rounded' ? 'rounding' : 'corner'] = v / 100;
          changed();
        }
      );
    if (kind !== 'rounded') this.shapeOptionFields(p, kind, opts, changed);
  };
  P.dockShapeInspector = function (p) {
    p.classList.add('si-shape-inspector');
    const area = this.floatingArea();
    p.style.left = area.x + Math.max(0, area.w - 300) + 'px';
    p.style.top = area.y + 'px';
    p.style.width = '300px';
    this.fitFloatingPanel(p);
    this.scheduleFloatingLayout();
  };
  P.openPrimitiveInspector = function () {
    if (this.panelKind === 'shape-inspector') {
      this.closePanel(true);
      return;
    }
    const kind = this.directShapeKind || 'rectangle',
      p = this.makePanel(
        this.insertShapeButton,
        'Propriedades · ' + ShapeKit.names[kind],
        'shape-inspector'
      );
    this.dockShapeInspector(p);
    this.directShapeOptions = ShapeKit.options(this.directShapeOptions);
    this.shapeDraftSize ||= { w: 160, h: 100 };
    element(
      p,
      'p',
      'si-panel-copy',
      'Configura as próximas formas. Fechar este painel mantém a ferramenta ativa.'
    );
    this.toggleField(p, 'Usar tamanho fixo', !!this.shapeFixedSize, (v) => {
      this.shapeFixedSize = v;
      reflect();
    });
    const dimensions = element(p, 'div', 'si-property-grid'),
      inputs = [];
    for (const [key, label] of [
      ['w', 'Largura'],
      ['h', 'Altura']
    ])
      inputs.push(
        this.numberField(dimensions, label, this.shapeDraftSize[key], 1, 10000, (v) => {
          this.shapeDraftSize[key] = v;
        })
      );
    const reflect = () => {
      for (const input of inputs) {
        input.disabled = !this.shapeFixedSize;
        input.title = this.shapeFixedSize
          ? 'Unidades do canvas'
          : 'Ative Usar tamanho fixo para definir a dimensão';
      }
    };
    reflect();
    this.shapePropertyFields(p, kind, this.directShapeOptions, () => {});
    element(
      p,
      'p',
      'si-panel-copy',
      'Quadrados, círculos e polígonos regulares preservam suas proporções. O arredondamento é relativo ao menor lado.'
    );
    button(p, 'Trocar forma', () => this.openShapeLibrary());
  };
  P.openShapeParameters = function () {
    const e = this.selectedElements()[0];
    if (!e?.shapeFrame || !ShapeKit.names[e.shapeKind]) return;
    if (e.erasures?.length) {
      new Notice(
        'Esta forma tem recortes de borracha. Use os controles de transformação para preservar os recortes.'
      );
      return;
    }
    const session = this.s,
      revision = session.revision,
      p = this.makePanel(
        this.insertShapeButton,
        'Propriedades · ' + ShapeKit.label(e),
        'shape-parameters'
      );
    this.dockShapeInspector(p);
    this.propertyTarget = e.id;
    this.propertyRevision = revision;
    this.propertyDirty = false;
    const f = e.shapeFrame,
      opts = ShapeKit.options(e.shapeOptions),
      state = {
        w: Ink.dist(f[0], f[1]),
        h: Ink.dist(f[0], f[2]),
        angle: (Math.atan2(f[1].y - f[0].y, f[1].x - f[0].x) * 180) / Math.PI
      };
    let next = e;
    const preview = () => {
      if (this.s !== session || session.revision !== revision) return;
      this.propertyDirty = true;
      const a = (state.angle * Math.PI) / 180,
        frame = [
          f[0],
          { x: f[0].x + Math.cos(a) * state.w, y: f[0].y + Math.sin(a) * state.w },
          { x: f[0].x - Math.sin(a) * state.h, y: f[0].y + Math.cos(a) * state.h }
        ];
      next = ShapeKit.rebuild({ ...e, shapeFrame: frame }, opts);
      this.stylePreview = {
        session,
        revision,
        elements: session.doc.elements.map((x) => (x.id === e.id ? next : x))
      };
      this.requestRender();
    };
    element(p, 'div', 'si-menu-section', 'Dimensões e rotação');
    const dimensions = element(p, 'div', 'si-property-grid');
    const ratio = state.w / state.h,
      dimensionInputs = {};
    let locked = false;
    this.toggleField(p, 'Manter proporção', locked, (v) => (locked = v));
    for (const [key, label, min, max] of [
      ['w', 'Largura', 1, 10000],
      ['h', 'Altura', 1, 10000],
      ['angle', 'Rotação (°)', -360, 360]
    ])
      dimensionInputs[key] = this.numberField(
        dimensions,
        label,
        state[key],
        min,
        max,
        (v) => {
          if (locked && key !== 'angle')
            v = Ink.clamp(
              v,
              key === 'w' ? Math.max(1, ratio) : Math.max(1, 1 / ratio),
              key === 'w' ? Math.min(10000, 10000 * ratio) : Math.min(10000, 10000 / ratio)
            );
          state[key] = v;
          dimensionInputs[key].value = String(v);
          if (locked && key !== 'angle') {
            const other = key === 'w' ? 'h' : 'w';
            state[other] = key === 'w' ? v / ratio : v * ratio;
            dimensionInputs[other].value = String(Math.round(state[other] * 100) / 100);
          }
          preview();
        },
        1
      );
    element(p, 'div', 'si-menu-section', 'Geometria');
    this.shapePropertyFields(p, e.shapeKind, opts, preview);
    element(
      p,
      'p',
      'si-panel-copy',
      'Medidas em unidades do canvas, independentes do zoom. Formas regulares preservam suas proporções. A prévia só é salva ao aplicar.'
    );
    const actions = element(p, 'div', 'si-confirm-actions');
    button(actions, 'Cancelar', () => this.closePanel(true));
    button(actions, 'Aplicar alterações', () => {
      if (this.s !== session || session.revision !== revision) {
        new Notice('A página mudou. Reabra as propriedades.');
        this.closePanel();
        return;
      }
      preview();
      this.closePanel();
      this.safeCommit(
        Ink.resolveConnections(session.doc.elements.map((x) => (x.id === e.id ? next : x)))
      );
      this.overlay.focus({ preventScroll: true });
    });
    p.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        event.stopPropagation();
        actions.children[1].click();
      }
    });
  };
  wrap('updateSuggestion', function (old, ...args) {
    const result = old.apply(this, args);
    if (this.mode === 'primitive' && !this.pending && this.suggestion) {
      this.suggestion.hidden = false;
      this.suggestion.replaceChildren();
      element(
        this.suggestion,
        'span',
        'si-selection-count',
        ShapeKit.names[this.directShapeKind || 'rectangle']
      );
      button(this.suggestion, 'Trocar forma', () => this.openShapeLibrary());
      button(this.suggestion, 'Propriedades', () => this.openPrimitiveInspector());
      if (this.selectedElements().length === 1)
        button(this.suggestion, 'Editar forma criada', () => this.openShapeParameters());
    }
    return result;
  });
  wrap('down', function (old, e) {
    if (
      this.panelKind === 'shape-parameters' &&
      this.propertyDirty &&
      e.button === 0 &&
      !this.spaceDown
    ) {
      this.showPropertyPending();
      return;
    }
    this.drawingIntoShapeInspector =
      (this.mode === 'primitive' && this.panelKind === 'shape-inspector') ||
      this.panelKind === 'shape-parameters';
    try {
      return old.call(this, e);
    } finally {
      this.drawingIntoShapeInspector = false;
    }
  });
  wrap('closePanel', function (old, ...args) {
    if (this.drawingIntoShapeInspector) return;
    return old.apply(this, args);
  });
})(InkView);
