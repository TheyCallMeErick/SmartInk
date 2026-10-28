/* 0.16: contextual construction tools; all destructive actions have preview + undo. */
(function installVectorTools(View) {
  const P = View.prototype,
    wrap = (name, fn) => {
      const old = P[name];
      P[name] = function (...args) {
        return fn.call(this, old, ...args);
      };
    };
  const section = (panel, title, open = false) => {
    const box = element(panel, 'details', 'si-menu-accordion');
    box.open = open;
    element(box, 'summary', '', title);
    return box;
  };
  const action = (panel, title, fn, enabled = true, reason = '') => {
    const b = button(panel, title, fn);
    b.className = 'si-menu-action si-structured-action';
    b.disabled = !enabled;
    if (reason) b.title = reason;
    return b;
  };
  P.vectorSelected = function () {
    return this.selectedElements().filter((e) => Ink.isEditable(this.s.doc, e));
  };
  P.replaceVectors = function (selected, replacements) {
    const ids = new Set(selected.map((e) => e.id)),
      first = this.s.doc.elements.findIndex((e) => ids.has(e.id)),
      out = [];
    this.s.doc.elements.forEach((e, i) => {
      if (i === first) out.push(...replacements);
      if (!ids.has(e.id)) out.push(e);
    });
    const byId = new Map(replacements.map((e) => [e.id, e]));
    return out.map((e) => {
      if (!e.bindings) return e;
      const next = { ...e, bindings: { ...e.bindings } };
      for (const [key, b] of Object.entries(e.bindings)) {
        if (!ids.has(b.targetId)) continue;
        const target = byId.get(b.targetId),
          anchors = target ? Ink.anchors(target) : [],
          point = { x: e[key === 'start' ? 'x1' : 'x2'], y: e[key === 'start' ? 'y1' : 'y2'] },
          anchor = anchors.sort((a, b) => Ink.dist(point, a) - Ink.dist(point, b))[0];
        if (anchor) next.bindings[key] = { targetId: target.id, index: anchor.index };
        else delete next.bindings[key];
      }
      return next;
    });
  };
  P.openVectorTools = function () {
    this.finish(false);
    const selected = this.vectorSelected(),
      p = this.makePanel(this.organizeButton, 'Construir e editar', 'vector-tools');
    p.classList.add('si-vector-panel');
    element(
      p,
      'p',
      'si-panel-copy',
      selected.length
        ? selected.length +
            ' objeto(s) selecionado(s). Operações mostram uma prévia antes de aplicar.'
        : 'Selecione contornos com o cursor para habilitar as operações.'
    );
    const booleans = section(p, 'Combinar formas', selected.length >= 2),
      valid = selected.length >= 2 && selected.every(VectorOps.closed);
    for (const [op, label] of [
      ['union', 'Unir áreas'],
      ['difference', 'Subtrair da forma de trás'],
      ['intersection', 'Manter interseção'],
      ['xor', 'Excluir sobreposições']
    ])
      action(
        booleans,
        label,
        () =>
          this.previewVectorOperation(
            label,
            'boolean',
            { elements: selected, kind: op },
            (result) => this.replaceVectors(selected, [result])
          ),
        valid,
        'Selecione pelo menos duas formas fechadas na mesma camada.'
      );
    element(
      booleans,
      'small',
      'si-panel-copy',
      'Na subtração, a forma de trás é a base. Os demais objetos retiram área dela. O resultado usa o estilo da base.'
    );
    const cuts = section(p, 'Recortar e preencher', selected.length > 0);
    action(
      cuts,
      'Recortar entre interseções…',
      () => this.armVectorTool('trim'),
      selected.length >= 2,
      'Selecione o contorno e as linhas que o cruzam.'
    );
    this.numberField(
      cuts,
      'Tolerância de aberturas (unidades da página)',
      this.fillGap ?? 3,
      0,
      20,
      (v) => (this.fillGap = v),
      0.5
    );
    action(
      cuts,
      'Preencher área fechada…',
      () => this.armVectorTool('region-fill'),
      selected.length > 0,
      'Selecione os contornos que delimitam a área.'
    );
    element(
      cuts,
      'small',
      'si-panel-copy',
      'Clique no trecho a remover ou dentro da área a preencher. Você poderá cancelar a prévia. Curvas recortadas usam aproximação poligonal.'
    );
    const curves = section(p, 'Curvas e nós', selected.length === 1);
    if (selected[0]?.type === 'region')
      action(
        curves,
        'Editar contornos e furos…',
        () => this.openRegionEditing(),
        selected.length === 1
      );
    action(
      curves,
      'Editar nós Bézier…',
      () => this.openVectorNodes(),
      selected.length === 1 && !['image', 'text', 'region'].includes(selected[0]?.type)
    );
    this.toggleField(
      curves,
      'Continuar traços pelas extremidades',
      !!this.plugin.settings.continueInk,
      (v) => {
        this.plugin.settings.continueInk = v;
        void this.plugin.savePreferences();
      }
    );
    this.toggleField(
      curves,
      'Mostrar encaixe antes de tocar',
      this.plugin.settings.hoverSnap !== false,
      (v) => {
        this.plugin.settings.hoverSnap = v;
        this.hoverVector = null;
        void this.plugin.savePreferences();
        this.drawOverlay();
      }
    );
    element(
      curves,
      'small',
      'si-panel-copy',
      'Continuar usa o pincel, a pressão e a suavização do traço original. Alt inicia um traço separado.'
    );
    const construction = section(p, 'Repetição e relações');
    action(
      construction,
      'Repetir com deslocamento e rotação…',
      () => this.openVectorRepeat(),
      selected.length > 0
    );
    const line = selected.find((e) => e.type === 'line' && !e.connector),
      circle = selected.find((e) => e.type === 'circle');
    action(
      construction,
      'Manter linha tangente ao círculo',
      () =>
        this.previewInkOperation('Tangência persistente', () => {
          const next = Workflow.constrain(
            { ...line, geometryRule: { kind: 'tangent', targetId: circle.id } },
            circle,
            'tangent'
          );
          return this.s.doc.elements.map((e) => (e.id === line.id ? next : e));
        }),
      selected.length === 2 && !!line && !!circle,
      'Selecione uma linha reta e um círculo.'
    );
    action(
      construction,
      'Paralelismo, igualdade e propriedades…',
      () => this.openProperties(),
      selected.length > 0
    );
  };
  P.armVectorTool = function (mode) {
    const targets = this.vectorSelected();
    if (!targets.length) return;
    this.closePanel();
    this.vectorTask = { mode, targets, session: this.s, revision: this.s.revision };
    this.mode = mode;
    this.pointEditing = null;
    this.updateTools();
    this.hint.textContent =
      mode === 'trim'
        ? 'Recortar: clique no trecho entre interseções. Esc sai.'
        : 'Preencher: clique dentro de uma área delimitada pela seleção. Esc sai.';
    this.overlay.style.cursor = 'crosshair';
    this.overlay.focus();
  };
  P.executeVectorPoint = function (p) {
    const task = this.vectorTask;
    if (!task || task.session !== this.s || task.revision !== this.s.revision) {
      new Notice('A seleção mudou; escolha a ferramenta novamente.');
      return;
    }
    const selected = task.targets;
    this.mode = 'select';
    this.vectorTask = null;
    this.updateTools();
    this.previewInkOperation(task.mode === 'trim' ? 'Recortar trecho' : 'Preencher área', () => {
      if (task.mode === 'trim') {
        let target = null,
          best = 12 / this.zoom;
        for (const e of selected) {
          if (['image', 'text', 'region', 'arrow'].includes(e.type)) continue;
          for (const r of VectorOps.rings(e))
            for (let i = 1; i < r.length; i++) {
              const d = Ink.segmentDistance(p, r[i - 1], r[i]);
              if (d < best) {
                best = d;
                target = e;
              }
            }
        }
        if (!target) throw new Error('Clique próximo a um contorno selecionado.');
        return this.replaceVectors(
          [target],
          VectorOps.trim(
            target,
            selected.filter((e) => e !== target),
            p
          )
        );
      }
      const layer = this.activeLayer();
      if (!layer?.visible || layer.locked)
        throw new Error('Escolha uma camada visível e desbloqueada.');
      const fill = VectorOps.fill(selected, p, this.fillGap ?? 3, {
          layerId: layer.id,
          ...Brushes.strokeStyle(this.plugin.settings, this.plugin.settings.lastBrush)
        }),
        first = this.s.doc.elements.findIndex((e) => selected.includes(e)),
        after = this.s.doc.elements.slice();
      after.splice(Math.max(0, first), 0, fill);
      return after;
    });
  };
  P.openVectorRepeat = function () {
    const selected = this.vectorSelected();
    if (!selected.length) return;
    const session = this.s,
      revision = session.revision,
      p = this.makePanel(this.organizeButton, 'Repetir seleção', 'vector-repeat'),
      options = { count: 3, dx: 40, dy: 0, angle: 0 };
    let after = null;
    const status = element(p, 'p', 'si-panel-copy');
    status.setAttribute('aria-live', 'polite');
    const preview = () => {
      try {
        if (this.s !== session || this.s.revision !== revision)
          throw new Error('A página mudou; reabra a repetição.');
        after = [
          ...session.doc.elements,
          ...VectorOps.repeat(selected, { ...options, angle: (options.angle * Math.PI) / 180 })
        ];
        if (after.length > 20000) throw new Error('Limite de 20 mil objetos.');
        this.stylePreview = { revision, elements: after };
        status.textContent =
          options.count + ' cópia(s) · ' + options.count * selected.length + ' objetos novos';
        apply.disabled = false;
      } catch (e) {
        after = null;
        this.stylePreview = null;
        status.textContent = e.message;
        apply.disabled = true;
      }
      this.requestRender();
    };
    for (const [key, label, min, max, step] of [
      ['count', 'Quantidade de cópias', 1, 100, 1],
      ['dx', 'Deslocamento horizontal', -10000, 10000, 1],
      ['dy', 'Deslocamento vertical', -10000, 10000, 1],
      ['angle', 'Rotação por cópia (°)', -360, 360, 1]
    ])
      this.numberField(
        p,
        label,
        options[key],
        min,
        max,
        (v) => {
          options[key] = v;
          preview();
        },
        step
      );
    element(
      p,
      'p',
      'si-panel-copy',
      'A rotação usa o centro da seleção original. Deslocamento e ângulo são acumulados a cada cópia; vínculos internos são preservados.'
    );
    const apply = button(p, 'Aplicar cópias', () => {
      if (!after || this.s !== session || session.revision !== revision) {
        new Notice('A página mudou; reabra a repetição.');
        return;
      }
      this.closePanel();
      this.safeCommit(after);
    });
    button(p, 'Cancelar', () => this.closePanel());
    preview();
  };
  P.openVectorNodes = function () {
    const e = this.vectorSelected()[0];
    if (!e) return;
    if (e.type === 'path' && e.nodes.length > 128) {
      new Notice(
        'Este caminho tem mais de 128 nós. Recorte uma parte menor antes de editar alças.'
      );
      return;
    }
    if (e.type !== 'path') {
      this.previewInkOperation('Converter em caminho editável', () =>
        this.replaceVectors([e], [VectorOps.toPath(e)])
      );
      if (this.flyout)
        element(
          this.flyout,
          'p',
          'si-panel-copy',
          'Após aplicar, abra Editar nós Bézier novamente. Tinta com pressão passa a ter espessura uniforme; curvas são amostradas em até 128 nós. Desfazer recupera o original.'
        );
      return;
    }
    this.mode = 'select';
    this.pointEditing = e.id;
    let index = Ink.clamp(this.vectorNodeIndex || 0, 0, e.nodes.length - 1);
    this.vectorNodeIndex = index;
    const p = this.makePanel(this.organizeButton, 'Editar nós Bézier', 'vector-nodes');
    element(
      p,
      'p',
      'si-panel-copy',
      'Arraste os nós brancos e as alças amarelas no canvas. Escolha abaixo o nó para operações exatas. Esc encerra a edição.'
    );
    this.numberField(
      p,
      'Nó selecionado (1–' + e.nodes.length + ')',
      index + 1,
      1,
      e.nodes.length,
      (v) => {
        index = Math.round(v) - 1;
        this.vectorNodeIndex = index;
        this.drawOverlay();
      }
    );
    const perform = (title, fn) =>
      this.previewInkOperation(title, () => this.replaceVectors([e], fn(e, index)));
    for (const [kind, label] of [
      ['corner', 'Canto: alças independentes'],
      ['smooth', 'Suave: alças alinhadas'],
      ['symmetric', 'Simétrico: alças iguais']
    ])
      action(p, label, () => perform(label, (e, i) => [VectorOps.nodeKind(e, i, kind)]));
    action(p, 'Inserir nó no próximo segmento', () =>
      perform('Inserir nó', (e, i) => [VectorOps.insert(e, i)])
    );
    action(p, 'Remover nó', () => perform('Remover nó', (e, i) => [VectorOps.remove(e, i)]));
    action(p, e.closed ? 'Abrir caminho neste nó' : 'Dividir caminho neste nó', () =>
      perform('Dividir caminho', VectorOps.split)
    );
    action(p, 'Continuar editando no canvas', () => {
      this.closePanel();
      this.overlay.focus();
    });
    this.drawOverlay();
  };
  // Query the already-rendered spatial index: no rebuilding, serialization or outline generation on pen-down.
  P.vectorHoverAnchor = function (p, event, continuationOnly = false) {
    if (!this.s || event.altKey) return null;
    const prefs = this.plugin.settings,
      writing = !!Brushes.SPECS[this.mode],
      canContinue =
        writing &&
        prefs.continueInk &&
        !this.shapeAssist &&
        !this.activeLayer()?.drawingAssist &&
        !this.drafting().limit &&
        !this.drafting().ruler?.enabled;
    if (continuationOnly && !canContinue) return null;
    if (
      !canContinue &&
      (!prefs.snapPoints ||
        !prefs.snapObjects ||
        (writing && !prefs.snapWriting && !this.shapeAssist))
    )
      return null;
    const radius = prefs.snapRadius / this.zoom;
    let best = null,
      distance = radius;
    for (const obj of (
      this.spatial?.query({ x: p.x - radius, y: p.y - radius, w: radius * 2, h: radius * 2 }) || []
    ).slice(-64)) {
      if (!Ink.isVisible(this.s.doc, obj)) continue;
      const continuing =
        canContinue &&
        obj.type === 'stroke' &&
        Ink.isEditable(this.s.doc, obj) &&
        obj.layerId === this.s.doc.activeLayer &&
        !obj.erasures?.length &&
        obj.points.length <= 20000;
      if (continuationOnly && !continuing) continue;
      if (
        !continuing &&
        (!prefs.snapPoints ||
          !prefs.snapObjects ||
          (writing && !prefs.snapWriting && !this.shapeAssist))
      )
        continue;
      for (const anchor of Ink.anchors(obj)) {
        if (Ink.erased(obj, anchor)) continue;
        if (!continuing && !prefs.snapTypes?.[Ink.anchorKind(obj, anchor)]) continue;
        const d = Ink.dist(anchor, p);
        if (d < distance) {
          distance = d;
          best = {
            ...anchor,
            object: obj,
            continuing,
            label: continuing ? 'Continuar traço' : 'Encaixar ponto',
            revision: this.s.revision,
            session: this.s
          };
        }
      }
    }
    return best;
  };
  wrap('openOrganize', function (old, ...args) {
    old.apply(this, args);
    action(this.flyout, 'Construir e editar…', () => this.openVectorTools());
  });
  wrap('updateSuggestion', function (old, ...args) {
    const out = old.apply(this, args);
    if (
      this.mode === 'select' &&
      !this.pending?.shape &&
      this.suggestion &&
      this.vectorSelected().length
    )
      action(this.suggestion, 'Construir e editar', () => this.openVectorTools());
    return out;
  });
  wrap('openPrecision', function (old, ...args) {
    old.apply(this, args);
    this.toggleField(
      this.flyout,
      'Prévia de encaixe ao aproximar a caneta',
      this.plugin.settings.hoverSnap !== false,
      (v) => {
        this.plugin.settings.hoverSnap = v;
        void this.plugin.savePreferences();
      }
    );
    this.toggleField(
      this.flyout,
      'Continuar tinta a partir de extremidades',
      !!this.plugin.settings.continueInk,
      (v) => {
        this.plugin.settings.continueInk = v;
        void this.plugin.savePreferences();
      }
    );
  });
  wrap('down', function (old, e) {
    this.hoverVector = null;
    if (this.active) return old.call(this, e);
    if (this.vectorTask && e.button === 0 && !this.spaceDown) {
      if (
        e.pointerType === 'touch' ||
        !this.editable() ||
        (this.plugin.settings.penOnly && e.pointerType !== 'pen')
      )
        return;
      e.preventDefault();
      const task = this.vectorTask;
      this.active = { mode: 'vector-point', pointer: e.pointerId, task, point: this.point(e) };
      this.overlay.setPointerCapture(e.pointerId);
      return;
    }
    const anchor =
      e.button === 0 &&
      !this.spaceDown &&
      !this.temporaryMode &&
      !this.straightHeld(e) &&
      !this.heldKeys.has(this.plugin.settings.brushAdjustKey || 'KeyD')
        ? this.vectorHoverAnchor(this.point(e), e, true)
        : null;
    const out = old.call(this, e);
    const a = this.active;
    if (anchor?.continuing && a?.stroke && Brushes.SPECS[a.mode]) {
      a.continuation = anchor;
      a.recognize = false;
      a.stroke = {
        ...anchor.object,
        id: a.stroke.id,
        points: [{ ...a.rawPoints[0], x: anchor.x, y: anchor.y }]
      };
      a.rawPoints = a.stroke.points;
      this.hint.textContent = 'Continuando traço · mesmo estilo do original · Esc cancela';
    }
    return out;
  });
  wrap('move', function (old, e) {
    const a = this.active;
    if (a?.mode === 'vector-point') return;
    if (a?.heldShape && a.pointer === e.pointerId) {
      const base = a.heldBase,
        p = this.snapPoint(this.point(e), e, null, new Set(), true).point,
        origin = a.holdCenter;
      let angle = 0,
        scale = 1;
      if (base.type === 'line') {
        let q = p;
        if (e.shiftKey || this.straightHeld(e)) q = Ink.snapAngle({ x: base.x1, y: base.y1 }, p);
        a.heldShape = { ...base, x2: q.x, y2: q.y };
        angle = Math.atan2(q.y - base.y1, q.x - base.x1);
      } else {
        let state = a.vectorHeld;
        if (!state || state.base !== base)
          state = a.vectorHeld = { base, source: base, point: a.holdPoint, rotating: !!e.altKey };
        else if (state.rotating !== !!e.altKey)
          state = a.vectorHeld = { base, source: a.heldShape, point: p, rotating: !!e.altKey };
        let source = state.source;
        if (e.shiftKey) {
          if (source.type === 'ellipse')
            source = { ...source, type: 'circle', r: (source.rx + source.ry) / 2 };
          else if (source.type === 'rectangle') source = Workflow.constrain(source, null, 'square');
        }
        if (e.altKey) {
          angle =
            Math.atan2(p.y - origin.y, p.x - origin.x) -
            Math.atan2(state.point.y - origin.y, state.point.x - origin.x);
          if (e.shiftKey) angle = (Math.round(angle / (Math.PI / 12)) * Math.PI) / 12;
        } else
          scale = Ink.clamp(
            Ink.dist(origin, p) / Math.max(1, Ink.dist(origin, state.point)),
            0.2,
            5
          );
        a.heldShape = Ink.transform(source, { scale, angle, origin });
      }
      this.hint.textContent =
        'Forma · ' +
        Math.round((angle * 180) / Math.PI) +
        '° · ' +
        Math.round(scale * 100) +
        '% · Alt gira; Shift restringe · solte para confirmar';
      this.drawOverlay();
      return;
    }
    if (this.active?.continuation) {
      this.active.recognize = false;
    }
    const out = old.call(this, e);
    if (
      !this.active &&
      this.s &&
      e.buttons === 0 &&
      this.plugin.settings.hoverSnap !== false &&
      ['pen', 'mouse'].includes(e.pointerType) &&
      (['primitive', 'connector', 'shape'].includes(this.mode) || Brushes.SPECS[this.mode])
    ) {
      this.hoverVector = this.vectorHoverAnchor(this.point(e), e);
      this.drawOverlay();
    }
    return out;
  });
  wrap('pointEditMove', function (old, p, event) {
    const a = this.active;
    if (a?.element.type !== 'path') return old.call(this, p, event);
    const point =
      a.index % 3 === 0 ? this.snapPoint(p, event, null, new Set([a.element.id]), true).point : p;
    const next = Ink.editPoint(a.element, a.index, point);
    a.preview = Ink.resolveConnections(a.before.map((e) => (e === a.element ? next : e)));
    a.changed = Ink.dist(a.start, p) > 0.2 / this.zoom;
    this.vectorNodeIndex = Math.floor(a.index / 3);
    this.render();
  });
  wrap('finish', function (old, commit, ...args) {
    const a = this.active;
    if (a?.mode === 'vector-point') {
      this.active = null;
      if (this.overlay.hasPointerCapture(a.pointer)) this.overlay.releasePointerCapture(a.pointer);
      if (commit) this.executeVectorPoint(a.point);
      return;
    }
    if (a?.continuation) {
      this.stopHold();
      this.cancelStrokeBackup(a);
      this.active = null;
      if (this.overlay.hasPointerCapture(a.pointer)) this.overlay.releasePointerCapture(a.pointer);
      this.snapMarker = this.snapLock = null;
      const c = a.continuation;
      if (
        commit &&
        this.s === c.session &&
        this.s.revision === c.revision &&
        this.s.doc.elements.includes(c.object)
      ) {
        if (a.stroke.points.length + c.object.points.length > 40000)
          new Notice('Limite de 40 mil pontos para continuar um traço.');
        else if (a.stroke.points.length > 1) {
          const next = VectorOps.continueStroke(c.object, a.stroke, c.index);
          this.commitElements(this.s.doc.elements.map((e) => (e === c.object ? next : e)));
        }
      } else if (commit) new Notice('O traço original mudou; a continuação foi cancelada.');
      this.requestRender();
      return;
    }
    if (a?.mode === 'point-edit' && a.element.type === 'path')
      this.vectorNodeIndex = Math.floor(a.index / 3);
    return old.call(this, commit, ...args);
  });
  wrap('cancelGesture', function (old, ...args) {
    this.hoverVector = null;
    if (this.active?.continuation || this.active?.mode === 'vector-point') this.finish(false);
    if (this.vectorTask) {
      this.vectorTask = null;
      this.mode = 'select';
      this.updateTools();
      this.drawOverlay();
      return;
    }
    return old.apply(this, args);
  });
  wrap('drawOverlay', function (old, ...args) {
    old.apply(this, args);
    if (!this.s || !this.overlay) return;
    const ctx = this.overlay.getContext('2d'),
      target =
        this.pointEditing &&
        (this.active?.preview || this.s.doc.elements).find(
          (e) => e.id === this.pointEditing && e.type === 'path'
        );
    ctx.save();
    if (target) {
      ctx.strokeStyle = '#b07a22';
      ctx.lineWidth = 1 / this.zoom;
      ctx.setLineDash([3 / this.zoom, 3 / this.zoom]);
      ctx.beginPath();
      for (const n of target.nodes)
        for (const h of [n.in, n.out])
          if (h) {
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(h.x, h.y);
          }
      ctx.stroke();
      ctx.setLineDash([]);
      const n = target.nodes[this.vectorNodeIndex || 0];
      if (n) {
        ctx.strokeStyle = '#0078d4';
        ctx.lineWidth = 2 / this.zoom;
        ctx.beginPath();
        ctx.arc(n.x, n.y, 9 / this.zoom, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    const hover = this.hoverVector;
    if (hover && !this.active && hover.session === this.s && hover.revision === this.s.revision) {
      ctx.strokeStyle = hover.continuing ? '#0b875b' : '#0078d4';
      ctx.lineWidth = 2 / this.zoom;
      ctx.beginPath();
      ctx.arc(hover.x, hover.y, 7 / this.zoom, 0, Math.PI * 2);
      ctx.moveTo(hover.x - 11 / this.zoom, hover.y);
      ctx.lineTo(hover.x + 11 / this.zoom, hover.y);
      ctx.moveTo(hover.x, hover.y - 11 / this.zoom);
      ctx.lineTo(hover.x, hover.y + 11 / this.zoom);
      ctx.stroke();
      ctx.font = 12 / this.zoom + 'px sans-serif';
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fillText(I18n.t(hover.label), hover.x + 14 / this.zoom, hover.y - 12 / this.zoom);
    }
    ctx.restore();
  });
  wrap('build', function (old, ...args) {
    const result = old.apply(this, args);
    this.listen(this.overlay, 'pointerleave', () => {
      this.hoverVector = null;
      if (!this.active) this.drawOverlay();
    });
    return result;
  });
  for (const name of ['onUnloadFile', 'onClose'])
    wrap(name, function (old, ...args) {
      this.hoverVector = null;
      this.vectorTask = null;
      return old.apply(this, args);
    });
})(InkView);
