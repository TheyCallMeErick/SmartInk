/* Small workflow improvements; no extra work in the document rendering loop. */
(function installUsabilityRefinement(View) {
  const P = View.prototype,
    walk = (n) => [n, ...Array.from(n.children || []).flatMap(walk)],
    wrap = (name, fn) => {
      const old = P[name];
      P[name] = function (...args) {
        return fn.call(this, old, ...args);
      };
    };
  P.preferenceOperation = function (label, get, set, action) {
    const before = Ink.clone(get());
    action();
    const after = JSON.stringify(get());
    if (JSON.stringify(before) === after) return;
    this.preferenceUndo = { label, get, set, before, after };
    this.showPreferenceUndo();
  };
  P.showPreferenceUndo = function () {
    this.preferenceUndoBox?.remove();
    const item = this.preferenceUndo;
    if (!item) return;
    const box = (this.preferenceUndoBox = element(
      this.settingsShell || this.root,
      'div',
      'si-preference-undo'
    ));
    box.setAttribute('role', 'status');
    element(box, 'span', '', item.label);
    button(box, 'Desfazer ajuste', () => this.undoPreference());
    button(box, '×', () => box.remove()).setAttribute('aria-label', 'Fechar mensagem');
  };
  P.undoPreference = function () {
    const item = this.preferenceUndo;
    if (!item) return false;
    if (JSON.stringify(item.get()) !== item.after) {
      new Notice('Este ajuste já mudou. Desfazer não substituirá alterações posteriores.');
      return false;
    }
    item.set(Ink.clone(item.before));
    void this.plugin.savePreferences();
    this.preferenceUndo = null;
    this.preferenceUndoBox?.remove();
    this.renderFavorites();
    this.updateTools();
    const kind = this.panelKind;
    if (Brushes.SPECS[kind]) this.openBrushPanel(kind);
    else if (kind === 'workflow') this.openWorkflow();
    return true;
  };
  P.withBrushUndo = function (kind, keys, action) {
    const s = this.plugin.settings;
    this.preferenceOperation(
      'Ajuste do pincel restaurado',
      () => Object.fromEntries(keys.map((k) => [k, s.brushes[kind][k]])),
      (value) => Brushes.updateBrush(s, kind, value),
      action
    );
  };
  P.parameterHelp = function (row, key) {
    const info = {
      streamline: [
        'Estabilização',
        'Reduz tremores acompanhando a trajetória. Valores altos podem atrasar a ponta e arredondar letras pequenas.'
      ],
      smoothing: [
        'Suavização',
        'Arredonda o contorno do traço. Compare a mesma amostra antes e depois para preservar detalhes.'
      ],
      pressureGamma: [
        'Curva de pressão',
        'Muda a resposta à força da caneta. Valores maiores exigem mais pressão para engrossar o traço.'
      ]
    }[key];
    if (!info) return;
    const box = element(row, 'details', 'si-parameter-help');
    element(box, 'summary', '', 'Sobre ' + info[0].toLowerCase());
    element(box, 'p', 'si-panel-copy', info[1]);
    const svg = row.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 120 36');
    svg.setAttribute('aria-hidden', 'true');
    for (const [d, color] of [
      ['M4 26l12-17 12 19 12-18 12 18 12-18 12 18 12-18 12 16', 'var(--text-muted)'],
      [
        key === 'pressureGamma' ? 'M4 30Q65 32 116 4' : 'M4 24Q20 7 34 22T64 22T94 22T116 20',
        'var(--interactive-accent)'
      ]
    ]) {
      const path = row.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', color);
      path.setAttribute('stroke-width', '2');
      svg.appendChild(path);
    }
    box.appendChild(svg);
  };
  P.nearestSelectionHandle = function (p, corners) {
    let found = -1,
      distance = this.selectionTolerance() / this.zoom;
    corners.forEach((q, i) => {
      const d = Ink.dist(p, q);
      if (d < distance) {
        distance = d;
        found = i;
      }
    });
    return found;
  };
  wrap('updateCursor', function (old, e) {
    const r = old.call(this, e),
      b = this.selectionBox();
    if (b) {
      const p = this.point(e),
        index = this.nearestSelectionHandle(p, this.selectionHandles(b));
      if (
        index < 0 &&
        Ink.dist(p, this.rotationHandle(b)) < this.selectionTolerance() / this.zoom
      ) {
        this.overlay.style.cursor = 'grab';
        if (I18n.attribute(this.overlay, 'title') !== 'Girar seleção · Shift encaixa em 15°')
          this.overlay.title = 'Girar seleção · Shift encaixa em 15°';
      } else {
        const title = index >= 0 ? 'Redimensionar seleção' : 'Mover seleção';
        if (index >= 0) this.overlay.style.cursor = index % 2 ? 'nesw-resize' : 'nwse-resize';
        if (I18n.attribute(this.overlay, 'title') !== title) this.overlay.title = title;
      }
    }
    return r;
  });
  P.placePanelAwayFromWork = function (panel) {
    if (
      !panel ||
      this.settingsShell ||
      panel.dataset.siPlaced ||
      this.plugin.settings.panelPositions[this.panelKind]
    )
      return;
    panel.dataset.siPlaced = 'true';
    const a = this.floatingArea(),
      r = panel.getBoundingClientRect(),
      w = Math.min(r.width, a.w),
      h = Math.min(r.height, a.h),
      b = this.selectionBox();
    let avoid = this.lastWritingPoint
      ? { x: this.lastWritingPoint.x - 28, y: this.lastWritingPoint.y - 28, w: 56, h: 56 }
      : null;
    if (b) {
      const o = this.overlay.getBoundingClientRect(),
        root = this.root.getBoundingClientRect(),
        angle = this.camera.angle || 0,
        c = Math.cos(angle),
        s = Math.sin(angle);
      const pts = this.handles(b).map((p) => ({
        x: o.left - root.left + this.camera.x + this.zoom * (p.x * c - p.y * s),
        y: o.top - root.top + this.camera.y + this.zoom * (p.x * s + p.y * c)
      }));
      avoid = Ink.pointBounds(pts);
    }
    if (!avoid) return;
    const initial = {
        x: parseFloat(panel.style.left) || a.x,
        y: parseFloat(panel.style.top) || a.y
      },
      candidates = [
        initial,
        { x: avoid.x + avoid.w + 12, y: avoid.y },
        { x: avoid.x - w - 12, y: avoid.y },
        { x: avoid.x, y: avoid.y - h - 12 },
        { x: avoid.x, y: avoid.y + avoid.h + 12 }
      ].map((p) => ({
        x: Ink.clamp(p.x, a.x, a.x + a.w - w),
        y: Ink.clamp(p.y, a.y, a.y + a.h - h)
      }));
    const score = (p) =>
      Math.max(0, Math.min(p.x + w, avoid.x + avoid.w) - Math.max(p.x, avoid.x)) *
        Math.max(0, Math.min(p.y + h, avoid.y + avoid.h) - Math.max(p.y, avoid.y)) *
        100 +
      Math.hypot(p.x - initial.x, p.y - initial.y);
    candidates.sort((x, y) => score(x) - score(y));
    panel.style.left = candidates[0].x + 'px';
    panel.style.top = candidates[0].y + 'px';
    this.fitFloatingPanel(panel);
  };
  wrap('positionShapePopover', function (old, ...args) {
    if (this.shapePopover?.dataset.siPlaced) {
      this.fitFloatingPanel(this.shapePopover);
      return;
    }
    const r = old.apply(this, args);
    this.placePanelAwayFromWork(this.shapePopover);
    return r;
  });
  wrap('makePanel', function (old, ...args) {
    const p = old.apply(this, args);
    this.win.requestAnimationFrame(() => {
      if (this.flyout === p) this.placePanelAwayFromWork(p);
    });
    return p;
  });
  wrap('down', function (old, e) {
    if (e.button === 0) {
      const r = this.root.getBoundingClientRect();
      this.lastWritingPoint = { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    return old.call(this, e);
  });
  wrap('showCanvasFeedback', function (old, message, undo = false) {
    if (!undo && this.active?.stroke) {
      this.pendingInformational ??= new Map();
      this.pendingInformational.set(message, (this.pendingInformational.get(message) || 0) + 1);
      while (this.pendingInformational.size > 5)
        this.pendingInformational.delete(this.pendingInformational.keys().next().value);
      return;
    }
    return old.call(this, message, undo);
  });
  wrap('finish', function (old, ...args) {
    const tail = this.active?.stroke?.points?.at(-1);
    if (tail) {
      const q = Ink.worldToScreen(tail, this.camera, this.zoom),
        o = this.overlay.getBoundingClientRect(),
        root = this.root.getBoundingClientRect();
      this.lastWritingPoint = { x: q.x + o.left - root.left, y: q.y + o.top - root.top };
    }
    const r = old.apply(this, args);
    if (!this.active && this.pendingInformational?.size) {
      const items = [...this.pendingInformational],
        last = items.at(-1);
      this.pendingInformational.clear();
      this.showCanvasFeedback(last[0] + (last[1] > 1 ? ' (×' + last[1] + ')' : ''));
    }
    return r;
  });
  wrap('onUnloadFile', function (old, ...args) {
    this.brushTestSamples = {};
    this.brushTestSession = null;
    this.pendingInformational?.clear();
    return old.apply(this, args);
  });
  wrap('createSettingsModal', function (old, ...args) {
    const r = old.apply(this, args);
    const oldCatalog = this.settingsCatalog || [];
    this.settingsCatalog = [
      ...SMART_INK_SETTINGS_CATALOG,
      ...oldCatalog.filter(
        (x) => !SMART_INK_SETTINGS_CATALOG.some((y) => y.kind === x.kind && y.label === x.label)
      )
    ];
    for (const item of this.settingsCatalog)
      item.alias =
        (item.alias || '') +
        ' ' +
        ({
          Espessura: 'grossura largura thickness width',
          Suavização: 'smoothing tremor',
          Estabilização: 'stabilization tremor',
          'Criar backups automáticos': 'backup recovery segurança',
          'Densidade dos controles': 'compacto tamanho botoes density size'
        }[item.label] || '') +
        (/^Espessura/.test(item.label) ? ' grossura largura thickness width' : '');
    return r;
  });
  P.editFavorites = function (action) {
    this.preferenceOperation(
      'Favoritos atualizados',
      () => this.plugin.settings.favorites,
      (value) => {
        this.plugin.settings.favorites = value;
      },
      () => {
        action(this.plugin.settings.favorites);
        void this.plugin.savePreferences();
        this.renderFavorites();
        this.openWorkflow();
      }
    );
  };
  wrap('openWorkflow', function (old, ...args) {
    const r = old.apply(this, args),
      p = this.flyout;
    if (this.panelKind !== 'workflow') return r;
    const favorites = this.plugin.settings.favorites,
      rows = Array.from(p.children).filter((n) => n.className === 'si-layer-row');
    for (const [i, f] of favorites.entries()) {
      const row = rows[i];
      if (!row) continue;
      row.replaceChildren();
      row.classList.add('si-favorite-editor');
      const grip = button(row, '↕', () =>
        this.showCanvasFeedback('Arraste para reordenar ou use as setas ao lado do favorito.')
      );
      grip.setAttribute('aria-label', 'Arrastar favorito');
      grip.draggable = true;
      grip.addEventListener('dragstart', (e) => {
        this.favoriteDrag = i;
        e.dataTransfer?.setData('application/x-smart-ink-favorite', String(i));
      });
      row.addEventListener('dragover', (e) => {
        if (this.favoriteDrag !== undefined) e.preventDefault();
      });
      row.addEventListener('drop', (e) => {
        if (this.favoriteDrag === undefined) return;
        e.preventDefault();
        const from = this.favoriteDrag;
        this.favoriteDrag = undefined;
        if (from !== i) this.editFavorites((list) => list.splice(i, 0, list.splice(from, 1)[0]));
      });
      grip.addEventListener('dragend', () => (this.favoriteDrag = undefined));
      const name = element(row, 'input');
      name.value = f.name;
      name.setAttribute('aria-label', 'Nome do favorito');
      name.addEventListener('change', () =>
        this.editFavorites((list) => (list[i].name = name.value.trim().slice(0, 40) || f.name))
      );
      button(row, 'Usar', () => {
        Brushes.updateBrush(this.plugin.settings, f.kind, f.brush);
        this.selectTool(f.kind, false, false);
        void this.plugin.savePreferences();
        this.closePanel();
      });
      button(row, 'Atualizar', () =>
        this.editFavorites((list) => {
          const kind = this.plugin.settings.lastBrush;
          list[i] = { ...list[i], kind, brush: Ink.clone(this.plugin.settings.brushes[kind]) };
        })
      ).title = 'Substituir pelo pincel atual';
      const up = button(row, '↑', () =>
        this.editFavorites((list) => list.splice(i - 1, 0, list.splice(i, 1)[0]))
      );
      up.disabled = i === 0;
      up.setAttribute('aria-label', 'Mover favorito para cima');
      const down = button(row, '↓', () =>
        this.editFavorites((list) => list.splice(i + 1, 0, list.splice(i, 1)[0]))
      );
      down.disabled = i === favorites.length - 1;
      down.setAttribute('aria-label', 'Mover favorito para baixo');
      button(row, 'Remover', () => this.editFavorites((list) => list.splice(i, 1)));
    }
    this.refreshDisabledReasons(p);
    return r;
  });
})(InkView);
