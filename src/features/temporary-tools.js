/* One temporary-tool stack for keyboard and pen buttons, including out-of-order release. */
(function installTemporaryTools(View) {
  const P = View.prototype,
    wrap = (name, fn) => {
      const old = P[name];
      P[name] = function (...args) {
        return fn.call(this, old, ...args);
      };
    };
  P.beginTemporary = function (mode, key) {
    if (this.tempStack?.some((f) => f.key === key)) return;
    this.finish(true);
    this.tempStack ??= [];
    this.tempStack.push({ key, mode: this.mode });
    this.mode = mode;
    this.updateTools();
    this.hint.textContent =
      'Temporário: ' +
      { select: 'Cursor', erase: 'Borracha', pan: 'Navegação' }[mode] +
      ' · solte para retornar';
    if (this.liveStatus) this.liveStatus.textContent = this.hint.textContent;
  };
  P.endTemporary = function (key) {
    const stack = this.tempStack || [],
      i = stack.findIndex((f) => f.key === key);
    if (i < 0) return;
    const frame = stack[i];
    if (i === stack.length - 1) {
      this.finish(true);
      this.mode = frame.mode;
    } else stack[i + 1].mode = frame.mode;
    stack.splice(i, 1);
    this.updateTools();
    if (!stack.length)
      this.hint.textContent =
        'Ferramenta restaurada: ' + (Brushes.SPECS[this.mode]?.label || this.mode);
  };
  wrap('selectTool', function (old, ...args) {
    this.tempStack = [];
    return old.apply(this, args);
  });
  wrap('build', function (old, ...args) {
    const result = old.apply(this, args);
    this.listen(this.win, 'blur', () => {
      if (this.tempStack?.length) {
        this.cancelGesture();
        this.mode = this.tempStack[0].mode;
        this.tempStack = [];
        this.updateTools();
      }
    });
    this.listen(this.root, 'pointerup', (e) => this.endTemporary('pen:' + e.pointerId));
    this.listen(this.root, 'pointercancel', (e) => this.endTemporary('pen:' + e.pointerId));
    return result;
  });
  wrap('finish', function (old, ...args) {
    const pointer = this.active?.pointer,
      result = old.apply(this, args);
    if (pointer !== undefined && !this.active) this.endTemporary('pen:' + pointer);
    return result;
  });
  wrap('down', function (old, e) {
    const s = this.plugin.settings,
      mapping =
        e.button === 2
          ? s.penButtons.secondary
          : e.button === 1
            ? s.penButtons.middle
            : e.button === 5
              ? s.penButtons.eraser
              : null;
    if (
      mapping &&
      ['select', 'pan', 'erase'].includes(mapping) &&
      !this.active &&
      this.editable() &&
      e.pointerType !== 'touch'
    ) {
      this.beginTemporary(mapping, 'pen:' + e.pointerId);
      const input = new Proxy(e, {
        get: (t, k) => (k === 'button' ? 0 : typeof t[k] === 'function' ? t[k].bind(t) : t[k])
      });
      return old.call(this, input);
    }
    return old.call(this, e);
  });
})(InkView);
