/* Contextual editing, bounded background jobs and explicit recognition UX. */
(function installRefinementUI(View) {
  const P = View.prototype,
    wrap = (name, fn) => {
      const old = P[name];
      P[name] = function (...args) {
        return fn.call(this, old, ...args);
      };
    },
    walk = (root) => [root, ...Array.from(root?.children || []).flatMap(walk)];
  P.cancelGeometry = function (slot = 'geometryJob') {
    const job = this[slot];
    if (job) {
      this[slot] = null;
      job.cancel();
    }
  };
  P.runGeometry = function (op, args, slot = 'geometryJob') {
    this.cancelGeometry(slot);
    let worker,
      url,
      timer,
      rejectJob,
      settled = false;
    const win = this.win,
      cleanup = () => {
        clearTimeout(timer);
        worker?.terminate();
        if (url) win.URL.revokeObjectURL(url);
      },
      job = {
        cancel: () => {
          if (settled) return;
          settled = true;
          cleanup();
          rejectJob?.(Object.assign(new Error('Operação cancelada.'), { name: 'AbortError' }));
        }
      };
    job.promise = new Promise((resolve, reject) => {
      rejectJob = reject;
      const done = (error, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (this[slot] === job) this[slot] = null;
        error ? reject(error) : resolve(value);
      };
      if (win.Worker && win.Blob && win.URL?.createObjectURL) {
        try {
          url = win.URL.createObjectURL(
            new win.Blob([SMART_INK_WORKER_SOURCE], { type: 'text/javascript' })
          );
          worker = new win.Worker(url);
          worker.onmessage = (e) =>
            done(e.data.error ? new Error(e.data.error) : null, e.data.result);
          worker.onerror = (e) =>
            done(new Error(e.message || 'Falha no processamento em segundo plano.'));
          timer = setTimeout(
            () => done(new Error('Operação excedeu 15 segundos. Reduza a seleção.')),
            15000
          );
          worker.postMessage({ op, args });
        } catch (e) {
          done(new Error('Não foi possível iniciar o processamento: ' + e.message));
        }
      } else
        timer = setTimeout(() => {
          try {
            done(null, Refinement.run(op, args));
          } catch (e) {
            done(e);
          }
        }, 0);
    });
    this[slot] = job;
    return job;
  };
  P.previewVectorOperation = function (title, op, args, build, onError) {
    // Test doubles/old hosts without Worker keep the same explicit bounded operation semantics.
    if (!this.win.Worker) {
      try {
        const result = Refinement.run(op, args);
        this.previewInkOperation(title, () => build(result));
      } catch (error) {
        if (onError) onError(error);
        else new Notice(error.message);
      }
      return;
    }
    const session = this.s,
      revision = session.revision,
      p = this.makePanel(this.organizeButton, title, 'vector-job');
    element(
      p,
      'p',
      'si-panel-copy',
      'Calculando prévia… Você pode cancelar e continuar trabalhando.'
    ).setAttribute('role', 'status');
    button(p, 'Cancelar', () => this.closePanel());
    const job = this.runGeometry(op, args);
    this.vectorPromise = job.promise
      .then((result) => {
        if (this.flyout !== p) return;
        if (this.s !== session || session.revision !== revision) {
          this.closePanel();
          new Notice('A página mudou; refaça a operação.');
          return;
        }
        this.previewInkOperation(title, () => build(result));
      })
      .catch((error) => {
        if (error.name === 'AbortError' || this.flyout !== p) return;
        if (onError) onError(error);
        else {
          this.closePanel();
          new Notice(error.message);
        }
      });
  };
  P.openGapDiagnosis = function (elements, error) {
    const session = this.s,
      revision = session.revision,
      p = this.makePanel(this.organizeButton, 'Localizar abertura', 'gap-diagnosis');
    element(p, 'p', 'si-panel-copy', error.message);
    const status = element(p, 'p', 'si-panel-copy', 'Procurando extremidades abertas…');
    button(p, 'Fechar', () => this.closePanel());
    const job = this.runGeometry('gaps', { elements, gap: 60 });
    this.vectorPromise = job.promise
      .then((gaps) => {
        if (this.s !== session || session.revision !== revision || this.flyout !== p) return;
        this.gapMarkers = gaps;
        status.textContent = gaps.length
          ? 'Possíveis frestas em laranja. Escolha uma para conferir a ponte antes de aplicar.'
          : 'Nenhuma fresta curta encontrada. Feche manualmente o contorno ou selecione os limites corretos.';
        for (const [i, gap] of gaps.entries())
          button(
            p,
            'Conferir fresta ' + (i + 1) + ' · ' + gap.distance.toFixed(1) + ' unidades',
            () => {
              const source = elements[0],
                bridge = {
                  id: Ink.uid(),
                  type: 'line',
                  color: source.color,
                  width: source.width,
                  opacity: source.opacity,
                  layerId: source.layerId,
                  x1: gap.a.x,
                  y1: gap.a.y,
                  x2: gap.b.x,
                  y2: gap.b.y
                };
              this.previewInkOperation('Fechar fresta', () => [...session.doc.elements, bridge]);
              this.selected.add(bridge.id);
            }
          );
        this.drawOverlay();
      })
      .catch((e) => {
        if (e.name !== 'AbortError' && this.flyout === p) status.textContent = e.message;
      });
  };
  P.executeVectorPoint = function (p) {
    const task = this.vectorTask;
    if (!task || task.session !== this.s || task.revision !== this.s.revision) {
      new Notice('A seleção mudou; escolha novamente a ferramenta.');
      return;
    }
    this.mode = 'select';
    this.vectorTask = null;
    this.trimHover = null;
    this.cancelGeometry('hoverGeometryJob');
    this.updateTools();
    if (task.mode === 'trim') {
      this.previewVectorOperation(
        'Recortar trecho',
        'trim',
        { elements: task.targets, point: p, tolerance: 12 / this.zoom },
        (r) =>
          this.replaceVectors(
            task.targets.filter((e) => e.id === r.targetId),
            r.pieces
          )
      );
      return;
    }
    const layer = this.activeLayer();
    if (!layer?.visible || layer.locked) {
      new Notice('Escolha uma camada visível e desbloqueada.');
      return;
    }
    this.previewVectorOperation(
      'Preencher área',
      'fill',
      {
        elements: task.targets,
        point: p,
        gap: this.fillGap ?? 3,
        style: {
          layerId: layer.id,
          ...Brushes.strokeStyle(this.plugin.settings, this.plugin.settings.lastBrush)
        }
      },
      (fill) => {
        const after = this.s.doc.elements.slice(),
          i = after.findIndex((e) => task.targets.includes(e));
        after.splice(Math.max(0, i), 0, fill);
        return after;
      },
      (error) => this.openGapDiagnosis(task.targets, error)
    );
  };
  P.scheduleTrimHover = function (p) {
    clearTimeout(this.trimHoverTimer);
    this.cancelGeometry('hoverGeometryJob');
    this.trimHover = null;
    const task = this.vectorTask;
    if (task?.mode !== 'trim') return;
    this.trimHoverTimer = setTimeout(() => {
      this.trimHoverTimer = null;
      if (
        this.active ||
        this.vectorTask !== task ||
        this.s !== task.session ||
        this.s.revision !== task.revision
      )
        return;
      const job = this.runGeometry(
        'trim',
        { elements: task.targets, point: p, tolerance: 12 / this.zoom },
        'hoverGeometryJob'
      );
      job.promise
        .then((result) => {
          if (this.vectorTask === task && !this.active && this.s.revision === task.revision) {
            this.trimHover = result.removed;
            this.drawOverlay();
          }
        })
        .catch(() => {});
    }, 90);
  };
  wrap('move', function (old, e) {
    const a = this.active;
    if (a?.mode === 'refine-drag' && a.pointer === e.pointerId) {
      e.preventDefault();
      const p = this.point(e),
        delta = { x: p.x - a.start.x, y: p.y - a.start.y };
      let next;
      if (a.kind === 'nodes') next = Refinement.translateNodes(a.element, a.nodes, delta);
      else if (a.kind === 'bend')
        next = Refinement.bend(a.element, a.segment.index, a.segment.t, delta);
      else if (a.kind === 'ring') next = Refinement.editRing(a.element, a.ring, a.node, p);
      else next = Refinement.parameterEdit(a.element, a.kind, p);
      a.preview = a.before.map((x) => (x.id === next.id ? next : x));
      a.changed = Ink.dist(p, a.start) > 0.2 / this.zoom;
      this.requestRender();
      return;
    }
    const result = old.call(this, e);
    if (this.active?.heldShape)
      this.active.heldShape = Refinement.parameterize(this.active.heldShape);
    if (!this.active && this.vectorTask?.mode === 'trim' && !e.buttons)
      this.scheduleTrimHover(this.point(e));
    return result;
  });
  P.beginRefineDrag = function (e, element, kind, extra = {}) {
    e.preventDefault();
    this.closePanel();
    this.overlay.focus();
    this.overlay.setPointerCapture(e.pointerId);
    this.active = {
      mode: 'refine-drag',
      pointer: e.pointerId,
      session: this.s,
      revision: this.s.revision,
      before: this.s.doc.elements,
      element,
      kind,
      start: this.point(e),
      ...extra
    };
  };
  wrap('down', function (old, e) {
    if (
      this.active ||
      e.button !== 0 ||
      this.spaceDown ||
      this.temporaryMode ||
      e.pointerType === 'touch' ||
      !this.editable()
    )
      return old.call(this, e);
    const p = this.point(e),
      target =
        this.mode === 'select' &&
        (this.regionEditing || this.parameterEditing || this.pointEditing) &&
        this.s.doc.elements.find(
          (x) =>
            x.id === (this.regionEditing || this.parameterEditing || this.pointEditing) &&
            Ink.isEditable(this.s.doc, x)
        );
    if (target && this.mode === 'select') {
      if (this.regionEditing === target.id && target.type === 'region') {
        const entry = Refinement.ringList(target)[this.regionRingIndex || 0];
        const index = entry?.ring
          .slice(0, -1)
          .findIndex((q) => Ink.dist(p, { x: q[0], y: q[1] }) < 10 / this.zoom);
        if (entry?.ring.length <= 257 && index >= 0) {
          this.beginRefineDrag(e, target, 'ring', { ring: this.regionRingIndex || 0, node: index });
          return;
        }
      }
      if (this.parameterEditing === target.id) {
        const h = Refinement.parameterHandles(target).find((h) => Ink.dist(h, p) < 11 / this.zoom);
        if (h) {
          this.beginRefineDrag(e, target, h.key);
          return;
        }
      }
      if (this.pointEditing === target.id && target.type === 'path' && target.nodes.length <= 128) {
        const h = Ink.pointHandles(target).find((h) => Ink.dist(h, p) < 10 / this.zoom);
        if (h && h.index % 3 === 0) {
          const i = h.index / 3;
          this.nodeSelection ??= new Set();
          if (e.shiftKey) {
            this.nodeSelection.has(i) ? this.nodeSelection.delete(i) : this.nodeSelection.add(i);
            this.vectorNodeIndex = i;
            this.drawOverlay();
            return;
          }
          if (!this.nodeSelection.has(i)) this.nodeSelection = new Set([i]);
          this.vectorNodeIndex = i;
          this.beginRefineDrag(e, target, 'nodes', { nodes: new Set(this.nodeSelection) });
          return;
        }
        if (!h) {
          const segment = Refinement.nearest(target, p);
          if (segment && segment.distance < 9 / this.zoom) {
            this.beginRefineDrag(e, target, 'bend', { segment });
            return;
          }
        }
      }
    }
    if (this.mode === 'select' && e.altKey) {
      const hits = this.spatial
        .query({
          x: p.x - 5 / this.zoom,
          y: p.y - 5 / this.zoom,
          w: 10 / this.zoom,
          h: 10 / this.zoom
        })
        .filter((x) => this.selectionAllowed(x) && this.visible.hit(x, p, 5 / this.zoom))
        .reverse()
        .slice(0, 20);
      if (hits.length > 1) {
        e.preventDefault();
        this.openOverlapPicker(hits);
        return;
      }
    }
    return old.call(this, e);
  });
  wrap('finish', function (old, commit, ...args) {
    const a = this.active;
    if (a?.mode === 'refine-drag') {
      this.active = null;
      if (this.overlay.hasPointerCapture(a.pointer)) this.overlay.releasePointerCapture(a.pointer);
      if (commit && a.changed && this.s === a.session && this.s.revision === a.revision) {
        if (a.kind === 'ring')
          this.previewVectorOperation(
            'Editar contorno da região',
            'normalize',
            { element: a.preview.find((e) => e.id === a.element.id) },
            (result) => a.preview.map((e) => (e.id === result.id ? result : e))
          );
        else {
          this.nextHistoryLabel =
            a.kind === 'bend'
              ? 'Ajuste de curva'
              : a.kind === 'nodes'
                ? 'Movimento de nós'
                : 'Parâmetros da forma';
          this.commitElements(a.preview);
        }
      }
      this.requestRender();
      return;
    }
    const start = this.s?.history.undoStack.length,
      c = a?.continuation;
    const result = old.call(this, commit, ...args);
    if (this.s?.history.undoStack.length > start) {
      const op = this.s.history.undoStack.at(-1);
      op.label ??= c
        ? 'Continuação de traço'
        : a?.mode === 'point-edit'
          ? 'Edição de nó'
          : a?.mode === 'erase'
            ? 'Apagamento'
            : a?.stroke
              ? 'Traço'
              : 'Transformação';
    }
    return result;
  });
  wrap('cancelGesture', function (old, ...args) {
    if (this.active?.mode === 'refine-drag') this.finish(false);
    this.nodeSelection = null;
    this.regionEditing = null;
    this.parameterEditing = null;
    this.trimHover = null;
    clearTimeout(this.trimHoverTimer);
    this.cancelGeometry('hoverGeometryJob');
    return old.apply(this, args);
  });
  wrap('correctedShape', function (old, ...args) {
    return Refinement.parameterize(old.apply(this, args));
  });
  P.openRegionEditing = function () {
    const e = this.vectorSelected()[0];
    if (e?.type !== 'region') return;
    const entries = Refinement.ringList(e),
      p = this.makePanel(this.organizeButton, 'Editar contornos e furos', 'region-edit');
    this.pointEditing = null;
    this.parameterEditing = null;
    this.regionEditing = e.id;
    this.regionRingIndex = Ink.clamp(this.regionRingIndex || 0, 0, entries.length - 1);
    this.choiceField(
      p,
      'Contorno',
      String(this.regionRingIndex),
      entries.map((r, i) => [String(i), r.label + ' · ' + (r.ring.length - 1) + ' nós']),
      (v) => {
        this.regionRingIndex = Number(v);
        this.drawOverlay();
      }
    );
    element(
      p,
      'p',
      'si-panel-copy',
      'Arraste um vértice do contorno realçado. Soltar abre uma prévia para validar a nova região. Furos continuam transparentes. Até 256 vértices por contorno para edição direta.'
    );
    button(p, 'Editar no canvas', () => {
      if (entries[this.regionRingIndex].ring.length > 257) {
        new Notice('Contorno muito complexo para edição direta.');
        return;
      }
      this.mode = 'select';
      this.closePanel();
      this.drawOverlay();
    });
  };
  wrap('openVectorNodes', function (old, ...args) {
    if (this.vectorSelected()[0]?.type === 'region') return this.openRegionEditing();
    this.regionEditing = null;
    this.parameterEditing = null;
    this.nodeSelection = null;
    const out = old.apply(this, args);
    if (this.panelKind === 'vector-nodes')
      element(
        this.flyout,
        'p',
        'si-panel-copy',
        'Duplo clique num segmento insere um nó. Shift + clique seleciona vários nós. Arraste a curva entre os nós para modelá-la diretamente.'
      );
    return out;
  });
  wrap('startPointEditing', function (old, ...args) {
    const e = this.vectorSelected()[0];
    if (e?.type === 'region') return this.openRegionEditing();
    this.regionEditing = null;
    this.parameterEditing = null;
    return old.apply(this, args);
  });
  wrap('openShapeParameters', function (old, ...args) {
    old.apply(this, args);
    if (this.flyout)
      button(this.flyout, 'Ajustar dimensões e raio no canvas', () => {
        const e = this.vectorSelected()[0];
        if (!e?.shapeFrame) return;
        this.parameterEditing = e.id;
        this.regionEditing = this.pointEditing = null;
        this.closePanel();
        this.mode = 'select';
        this.hint.textContent = 'Alças azuis: dimensões · laranja: arredondamento · Esc encerra';
        this.drawOverlay();
      });
  });
  P.openOverlapPicker = function (hits) {
    const p = this.makePanel(this.organizeButton, 'Objetos sob o cursor', 'overlap-picker');
    element(
      p,
      'p',
      'si-panel-copy',
      'Passe o cursor ou use Tab para realçar; clique ou pressione Enter para selecionar.'
    );
    for (const [i, e] of hits.entries()) {
      const b = button(p, '');
      b.className = 'si-overlap-item';
      const icon = element(b, 'span', 'si-shape-icon');
      if (!['image', 'text'].includes(e.type)) icon.innerHTML = ShapeKit.icon(e);
      element(
        b,
        'span',
        '',
        i +
          1 +
          '. ' +
          (e.type === 'stroke'
            ? 'Traço'
            : e.type === 'text'
              ? 'Texto'
              : e.type === 'image'
                ? 'Imagem'
                : ShapeKit.label(e)) +
          ' · ' +
          (Ink.layerFor(this.s.doc, e)?.name || 'Camada')
      );
      const show = () => {
        this.overlapHighlight = e;
        this.drawOverlay();
      };
      b.addEventListener('pointerenter', show);
      b.addEventListener('focus', show);
      b.addEventListener('click', () => {
        this.selected = new Set([e.id]);
        this.closePanel();
        this.updateSuggestion();
        this.drawOverlay();
      });
    }
    p.children[2]?.focus?.();
  };
  wrap('commitElements', function (old, after, ...args) {
    const count = this.s?.history.undoStack.length,
      result = old.call(this, after, ...args);
    if (this.s?.history.undoStack.length > count) {
      this.s.history.undoStack.at(-1).label = this.nextHistoryLabel || 'Edição';
    }
    this.nextHistoryLabel = null;
    return result;
  });
  for (const name of ['undo', 'redo'])
    wrap(name, function (old, ...args) {
      const s = this.s,
        op = s?.history[name === 'undo' ? 'undoStack' : 'redoStack'].at(-1),
        result = old.apply(this, args);
      if (op && s === this.s) {
        this.historyFlash = {
          ids: op.changedIds || new Set([...op.before, ...op.after].map((e) => e.id)),
          until: Date.now() + 1000
        };
        const label = op.label || 'Edição';
        this.hint.textContent = (name === 'undo' ? 'Desfeito: ' : 'Refeito: ') + label;
        this.liveStatus && (this.liveStatus.textContent = this.hint.textContent);
        this.drawOverlay();
        clearTimeout(this.historyFlashTimer);
        this.historyFlashTimer = setTimeout(() => {
          this.historyFlash = null;
          this.drawOverlay();
        }, 1000);
      }
      return result;
    });
  // Describe the actual snap target and keep base snap hysteresis unchanged.
  wrap('snapPoint', function (old, ...args) {
    let result = old.apply(this, args);
    const [point, event = {}] = args,
      prefs = this.plugin.settings,
      signature = [
        this.mode,
        prefs.snapPoints,
        prefs.snapObjects,
        prefs.snapWriting,
        prefs.snapIntersections,
        prefs.snapCenters,
        prefs.snapGrid,
        this.s?.doc.paperSpacing
      ].join('|'),
      lock = this.precisionLock;
    if (
      lock &&
      lock.session === this.s &&
      lock.revision === this.s.revision &&
      lock.signature === signature &&
      !event.altKey &&
      !result.anchor &&
      Ink.dist(lock.marker, point) < (prefs.snapRadius * 1.6) / this.zoom
    ) {
      this.snapMarker = lock.marker;
      result = { point: { ...point, x: lock.marker.x, y: lock.marker.y }, anchor: null };
    }
    const marker = this.snapMarker;
    if (marker?.label && !marker.targetId)
      this.precisionLock = { marker, session: this.s, revision: this.s.revision, signature };
    else this.precisionLock = null;
    if (marker) {
      let kind = marker.label || 'Origem do traço';
      if (marker.targetId) {
        const object = this.spatial
          .query({ x: marker.x - 1, y: marker.y - 1, w: 2, h: 2 })
          .find((e) => e.id === marker.targetId);
        kind = object
          ? { endpoints: 'Extremidade', corners: 'Vértice', midpoints: 'Ponto médio / cardinal' }[
              Ink.anchorKind(object, marker)
            ]
          : 'Ponto';
      }
      this.snapDescription =
        kind +
        (this.mode === 'connector' && result.anchor ? ' · vínculo persistente' : ' · alinhamento');
    } else this.snapDescription = null;
    return result;
  });
  wrap('vectorHoverAnchor', function (old, ...args) {
    const anchor = old.apply(this, args);
    if (anchor && !anchor.continuing) {
      const kind = Ink.anchorKind(anchor.object, anchor);
      anchor.label =
        { endpoints: 'Extremidade', corners: 'Vértice', midpoints: 'Ponto médio / cardinal' }[
          kind
        ] + (this.mode === 'connector' ? ' · vínculo persistente' : ' · alinhamento');
    }
    return anchor;
  });
  wrap('drawOverlay', function (old, ...args) {
    old.apply(this, args);
    if (!this.s) return;
    const ctx = this.overlay.getContext('2d');
    ctx.save();
    ctx.lineWidth = 2 / this.zoom;
    const poly = (points, color, close = false) => {
        if (!points?.length) return;
        ctx.strokeStyle = color;
        ctx.beginPath();
        points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        if (close) ctx.closePath();
        ctx.stroke();
      },
      dot = (p, color, r = 5) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r / this.zoom, 0, Math.PI * 2);
        ctx.fill();
      };
    if (this.trimHover) {
      ctx.lineWidth = 5 / this.zoom;
      poly(this.trimHover, '#dc2626');
      ctx.lineWidth = 2 / this.zoom;
    }
    for (const gap of this.gapMarkers || []) {
      poly([gap.a, gap.b], '#d97706');
      dot(gap.a, '#d97706');
      dot(gap.b, '#d97706');
    }
    const target =
      (this.regionEditing || this.parameterEditing || this.pointEditing) &&
      (this.active?.preview || this.s.doc.elements).find(
        (e) => e.id === (this.regionEditing || this.parameterEditing || this.pointEditing)
      );
    if (target?.type === 'region' && this.regionEditing) {
      const entry = Refinement.ringList(target)[this.regionRingIndex || 0];
      if (entry && entry.ring.length <= 257) {
        const points = entry.ring.slice(0, -1).map(([x, y]) => ({ x, y }));
        poly(points, '#0078d4', true);
        points.forEach((p) => dot(p, '#0078d4', 4));
      }
    }
    if (target?.shapeFrame && this.parameterEditing)
      for (const h of Refinement.parameterHandles(target)) {
        dot(h, h.key === 'rounding' ? '#d97706' : '#0078d4', 6);
        ctx.font = 12 / this.zoom + 'px sans-serif';
        ctx.fillText(I18n.t(h.label), h.x + 10 / this.zoom, h.y - 10 / this.zoom);
      }
    if (target?.type === 'path')
      for (const i of this.nodeSelection || []) {
        const n = target.nodes[i];
        if (n) dot(n, '#0078d4', 6);
      }
    const highlights = this.overlapHighlight
      ? [this.overlapHighlight]
      : this.historyFlash && Date.now() < this.historyFlash.until
        ? this.s.doc.elements.filter((e) => this.historyFlash.ids.has(e.id)).slice(0, 50)
        : [];
    for (const e of highlights) {
      const b = Ink.elementBounds(e);
      if (b) {
        ctx.strokeStyle = '#0078d4';
        ctx.strokeRect(
          b.x - 3 / this.zoom,
          b.y - 3 / this.zoom,
          b.w + 6 / this.zoom,
          b.h + 6 / this.zoom
        );
      }
    }
    if (this.snapMarker && this.snapDescription) {
      ctx.fillStyle = '#0078d4';
      ctx.font = 12 / this.zoom + 'px sans-serif';
      ctx.fillText(
        I18n.t(this.snapDescription),
        this.snapMarker.x + 14 / this.zoom,
        this.snapMarker.y + 22 / this.zoom
      );
    }
    ctx.restore();
  });
  wrap('selectTool', function (old, ...args) {
    this.vectorTask = null;
    this.regionEditing = this.parameterEditing = null;
    this.nodeSelection = null;
    this.trimHover = null;
    this.precisionLock = null;
    clearTimeout(this.trimHoverTimer);
    this.cancelGeometry('hoverGeometryJob');
    return old.apply(this, args);
  });
  wrap('armVectorTool', function (old, ...args) {
    this.regionEditing = this.parameterEditing = null;
    this.nodeSelection = null;
    return old.apply(this, args);
  });
  wrap('closePanel', function (old, ...args) {
    this.cancelGeometry();
    this.gapMarkers = null;
    this.overlapHighlight = null;
    return old.apply(this, args);
  });
  wrap('build', function (old, ...args) {
    const result = old.apply(this, args);
    this.liveStatus = element(this.root, 'span', 'si-visually-hidden');
    this.liveStatus.setAttribute('role', 'status');
    this.liveStatus.setAttribute('aria-live', 'polite');
    this.listen(this.overlay, 'dblclick', (e) => {
      const target = this.s?.doc.elements.find(
        (x) => x.id === this.pointEditing && x.type === 'path'
      );
      if (!target || !Ink.isEditable(this.s.doc, target)) return;
      const near = Refinement.nearest(target, this.point(e));
      if (near?.distance < 12 / this.zoom) {
        this.nextHistoryLabel = 'Inserção de nó';
        try {
          const next = VectorOps.insert(target, near.index, near.t);
          this.safeCommit(this.replaceVectors([target], [next]));
          this.vectorNodeIndex = near.index + 1;
          this.nodeSelection = new Set([this.vectorNodeIndex]);
          this.drawOverlay();
        } catch (error) {
          new Notice(error.message);
        }
      }
    });
    this.listen(this.overlay, 'pointerleave', () => {
      clearTimeout(this.trimHoverTimer);
      this.cancelGeometry('hoverGeometryJob');
      this.trimHover = null;
      this.drawOverlay();
    });
    return result;
  });
  for (const name of ['onUnloadFile', 'onClose'])
    wrap(name, function (old, ...args) {
      this.cancelGeometry();
      this.cancelGeometry('hoverGeometryJob');
      clearTimeout(this.trimHoverTimer);
      clearTimeout(this.historyFlashTimer);
      this.regionEditing = this.parameterEditing = null;
      return old.apply(this, args);
    });
})(InkView);
