/* Smart Ink — quality-of-life layer. Kept unminified to make future maintenance practical.
 * Appended to main.js after installFeatures; only Obsidian's existing DOM APIs are used.
 */
(function installQualityOfLife(View, Ink, Brushes, { element, button, Notice }) {
  const P = View.prototype;
  const before = (method, fn) => {
    const original = P[method];
    P[method] = function (...args) {
      return fn.call(this, original, ...args);
    };
  };
  const NORMAL = ['write', 'erase', 'select', 'lasso', 'rulers', 'pencil', 'undo', 'redo'];
  const DIAGRAM = [
    'select',
    'connector',
    'rulers',
    'lasso',
    'write',
    'recognizeShapes',
    'undo',
    'fit'
  ];
  const ACTIONS = {
    write: ['Caneta', 'pen-tool'],
    pencil: ['Lápis', 'pencil'],
    marker: ['Marca-texto', 'highlighter'],
    erase: ['Borracha', 'eraser'],
    select: ['Selecionar', 'mouse-pointer-2'],
    lasso: ['Laço', 'lasso'],
    connector: ['Conector', 'route'],
    rulers: ['Réguas', 'ruler'],
    recognizeShapes: ['Reconhecer formas', 'shapes'],
    undo: ['Desfazer', 'undo-2'],
    redo: ['Refazer', 'redo-2'],
    fit: ['Enquadrar', 'maximize-2'],
    smooth: ['Suavizar seleção', 'waves'],
    layers: ['Camadas', 'layers'],
    precision: ['Encaixes', 'magnet'],
    pan: ['Mover', 'hand']
  };
  const GLYPHS = {
    'pen-tool':
      '<path d="m12 19 7-7 3 3-7 7-3-3ZM2 22l7-7m0 0 4 4m-4-4 7-7-4-4-7 7 4 4ZM14 4l4-2 4 4-2 4"/>',
    pencil: '<path d="M12 20h9M3 17.3 17.3 3a2.1 2.1 0 0 1 3 3L6 20l-4 1Z"/>',
    highlighter: '<path d="m8 16 8-8 4 4-8 8H8zM16 8l3-3 4 4-3 3M3 21h18"/>',
    eraser:
      '<path d="m7 21-5-5a2 2 0 0 1 0-3l10-10a2 2 0 0 1 3 0l7 7a2 2 0 0 1 0 3l-8 8H7ZM8 8l9 9M3 21h19"/>',
    'mouse-pointer-2': '<path d="m5 3 14 9-7 1-3 7-4-17Z"/>',
    lasso:
      '<path d="M11 20c-5 0-9-3-9-7 0-5 5-9 11-9s9 3 9 8-7 7-11 5c-3-2-1-5 1-4 2 1 2 5-1 8Z"/>',
    route:
      '<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h7a5 5 0 0 1 0 10h-4a4 4 0 0 0 0 4h7"/>',
    ruler: '<path d="M3 6h18v12H3zM7 6v5m4-5v3m4-3v5m4-5v3"/>',
    shapes: '<rect x="3" y="4" width="11" height="11" rx="1"/><circle cx="16" cy="16" r="6"/>',
    'undo-2': '<path d="M9 14 4 9l5-5M4 9h11a6 6 0 0 1 0 12h-3"/>',
    'redo-2': '<path d="m15 14 5-5-5-5m5 5H9a6 6 0 0 0 0 12h3"/>',
    'maximize-2': '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    waves:
      '<path d="M2 7c4-5 7 5 11 0s7-5 9 0M2 13c4-5 7 5 11 0s7-5 9 0M2 19c4-5 7 5 11 0s7-5 9 0"/>',
    layers: '<path d="m12 2 10 6-10 6L2 8Zm-10 11 10 6 10-6m-20 5 10 5 10-5"/>',
    hand: '<path d="M6 14V9a2 2 0 0 1 4 0v3-6a2 2 0 0 1 4 0v6-5a2 2 0 0 1 4 0v6-2a2 2 0 0 1 4 0v5c0 4-3 7-8 7H9l-7-7a2 2 0 0 1 3-3l1 1Z"/>',
    magnet: '<path d="M6 3h5v7a1 1 0 0 0 2 0V3h5v7a6 6 0 0 1-12 0V3ZM6 6h5m2 0h5"/>',
    settings:
      '<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3m10-10h-3M5 12H2m17-7-2 2M7 17l-2 2m14 0-2-2M7 7 5 5"/>',
    'chevron-up': '<path d="m6 15 6-6 6 6"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    'eye-off':
      '<path d="m3 3 18 18M10 5c6-1 12 7 12 7s-2 4-6 6M6 6C3 8 2 12 2 12s4 7 10 7c2 0 4-1 5-2"/>',
    lock: '<rect x="5" y="11" width="14" height="11" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    'lock-open':
      '<rect x="5" y="11" width="14" height="11" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0"/>',
    plus: '<path d="M12 4v16M4 12h16"/>',
    minus: '<path d="M4 12h16"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    trash: '<path d="M4 7h16M10 4h4m-8 3 1 14h10l1-14M10 11v6m4-6v6"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    sliders:
      '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="var(--background-primary)"/><circle cx="16" cy="12" r="2" fill="var(--background-primary)"/><circle cx="11" cy="18" r="2" fill="var(--background-primary)"/>',
    dots: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    'arrow-left': '<path d="m14 5-7 7 7 7M7 12h14"/>',
    'file-pen':
      '<path d="M12 2H5a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9ZM12 2v8h7m-9 8 7-7 2 2-7 7H9Z"/>',
    link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2m3 6a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2"/>',
    'edit-3': '<path d="m3 17-1 5 5-1L21 7l-4-4L3 17ZM14 6l4 4"/>',
    group:
      '<rect x="2" y="3" width="8" height="8" rx="1"/><rect x="14" y="13" width="8" height="8" rx="1"/><path d="M14 3h8v8M2 13v8h8"/>',
    align: '<path d="M4 4v16M8 7h11v4H8zM8 14h8v4H8z"/>'
  };
  function icon(parent, kind, size = 19) {
    const svg = parent.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('si-action-svg');
    svg.innerHTML = GLYPHS[kind] || GLYPHS.shapes;
    parent.appendChild(svg);
    return svg;
  }
  function control(parent, name, glyph, act, className = 'si-compact-button') {
    const b = button(parent, '', act);
    b.className = className;
    b.title = name;
    b.setAttribute('aria-label', name);
    icon(b, glyph);
    return b;
  }
  function normalizedRadial(settings, context) {
    const defaults = context === 'diagram' ? DIAGRAM : NORMAL;
    const stored = settings.radialPresets?.[context];
    if (!Array.isArray(stored)) return defaults.slice();
    const fallback = {
      color: 'rulers',
      thin: 'smooth',
      thick: 'pencil',
      recognize: 'recognizeShapes'
    };
    const used = new Set();
    return Array.from({ length: 8 }, (_, i) => {
      let key = fallback[stored[i]] || stored[i];
      if (!ACTIONS[key] || used.has(key)) key = defaults.find((k) => !used.has(k)) || 'write';
      used.add(key);
      return key;
    });
  }
  function command(view, action, center) {
    if (Brushes.SPECS[action]) {
      view.qualityBrushPosition = center;
      view.selectTool(action, true, false);
      return;
    }
    if (['erase', 'select', 'lasso', 'connector', 'pan'].includes(action)) {
      view.selectTool(action, false, false);
      return;
    }
    if (action === 'rulers') {
      view.openRadial(center, 'rulers');
      return;
    }
    if (action === 'recognizeShapes') {
      if (view.selectedElements().some((e) => e.type === 'stroke' && !e.erasures?.length))
        view.recognizeIds([...view.selected]);
      else {
        view.shapeAssist = !view.shapeAssist;
        view.updateTools();
        view.drawOverlay();
      }
      return;
    }
    if (action === 'layers') {
      view.setLayerDockOpen(true);
      return;
    }
    if (action === 'precision') {
      view.openPrecision();
      return;
    }
    if (action === 'smooth') {
      if (view.selectedElements().some((e) => e.type === 'stroke')) view.openSampleComparison();
      else {
        view.qualityBrushPosition = center;
        view.selectTool(view.plugin.settings.lastBrush, true, false);
      }
      return;
    }
    if (['undo', 'redo', 'fit'].includes(action)) view[action]();
  }
  P.openRadial = function (position, page = 'main') {
    if (!this.s) return;
    this.finish(false);
    this.closePanel();
    this.closeRadial();
    const r = this.root.getBoundingClientRect();
    const fallback = {
      x: r.left + this.root.clientWidth / 2,
      y: r.top + this.root.clientHeight / 2
    };
    const origin = position || this.lastPointer || fallback;
    // Reserve room for the curved zoom strip below the wheel, including in narrow panes.
    const scale = Math.min(1, this.root.clientWidth / 324, this.root.clientHeight / 394);
    const marginX = 151 * scale + 5,
      marginTop = 151 * scale + 5,
      marginBottom = 218 * scale + 5;
    const cx = Ink.clamp(
      origin.x - r.left,
      Math.min(marginX, this.root.clientWidth / 2),
      Math.max(this.root.clientWidth / 2, this.root.clientWidth - marginX)
    );
    const cy = Ink.clamp(
      origin.y - r.top,
      Math.min(marginTop, this.root.clientHeight / 2),
      Math.max(this.root.clientHeight / 2, this.root.clientHeight - marginBottom)
    );
    const center = { x: cx, y: cy };
    const actual = { x: r.left + center.x, y: r.top + center.y };
    const root = element(this.root, 'div', 'si-radial si-radial-v2');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', page === 'rulers' ? 'Menu de réguas' : 'Ferramentas rápidas');
    root.style.left = center.x + 'px';
    root.style.top = center.y + 'px';
    root.style.setProperty('--si-radial-scale', String(scale));
    this.radial = root;
    let entries;
    if (page === 'rulers') {
      entries = [
        ['Painel de réguas', 'ruler', () => this.openDraftingPanel()],
        [
          'Adicionar régua',
          'ruler',
          () => {
            const d = Ink.clone(this.drafting());
            const middle = this.worldCenter();
            d.ruler = { ...middle, angle: 0, length: 400 / this.zoom, enabled: true };
            this.setDrafting(d);
          }
        ],
        ['Guia horizontal', 'align', () => this.quickAddGuide('y')],
        ['Guia vertical', 'align', () => this.quickAddGuide('x')],
        [
          'Editar guias',
          'edit-3',
          () => {
            this.mode = 'drafting';
            this.updateTools();
            this.drawOverlay();
          }
        ],
        ['Configurar linha reta', 'settings', () => this.openDraftingPanel()],
        [
          'Remover régua',
          'trash',
          () => {
            const d = Ink.clone(this.drafting());
            delete d.ruler;
            this.setDrafting(d);
          }
        ],
        ['Voltar', 'arrow-left', () => this.openRadial(actual)]
      ];
    } else {
      const context = this.mode === 'connector' || this.shapeAssist ? 'diagram' : 'writing';
      entries = normalizedRadial(this.plugin.settings, context).map((action) => [
        ACTIONS[action][0],
        ACTIONS[action][1],
        () => command(this, action, actual)
      ]);
    }
    for (const [i, [label, glyph, act]] of entries.entries()) {
      const b = control(
        root,
        label,
        glyph,
        () => {
          this.closeRadial();
          act();
        },
        'si-radial-item'
      );
      const angle = (i * Math.PI) / 4 - Math.PI / 2;
      b.style.left = 150 + Math.cos(angle) * 106 + 'px';
      b.style.top = 150 + Math.sin(angle) * 106 + 'px';
      element(b, 'span', 'si-radial-label', label);
    }
    const close = button(root, '', () => this.closeRadial());
    close.className = 'si-radial-center';
    close.title = page === 'rulers' ? 'Voltar às ferramentas' : 'Fechar menu radial';
    close.setAttribute('aria-label', close.title);
    icon(close, page === 'rulers' ? 'arrow-left' : ACTIONS[this.mode]?.[1] || 'pen-tool', 22);
    if (page === 'rulers')
      close.addEventListener('click', () => this.openRadial(actual), { once: true });
    const meta = element(
      root,
      'span',
      'si-radial-caption',
      page === 'rulers' ? 'RÉGUAS' : 'FERRAMENTAS'
    );
    meta.setAttribute('aria-hidden', 'true');
    if (this.plugin.settings.radialZoom !== false) this.attachRadialZoom(root, actual);
    close.focus();
  };
  P.quickAddGuide = function (axis) {
    const d = Ink.clone(this.drafting());
    if (d.guides.length >= 100) {
      new Notice('Limite de 100 guias.');
      return;
    }
    const world = this.worldCenter();
    d.guides.push({ axis, value: world[axis] });
    this.setDrafting(d);
  };
  // Accessible curved zoom control, always relative to the point where the wheel was opened.
  // Logarithmic scale keeps small zoom levels as easy to dial as large ones.
  const zoomMin = Math.log2(0.1),
    zoomMax = 3;
  const zoomAtRatio = (t) => 2 ** (zoomMin + Ink.clamp(t, 0, 1) * (zoomMax - zoomMin));
  const ratioAtZoom = (z) => Ink.clamp((Math.log2(z) - zoomMin) / (zoomMax - zoomMin), 0, 1);
  P.attachRadialZoom = function (root, actual) {
    const bar = element(root, 'div', 'si-radial-zoom');
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Controle rápido de zoom');
    const anchorRect = this.overlay.getBoundingClientRect();
    const anchor = { x: actual.x - anchorRect.left, y: actual.y - anchorRect.top };
    const change = (level) => {
      if (!this.s) return;
      this.setZoom(Ink.clamp(level, 0.1, 8), anchor);
    };
    const less = control(
      bar,
      'Diminuir zoom',
      'minus',
      () => change(this.zoom / 1.2),
      'si-radial-zoom-step'
    );
    const track = element(bar, 'div', 'si-radial-zoom-track');
    track.tabIndex = 0;
    track.setAttribute('role', 'slider');
    track.setAttribute('aria-label', 'Zoom do canvas');
    track.setAttribute('aria-valuemin', '10');
    track.setAttribute('aria-valuemax', '800');
    track.title = 'Arraste para ajustar · setas ± zoom · Home 10% · End 800%';
    const ns = 'http://www.w3.org/2000/svg',
      svg = track.ownerDocument.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 220 66');
    svg.setAttribute('aria-hidden', 'true');
    const path = (cls, d) => {
      const p = track.ownerDocument.createElementNS(ns, 'path');
      p.setAttribute('class', cls);
      p.setAttribute('d', d);
      svg.appendChild(p);
      return p;
    };
    path('si-zoom-track', 'M 10 12 Q 110 68 210 12');
    const progress = path('si-zoom-progress', '');
    const marker = track.ownerDocument.createElementNS(ns, 'circle');
    marker.setAttribute('class', 'si-zoom-thumb');
    marker.setAttribute('r', '7');
    svg.appendChild(marker);
    track.appendChild(svg);
    const readout = element(track, 'span', 'si-radial-zoom-value', '100%');
    const more = control(
      bar,
      'Aumentar zoom',
      'plus',
      () => change(this.zoom * 1.2),
      'si-radial-zoom-step'
    );
    const update = () => {
      if (this.radial !== root) return;
      const t = ratioAtZoom(this.zoom),
        x = 10 + 200 * t,
        y = 12 + 112 * t * (1 - t);
      progress.setAttribute('d', `M 10 12 Q ${10 + 100 * t} ${12 + 56 * t} ${x} ${y}`);
      marker.setAttribute('cx', String(x));
      marker.setAttribute('cy', String(y));
      const percent = Math.round(this.zoom * 100) + '%';
      readout.textContent = percent;
      track.setAttribute('aria-valuenow', String(Math.round(this.zoom * 100)));
      track.setAttribute('aria-valuetext', percent);
      less.disabled = this.zoom <= 0.10001;
      more.disabled = this.zoom >= 7.9999;
    };
    this.radialZoomUpdate = update;
    update();
    const changeAt = (e) => {
      const bounds = track.getBoundingClientRect();
      if (!bounds.width) return;
      const t = Ink.clamp((e.clientX - bounds.left) / bounds.width, 0, 1);
      change(zoomAtRatio(t));
    };
    track.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      track.focus();
      // One navigation-history entry per drag instead of 50+ successive entries.
      this.rememberView();
      this.navigating = true;
      this.radialZoomDrag = true;
      if (track.setPointerCapture && e.pointerId !== undefined)
        track.setPointerCapture(e.pointerId);
      changeAt(e);
    });
    track.addEventListener('pointermove', (e) => {
      if (this.radialZoomDrag && this.radial === root) {
        e.preventDefault();
        changeAt(e);
      }
    });
    const endDrag = () => {
      if (this.radialZoomDrag) {
        this.radialZoomDrag = false;
        this.navigating = false;
      }
    };
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);
    track.addEventListener('lostpointercapture', endDrag);
    track.addEventListener('keydown', (e) => {
      let next = this.zoom;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next /= 1.12;
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next *= 1.12;
      else if (e.key === 'PageDown') next /= 1.5;
      else if (e.key === 'PageUp') next *= 1.5;
      else if (e.key === 'Home') next = 0.1;
      else if (e.key === 'End') next = 8;
      else return;
      e.preventDefault();
      e.stopPropagation();
      change(next);
    });
  };
  before('syncZoom', function (old, ...args) {
    const out = old.apply(this, args);
    this.radialZoomUpdate?.();
    return out;
  });
  before('closeRadial', function (old, ...args) {
    this.radialZoomUpdate = null;
    this.radialZoomDrag = false;
    this.navigating = false;
    return old.apply(this, args);
  });
  P.openRadialSettings = function () {
    const p = this.makePanel(
      this.pageButton || this.organizeButton,
      'Personalizar menu radial',
      'radial-settings'
    );
    this.toggleField(
      p,
      'Exibir zoom curvo no menu radial',
      this.plugin.settings.radialZoom !== false,
      (v) => {
        this.plugin.settings.radialZoom = v;
        void this.plugin.savePreferences();
      }
    );
    element(
      p,
      'p',
      'si-panel-copy',
      'Personalize as oito posições por contexto. Pincéis abrem cor e espessura; réguas têm submenu. Zoom fica abaixo da roda.'
    );
    const expanded = this.radialEditorContext || 'writing';
    for (const [context, title, defaults] of [
      ['writing', 'Escrita', NORMAL],
      ['diagram', 'Diagramas', DIAGRAM]
    ]) {
      const section = element(p, 'details', 'si-radial-editor-section');
      section.open = context === expanded;
      element(section, 'summary', '', '' + title + ' · 8 ações');
      section.addEventListener('toggle', () => {
        if (section.open) this.radialEditorContext = context;
      });
      const current = normalizedRadial(this.plugin.settings, context);
      const choices = Object.entries(ACTIONS)
        .filter(([key]) => !['pan'].includes(key))
        .map(([key, [name]]) => [key, name]);
      for (let i = 0; i < 8; i++)
        this.choiceField(section, 'Posição ' + (i + 1), current[i], choices, (value) => {
          const entries = normalizedRadial(this.plugin.settings, context);
          const previous = entries[i],
            j = entries.indexOf(value);
          if (j !== -1 && j !== i) entries[j] = previous;
          entries[i] = value;
          this.plugin.settings.radialPresets ??= {};
          this.plugin.settings.radialPresets[context] = entries;
          this.radialEditorContext = context;
          void this.plugin.savePreferences();
          this.openRadialSettings();
        });
      button(section, 'Restaurar padrão · ' + title, () => {
        this.plugin.settings.radialPresets ??= {};
        this.plugin.settings.radialPresets[context] = defaults.slice();
        this.radialEditorContext = context;
        void this.plugin.savePreferences();
        this.openRadialSettings();
      }).className = 'si-menu-action';
    }
    button(p, '← Documento e configurações', () => this.openPagePanel(this.pageButton)).className =
      'si-menu-action si-nav-back';
  };
  // Organizar contains creation and structural actions, not vault-wide preferences.
  P.openOrganize = function () {
    const p = this.makePanel(this.organizeButton, 'Organizar', 'organize');
    for (const [section, entries] of [
      [
        'Inserir',
        [
          ['Texto', 'openTextEditor'],
          ['Imagem', 'chooseImage'],
          ['Espaço entre anotações', 'startSpace'],
          ['Biblioteca de elementos', 'openAssets']
        ]
      ],
      [
        'Estrutura',
        [
          ['Regiões e minimapa', 'openRegions'],
          ['Seleção e grupos', 'openSelectionControls']
        ]
      ]
    ]) {
      element(p, 'div', 'si-menu-section', section);
      for (const [label, method] of entries) {
        const action = button(p, label, () => this[method]());
        action.className = 'si-menu-action si-structured-action';
      }
    }
    element(
      p,
      'p',
      'si-panel-copy',
      'Papel, encaixes, atalhos e outras preferências estão em •••. As camadas têm painel próprio no canto inferior direito.'
    );
  };
  P.openPagePanel = function (anchor) {
    if (this.panelKind === 'page') {
      this.closePanel();
      return;
    }
    const p = this.makePanel(
      anchor || this.pageButton || this.organizeButton,
      'Documento e configurações',
      'page'
    );
    element(p, 'div', 'si-menu-section', 'Página atual');
    const row = element(p, 'label', 'si-check-row');
    element(row, 'span', '', 'Tipo de papel');
    const paper = element(row, 'select');
    this.paper = paper;
    for (const [key, name] of [
      ['dots', 'Pontos'],
      ['grid', 'Grade'],
      ['lines', 'Pautado'],
      ['plain', 'Liso']
    ]) {
      const o = element(paper, 'option', '', name);
      o.value = key;
    }
    paper.value = this.s?.doc.background || 'dots';
    paper.addEventListener('change', () => this.commitMeta({ background: paper.value }));
    this.numberField(
      p,
      'Espaço entre linhas / grade',
      this.s.doc.paperSpacing || 28,
      8,
      200,
      (v) => this.commitMeta({ paperSpacing: v }),
      1
    );
    this.choiceField(
      p,
      'Tipo de grade',
      this.s.doc.gridStyle || 'cartesian',
      [
        ['cartesian', 'Cartesiana'],
        ['isometric', 'Isométrica']
      ],
      (v) => this.commitMeta({ gridStyle: v })
    );
    for (const [label, fn] of [
      ['Modelos de página', () => this.openTemplates()],
      ['Réguas e guias desta página', () => this.openDraftingPanel()],
      ['Regiões e minimapa', () => this.openRegions()],
      ['Abrir camadas', () => this.setLayerDockOpen(true)],
      ['Criar nota vinculada a esta página', () => this.createLinkedNote()],
      ['Copiar incorporação para nota', () => this.copyEmbed()]
    ])
      button(p, label, fn).className = 'si-menu-action';
    const prefsSection = element(p, 'details', 'si-menu-accordion si-preferences-links');
    element(prefsSection, 'summary', '', 'Preferências do plugin');
    for (const [label, fn] of [
      ['Precisão e encaixes', () => this.openPrecision()],
      ['Interface e gestos', () => this.openInterface()],
      ['Atalhos e pincéis favoritos', () => this.openWorkflow()],
      ['Personalizar radial e zoom', () => this.openRadialSettings()],
      ['Perfis da mesa digitalizadora', () => this.openDeviceProfiles()],
      ['Navegação e medidas', () => this.openNavigation()]
    ])
      button(prefsSection, label, fn).className = 'si-menu-action';
    const filesSection = element(p, 'details', 'si-menu-accordion');
    element(filesSection, 'summary', '', 'Arquivo e segurança');
    this.backupControl(filesSection);
    for (const [label, fn] of [
      ['Salvar agora', () => this.save()],
      ['Exportar e imprimir', () => this.openExportOptions()],
      ['Baixar cópia editável', () => this.download()],
      ['Cópias de recuperação', () => this.openRecovery()],
      ['Histórico visual', () => this.openSessionHistory()],
      ['Diagnóstico de desempenho', () => this.openPerformance()]
    ])
      button(filesSection, label, fn).className = 'si-menu-action';
    p.focus();
  };
  P.openPrecision = function () {
    const p = this.makePanel(
      this.pageButton || this.organizeButton,
      'Precisão e encaixes',
      'precision'
    );
    const s = this.plugin.settings,
      save = () => {
        this.snapLock = null;
        this.snapMarker = null;
        void this.plugin.savePreferences();
        this.drawOverlay();
      };
    element(p, 'div', 'si-menu-section', 'Encaixe de pontos');
    let reflect = () => {};
    this.toggleField(p, 'Ativar encaixe de pontos', s.snapPoints, (v) => {
      s.snapPoints = v;
      save();
      reflect();
    });
    const options = element(p, 'div', 'si-snap-subsettings');
    options.setAttribute('role', 'group');
    options.setAttribute('aria-label', 'Opções dependentes do encaixe de pontos');
    const dependents = [];
    const toggle = (label, key) =>
      dependents.push(
        this.toggleField(options, label, s[key] !== false, (v) => {
          s[key] = v;
          save();
          reflect();
        })
      );
    toggle('Fechar traço na própria origem', 'snapOrigin');
    toggle('Encaixar em outros objetos', 'snapObjects');
    const writing = this.toggleField(
      options,
      'Atrair escrita livre para outros objetos',
      s.snapWriting,
      (v) => {
        s.snapWriting = v;
        save();
      }
    );
    reflect = () => {
      options.classList.toggle('si-settings-disabled', !s.snapPoints);
      for (const input of dependents) {
        input.disabled = !s.snapPoints;
        input.title = s.snapPoints ? '' : 'Ative Encaixe de pontos para usar esta opção.';
      }
      writing.disabled = !s.snapPoints || !s.snapObjects;
      writing.title = writing.disabled
        ? 'Ative Encaixe de pontos e Encaixar em outros objetos.'
        : '';
    };
    element(
      options,
      'p',
      'si-panel-copy',
      'Desligue “Fechar traço na própria origem” para desenhar livremente sem perder o encaixe entre objetos.'
    );
    element(p, 'div', 'si-menu-section', 'Tipos de âncora');
    for (const [key, label] of [
      ['endpoints', 'Extremidades'],
      ['corners', 'Cantos'],
      ['midpoints', 'Meios e pontos cardinais']
    ]) {
      this.toggleField(p, label, s.snapTypes[key] !== false, (v) => {
        s.snapTypes[key] = v;
        save();
      });
    }
    this.numberField(p, 'Distância de encaixe (pixels)', s.snapRadius, 3, 24, (v) => {
      s.snapRadius = v;
      save();
    });
    element(p, 'div', 'si-menu-section', 'Guias e formas');
    this.toggleField(p, 'Mostrar guias', s.guidesVisible, (v) => {
      s.guidesVisible = v;
      save();
    });
    this.toggleField(p, 'Encaixar nas guias', s.guideSnap, (v) => {
      s.guideSnap = v;
      save();
    });
    this.toggleField(p, 'Guias inteligentes ao mover', s.smartGuides, (v) => {
      s.smartGuides = v;
      save();
    });
    this.toggleField(p, 'Corrigir forma ao segurar', s.holdShapes, (v) => {
      s.holdShapes = v;
      save();
    });
    this.numberField(
      p,
      'Tempo para corrigir forma (ms)',
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
      p,
      'p',
      'si-panel-copy',
      'Alt suspende os encaixes durante o gesto. O encaixe nas guias funciona independentemente do encaixe nos pontos.'
    );
    button(p, 'Testar minha escrita', () => this.openCalibration(s.lastBrush)).className =
      'si-menu-action';
    button(p, '← Documento e configurações', () => this.openPagePanel(this.pageButton)).className =
      'si-menu-action si-nav-back';
    // Dependent switches visibly disable while their parent feature is off.
    reflect();
  };
  // Brush flyouts invoked via the radial menu are placed beside the pen,
  // unless the person saved a custom location by dragging that panel.
  before('makePanel', function (old, anchor, title, kind) {
    const origin = this.qualityBrushPosition;
    this.qualityBrushPosition = null;
    const panel = old.call(this, anchor, title, kind);
    if (origin && Brushes.SPECS[kind] && !this.plugin.settings.panelPositions[kind]) {
      const rect = this.root.getBoundingClientRect(),
        x = origin.x - rect.left,
        y = origin.y - rect.top;
      const px = x + 305 < this.root.clientWidth ? x + 16 : x - 300;
      const left = Ink.clamp(px, 8, Math.max(8, this.root.clientWidth - 304));
      const top = Ink.clamp(y - 160, 8, Math.max(8, this.root.clientHeight - 240));
      panel.style.left = left + 'px';
      panel.style.top = top + 'px';
      panel.style.maxHeight = Math.max(100, this.root.clientHeight - top - 12) + 'px';
    }
    return panel;
  });
  // Layer dock: only document metadata is committed; selection and z-order retain undo semantics.
  before('build', function (old, ...args) {
    const result = old.apply(this, args);
    // Keep the toolbar zoom, but consolidate redundant history buttons under
    // ••• → Navegação e medidas instead of a second competing toolbar cluster.
    const zoomGroups = Array.from(this.toolbar.children).filter((node) =>
      (node.className || '').split(/\s+/).includes('si-toolbar-zoom')
    );
    if (zoomGroups[1]) zoomGroups[1].remove();
    const dock = element(this.root, 'div', 'si-layer-dock');
    this.layerDock = dock;
    dock.hidden = true;
    const toggle = control(
      dock,
      'Mostrar camadas',
      'layers',
      () => this.setLayerDockOpen(!this.layerDockOpen),
      'si-layer-toggle'
    );
    this.layerToggle = toggle;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'si-layers-' + Math.random().toString(36).slice(2));
    this.layerCounter = element(toggle, 'span', 'si-layer-counter', '0');
    const sheet = element(dock, 'div', 'si-layer-sheet');
    this.layerSheet = sheet;
    sheet.id = toggle.getAttribute('aria-controls');
    sheet.setAttribute('role', 'region');
    sheet.setAttribute('aria-label', 'Camadas do documento');
    sheet.hidden = true;
    this.listen(
      this.root.ownerDocument,
      'pointerdown',
      (e) => {
        if (this.layerDockOpen && !dock.contains(e.target) && !this.flyout?.contains(e.target))
          this.setLayerDockOpen(false);
      },
      true
    );
    this.renderLayerDock();
    return result;
  });
  P.setLayerDockOpen = function (open) {
    this.layerDockOpen = !!open && !!this.s;
    if (!this.layerSheet) return;
    this.layerSheet.hidden = !this.layerDockOpen;
    this.layerDock.classList.toggle('is-open', this.layerDockOpen);
    this.layerToggle.setAttribute('aria-expanded', String(this.layerDockOpen));
    this.layerToggle.setAttribute(
      'aria-label',
      this.layerDockOpen ? 'Ocultar camadas' : 'Mostrar camadas'
    );
    if (this.layerDockOpen) {
      this.closePanel();
      this.renderLayerDock();
    }
  };
  P.selectLayerAt = function (delta) {
    if (!this.s) return;
    const layers = this.s.doc.layers,
      index = layers.findIndex((l) => l.id === this.s.doc.activeLayer);
    const layer = layers[index + delta];
    if (layer) this.commitMeta({ activeLayer: layer.id });
  };
  P.layerOrder = function (id, delta) {
    const layers = this.s.doc.layers.slice(),
      i = layers.findIndex((l) => l.id === id),
      j = i + delta;
    if (i < 0 || j < 0 || j >= layers.length) return;
    // Background layer always stays behind the ink.
    if (layers[i].id === 'background' || layers[j].id === 'background') return;
    [layers[i], layers[j]] = [layers[j], layers[i]];
    this.commitMeta({ layers });
  };
  P.renderLayerDock = function () {
    if (!this.layerSheet || !this.s) return;
    const doc = this.s.doc;
    this.layerCounter.textContent = String(doc.layers.length);
    const active = doc.layers.find((l) => l.id === doc.activeLayer);
    this.layerToggle.title = 'Camadas · ' + (active?.name || 'Nenhuma');
    if (!this.layerDockOpen) return;
    const sheet = this.layerSheet;
    sheet.replaceChildren();
    const heading = element(sheet, 'div', 'si-layer-heading');
    element(heading, 'strong', '', 'Camadas');
    const buttons = element(heading, 'div', 'si-layer-heading-actions');
    const index = doc.layers.findIndex((l) => l.id === doc.activeLayer);
    const up = control(buttons, 'Selecionar camada acima', 'chevron-up', () =>
      this.selectLayerAt(1)
    );
    up.disabled = index >= doc.layers.length - 1;
    const down = control(buttons, 'Selecionar camada abaixo', 'chevron-down', () =>
      this.selectLayerAt(-1)
    );
    down.disabled = index <= 0;
    control(buttons, 'Nova camada', 'plus', () => this.addLayer());
    const list = element(sheet, 'div', 'si-layer-list');
    list.setAttribute('role', 'list');
    for (const [i, layer] of doc.layers.map((l, i) => [i, l]).reverse()) {
      const row = element(list, 'div', 'si-layer-item');
      row.setAttribute('role', 'listitem');
      row.classList.toggle('is-active', layer.id === doc.activeLayer);
      row.classList.toggle('is-hidden-layer', !layer.visible);
      const select = button(row, '', () => {
        if (doc.activeLayer !== layer.id) this.commitMeta({ activeLayer: layer.id });
      });
      select.className = 'si-layer-select';
      select.setAttribute('aria-pressed', String(layer.id === doc.activeLayer));
      select.title = 'Selecionar ' + layer.name;
      element(select, 'span', 'si-layer-dot');
      const text = element(select, 'span', 'si-layer-name', layer.name);
      text.title = layer.name;
      const count = doc.elements.filter((e) => (e.layerId || 'ink') === layer.id).length;
      element(select, 'small', 'si-layer-item-count', String(count));
      const vis = control(
        row,
        layer.visible ? 'Ocultar ' + layer.name : 'Mostrar ' + layer.name,
        layer.visible ? 'eye' : 'eye-off',
        () =>
          this.commitMeta({
            layers: doc.layers.map((l) => (l.id === layer.id ? { ...l, visible: !l.visible } : l))
          })
      );
      vis.setAttribute('aria-pressed', String(layer.visible));
      const lock = control(
        row,
        layer.locked ? 'Desbloquear ' + layer.name : 'Bloquear ' + layer.name,
        layer.locked ? 'lock' : 'lock-open',
        () =>
          this.commitMeta({
            layers: doc.layers.map((l) => (l.id === layer.id ? { ...l, locked: !l.locked } : l))
          })
      );
      lock.setAttribute('aria-pressed', String(layer.locked));
      const more = control(row, 'Mais ações de ' + layer.name, 'more', () =>
        this.openLayerRowOptions(layer.id, more)
      );
    }
    const foot = element(sheet, 'div', 'si-layer-footer');
    control(foot, 'Adicionar camada', 'plus', () => this.addLayer());
    const label = element(foot, 'span', '', active?.name || '');
    label.title = active?.name || '';
    const more = control(foot, 'Opções da camada ativa', 'more', () =>
      this.openLayerRowOptions(doc.activeLayer, more)
    );
  };
  P.addLayer = function () {
    if (!this.s) return;
    if (this.s.doc.layers.length >= 50) {
      new Notice('Limite de 50 camadas.');
      return;
    }
    const layers = this.s.doc.layers;
    const layer = {
      id: Ink.uid(),
      name: 'Camada ' + (layers.length + 1),
      visible: true,
      locked: false
    };
    this.commitMeta({ layers: [...layers, layer], activeLayer: layer.id });
  };
  P.openLayerRowOptions = function (id, anchor) {
    const layer = this.s?.doc.layers.find((l) => l.id === id);
    if (!layer) return;
    const p = this.makePanel(anchor, 'Camada: ' + layer.name, 'layer-actions');
    p.classList.add('si-layer-options');
    const rename = element(p, 'label', 'si-small-field');
    element(rename, 'span', '', 'Nome da camada');
    const input = element(rename, 'input');
    input.type = 'text';
    input.maxLength = 200;
    input.value = layer.name;
    input.setAttribute('aria-label', 'Renomear camada');
    const apply = () => {
      const name = input.value.trim().slice(0, 200);
      if (name && name !== layer.name)
        this.commitMeta({
          layers: this.s.doc.layers.map((l) => (l.id === id ? { ...l, name } : l))
        });
    };
    input.addEventListener('change', apply);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        apply();
        this.setLayerDockOpen(true);
      }
    });
    element(p, 'div', 'si-menu-section', 'Ordem e conteúdo');
    for (const [title, fn] of [
      ['Subir camada', () => this.layerOrder(id, 1)],
      ['Descer camada', () => this.layerOrder(id, -1)],
      [
        'Mover seleção para esta camada',
        () => {
          if (layer.locked || !layer.visible) {
            new Notice('Desbloqueie e mostre a camada primeiro.');
            return;
          }
          const ids = new Set(this.selectedElements().map((e) => e.id));
          if (!ids.size) {
            new Notice('Selecione objetos para mover.');
            return;
          }
          this.commitElements(
            this.s.doc.elements.map((e) => (ids.has(e.id) ? { ...e, layerId: id } : e))
          );
        }
      ],
      [
        'Desbloquear objetos desta camada',
        () =>
          this.commitElements(
            this.s.doc.elements.map((e) =>
              (e.layerId || 'ink') === id ? { ...e, locked: false } : e
            )
          )
      ]
    ])
      button(p, title, () => {
        fn();
        this.closePanel();
        this.renderLayerDock();
      }).className = 'si-menu-action';
    if (layer.id !== 'background' && this.s.doc.layers.length > 1)
      button(p, 'Excluir camada…', () => this.openLayerDelete(id)).className =
        'si-menu-action si-danger-action';
    element(
      p,
      'p',
      'si-panel-copy',
      'Visibilidade e bloqueio podem ser alterados diretamente na lista. Todas as alterações podem ser desfeitas.'
    );
  };
  before('refresh', function (old, ...args) {
    const out = old.apply(this, args);
    if (this.layerDock) this.layerDock.hidden = !this.s;
    this.renderLayerDock();
    return out;
  });
  before('commitMeta', function (old, ...args) {
    const out = old.apply(this, args);
    this.renderLayerDock();
    return out;
  });
  before('commitElements', function (old, ...args) {
    const out = old.apply(this, args);
    this.renderLayerDock();
    return out;
  });
  before('undo', function (old, ...args) {
    const out = old.apply(this, args);
    this.renderLayerDock();
    return out;
  });
  before('redo', function (old, ...args) {
    const out = old.apply(this, args);
    this.renderLayerDock();
    return out;
  });
  before('onUnloadFile', async function (old, ...args) {
    this.setLayerDockOpen(false);
    if (this.layerDock) this.layerDock.hidden = true;
    return old.apply(this, args);
  });
  before('onClose', async function (old, ...args) {
    this.setLayerDockOpen(false);
    return old.apply(this, args);
  });
  // Keep layer operations in the dock and apply deletion in a single undoable history step.
  P.deleteLayer = function (id, removeObjects = false) {
    if (!this.editable()) return;
    const doc = this.s.doc;
    if (id === 'background' || doc.layers.length <= 1 || !doc.layers.some((l) => l.id === id))
      return;
    const target =
      doc.layers.find((l) => l.id !== id && l.visible && !l.locked) ||
      doc.layers.find((l) => l.id !== id);
    if (!target) return;
    const previous = Ink.clone({ layers: doc.layers, activeLayer: doc.activeLayer });
    const before = doc.elements;
    const after = removeObjects
      ? before.filter((e) => (e.layerId || 'ink') !== id)
      : before.map((e) => ((e.layerId || 'ink') === id ? { ...e, layerId: target.id } : e));
    const next = {
      layers: doc.layers.filter((l) => l.id !== id),
      activeLayer: doc.activeLayer === id ? target.id : doc.activeLayer
    };
    this.s.history.push(before, after);
    Object.assign(this.s.history.undoStack.at(-1), {
      layerBefore: previous,
      layerAfter: Ink.clone(next)
    });
    doc.elements = after;
    Object.assign(doc, next);
    if (removeObjects) {
      const ids = new Set(after.map((e) => e.id));
      this.selected = new Set([...this.selected].filter((id) => ids.has(id)));
    }
    this.changed();
    this.closePanel();
    this.setLayerDockOpen(true);
    this.renderLayerDock();
  };
  P.openLayerDelete = function (id) {
    const layer = this.s?.doc.layers.find((l) => l.id === id);
    if (!layer || layer.id === 'background' || this.s.doc.layers.length <= 1) return;
    const count = this.s.doc.elements.filter((e) => (e.layerId || 'ink') === id).length;
    const p = this.makePanel(
      this.layerToggle || this.organizeButton,
      'Excluir camada',
      'remove-layer'
    );
    element(
      p,
      'p',
      'si-panel-copy',
      '“' +
        layer.name +
        '” contém ' +
        count +
        ' objeto' +
        (count === 1 ? '' : 's') +
        '. Escolha o destino do conteúdo. É possível desfazer.'
    );
    button(p, 'Manter objetos em outra camada', () => this.deleteLayer(id, false)).className =
      'si-menu-action';
    button(p, 'Excluir camada e objetos', () => this.deleteLayer(id, true)).className =
      'si-menu-action si-danger-action';
    button(p, 'Cancelar', () => {
      this.closePanel();
      this.setLayerDockOpen(true);
    }).className = 'si-menu-action';
  };
  // Compact selection toolbar: keep high-frequency actions in view and place rare actions in overflow.
  const legacySuggestion = P.updateSuggestion;
  P.updateSuggestion = function () {
    if (!this.suggestion) return;
    const selected = this.s && this.mode === 'select' ? this.selectedElements() : [];
    if (!selected.length || this.pending) {
      // Retain shape suggestions, held-shape candidates and drafting messages.
      this.renderLegacySuggestion();
      return;
    }
    this.suggestion.replaceChildren();
    this.suggestion.hidden = false;
    this.suggestion.classList.add('si-selection-actions');
    element(
      this.suggestion,
      'span',
      'si-selection-count',
      selected.length + ' selecionado' + (selected.length > 1 ? 's' : '')
    );
    const group = element(this.suggestion, 'div', 'si-selection-buttons');
    const stroke = selected.some((e) => e.type === 'stroke');
    const shape = selected.some((e) => e.type === 'stroke' && !e.erasures?.length);
    const controls = [
      ['Formatar diagrama', 'align', () => this.openDiagram(), true],
      ['Reconhecer seleção (formas)', 'shapes', () => this.recognizeIds([...this.selected]), shape],
      ['Comparar suavização', 'waves', () => this.openSampleComparison(), stroke],
      [
        'Editar pontos',
        'edit-3',
        () => this.startPointEditing(),
        selected.length === 1 && Ink.pointHandles(selected[0]).length > 0
      ],
      ['Estilo da seleção', 'sliders', () => this.openSelectionStyle(), true]
    ];
    for (const [name, glyph, fn, enabled] of controls) {
      const b = control(group, name, glyph, fn);
      b.disabled = !enabled;
      if (!enabled) {
        b.title =
          name === 'Editar pontos'
            ? 'Selecione um único objeto com pontos editáveis.'
            : name === 'Comparar suavização'
              ? 'Selecione pelo menos um traço de tinta.'
              : 'Selecione um traço de tinta sem apagamentos parciais.';
        b.setAttribute('aria-label', name + ' · ' + b.title);
      }
    }
    const overflow = control(group, 'Mais ações da seleção', 'more', () =>
      this.openSelectionActions(overflow)
    );
    overflow.classList.add('si-selection-overflow');
  };
  // Preserve original candidate-mode controls without inheriting the extra feature toolbar.
  P.renderLegacySuggestion = function () {
    this.suggestion?.classList.remove('si-selection-actions');
    if (legacySuggestion) legacySuggestion.call(this);
    else {
      this.suggestion.replaceChildren();
      this.suggestion.hidden = true;
    }
  };
  P.openSelectionActions = function (anchor) {
    const p = this.makePanel(anchor, 'Ações da seleção', 'selection-actions');
    const selected = this.selectedElements();
    for (const [title, fn, ok] of [
      ['Formatar diagrama', () => this.openDiagram(), true],
      [
        'Reconhecer formas',
        () => this.recognizeIds([...this.selected]),
        selected.some((e) => e.type === 'stroke' && !e.erasures?.length)
      ],
      [
        'Comparar suavização',
        () => this.openSampleComparison(),
        selected.some((e) => e.type === 'stroke')
      ],
      [
        'Editar pontos',
        () => this.startPointEditing(),
        selected.length === 1 && Ink.pointHandles(selected[0]).length > 0
      ],
      ['Propriedades e geometria', () => this.openProperties(), true],
      ['Estilo da seleção', () => this.openSelectionStyle(), true],
      ['Objetos e links', () => this.openObjectOptions(), true],
      [
        'Conectores',
        () => this.openConnectorOptions(),
        selected.some((e) => ['line', 'arrow'].includes(e.type))
      ],
      ['Editar imagem', () => this.openImageOptions(), selected.some((e) => e.type === 'image')],
      [
        'Editar texto',
        () => this.openTextEditor(selected[0]),
        selected.length === 1 && selected[0].type === 'text'
      ],
      ['Agrupar', () => this.groupSelection(), selected.length > 1],
      ['Desagrupar', () => this.groupSelection(true), true],
      ['Duplicar', () => this.duplicateSelection(), true],
      ['Excluir', () => this.deleteSelection(), true]
    ]) {
      if (ok) button(p, title, fn).className = 'si-menu-action';
    }
  };
})(InkView, Ink, Brushes, { element, button, Notice });
