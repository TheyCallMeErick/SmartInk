/* Shared interaction rules. Runs on UI events, never on each pen sample. */
(function installUXPolish(View) {
  const P = View.prototype,
    wrap = (name, fn) => {
      const old = P[name];
      P[name] = function (...args) {
        return fn.call(this, old, ...args);
      };
    };
  const walk = (n) => [n, ...Array.from(n.children || []).flatMap(walk)];
  let fieldId = 0;
  P.numberField = function (panel, title, value, min, max, change, step = 1) {
    const row = element(panel, 'label', 'si-check-row si-number-field'),
      label = element(row, 'span', 'si-number-label', title),
      input = element(row, 'input');
    input.type = 'number';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(Math.round(value * 10000) / 10000);
    input.setAttribute('aria-label', title);
    const error = element(row, 'small', 'si-field-error');
    error.id = 'si-field-error-' + ++fieldId;
    error.hidden = true;
    input.setAttribute('aria-describedby', error.id);
    let last = Number(value),
      drag = null;
    const valid = () => {
      const n = Number(input.value);
      return input.value.trim() !== '' && Number.isFinite(n) && n >= min && n <= max;
    };
    const check = () => {
      const ok = valid();
      input.setAttribute('aria-invalid', String(!ok));
      error.hidden = ok;
      error.textContent = ok
        ? ''
        : `Informe um valor entre ${min} e ${max}. Esc restaura o anterior.`;
      return ok;
    };
    const commit = () => {
      if (!check()) return;
      const n = Number(input.value);
      if (n !== last) {
        change(n);
        last = n;
      }
    };
    input._siRestore = () => {
      input.value = String(last);
      check();
    };
    input.addEventListener('input', check);
    input.addEventListener('change', commit);
    input.addEventListener('keydown', (e) => {
      if (e.isComposing) return;
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        commit();
      }
      if (e.altKey && e.key === 'Backspace') {
        e.preventDefault();
        e.stopPropagation();
        input.value = String(value);
        commit();
      }
      if (['ArrowUp', 'ArrowDown'].includes(e.key) && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        input.value = String(
          Math.round(
            Ink.clamp(
              (valid() ? Number(input.value) : last) +
                (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1),
              min,
              max
            ) * 1e6
          ) / 1e6
        );
        commit();
      }
    });
    label.title =
      'Arraste para ajustar · Shift: passos maiores · Alt+Backspace no campo: restaurar valor inicial';
    label.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || input.disabled) return;
      e.preventDefault();
      label.setPointerCapture?.(e.pointerId);
      drag = { x: e.clientX, value: last };
    });
    label.addEventListener('pointermove', (e) => {
      if (!drag) return;
      input.value = String(
        Math.round(
          Ink.clamp(
            drag.value + Math.trunc((e.clientX - drag.x) / 6) * step * (e.shiftKey ? 10 : 1),
            min,
            max
          ) * 1e6
        ) / 1e6
      );
      check();
    });
    label.addEventListener('pointerup', () => {
      if (!drag) return;
      drag = null;
      commit();
    });
    label.addEventListener('pointercancel', () => {
      drag = null;
      input._siRestore();
    });
    return input;
  };
  P.showPropertyPending = function () {
    if (!this.flyout || this.propertyMessage?.parentNode === this.flyout) return;
    const box = element(this.flyout, 'div', 'si-pending-edit');
    this.propertyMessage = box;
    box.setAttribute('role', 'status');
    element(
      box,
      'p',
      '',
      'Há alterações em prévia. Aplique ou descarte antes de trocar a seleção.'
    );
    button(box, 'Aplicar prévia', () => {
      const apply = walk(this.flyout).find(
        (n) => n.tagName === 'BUTTON' && I18n.canonical(n) === 'Aplicar alterações'
      );
      apply?.click();
    });
    button(box, 'Continuar editando', () => {
      box.remove();
      this.propertyMessage = null;
    });
    button(box, 'Descartar prévia', () => {
      this.propertyDirty = false;
      this.stylePreview = null;
      this.openShapeParameters();
      this.requestRender();
    });
    box.scrollIntoView?.({ block: 'nearest' });
  };
  P.polishPanel = function (p) {
    if (this.flyout !== p) return;
    for (const b of walk(p).filter((n) => n.tagName === 'BUTTON')) {
      const text = I18n.canonical(b) || '';
      if (/^(Excluir|Apagar|Remover)/.test(text)) {
        b.classList.add('si-destructive-action');
        b.title = b.title || 'Ação de remoção';
      }
      const shortcut = text.match(/^(.*?)\s*\((Shift\+2|Ctrl[^)]*|Cmd[^)]*)\)$/);
      if (shortcut && !b.dataset.siShortcut) {
        b.dataset.siShortcut = shortcut[2];
        b.setAttribute('aria-label', text);
        b.textContent = shortcut[1];
        element(b, 'kbd', 'si-key-hint', shortcut[2]);
      }
      if (b.disabled && !b.title)
        b.title = 'Indisponível para a seleção ou o estado atual do documento.';
    }
    const context = element(
      p,
      'div',
      'si-panel-context',
      this.panelKind === 'shape-inspector'
        ? 'Ferramenta · próximas formas'
        : this.panelKind === 'shape-parameters'
          ? 'Objeto selecionado · alterações em prévia'
          : this.panelKind === 'selection'
            ? 'Seleção atual · prévia até aplicar'
            : Brushes.SPECS[this.panelKind]
              ? 'Próximos traços · ajustes imediatos'
              : ''
    );
    if (context.textContent) p.children[0]?.after?.(context);
    else context.remove();
  };
  wrap('makePanel', function (old, ...args) {
    const p = old.apply(this, args);
    p.addEventListener(
      'click',
      (e) => {
        if (
          e.target.closest?.('[data-si-action="confirm"]') &&
          walk(p).some((n) => n.getAttribute?.('aria-invalid') === 'true')
        ) {
          e.preventDefault();
          e.stopImmediatePropagation();
          walk(p)
            .find((n) => n.getAttribute?.('aria-invalid') === 'true')
            ?.focus();
        }
      },
      true
    );
    p.addEventListener(
      'keydown',
      (e) => {
        if (
          (e.ctrlKey || e.metaKey) &&
          e.key === 'Enter' &&
          walk(p).some((n) => n.getAttribute?.('aria-invalid') === 'true')
        ) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      },
      true
    );
    this.updateEmptyHint?.();
    this.win.requestAnimationFrame(() => this.polishPanel(p));
    return p;
  });
  wrap('closePanel', function (old, ...args) {
    if (this.drawingIntoShapeInspector) return old.apply(this, args);
    const kind = this.panelKind,
      result = old.apply(this, args);
    if (kind === 'shape-parameters') {
      this.propertyTarget = null;
      this.propertyDirty = false;
      this.propertyMessage = null;
    }
    return result;
  });
  wrap('updateSuggestion', function (old, ...args) {
    const out = old.apply(this, args);
    if (
      this.panelKind === 'shape-parameters' &&
      this.propertyDirty &&
      ![...this.selected].includes(this.propertyTarget)
    )
      this.showPropertyPending();
    if (
      this.panelKind === 'shape-parameters' &&
      !this.active &&
      !this.propertyDirty &&
      !this.followingProperties
    ) {
      const selected = this.selectedElements();
      if (
        selected.length === 1 &&
        selected[0].shapeFrame &&
        (selected[0].id !== this.propertyTarget || this.s.revision !== this.propertyRevision)
      ) {
        this.followingProperties = true;
        try {
          this.openShapeParameters();
        } finally {
          this.followingProperties = false;
        }
      } else if (selected.length !== 1 || !selected[0]?.shapeFrame) {
        this.closePanel();
      }
    }
    return out;
  });
  wrap('openBrushPanel', function (old, kind, selection = false) {
    const out = old.call(this, kind, selection);
    if (selection && this.flyout) {
      const selected = this.selectedElements(),
        mixed = [
          ['color', 'cor'],
          ['width', 'espessura'],
          ['opacity', 'opacidade']
        ]
          .filter(([key]) => new Set(selected.map((e) => e[key])).size > 1)
          .map(([, label]) => label);
      if (mixed.length) {
        const text = element(
          this.flyout,
          'p',
          'si-mixed-values',
          'Valores diferentes: ' +
            mixed.join(', ') +
            '. Os controles mostram uma referência; só os ajustes escolhidos serão aplicados.'
        );
        this.flyout.children[0]?.after?.(text);
      }
    }
    return out;
  });
  wrap('refresh', function (old, ...args) {
    const out = old.apply(this, args);
    if (this.undoButton)
      this.undoButton.title = this.undoButton.disabled
        ? 'Nada disponível para desfazer ou documento com falha de salvamento'
        : 'Desfazer · Ctrl/Cmd+Z';
    if (this.redoButton)
      this.redoButton.title = this.redoButton.disabled
        ? 'Nada disponível para refazer ou documento com falha de salvamento'
        : 'Refazer · Ctrl/Cmd+Shift+Z';
    return out;
  });
  wrap('build', function (old, ...args) {
    const out = old.apply(this, args);
    this.status?.setAttribute('role', 'status');
    this.status?.setAttribute('aria-live', 'polite');
    this.overlay.setAttribute(
      'aria-label',
      'Área de desenho. Espaço para navegar; Esc encerra a ação atual.'
    );
    this.listen(
      this.root,
      'pointerdown',
      (e) => {
        if (e.pointerType === 'pen') this.root.classList.add('si-pen-input');
        else if (e.pointerType === 'mouse') this.root.classList.remove('si-pen-input');
      },
      true
    );
    return out;
  });
  wrap('showCanvasFeedback', function (old, message, undo = false) {
    if (this.canvasFeedback?.isConnected && this.lastFeedback === message && !undo) return;
    this.lastFeedback = message;
    const out = old.call(this, message, undo);
    const box = this.canvasFeedback;
    if (box) {
      box.addEventListener('pointerenter', () => clearTimeout(this.feedbackTimer));
      box.addEventListener('focusin', () => clearTimeout(this.feedbackTimer));
    }
    return out;
  });
  // Shift the contextual strip away from an open inspector, without changing canvas geometry.
  wrap('constrainFloatingUI', function (old, ...args) {
    const out = old.apply(this, args);
    if (this.suggestion && this.viewport) {
      const width = this.viewport.clientWidth,
        side = ['shape-parameters', 'shape-inspector'].includes(this.panelKind) && width >= 620;
      this.suggestion.style.maxWidth = side
        ? Math.max(160, width - 340) + 'px'
        : 'calc(100% - 24px)';
      this.suggestion.style.left = side ? (width - 320) / 2 + 'px' : '50%';
    }
    return out;
  });
  P.updateEmptyHint = function () {
    if (this.emptyHint)
      this.emptyHint.hidden =
        !this.s || !!this.s.doc.elements.length || !!this.active || !!this.flyout;
  };
  wrap('build', function (old, ...args) {
    const out = old.apply(this, args);
    const box = element(this.viewport, 'div', 'si-empty-hint');
    this.emptyHint = box;
    box.hidden = true;
    element(box, 'strong', '', 'Sua página está pronta');
    element(box, 'span', '', 'Escreva com a caneta ou escolha uma forma.');
    element(box, 'small', '', 'Espaço: navegar · Ctrl/Cmd+Z: desfazer · Esc: encerrar ação');
    return out;
  });
  wrap('refresh', function (old, ...args) {
    const out = old.apply(this, args);
    this.updateEmptyHint();
    return out;
  });
  wrap('down', function (old, ...args) {
    if (this.emptyHint) this.emptyHint.hidden = true;
    return old.apply(this, args);
  });
  wrap('closePanel', function (old, ...args) {
    const out = old.apply(this, args);
    this.updateEmptyHint();
    return out;
  });
  for (const name of ['pasteImages', 'copySelectionImage'])
    wrap(name, async function (old, ...args) {
      const session = this.s,
        token = {};
      this.uxBusy = token;
      this.root.setAttribute('aria-busy', 'true');
      this.showCanvasFeedback(
        name === 'pasteImages' ? 'Preparando imagens…' : 'Preparando imagem da seleção…'
      );
      try {
        return await old.apply(this, args);
      } finally {
        if (this.uxBusy === token) {
          this.uxBusy = null;
          this.root.setAttribute('aria-busy', 'false');
          if (
            this.s === session &&
            this.canvasFeedback &&
            I18n.canonical(this.canvasFeedback).includes('Preparando')
          ) {
            this.canvasFeedback.remove();
            this.canvasFeedback = null;
          }
        }
      }
    });
})(InkView);
