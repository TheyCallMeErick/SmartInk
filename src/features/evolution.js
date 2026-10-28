/* 0.14: tools and auxiliary UI. No serialization or background render is started by pointer input. */
(function installEvolution(View, Ink, Brushes, { element, button, Notice }) {
  const P = View.prototype,
    wrap = (name, fn) => {
      const previous = P[name];
      P[name] = function (...args) {
        return fn.call(this, previous, ...args);
      };
    };

  const presets = [
    ['Escrita fina', 'write', { width: 1, streamline: 0.08, smoothing: 0.35, adaptiveInk: true }],
    ['Escrita normal', 'write', { width: 2, streamline: 0.15, smoothing: 0.55 }],
    [
      'Caligrafia',
      'write',
      { width: 5, pressure: true, pressureGamma: 1.3, streamline: 0.35, smoothing: 0.65 }
    ],
    ['Títulos', 'write', { width: 8, streamline: 0.25, smoothing: 0.6 }],
    ['Marca-texto', 'marker', { width: 18 }],
    ['Diagramas', 'write', { width: 2, streamline: 0.1, cornerProtection: 0.85 }],
    ['Linhas técnicas', 'pencil', { width: 1, pressure: false, streamline: 0, smoothing: 0.35 }]
  ].map(([name, kind, brush], i) => ({
    id: 'builtin-' + i,
    name,
    kind,
    brush: Brushes.settings({ brushes: { [kind]: brush } }).brushes[kind]
  }));
  const descendants = (root) => {
    const out = [];
    const walk = (n) => {
      out.push(n);
      for (const c of n.children || []) walk(c);
    };
    walk(root);
    return out;
  };
  P.setBackupsEnabled = function (enabled) {
    this.plugin.settings.backupsEnabled = !!enabled;
    if (!enabled) {
      if (this.active) this.cancelStrokeBackup(this.active);
      if (this.s) this.s.backupError = null;
    }
    void this.plugin.savePreferences();
  };
  P.backupControl = function (panel) {
    this.toggleField(
      panel,
      'Criar backups automáticos',
      this.plugin.settings.backupsEnabled !== false,
      (v) => {
        this.setBackupsEnabled(v);
      }
    );
    element(
      panel,
      'p',
      'si-panel-copy',
      'Desligar impede novas cópias automáticas, inclusive de traços longos. Mantém as cópias existentes, o salvamento da página após 5 s e a recuperação em caso de conflito. Uma gravação já iniciada pode terminar.'
    );
  };
  wrap('openPagePanel', function (old, ...args) {
    old.apply(this, args);
    if (this.panelKind !== 'page') return;
    const p = this.flyout;
    button(p, 'Caderno e páginas (experimental)', () => this.openNotebook()).className =
      'si-menu-action';
    button(p, 'Mostrar / ocultar navegador', () => this.toggleNavigator()).className =
      'si-menu-action';
  });
  wrap('openRecovery', function (old) {
    old.call(this);
    this.backupControl(this.flyout);
  });
  wrap('openPrecision', function (old) {
    old.call(this);
    const p = this.flyout,
      s = this.plugin.settings;
    for (const [key, label] of [
      ['snapIntersections', 'Encaixar em interseções'],
      ['snapCenters', 'Encaixar no centro dos objetos'],
      ['snapGrid', 'Encaixar na grade'],
      ['snapVelocity', 'Reduzir magnetismo em movimento rápido']
    ])
      this.toggleField(p, label, !!s[key], (v) => {
        s[key] = v;
        void this.plugin.savePreferences();
      });
    this.numberField(
      p,
      'Erro máximo de QuickShape (menor = mais rigoroso)',
      s.quickShapeMaxError,
      0.02,
      0.12,
      (v) => {
        s.quickShapeMaxError = v;
        void this.plugin.savePreferences();
      },
      0.005
    );
    this.choiceField(
      p,
      'Tecla de proporções',
      s.proportionKey,
      [
        ['Shift', 'Shift'],
        ['Control', 'Ctrl'],
        ['Alt', 'Alt'],
        ['Meta', 'Meta']
      ],
      (v) => {
        s.proportionKey = v;
        void this.plugin.savePreferences();
      }
    );
  });
  P.drawIsometric = function (ctx, view, step) {
    const w = Math.sqrt(3) * step,
      h = 2 * step,
      x0 = Math.floor(view.x / w) * w,
      y0 = Math.floor(view.y / h) * h;
    ctx.beginPath();
    for (let y = y0; y <= view.y + view.h; y += h)
      for (let x = x0; x <= view.x + view.w; x += w) {
        for (const [a, b] of [
          [
            { x, y },
            { x: x + w, y }
          ],
          [
            { x, y: y + step },
            { x: x + w, y: y + step }
          ],
          [
            { x, y },
            { x: x + w, y: y + step }
          ],
          [
            { x, y: y + step },
            { x: x + w, y: y + h }
          ],
          [
            { x, y: y + step },
            { x: x + w, y }
          ],
          [
            { x, y: y + h },
            { x: x + w, y: y + step }
          ]
        ]) {
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
        }
      }
    ctx.stroke();
  };
  P.intersection = function (a, b, c, d) {
    const ux = b.x - a.x,
      uy = b.y - a.y,
      vx = d.x - c.x,
      vy = d.y - c.y,
      den = ux * vy - uy * vx;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((c.x - a.x) * vy - (c.y - a.y) * vx) / den,
      u = ((c.x - a.x) * uy - (c.y - a.y) * ux) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { x: a.x + t * ux, y: a.y + t * uy } : null;
  };
  wrap(
    'snapPoint',
    function (old, p, event = {}, selfStart = null, exclude = new Set(), force = false) {
      const s = this.plugin.settings,
        writing =
          !!Brushes.SPECS[this.mode] &&
          !this.shapeAssist &&
          !this.activeLayer()?.drawingAssist &&
          !force;
      const base = old.call(this, p, event, selfStart, exclude, force);
      if (
        event.altKey ||
        !s.snapPoints ||
        (writing && !s.snapWriting) ||
        base.anchor ||
        this.snapMarker
      )
        return base;
      if (!s.snapIntersections && !s.snapCenters && !s.snapGrid) return base;
      let radius = s.snapRadius / this.zoom;
      if (s.snapVelocity && this.lastMagnetPoint) {
        const dt = Math.max(1, (p.t || 0) - (this.lastMagnetPoint.t || 0)),
          speed = (Ink.dist(p, this.lastMagnetPoint) * this.zoom) / dt;
        radius *= Ink.clamp(1 - speed * 0.12, 0.35, 1);
      }
      this.lastMagnetPoint = p;
      let best = null,
        distance = radius;
      const offer = (q, label) => {
        const d = Ink.dist(q, p);
        if (d < distance) {
          best = { ...q, label };
          distance = d;
        }
      };
      if (s.snapGrid && this.s.doc.background === 'grid') {
        const step = this.s.doc.paperSpacing || 28;
        if (this.s.doc.gridStyle === 'isometric') {
          const dy = step / 2,
            j = Math.round(p.y / dy),
            dx = (step * Math.sqrt(3)) / 2;
          offer(
            { x: Math.round((p.x - (j % 2) * dx) / (2 * dx)) * 2 * dx + (j % 2) * dx, y: j * dy },
            'Grade isométrica'
          );
        } else
          offer({ x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step }, 'Grade');
      }
      if (s.snapObjects && (s.snapCenters || s.snapIntersections)) {
        const objects = (
          this.auxIndex?.source === this.s.doc.elements
            ? this.auxIndex.query({
                x: p.x - radius,
                y: p.y - radius,
                w: radius * 2,
                h: radius * 2
              })
            : this.layerElements()
        )
          .filter((e) => !exclude.has(e.id) && Ink.isVisible(this.s.doc, e))
          .slice(-64);
        if (s.snapCenters)
          for (const e of objects) {
            const b = Ink.elementBounds(e);
            offer({ x: b.x + b.w / 2, y: b.y + b.h / 2 }, 'Centro');
          }
        if (s.snapIntersections) {
          const segments = [];
          for (const e of objects) {
            if (e.type === 'stroke' || ['image', 'text', 'circle', 'ellipse'].includes(e.type))
              continue;
            for (const outline of e.type === 'region' ? VectorOps.rings(e) : [Ink.outline(e)])
              for (let i = 1; i < outline.length && segments.length < 80; i++)
                segments.push({ id: e.id, a: outline[i - 1], b: outline[i] });
          }
          for (let i = 0; i < segments.length; i++)
            for (let j = i + 1; j < segments.length; j++) {
              if (segments[i].id === segments[j].id) continue;
              const q = this.intersection(
                segments[i].a,
                segments[i].b,
                segments[j].a,
                segments[j].b
              );
              if (q) offer(q, 'Interseção');
            }
        }
      }
      if (best) {
        this.snapMarker = best;
        return { point: { ...p, x: best.x, y: best.y }, anchor: null };
      }
      return base;
    }
  );
  wrap('correctedShape', function (old, candidate, stroke, ...rest) {
    let shape = old.call(this, candidate, stroke, ...rest);
    const key = this.plugin.settings.proportionKey;
    if (this.heldKeys.has(key)) {
      if (shape.type === 'ellipse') {
        const r = (shape.rx + shape.ry) / 2;
        shape = { ...shape, type: 'circle', r };
        delete shape.rx;
        delete shape.ry;
        delete shape.angle;
      } else if (shape.type === 'rectangle') shape = Workflow.constrain(shape, null, 'square');
    }
    return shape;
  });
  // Directional selection is armed only while its invoking key/button is held.
  wrap('openRadial', function (old, position, ...rest) {
    old.call(this, position, ...rest);
    if (!this.radial) return;
    const r = this.root.getBoundingClientRect();
    this.radialCenter = {
      x: r.left + parseFloat(this.radial.style.left),
      y: r.top + parseFloat(this.radial.style.top)
    };
    this.radialItems = Array.from(this.radial.children).filter(
      (n) => n.className === 'si-radial-item'
    );
    this.radialOpened = Date.now();
    this.radialChoice = -1;
  });
  P.radialDirection = function (e) {
    if (!this.radial || !this.radialArmed || this.radialZoomDrag) return;
    const dx = e.clientX - this.radialCenter.x,
      dy = e.clientY - this.radialCenter.y,
      d = Math.hypot(dx, dy);
    const index =
      d < 38 || d > 250
        ? -1
        : ((Math.round((Math.atan2(dy, dx) + Math.PI / 2) / (Math.PI / 4)) % 8) + 8) % 8;
    this.radialChoice = index;
    this.radialItems.forEach((b, i) => b.classList.toggle('is-directional-choice', i === index));
  };
  P.finishRadialDirection = function () {
    if (!this.radialArmed) return;
    this.radialArmed = false;
    if (Date.now() - this.radialOpened >= 100 && this.radialChoice >= 0) {
      const target = this.radialItems[this.radialChoice];
      target?.click();
    }
  };
  wrap('closeRadial', function (old) {
    this.radialArmed = false;
    this.radialChoice = -1;
    return old.call(this);
  });
  wrap('openRadialSettings', function (old) {
    old.call(this);
    this.toggleField(
      this.flyout,
      'Selecionar por direção ao soltar',
      this.plugin.settings.radialDirectional,
      (v) => {
        this.plugin.settings.radialDirectional = v;
        void this.plugin.savePreferences();
      }
    );
    element(
      this.flyout,
      'p',
      'si-panel-copy',
      'Segure a tecla do radial ou o botão secundário, aponte e solte. Zona central cancela; gestos muito curtos não ativam. Clique e zoom curvo continuam disponíveis.'
    );
  });
  P.swapColor = function () {
    const kind = this.plugin.settings.lastBrush,
      current = this.plugin.settings.brushes[kind].color,
      previous = this.previousColor || this.plugin.settings.recentColors.find((x) => x !== current);
    if (previous) {
      this.setBrush({ color: previous }, true);
      this.previousColor = current;
    }
  };
  wrap('setBrush', function (old, patch, ...rest) {
    if (patch.color)
      this.previousColor = this.plugin.settings.brushes[this.plugin.settings.lastBrush].color;
    return old.call(this, patch, ...rest);
  });
  P.swapFavorites = function () {
    const favorites = this.plugin.settings.favorites;
    if (favorites.length < 2) {
      new Notice('Salve dois pincéis favoritos primeiro.');
      return;
    }
    this.favoriteIndex = this.favoriteIndex === 0 ? 1 : 0;
    const f = favorites[this.favoriteIndex];
    Brushes.updateBrush(this.plugin.settings, f.kind, f.brush);
    this.selectTool(f.kind, false, false);
    void this.plugin.savePreferences();
  };
  P.startEyedropper = function () {
    this.finish(false);
    this.eyeReturn = this.mode;
    this.mode = 'eyedropper';
    this.closePanel();
    this.overlay.style.cursor = 'crosshair';
    this.hint.textContent = 'Conta-gotas: clique na cor visível. Esc cancela.';
  };
  P.pickColor = function (event) {
    try {
      const p = this.local(event),
        ratio = Math.min(this.win.devicePixelRatio || 1, 2),
        rgba = this.canvas
          .getContext('2d')
          .getImageData(Math.floor(p.x * ratio), Math.floor(p.y * ratio), 1, 1).data,
        color =
          '#' +
          Array.from(rgba)
            .slice(0, 3)
            .map((n) => n.toString(16).padStart(2, '0'))
            .join('');
      this.mode = this.eyeReturn || this.plugin.settings.lastBrush;
      this.setBrush({ color }, true);
      this.updateTools();
    } catch {
      new Notice('Não foi possível amostrar esse pixel.');
    }
  };
  P.applySelectionOperation = function (hits, initial = new Set()) {
    const operation = this.plugin.settings.selectionOperation;
    if (operation === 'subtract')
      this.selected = new Set([...initial].filter((id) => !hits.has(id)));
    else if (operation === 'add') this.selected = new Set([...initial, ...hits]);
    else this.selected = new Set(hits);
    this.updateSuggestion();
    this.drawOverlay();
  };
  P.startPolygonSelection = function () {
    this.finish(false);
    this.closePanel();
    this.polySelection = { points: [], initial: new Set(this.selected) };
    this.mode = 'polyselect';
    this.hint.textContent =
      'Seleção poligonal: clique nos vértices; Enter ou clique no início conclui. Esc cancela.';
  };
  P.finishPolygonSelection = function () {
    const a = this.polySelection;
    if (!a || a.points.length < 3) return;
    const hits = new Set(
      this.editableObjects()
        .filter((e) => this.selectionHit(e, a.points))
        .map((e) => e.id)
    );
    this.polySelection = null;
    this.mode = 'select';
    this.applySelectionOperation(hits, a.initial);
    this.updateTools();
  };
  wrap('down', function (old, e) {
    if (this.mode === 'eyedropper') {
      e.preventDefault();
      this.pickColor(e);
      return;
    }
    if (this.mode === 'polyselect') {
      e.preventDefault();
      const a = this.polySelection,
        p = this.point(e);
      if (a.points.length >= 3 && Ink.dist(p, a.points[0]) < 10 / this.zoom)
        this.finishPolygonSelection();
      else if (a.points.length < 64) {
        a.points.push(p);
        this.drawOverlay();
      }
      return;
    }
    const initial = this.mode === 'lasso' || this.mode === 'select' ? new Set(this.selected) : null;
    const mapping = this.plugin.settings.penButtons,
      configured =
        e.button === 2
          ? mapping.secondary
          : e.button === 1
            ? mapping.middle
            : e.button === 5
              ? mapping.eraser
              : null;
    let input = e;
    if (configured && configured !== 'default') {
      if (configured === 'radial') {
        e.preventDefault();
        this.openRadial({ x: e.clientX, y: e.clientY });
        if (this.plugin.settings.radialDirectional) this.radialArmed = true;
        return;
      }
      if (configured === 'eyedropper') {
        this.startEyedropper();
        return;
      }
      if (configured === 'select') this.selectTool('select', false, false);
      const mapped = configured === 'pan' ? 1 : configured === 'erase' ? 5 : 0;
      input = new Proxy(e, {
        get: (target, key) =>
          key === 'button'
            ? mapped
            : typeof target[key] === 'function'
              ? target[key].bind(target)
              : target[key]
      });
    }
    const out = old.call(this, input);
    if (this.radial && e.button === 2 && this.plugin.settings.radialDirectional)
      this.radialArmed = true;
    if (initial && ['lasso', 'marquee'].includes(this.active?.mode)) {
      this.active.selectionInitial = initial;
      if (this.plugin.settings.selectionOperation === 'subtract') this.active.selected = new Set();
    }
    return out;
  });
  wrap('finish', function (old, ...args) {
    const a = this.active,
      initial = a?.selectionInitial,
      mode = a?.mode;
    const out = old.apply(this, args);
    if (initial && ['lasso', 'marquee'].includes(mode))
      this.applySelectionOperation(this.selected, initial);
    return out;
  });
  wrap('cancelGesture', function (old) {
    this.polySelection = null;
    if (this.mode === 'polyselect' || this.mode === 'eyedropper') {
      this.mode = this.eyeReturn || 'select';
      this.updateTools();
    }
    return old.call(this);
  });
  wrap('openSelectionControls', function (old) {
    old.call(this);
    const p = this.flyout;
    this.choiceField(
      p,
      'Operação',
      this.plugin.settings.selectionOperation,
      [
        ['replace', 'Substituir'],
        ['add', 'Adicionar'],
        ['subtract', 'Subtrair']
      ],
      (v) => {
        this.plugin.settings.selectionOperation = v;
        void this.plugin.savePreferences();
      }
    );
    button(p, 'Seleção poligonal', () => this.startPolygonSelection());
    button(p, 'Seleção retangular', () => {
      this.selectTool('select', false, false);
      this.closePanel();
    });
    button(p, 'Inverter seleção', () => {
      this.selected = new Set(
        this.editableObjects()
          .filter((e) => !this.selected.has(e.id))
          .map((e) => e.id)
      );
      this.closePanel();
      this.updateSuggestion();
      this.drawOverlay();
    });
    button(p, 'Selecionar camada ativa', () => this.selectLayerContents(this.s.doc.activeLayer));
  });
  P.selectLayerContents = function (id) {
    this.selected = new Set(
      this.editableObjects()
        .filter((e) => (e.layerId || 'ink') === id)
        .map((e) => e.id)
    );
    this.mode = 'select';
    this.closePanel();
    this.updateTools();
    this.drawOverlay();
  };
  P.openPresetLibrary = function () {
    const p = this.makePanel(
        this.pageButton || this.organizeButton,
        'Biblioteca de pincéis',
        'preset-library'
      ),
      s = this.plugin.settings;
    const use = (preset) => {
      Brushes.updateBrush(s, preset.kind, preset.brush);
      this.selectTool(preset.kind, false, false);
      void this.plugin.savePreferences();
      this.closePanel();
    };
    element(p, 'strong', '', 'Prontos para usar');
    const cards = element(p, 'div', 'si-profile-row');
    for (const preset of presets) {
      const card = this.profileCard(cards, preset.name, () => use(preset));
      this.addProfilePreview(card, {
        ...Brushes.settings({}).brushes[preset.kind],
        ...preset.brush
      });
    }
    const name = element(p, 'input');
    name.placeholder = 'Nome do preset';
    button(p, 'Salvar pincel atual', () => {
      if (s.customPresets.length >= 64) {
        new Notice('Limite de 64 presets.');
        return;
      }
      s.customPresets.push({
        id: Ink.uid(),
        name: (name.value || 'Meu pincel').slice(0, 80),
        kind: s.lastBrush,
        brush: { ...s.brushes[s.lastBrush] }
      });
      void this.plugin.savePreferences();
      this.openPresetLibrary();
    });
    for (const preset of s.customPresets) {
      const row = element(p, 'div', 'si-preset-row'),
        input = element(row, 'input');
      input.value = preset.name;
      input.setAttribute('aria-label', 'Nome do preset');
      input.addEventListener('change', () => {
        preset.name = input.value.slice(0, 80) || 'Pincel';
        void this.plugin.savePreferences();
      });
      button(row, 'Usar', () => use(preset));
      button(row, 'Duplicar', () => {
        if (s.customPresets.length >= 64) return;
        s.customPresets.push({
          ...preset,
          id: Ink.uid(),
          name: (preset.name + ' cópia').slice(0, 80),
          brush: { ...preset.brush }
        });
        void this.plugin.savePreferences();
        this.openPresetLibrary();
      });
      button(row, 'Excluir', () => {
        s.customPresets = s.customPresets.filter((x) => x.id !== preset.id);
        void this.plugin.savePreferences();
        this.openPresetLibrary();
      });
    }
    button(p, 'Exportar presets', () =>
      this.saveJSON('smart-ink-presets.json', { version: 1, presets: s.customPresets })
    );
    const file = element(p, 'input');
    file.type = 'file';
    file.accept = '.json';
    file.setAttribute('aria-label', 'Importar presets');
    file.addEventListener('change', async () => {
      try {
        const f = file.files?.[0];
        if (!f) return;
        if (f.size > 200000) throw new Error('Arquivo acima de 200 KB.');
        const data = JSON.parse(await f.text());
        this.importPresets(data);
        this.openPresetLibrary();
      } catch (e) {
        new Notice(e.message);
      }
    });
  };
  P.importPresets = function (data) {
    if (
      data?.version !== 1 ||
      !Array.isArray(data.presets) ||
      data.presets.length + this.plugin.settings.customPresets.length > 64 ||
      data.presets.some(
        (x) =>
          !x ||
          !Brushes.SPECS[x.kind] ||
          typeof x.name !== 'string' ||
          x.name.length > 80 ||
          !x.brush ||
          typeof x.brush !== 'object'
      )
    )
      throw new Error('Coleção de presets inválida (máximo 64).');
    const items = data.presets.map((x) => ({
      id: Ink.uid(),
      name: x.name,
      kind: x.kind,
      brush: Brushes.settings({ brushes: { [x.kind]: x.brush } }).brushes[x.kind]
    }));
    this.plugin.settings.customPresets.push(...items);
    void this.plugin.savePreferences();
  };
  wrap('openWorkflow', function (old) {
    old.call(this);
    const p = this.flyout;
    button(p, 'Biblioteca de pincéis', () => this.openPresetLibrary());
    button(p, 'Alternar cor atual/anterior', () => this.swapColor());
    button(p, 'Alternar dois favoritos', () => this.swapFavorites());
    button(p, 'Conta-gotas', () => this.startEyedropper());
    for (const [key, label] of [
      ['eyedropper', 'Conta-gotas'],
      ['swapColor', 'Alternar cor'],
      ['swapFavorite', 'Alternar favoritos'],
      ['temporarySelect', 'Segurar: cursor temporário']
    ]) {
      const b = button(p, label + ': ' + this.plugin.settings.quickKeys[key]);
      b.addEventListener('keydown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!/^Key[A-Z]$/.test(e.code)) return;
        const s = this.plugin.settings;
        if (
          Object.values(s.shortcuts).includes(e.code) ||
          Object.entries(s.quickKeys).some(([k, v]) => k !== key && v === e.code) ||
          [s.returnBrushKey, s.radialKey, s.temporaryKey, s.brushAdjustKey, s.straightKey].includes(
            e.code
          )
        ) {
          new Notice('Tecla já usada.');
          return;
        }
        s.quickKeys[key] = e.code;
        void this.plugin.savePreferences();
        b.textContent = label + ': ' + e.code;
      });
    }
  });
  wrap('openInterface', function (old) {
    old.call(this);
    for (const [key, label] of [
      ['secondary', 'Botão secundário'],
      ['middle', 'Botão do meio'],
      ['eraser', 'Ponta borracha']
    ])
      this.choiceField(
        this.flyout,
        label,
        this.plugin.settings.penButtons[key] || 'default',
        [
          ['default', 'Padrão do plugin'],
          ['radial', 'Radial'],
          ['pan', 'Mover'],
          ['erase', 'Borracha'],
          ['select', 'Cursor'],
          ['eyedropper', 'Conta-gotas']
        ],
        (v) => {
          this.plugin.settings.penButtons[key] = v;
          void this.plugin.savePreferences();
        }
      );
    element(
      this.flyout,
      'p',
      'si-panel-copy',
      'O driver precisa expor o botão ao navegador; gestos do sistema podem interceptá-lo.'
    );
  });

  P.fineSliderValue = function (value, dx, dy, min, max, width, step) {
    const factor = 1 / (1 + Math.abs(dy) / 40),
      n = value + (dx / Math.max(40, width)) * (max - min) * factor;
    return Ink.clamp(Math.round(n / step) * step, min, max);
  };
  wrap('openBrushPanel', function (old, ...args) {
    const result = old.apply(this, args);
    if (!this.flyout) return result;
    for (const input of descendants(this.flyout).filter(
      (n) => n.tagName === 'INPUT' && n.type === 'range'
    )) {
      let drag = null;
      input.title =
        (input.title || '') + ' Arraste para ajustar; afaste verticalmente para maior precisão.';
      input.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        input.focus();
        input.setPointerCapture?.(e.pointerId);
        drag = { x: e.clientX, y: e.clientY, value: Number(input.value), id: e.pointerId };
      });
      input.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        e.preventDefault();
        const next = this.fineSliderValue(
          drag.value,
          e.clientX - drag.x,
          e.clientY - drag.y,
          Number(input.min),
          Number(input.max),
          input.getBoundingClientRect().width,
          Number(input.step) || 1
        );
        input.value = String(next);
        input.dispatchEvent(new this.win.Event('input', { bubbles: true }));
      });
      const done = () => {
        if (!drag) return;
        drag = null;
        input.dispatchEvent(new this.win.Event('change', { bubbles: true }));
      };
      input.addEventListener('pointerup', done);
      input.addEventListener('pointercancel', done);
      input.addEventListener('lostpointercapture', done);
    }
    return result;
  });
  // Maintenance is debounced and suspended during gestures; it does not serialize documents.
  P.scheduleAuxiliary = function () {
    if (
      !this.s ||
      !this.plugin.settings ||
      this.auxTimer ||
      (!this.plugin.settings.snapIntersections &&
        !this.plugin.settings.snapCenters &&
        !this.plugin.settings.minimapVisible &&
        !this.layerDockOpen)
    )
      return;
    const schedule =
      this.win?.setTimeout?.bind(this.win) ||
      (typeof setTimeout === 'function' ? setTimeout : null);
    if (!schedule) return;
    this.auxTimer = schedule(() => {
      this.auxTimer = null;
      if (!this.s || this.disposed) return;
      if (this.active) {
        this.scheduleAuxiliary();
        return;
      }
      if (this.plugin.settings.snapIntersections || this.plugin.settings.snapCenters) {
        this.auxIndex ??= new Visible.SpatialIndex();
        this.auxIndex.sync(this.s.doc.elements);
      }
      if (this.plugin.settings.minimapVisible) this.refreshNavigator();
      if (this.layerDockOpen) this.refreshLayerThumbnails();
    }, 180);
  };
  wrap('changed', function (old, ...args) {
    const out = old.apply(this, args);
    this.scheduleAuxiliary();
    return out;
  });
  P.toggleNavigator = function () {
    this.plugin.settings.minimapVisible = !this.plugin.settings.minimapVisible;
    void this.plugin.savePreferences();
    this.refreshNavigator();
  };
  P.refreshNavigator = function () {
    if (!this.root || !this.s) return;
    if (!this.navigatorBox) {
      const box = element(this.root, 'div', 'si-navigator');
      this.navigatorBox = box;
      button(box, '×', () => this.toggleNavigator()).setAttribute(
        'aria-label',
        'Ocultar navegador'
      );
      const canvas = element(box, 'canvas');
      canvas.width = 220;
      canvas.height = 140;
      canvas.setAttribute('aria-label', 'Navegador do canvas: clique ou arraste');
      canvas.tabIndex = 0;
      this.navigatorCanvas = canvas;
      let dragging = false;
      const move = (e) => {
        if (!this.navigatorMap) return;
        const r = canvas.getBoundingClientRect(),
          b = this.navigatorMap;
        this.centerView({
          x: b.x + ((e.clientX - r.left) * 220) / r.width / b.scale,
          y: b.y + ((e.clientY - r.top) * 140) / r.height / b.scale
        });
        this.render();
      };
      this.listen(canvas, 'pointerdown', (e) => {
        e.preventDefault();
        dragging = true;
        this.rememberView();
        canvas.setPointerCapture?.(e.pointerId);
        move(e);
      });
      this.listen(canvas, 'pointermove', (e) => {
        if (dragging) move(e);
      });
      this.listen(canvas, 'pointerup', () => (dragging = false));
      this.listen(canvas, 'pointercancel', () => (dragging = false));
      this.listen(canvas, 'keydown', (e) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
        e.preventDefault();
        this.rememberView();
        this.camera.x += e.key === 'ArrowLeft' ? 80 : e.key === 'ArrowRight' ? -80 : 0;
        this.camera.y += e.key === 'ArrowUp' ? 80 : e.key === 'ArrowDown' ? -80 : 0;
        this.render();
      });
    }
    this.navigatorBox.hidden = !this.plugin.settings.minimapVisible;
    if (this.navigatorBox.hidden) return;
    const view = this.viewportBounds();
    if (this.navCacheSource !== this.s.doc.elements || this.navCacheLayers !== this.s.doc.layers) {
      this.navCacheSource = this.s.doc.elements;
      this.navCacheLayers = this.s.doc.layers;
      const elements = this.layerElements();
      this.navRects = elements.map((e) => ({ b: Ink.elementBounds(e), color: e.color }));
      this.navContent = Ink.bounds(elements);
    }
    const content = this.navContent || view,
      b = Ink.expand(
        Ink.pointBounds([
          { x: content.x, y: content.y },
          { x: content.x + content.w, y: content.y + content.h },
          { x: view.x, y: view.y },
          { x: view.x + view.w, y: view.y + view.h }
        ]),
        20
      ),
      scale = Math.min(220 / b.w, 140 / b.h);
    this.navigatorMap = { ...b, scale };
    const ctx = this.navigatorCanvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, 220, 140);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 220, 140);
    ctx.scale(scale, scale);
    ctx.translate(-b.x, -b.y);
    for (const { b: r, color } of this.navRects || []) {
      ctx.fillStyle = color;
      ctx.fillRect(r.x, r.y, Math.max(r.w, 1 / scale), Math.max(r.h, 1 / scale));
    }
    ctx.strokeStyle = '#0078d4';
    ctx.lineWidth = 2 / scale;
    ctx.strokeRect(view.x, view.y, view.w, view.h);
  };
  wrap('render', function (old, ...args) {
    const out = old.apply(this, args);
    if (this.s && !this.active && this.plugin.settings.minimapVisible) this.scheduleAuxiliary();
    return out;
  });
  P.refreshLayerThumbnails = function () {
    if (!this.layerDockOpen || !this.layerSheet) return;
    const source = this.s.doc.elements;
    this.layerThumbCache ??= new Map();
    for (const row of descendants(this.layerSheet).filter(
      (n) => n.className === 'si-layer-select'
    )) {
      const id = row.dataset.layerId;
      if (!id) continue;
      const items = source.filter((e) => (e.layerId || 'ink') === id),
        cache = this.layerThumbCache.get(id);
      let svg;
      if (
        cache &&
        cache.items.length === items.length &&
        cache.items.every((e, i) => e === items[i])
      )
        svg = cache.svg;
      else {
        const doc = {
          ...this.s.doc,
          elements: items.slice(0, 300),
          layers: this.s.doc.layers.map((l) => ({ ...l, visible: true }))
        };
        svg = Ink.svg(doc);
        this.layerThumbCache.set(id, { items, svg });
      }
      let thumb = row.children.find
        ? row.children.find((n) => n.className === 'si-layer-thumb')
        : Array.from(row.children).find((n) => n.className === 'si-layer-thumb');
      if (!thumb) thumb = element(row, 'span', 'si-layer-thumb');
      thumb.innerHTML = svg;
    }
  };
  wrap('renderLayerDock', function (old) {
    if (this.active) {
      this.scheduleAuxiliary();
      return;
    }
    const result = old.call(this);
    if (this.layerDockOpen && this.s) {
      const layers = this.s.doc.layers.slice().reverse(),
        rows = descendants(this.layerSheet).filter((n) => n.className === 'si-layer-item');
      rows.forEach((row, i) => {
        const layer = layers[i];
        if (!layer) return;
        const select = Array.from(row.children).find((n) => n.className === 'si-layer-select');
        if (select) select.dataset.layerId = layer.id;
        row.draggable = layer.id !== 'background';
        row.addEventListener('dragstart', () => (this.dragLayerId = layer.id));
        row.addEventListener('dragover', (e) => e.preventDefault());
        row.addEventListener('drop', (e) => {
          e.preventDefault();
          this.reorderLayer(this.dragLayerId, layer.id);
          this.dragLayerId = null;
        });
        const choose = element(row, 'input');
        choose.type = 'checkbox';
        choose.checked = this.multiLayers?.has(layer.id) || false;
        choose.setAttribute('aria-label', 'Incluir ' + layer.name + ' na seleção de camadas');
        choose.addEventListener('change', () => {
          this.multiLayers ??= new Set();
          choose.checked ? this.multiLayers.add(layer.id) : this.multiLayers.delete(layer.id);
        });
      });
      this.scheduleAuxiliary();
    }
    return result;
  });
  P.reorderLayer = function (from, to) {
    if (!from || from === to || from === 'background' || to === 'background') return;
    const layers = this.s.doc.layers.slice(),
      i = layers.findIndex((l) => l.id === from),
      j = layers.findIndex((l) => l.id === to);
    if (i < 0 || j < 0) return;
    const [layer] = layers.splice(i, 1);
    layers.splice(j, 0, layer);
    this.commitMeta({ layers });
  };
  P.duplicateLayer = function (id) {
    this.finish(false);
    if (!this.editable() || this.s.doc.layers.length >= 50) return;
    const layer = this.s.doc.layers.find((l) => l.id === id);
    if (!layer) return;
    const newId = Ink.uid(),
      source = this.s.doc.elements.filter((e) => (e.layerId || 'ink') === id),
      ids = new Map(source.map((e) => [e.id, Ink.uid()])),
      copies = Workflow.cloneGroups(source).map((e) => {
        const next = { ...e, id: ids.get(e.id), layerId: newId };
        if (e.bindings) {
          next.bindings = {};
          for (const [key, b] of Object.entries(e.bindings))
            if (ids.has(b.targetId)) next.bindings[key] = { ...b, targetId: ids.get(b.targetId) };
        }
        if (next.geometryRule?.targetId) {
          next.geometryRule = ids.has(next.geometryRule.targetId)
            ? { ...next.geometryRule, targetId: ids.get(next.geometryRule.targetId) }
            : undefined;
        }
        return next;
      }),
      before = this.s.doc.elements,
      layers = this.s.doc.layers,
      activeLayer = this.s.doc.activeLayer;
    const nextLayers = [
      ...layers,
      { ...layer, id: newId, name: (layer.name + ' cópia').slice(0, 200), locked: false }
    ];
    try {
      Ink.parse(
        Ink.serialize({
          ...this.s.doc,
          layers: nextLayers,
          activeLayer: newId,
          elements: [...before, ...copies]
        })
      );
    } catch (e) {
      new Notice('Não foi possível duplicar: ' + e.message);
      return;
    }
    this.s.doc.layers = nextLayers;
    this.s.doc.activeLayer = newId;
    this.commitElements([...before, ...copies]);
    Object.assign(this.s.history.undoStack.at(-1), {
      layerBefore: { layers, activeLayer },
      layerAfter: { layers: this.s.doc.layers, activeLayer: newId }
    });
  };
  wrap('openLayerRowOptions', function (old, id, ...rest) {
    old.call(this, id, ...rest);
    if (!this.flyout) return;
    const p = this.flyout,
      layer = this.s.doc.layers.find((l) => l.id === id);
    button(p, 'Selecionar objetos da camada', () => this.selectLayerContents(id));
    button(p, 'Duplicar camada', () => {
      this.duplicateLayer(id);
      this.closePanel();
    });
    this.toggleField(p, 'Assistência de formas nesta camada', !!layer.drawingAssist, (v) =>
      this.commitMeta({
        layers: this.s.doc.layers.map((l) => (l.id === id ? { ...l, drawingAssist: v } : l))
      })
    );
    for (const [field, label] of [
      ['visible', 'Alternar visibilidade das camadas marcadas'],
      ['locked', 'Alternar bloqueio das camadas marcadas']
    ])
      button(p, label, () => {
        const ids = this.multiLayers?.size ? this.multiLayers : new Set([id]);
        this.commitMeta({
          layers: this.s.doc.layers.map((l) => (ids.has(l.id) ? { ...l, [field]: !l[field] } : l))
        });
      });
  });
  wrap('openOrganize', function (old) {
    old.call(this);
    button(this.flyout, 'Seleção avançada', () => this.openSelectionControls()).className =
      'si-menu-action';
    button(this.flyout, 'Biblioteca de pincéis', () => this.openPresetLibrary()).className =
      'si-menu-action';
    button(this.flyout, 'Conta-gotas', () => this.startEyedropper()).className = 'si-menu-action';
  });
  wrap('drawOverlay', function (old, ...args) {
    old.apply(this, args);
    if (this.polySelection?.points.length) {
      const ctx = this.overlay.getContext('2d');
      ctx.save();
      ctx.strokeStyle = '#0078d4';
      ctx.lineWidth = 1.5 / this.zoom;
      ctx.beginPath();
      this.polySelection.points.forEach((p, i) =>
        i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)
      );
      ctx.stroke();
      ctx.restore();
    }
    if (this.snapMarker?.label) {
      const ctx = this.overlay.getContext('2d');
      ctx.save();
      ctx.fillStyle = '#0078d4';
      ctx.font = 12 / this.zoom + 'px sans-serif';
      ctx.fillText(
        I18n.t(this.snapMarker.label),
        this.snapMarker.x + 10 / this.zoom,
        this.snapMarker.y + 18 / this.zoom
      );
      ctx.restore();
    }
  });
  wrap('build', function (old) {
    const result = old.call(this);
    this.listen(this.root, 'keydown', (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (
        e.code === this.plugin.settings.radialKey &&
        this.radial &&
        this.plugin.settings.radialDirectional
      )
        this.radialArmed = true;
      if (e.key === 'Enter' && this.polySelection) {
        e.preventDefault();
        this.finishPolygonSelection();
      }
      if (e.key === 'Escape') {
        this.polySelection = null;
        this.radialArmed = false;
      }
      if (e.target !== this.overlay || e.repeat || e.ctrlKey || e.metaKey) return;
      const key = Object.entries(this.plugin.settings.quickKeys).find(
        ([, code]) => code === e.code
      )?.[0];
      if (key) {
        e.preventDefault();
        if (key === 'eyedropper') this.startEyedropper();
        else if (key === 'swapColor') this.swapColor();
        else if (key === 'swapFavorite') this.swapFavorites();
        else if (key === 'temporarySelect') {
          this.beginTemporary('select', e.code);
        }
      }
    });
    this.listen(this.root, 'keyup', (e) => {
      if (e.code === this.plugin.settings.radialKey) this.finishRadialDirection();
      if (e.code === this.plugin.settings.quickKeys.temporarySelect && this.selectReturn) {
        this.finish(false);
        this.mode = this.selectReturn;
        this.selectReturn = null;
        this.updateTools();
      }
    });
    this.listen(this.root, 'pointermove', (e) => this.radialDirection(e));
    this.listen(this.root, 'pointerup', () => this.finishRadialDirection());
    this.listen(this.win, 'blur', () => {
      this.radialArmed = false;
      this.polySelection = null;
      if (this.selectReturn) {
        this.mode = this.selectReturn;
        this.selectReturn = null;
        this.updateTools();
      }
    });
    return result;
  });
  wrap('onLoadFile', async function (old, ...args) {
    this.disposed = false;
    const result = await old.apply(this, args);
    this.refreshNavigator();
    this.scheduleAuxiliary();
    return result;
  });
  wrap('onUnloadFile', async function (old, ...args) {
    if (this.auxTimer) clearTimeout(this.auxTimer);
    this.auxTimer = null;
    this.polySelection = null;
    if (this.navigatorBox) this.navigatorBox.hidden = true;
    return old.apply(this, args);
  });
  wrap('onClose', async function (old, ...args) {
    this.disposed = true;
    if (this.auxTimer) clearTimeout(this.auxTimer);
    this.auxTimer = null;
    return old.apply(this, args);
  });
})(InkView, Ink, Brushes, { element, button, Notice });
