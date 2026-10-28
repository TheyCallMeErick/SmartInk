/* Shared panel navigation and viewport containment. No work is added to pen input. */
(function installUnifiedUX(View) {
  const P = View.prototype,
    wrap = (name, fn) => {
      const old = P[name];
      P[name] = function (...args) {
        return fn.call(this, old, ...args);
      };
    };
  const sections = [
    ['interface', 'Interface', 'openInterface'],
    ['workflow', 'Atalhos e pincéis', 'openWorkflow'],
    ['radial-settings', 'Menu radial', 'openRadialSettings'],
    ['precision', 'Precisão', 'openPrecision']
  ];
  P.floatingArea = function () {
    const r = this.root.getBoundingClientRect(),
      v = this.win.visualViewport;
    const left = Math.max(r.left, v?.offsetLeft || 0),
      top = Math.max(r.top, v?.offsetTop || 0);
    const right = Math.min(
      r.right,
      (v?.offsetLeft || 0) + (v?.width || this.win.innerWidth || r.right)
    );
    const bottom = Math.min(
      r.bottom,
      (v?.offsetTop || 0) + (v?.height || this.win.innerHeight || r.bottom)
    );
    const margin = Math.min(8, Math.max(0, (right - left) / 4), Math.max(0, (bottom - top) / 4));
    return {
      x: left - r.left + margin,
      y: top - r.top + margin,
      w: Math.max(0, right - left - 2 * margin),
      h: Math.max(0, bottom - top - 2 * margin)
    };
  };
  P.fitFloatingPanel = function (panel, area = this.floatingArea()) {
    if (!panel) return;
    panel.style.boxSizing = 'border-box';
    panel.style.minWidth = '0';
    panel.style.minHeight = '0';
    panel.style.maxWidth = area.w + 'px';
    panel.style.maxHeight = area.h + 'px';
    const b = panel.getBoundingClientRect(),
      width = Math.min(b.width || 288, area.w),
      height = Math.min(b.height || 240, area.h);
    const x = Ink.clamp(parseFloat(panel.style.left) || area.x, area.x, area.x + area.w - width);
    const y = Ink.clamp(parseFloat(panel.style.top) || area.y, area.y, area.y + area.h - height);
    panel.style.left = x + 'px';
    panel.style.top = y + 'px';
    panel.style.maxHeight = Math.max(0, area.y + area.h - y) + 'px';
  };
  P.constrainFloatingUI = function () {
    if (!this.root) return;
    const a = this.floatingArea();
    this.fitFloatingPanel(this.flyout, a);
    this.fitFloatingPanel(this.shapePopover, a);
    if (this.radial) {
      const p = this.radial,
        scale = Math.min(1, a.w / 310, a.h / 380),
        half = 150 * scale;
      p.style.setProperty('--si-radial-scale', String(scale));
      p.style.left =
        Ink.clamp(parseFloat(p.style.left) || a.x + half, a.x + half, a.x + a.w - half) + 'px';
      p.style.top =
        Ink.clamp(parseFloat(p.style.top) || a.y + half, a.y + half, a.y + a.h - 220 * scale) +
        'px';
    }
    if (this.layerSheet) {
      // Fixed to the pane/window intersection, independent of dock and toolbar layout.
      const r = this.root.getBoundingClientRect(),
        p = this.layerSheet;
      p.style.position = 'fixed';
      p.style.boxSizing = 'border-box';
      p.style.right = 'auto';
      p.style.bottom = 'auto';
      p.style.width = Math.min(310, a.w) + 'px';
      p.style.maxHeight = a.h + 'px';
      const h = Math.min(p.getBoundingClientRect().height || 350, a.h);
      p.style.left = r.left + a.x + a.w - Math.min(310, a.w) + 'px';
      p.style.top = r.top + a.y + a.h - h + 'px';
    }
  };
  P.scheduleFloatingLayout = function () {
    if (this.floatingFrame || this.disposed) return;
    this.floatingFrame = this.win.requestAnimationFrame(() => {
      this.floatingFrame = null;
      this.constrainFloatingUI();
    });
  };
  wrap('build', function (old, ...args) {
    const result = old.apply(this, args),
      update = () => this.scheduleFloatingLayout();
    if (this.win.ResizeObserver) {
      this.floatingObserver = new this.win.ResizeObserver(update);
      this.floatingObserver.observe(this.root);
      this.cleanups.push(() => this.floatingObserver.disconnect());
    }
    this.listen(this.win, 'resize', update);
    this.listen(this.win, 'scroll', update, true);
    if (this.win.visualViewport) {
      this.listen(this.win.visualViewport, 'resize', update);
      this.listen(this.win.visualViewport, 'scroll', update);
    }
    return result;
  });
  wrap('makePanel', function (old, ...args) {
    if (this.flyout) this.floatingObserver?.unobserve(this.flyout);
    if (this.layerDockOpen) this.setLayerDockOpen(false);
    const p = old.apply(this, args);
    this.fitFloatingPanel(p);
    this.floatingObserver?.observe(p);
    p.addEventListener('toggle', () => this.scheduleFloatingLayout(), true);
    p.addEventListener('input', () => this.scheduleFloatingLayout());
    this.scheduleFloatingLayout();
    return p;
  });
  wrap('closePanel', function (old, ...args) {
    if (this.flyout) this.floatingObserver?.unobserve(this.flyout);
    return old.apply(this, args);
  });
  for (const name of ['openRadial', 'positionShapePopover', 'setLayerDockOpen', 'renderLayerDock'])
    wrap(name, function (old, ...args) {
      const result = old.apply(this, args);
      if (name === 'positionShapePopover' && !this.shapePopover) return result;
      this.constrainFloatingUI();
      this.scheduleFloatingLayout();
      return result;
    });
  for (const [kind, , method] of sections)
    wrap(method, function (old, ...args) {
      const previous =
        sections.some((s) => s[0] === this.panelKind) && this.flyout
          ? { left: this.flyout.style.left, top: this.flyout.style.top }
          : null;
      const result = old.apply(this, args),
        p = this.flyout;
      if (!p) return result;
      if (previous) {
        p.style.left = previous.left;
        p.style.top = previous.top;
      }
      const nav = element(p, 'nav', 'si-settings-nav');
      nav.setAttribute('aria-label', 'Preferências');
      // Keep real buttons and their handlers; changing sections never copies a form's values.
      for (const [key, label, open] of sections) {
        const b = button(nav, label, () => {
          this[open]();
          const active = this.flyout?.querySelector?.('[aria-current="page"]');
          active?.focus({ preventScroll: true });
        });
        b.setAttribute('aria-current', key === kind ? 'page' : 'false');
      }
      const heading = p.children[0];
      if (heading?.after) heading.after(nav);
      button(nav, 'Documento', () => {
        this.openPagePanel(this.pageButton);
        this.flyout?.focus({ preventScroll: true });
      });
      // Older Precision had a second return control; the shared navigation replaces it.
      for (const child of Array.from(p.children))
        if (child.className?.includes('si-nav-back')) child.remove();
      this.fitFloatingPanel(p);
      this.scheduleFloatingLayout();
      return result;
    });
  wrap('onClose', function (old, ...args) {
    if (this.floatingFrame) this.win.cancelAnimationFrame(this.floatingFrame);
    this.floatingFrame = null;
    this.floatingObserver?.disconnect();
    return old.apply(this, args);
  });
})(InkView);
