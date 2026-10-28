/* Settings reuse the original forms and callbacks: there is no second settings model. */
(function installSettingsModal(View) {
  const P = View.prototype,
    wrap = (name, fn) => {
      const old = P[name];
      P[name] = function (...args) {
        return fn.call(this, old, ...args);
      };
    };
  const routes = [
    ['page', 'Documento', 'openPagePanel'],
    ['interface', 'Interface e gestos', 'openInterface'],
    ['workflow', 'Atalhos e favoritos', 'openWorkflow'],
    ['preset-library', 'Biblioteca de pincéis', 'openPresetLibrary'],
    ['precision', 'Precisão e encaixes', 'openPrecision'],
    ['radial-settings', 'Menu radial', 'openRadialSettings'],
    ['device-profiles', 'Mesa digitalizadora', 'openDeviceProfiles'],
    ['navigation', 'Navegação e medidas', 'openNavigation']
  ];
  P.profileCard = function (parent, label, action) {
    const b = button(parent, '', action);
    b.className = 'si-profile-card';
    b.setAttribute('aria-label', label);
    const svg = this.root.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const path = this.root.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
    const d = /pequena/i.test(label)
      ? 'M4 17l3-8 3 8M5 14h4M14 10h6m-6 4h4m-4 4h6'
      : /diagrama/i.test(label)
        ? 'M3 3h7v7H3zM14 14h7v7h-7zM10 6h7v8'
        : /caligraf/i.test(label)
          ? 'M5 19l4-11 8-5 4 4-5 8-11 4Zm0 0 8-8M9 8l7 7'
          : /desenho/i.test(label)
            ? 'M3 19c2-14 7 5 9-7s5-5 9-9M3 22h18'
            : 'M3 17c3-12 5-12 5-5s-2 9 1 4 4-7 4-2 3 4 8-4';
    path.setAttribute('d', d);
    svg.appendChild(path);
    b.appendChild(svg);
    element(b, 'span', '', label);
    return b;
  };
  P.layoutSettingsModal = function () {
    if (!this.settingsShell) return;
    const a = this.floatingArea(),
      w = Math.min(860, a.w),
      h = Math.min(680, a.h);
    Object.assign(this.settingsShell.style, {
      left: a.x + (a.w - w) / 2 + 'px',
      top: a.y + (a.h - h) / 2 + 'px',
      width: w + 'px',
      height: h + 'px'
    });
    this.settingsShell.classList.toggle('si-settings-compact', w < 560);
  };
  P.createSettingsModal = function (anchor) {
    this.settingsOpener = anchor;
    this.settingsBackdrop = element(this.root, 'div', 'si-settings-backdrop');
    this.settingsBackdrop.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.closePanel(true);
    });
    const shell = (this.settingsShell = element(this.root, 'section', 'si-settings-shell'));
    shell.setAttribute('role', 'dialog');
    shell.setAttribute('aria-modal', 'true');
    shell.setAttribute('aria-label', 'Documento e configurações');
    const nav = element(shell, 'nav', 'si-settings-sidebar');
    nav.setAttribute('aria-label', 'Categorias de configurações');
    element(nav, 'strong', 'si-settings-heading', 'Configurações');
    this.settingsLinks = [];
    for (const [kind, label, method] of routes) {
      const b = button(nav, label, () => {
        if (this.panelKind === kind) return;
        this[method]();
        this.flyout?.focus({ preventScroll: true });
      });
      this.settingsLinks.push({ kind, b });
    }
    element(nav, 'p', 'si-panel-copy', 'As preferências são salvas automaticamente.');
    shell.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') e.stopPropagation();
      if (e.key !== 'Tab') return;
      const list = Array.from(
        shell.querySelectorAll?.('button,input,select,textarea,summary,[tabindex="0"]') || []
      ).filter((n) => !n.disabled && !n.hidden && n.getClientRects().length);
      if (!list.length) {
        e.preventDefault();
        return;
      }
      const first = list[0],
        last = list[list.length - 1],
        active = this.root.ownerDocument.activeElement;
      if (e.shiftKey && (active === first || !list.includes(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !list.includes(active))) {
        e.preventDefault();
        first.focus();
      }
    });
    // Prevent keyboard/pointer focus from reaching the drawing surface behind this modal.
    this.settingsInert = [];
    for (const child of Array.from(this.root.children)) {
      if (child === shell || child === this.settingsBackdrop || child === this.flyout) continue;
      this.settingsInert.push([child, child.inert]);
      child.inert = true;
    }
    this.layoutSettingsModal();
  };
  wrap('openPagePanel', function (old, ...args) {
    this.settingsRequested = true;
    try {
      return old.apply(this, args);
    } finally {
      this.settingsRequested = false;
    }
  });
  wrap('makePanel', function (old, ...args) {
    const modal = !!this.settingsShell || this.settingsRequested;
    this.settingsSwitch = modal;
    let p;
    try {
      p = old.apply(this, args);
    } finally {
      this.settingsSwitch = false;
    }
    if (modal) {
      if (!this.settingsShell) this.createSettingsModal(args[0]);
      this.settingsShell.appendChild(p);
      p.classList.add('si-settings-content');
      p.setAttribute('role', 'region');
      for (const { kind, b } of this.settingsLinks)
        b.setAttribute('aria-current', kind === this.panelKind ? 'page' : 'false');
      this.layoutSettingsModal();
    }
    return p;
  });
  wrap('fitFloatingPanel', function (old, p, ...args) {
    if (p && this.settingsShell?.contains(p)) return;
    return old.call(this, p, ...args);
  });
  wrap('constrainFloatingUI', function (old, ...args) {
    const r = old.apply(this, args);
    this.layoutSettingsModal();
    return r;
  });
  wrap('closePanel', function (old, focus = false) {
    const opener = this.settingsOpener,
      r = old.call(this, this.settingsShell ? false : focus);
    if (!this.settingsSwitch && this.settingsShell) {
      this.settingsShell.remove();
      this.settingsBackdrop?.remove();
      this.settingsShell = null;
      this.settingsBackdrop = null;
      this.settingsLinks = [];
      this.settingsOpener = null;
      for (const [node, inert] of this.settingsInert || []) node.inert = inert;
      this.settingsInert = [];
      if (focus) opener?.focus({ preventScroll: true });
    }
    return r;
  });
})(InkView);
