/* Retain original geometry while translating large selections. No point copies per frame. */
(function installSelectionPerformance(View) {
  const P = View.prototype,
    wrap = (name, fn) => {
      const old = P[name];
      P[name] = function (...args) {
        return fn.call(this, old, ...args);
      };
    };
  P.transformPreviewPoint = function (p, tx = {}) {
    const o = tx.origin || { x: 0, y: 0 },
      c = Math.cos(tx.angle || 0),
      s = Math.sin(tx.angle || 0),
      k = tx.scale ?? 1,
      x = p.x - o.x,
      y = p.y - o.y;
    return {
      x: o.x + (c * x - s * y) * k + (tx.dx || 0),
      y: o.y + (s * x + c * y) * k + (tx.dy || 0)
    };
  };
  P.previewBounds = function (b, tx) {
    return Ink.pointBounds(this.handles(b).map((p) => this.transformPreviewPoint(p, tx)));
  };
  P.prepareMovingSelection = function (a) {
    if (a.fastMove) return;
    const selected = a.before.filter((e) => a.selected.has(e.id)),
      ordered = this.layerElements(a.before),
      byId = new Map(a.before.map((e) => [e.id, e]));
    const records = ordered.map((e) => ({
      e,
      b: this.cachedBounds(e),
      moving: a.selected.has(e.id)
    }));
    const links = new Map();
    for (const e of ordered) {
      if (!e.bindings) continue;
      const moving = a.selected.has(e.id),
        points = [];
      for (const [side, x, y] of [
        ['start', 'x1', 'y1'],
        ['end', 'x2', 'y2']
      ]) {
        const binding = e.bindings[side],
          target = binding && byId.get(binding.targetId);
        if (!target || target.bindings) continue;
        const targetMoves = a.selected.has(target.id);
        if (moving && !targetMoves) continue;
        if (!moving && !targetMoves) continue;
        const anchor = Ink.anchors(target)[binding.index];
        if (anchor) points.push({ x, y, anchor, moving: targetMoves });
      }
      if (points.length) links.set(e.id, { e, moving, points });
    }
    a.fastMove = {
      session: this.s,
      box: Ink.bounds(selected),
      records,
      others: records.filter((r) => !r.moving).map((r) => r.b),
      links,
      dx: 0,
      dy: 0,
      tx: {},
      connections: new Map()
    };
  };
  P.flushMovingSelection = function (a) {
    const input = a.moveInput;
    if (!input) return;
    a.moveInput = null;
    if (a.revision !== this.s?.revision || a.moveSession !== this.s) {
      this.cancelGesture();
      return;
    }
    this.prepareMovingSelection(a);
    const fast = a.fastMove;
    let tx = { dx: input.point.x - a.start.x, dy: input.point.y - a.start.y, guides: [] };
    if (a.mode === 'resize') {
      const origin = input.altKey
        ? a.resizeCenter || { x: fast.box.x + fast.box.w / 2, y: fast.box.y + fast.box.h / 2 }
        : a.origin;
      tx = { scale: Ink.resizeScale(a.handle, input.point, origin), origin };
    } else if (a.mode === 'rotate') {
      let angle =
        Math.atan2(input.point.y - a.origin.y, input.point.x - a.origin.x) -
        Math.atan2(a.start.y - a.origin.y, a.start.x - a.origin.x);
      if (input.shiftKey) angle = (Math.round(angle / (Math.PI / 12)) * Math.PI) / 12;
      tx = { angle, origin: a.origin };
    } else if (this.plugin.settings.smartGuides && !input.altKey)
      tx = Ink.alignMove(fast.box, fast.others, tx.dx, tx.dy, 7 / this.zoom);
    fast.tx = tx;
    fast.dx = tx.dx || 0;
    fast.dy = tx.dy || 0;
    this.smartLines = tx.guides || [];
    a.changed =
      a.mode === 'move-selection'
        ? Math.hypot(fast.dx, fast.dy) > 0.5 / this.zoom
        : Math.abs((tx.scale ?? 1) - 1) > 1e-6 || Math.abs(tx.angle || 0) > 1e-6;
    fast.connections.clear();
    for (const [id, link] of fast.links) {
      const e = link.moving ? Ink.transform(link.e, tx) : { ...link.e };
      for (const p of link.points) {
        const q = p.moving ? this.transformPreviewPoint(p.anchor, tx) : p.anchor;
        e[p.x] = q.x;
        e[p.y] = q.y;
      }
      fast.connections.set(id, e);
    }
  };
  wrap('move', function (old, e) {
    const a = this.active;
    if (
      !['move-selection', 'resize', 'rotate'].includes(a?.mode) ||
      a.selected.size < 32 ||
      e.pointerId !== a.pointer
    )
      return old.call(this, e);
    e.preventDefault();
    this.lastPointer = { x: e.clientX, y: e.clientY };
    const point = this.point(e);
    if (
      a.mode === 'move-selection' &&
      !a.dragStarted &&
      Ink.dist(point, a.start) * this.zoom < this.plugin.settings.selectionSlop
    )
      return;
    a.dragStarted = true;
    a.moveSession ??= this.s;
    a.moveInput = { point, altKey: !!e.altKey, shiftKey: !!e.shiftKey };
    if (a.moveFrame == null)
      a.moveFrame = this.win.requestAnimationFrame(() => {
        a.moveFrame = null;
        if (this.active !== a) return;
        this.flushMovingSelection(a);
        if (this.active === a) this.render();
      });
  });
  P.paintMovingSelection = function (ctx, view) {
    const fast = this.active.fastMove,
      visible = [];
    for (const r of fast.records) {
      const connection = fast.connections.get(r.e.id),
        b = connection
          ? Ink.elementBounds(connection)
          : r.moving
            ? this.previewBounds(r.b, fast.tx)
            : r.b;
      if (
        b.x > view.x + view.w ||
        b.y > view.y + view.h ||
        b.x + b.w < view.x ||
        b.y + b.h < view.y
      )
        continue;
      visible.push(r.e);
      ctx.save();
      if (!connection && r.moving) {
        const tx = fast.tx,
          o = tx.origin || { x: 0, y: 0 };
        ctx.translate((tx.dx || 0) + o.x, (tx.dy || 0) + o.y);
        ctx.rotate(tx.angle || 0);
        ctx.scale(tx.scale ?? 1, tx.scale ?? 1);
        ctx.translate(-o.x, -o.y);
      }
      this.paint(ctx, connection || r.e);
      ctx.restore();
    }
    return visible;
  };
  // Avoid walking all selected points again just to draw a translated bounding box.
  wrap('drawOverlay', function (old, ...args) {
    const fast = this.active?.fastMove;
    if (!fast) return old.apply(this, args);
    const ctx = this.prepare(this.overlay),
      b = this.previewBounds(fast.box, fast.tx);
    this.drawDrafting(ctx);
    ctx.strokeStyle = '#0078d4';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 1.3 / this.zoom;
    ctx.setLineDash([]);
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    const size = (this.selectionPointer === 'pen' ? 13 : 9) / this.zoom;
    for (const p of this.handles(b)) {
      ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
      ctx.strokeRect(p.x - size / 2, p.y - size / 2, size, size);
    }
    const view = this.viewportBounds();
    ctx.strokeStyle = '#dd44aa';
    ctx.setLineDash([4 / this.zoom, 3 / this.zoom]);
    for (const g of this.smartLines) {
      ctx.beginPath();
      if (g.axis === 'x') {
        ctx.moveTo(g.value, view.y);
        ctx.lineTo(g.value, view.y + view.h);
      } else {
        ctx.moveTo(view.x, g.value);
        ctx.lineTo(view.x + view.w, g.value);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  });
  wrap('finish', function (old, ...args) {
    const a = this.active;
    if (a?.moveFrame != null) {
      this.win.cancelAnimationFrame(a.moveFrame);
      a.moveFrame = null;
    }
    if (a?.moveInput) this.flushMovingSelection(a);
    if (this.active === a && a?.fastMove) {
      const fast = a.fastMove;
      if (a.revision !== this.s?.revision || fast.session !== this.s) {
        this.cancelGesture();
        return;
      }
      if (a.changed)
        a.preview = Ink.resolveConnections(
          a.before.map((e) => {
            if (!a.selected.has(e.id)) return e;
            const moved = Ink.transform(e, fast.tx);
            if (moved.bindings) {
              moved.bindings = { ...moved.bindings };
              for (const side of Object.keys(moved.bindings))
                if (!a.selected.has(moved.bindings[side].targetId)) delete moved.bindings[side];
            }
            this.retainTransformedPath?.(e, moved, fast.tx);
            return moved;
          })
        );
    }
    return old.apply(this, args);
  });
  wrap('cancelGesture', function (old, ...args) {
    const a = this.active;
    if (a?.moveFrame != null) this.win.cancelAnimationFrame(a.moveFrame);
    if (a) a.moveInput = null;
    return old.apply(this, args);
  });
  for (const name of ['onClose', 'onUnloadFile'])
    wrap(name, function (old, ...args) {
      if (this.active?.moveSession) this.cancelGesture();
      return old.apply(this, args);
    });
})(InkView);
