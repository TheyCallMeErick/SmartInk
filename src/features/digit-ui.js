(function installDigitUI(View) {
  const P = View.prototype,
    wrap = (name, fn) => {
      const old = P[name];
      P[name] = function (...args) {
        return fn.call(this, old, ...args);
      };
    };
  P.dismissDigitOffer = function () {
    this.digitOffer?.remove();
    this.digitOffer = null;
    clearTimeout(this.digitTimer);
    this.digitTimer = null;
  };
  P.openDigitAssist = function (chosen = null) {
    this.finish(false);
    this.dismissDigitOffer();
    const selected = chosen || this.vectorSelected().filter((e) => e.type === 'stroke');
    let suggestions;
    try {
      suggestions = DigitAssist.suggest(selected, this.plugin.settings.digitSamples);
    } catch (e) {
      new Notice(e.message);
      return;
    }
    const session = this.s,
      revision = session.revision,
      p = this.makePanel(this.organizeButton, 'Conferir números escritos', 'digit-assist');
    p.classList.add('si-digit-panel');
    element(
      p,
      'p',
      'si-panel-copy',
      'Sugestões geométricas experimentais, não OCR treinado. Confira cada algarismo; o original só muda se você aplicar.'
    );
    const preview = element(p, 'div', 'si-digit-original');
    preview.innerHTML = Ink.svg(
      { ...Ink.fresh(), layers: session.doc.layers, elements: selected },
      '',
      { transparent: true }
    );
    preview.setAttribute('aria-label', 'Sua escrita original');
    const input = element(p, 'input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.maxLength = 32;
    input.value = suggestions.map((g) => g.candidates[0]?.digit || '').join('');
    input.setAttribute('aria-label', 'Número confirmado');
    let typed = false,
      keepOriginal = true,
      after = null;
    const status = element(p, 'p', 'si-panel-copy');
    status.setAttribute('aria-live', 'polite');
    const update = () => {
      try {
        const replacements = DigitAssist.cleanNumbers(selected, input.value, {
          typed,
          keepOriginal
        });
        after = keepOriginal
          ? [...session.doc.elements, ...replacements]
          : this.replaceVectors(selected, replacements);
        Ink.parse(Ink.serialize({ ...session.doc, elements: after }));
        this.stylePreview = { revision, elements: after };
        status.textContent = keepOriginal
          ? 'Prévia abaixo do original; sua tinta será mantida.'
          : 'Prévia de substituição; Desfazer recupera sua tinta.';
        apply.disabled = false;
      } catch (e) {
        after = null;
        this.stylePreview = null;
        status.textContent = e.message;
        apply.disabled = true;
      }
      this.requestRender();
    };
    if (suggestions.length === 1) {
      const grid = element(p, 'div', 'si-digit-grid');
      for (let digit = 0; digit <= 9; digit++) {
        const value = String(digit),
          b = button(grid, value, () => {
            input.value = value;
            update();
          });
        b.setAttribute('aria-label', 'Escolher algarismo ' + value);
        if (suggestions[0].candidates.some((c) => c.digit === value)) {
          b.classList.add('is-suggested');
          b.title = 'Uma das sugestões por semelhança';
        }
      }
      element(
        p,
        'small',
        'si-panel-copy',
        'Os três candidatos destacados são alternativas, não certezas.'
      );
    }
    this.choiceField(
      p,
      'Resultado',
      'vector',
      [
        ['vector', 'Algarismos desenhados e editáveis'],
        ['text', 'Texto digitado']
      ],
      (value) => {
        typed = value === 'text';
        update();
      }
    );
    this.toggleField(p, 'Manter original e inserir abaixo', true, (value) => {
      keepOriginal = value;
      update();
    });
    input.addEventListener('input', update);
    const actions = element(p, 'div', 'si-shape-actions'),
      apply = button(actions, 'Aplicar número confirmado', () => {
        if (!after || this.s !== session || session.revision !== revision) {
          new Notice('A página mudou; confira os números novamente.');
          return;
        }
        this.closePanel();
        this.nextHistoryLabel = 'Números confirmados';
        this.safeCommit(after);
        this.digitRecent = [];
      });
    button(actions, 'Manter somente o original', () => {
      this.closePanel();
      this.digitRecent = [];
    });
    if (suggestions.length === 1)
      button(p, 'Ensinar este exemplo com o algarismo escolhido', () => {
        try {
          const sample = DigitAssist.learn(selected, input.value),
            s = this.plugin.settings,
            others = s.digitSamples.filter((x) => x.digit !== sample.digit),
            same = s.digitSamples.filter((x) => x.digit === sample.digit).slice(-4);
          s.digitSamples = [...others, ...same, sample].slice(-50);
          void this.plugin.savePreferences();
          status.textContent = 'Exemplo salvo apenas neste vault. Não modifica o desenho.';
        } catch (e) {
          status.textContent = e.message;
        }
      });
    const settings = element(p, 'details', 'si-menu-accordion');
    element(settings, 'summary', '', 'Preferências de números');
    this.toggleField(
      settings,
      'Oferecer ajuda após uma pausa na escrita',
      !!this.plugin.settings.digitAuto,
      (value) => {
        this.plugin.settings.digitAuto = value;
        void this.plugin.savePreferences();
      }
    );
    button(settings, 'Remover exemplos aprendidos', () => {
      this.plugin.settings.digitSamples = [];
      void this.plugin.savePreferences();
      status.textContent = 'Exemplos pessoais removidos.';
    });
    update();
  };
  P.offerDigits = function () {
    this.dismissDigitOffer();
    const session = this.s,
      revision = session.revision,
      ids = (this.digitRecent || []).slice();
    this.digitTimer = setTimeout(() => {
      this.digitTimer = null;
      if (
        this.s !== session ||
        this.s.revision !== revision ||
        this.active ||
        this.flyout ||
        this.pending?.shape ||
        !this.plugin.settings.digitAuto
      )
        return;
      const elements = session.doc.elements.filter((e) => ids.includes(e.id));
      if (!elements.length) return;
      try {
        const groups = DigitAssist.suggest(elements, this.plugin.settings.digitSamples);
        if (groups.some((g) => g.candidates[0].score > 0.24)) return;
        const p = element(this.root, 'div', 'si-digit-offer');
        this.digitOffer = p;
        p.setAttribute('role', 'status');
        element(p, 'span', '', 'Conferir como número?');
        button(p, 'Conferir', () => this.openDigitAssist(elements));
        button(p, 'Manter', () => {
          this.dismissDigitOffer();
          this.digitRecent = [];
        });
      } catch {}
    }, 1100);
  };
  wrap('finish', function (old, commit, ...args) {
    const a = this.active,
      result = old.call(this, commit, ...args);
    if (
      commit &&
      a?.stroke &&
      !a.continuation &&
      Brushes.SPECS[a.mode] &&
      this.plugin.settings.digitAuto &&
      !this.shapeAssist &&
      this.s?.doc.elements.includes(a.stroke)
    ) {
      const prev = this.s.doc.elements.filter((e) => (this.digitRecent || []).includes(e.id)),
        b = Ink.bounds(prev),
        current = Ink.elementBounds(a.stroke);
      if (!b || !Ink.overlaps(Ink.expand(b, Math.max(24, b.h * 0.8)), current))
        this.digitRecent = [];
      this.digitRecent = [...(this.digitRecent || []), a.stroke.id].slice(-12);
      this.offerDigits();
    }
    return result;
  });
  wrap('down', function (old, ...args) {
    this.dismissDigitOffer();
    return old.apply(this, args);
  });
  wrap('openInkEditing', function (old, ...args) {
    old.apply(this, args);
    if (this.flyout)
      button(this.flyout, 'Conferir números escritos…', () => this.openDigitAssist());
  });
  wrap('openVectorTools', function (old, ...args) {
    old.apply(this, args);
    if (this.flyout)
      button(this.flyout, 'Conferir números escritos…', () => this.openDigitAssist()).disabled =
        !this.vectorSelected().some((e) => e.type === 'stroke');
  });
  wrap('openPrecision', function (old, ...args) {
    old.apply(this, args);
    this.toggleField(
      this.flyout,
      'Oferecer assistência de números após pausa',
      !!this.plugin.settings.digitAuto,
      (value) => {
        this.plugin.settings.digitAuto = value;
        if (!value) this.dismissDigitOffer();
        void this.plugin.savePreferences();
      }
    );
  });
  for (const name of ['onUnloadFile', 'onClose'])
    wrap(name, function (old, ...args) {
      this.dismissDigitOffer();
      this.digitRecent = [];
      return old.apply(this, args);
    });
})(InkView);
