/* Discoverable settings, live brush samples and scoped feedback. */
(function installUXGuidance(View) {
  const P = View.prototype,
    wrap = (name, fn) => {
      const old = P[name];
      P[name] = function (...args) {
        return fn.call(this, old, ...args);
      };
    };
  const walk = (n) => [n, ...Array.from(n.children || []).flatMap(walk)],
    textOf = (n) =>
      n.children?.length ? Array.from(n.children).map(textOf).join(' ') : I18n.canonical(n) || '',
    fold = (s) =>
      String(s)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
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
  P.addProfilePreview = function (card, brush) {
    const svg = this.root.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 28');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'si-profile-sample');
    const path = this.root.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
    const points = Array.from({ length: 64 }, (_, i) => ({
      x: 6 + i * 1.4,
      y: 14 + 6 * Math.sin(i / 3.5) + 1.3 * Math.sin(i * 2),
      p: 0.15 + (0.8 * i) / 63,
      t: i * 8
    }));
    path.setAttribute('d', Ink.inkPath({ ...brush, width: 2.5, points }));
    path.setAttribute('fill', 'currentColor');
    path.setAttribute('stroke', 'none');
    svg.appendChild(path);
    card.appendChild(svg);
  };
  P.createBrushTest = function (panel, current) {
    const box = element(panel, 'details', 'si-brush-test');
    element(box, 'summary', '', 'Experimentar a caneta');
    element(
      box,
      'p',
      'si-panel-copy',
      'Teste aqui sem marcar a página. Alterar o pincel atualiza a amostra. Mouse usa pressão fixa.'
    );
    const svg = this.root.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 256 112');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('class', 'si-brush-test-pad');
    svg.setAttribute('aria-label', 'Área de teste da caneta');
    box.appendChild(svg);
    if (this.brushTestSession !== this.s) {
      this.brushTestSession = this.s;
      this.brushTestSamples = {};
    }
    const key = this.panelKind,
      stored = ((this.brushTestSamples ??= {})[key] ??= {
        strokes: [],
        before: Ink.clone(current())
      });
    const comparison = element(box, 'div', 'si-brush-comparison'),
      beforeCell = element(comparison, 'div'),
      afterCell = element(comparison, 'div');
    element(beforeCell, 'strong', '', 'Antes');
    element(afterCell, 'strong', '', 'Atual');
    const beforeSVG =
      svg.cloneNode?.(false) ||
      this.root.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
    beforeSVG.setAttribute('viewBox', '0 0 256 112');
    beforeSVG.setAttribute('class', 'si-brush-test-pad si-brush-before');
    beforeSVG.setAttribute('aria-label', 'Amostra com o ajuste anterior');
    beforeSVG.setAttribute('preserveAspectRatio', 'none');
    beforeCell.appendChild(beforeSVG);
    afterCell.appendChild(svg);
    const state = { strokes: stored.strokes, active: null, frame: null },
      status = element(box, 'small', 'si-panel-copy', 'Até 24 traços de teste.');
    const redraw = () => {
      for (const [surface, style] of [
        [svg, current()],
        [beforeSVG, stored.before]
      ]) {
        surface.replaceChildren();
        for (const points of [...state.strokes, ...(state.active ? [state.active] : [])]) {
          const b = style,
            path = this.root.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', Ink.inkPath({ ...b, points }));
          path.setAttribute('fill', b.color);
          path.setAttribute('opacity', String(b.opacity));
          surface.appendChild(path);
        }
      }
    };
    const flush = () => {
      if (state.frame) this.win.cancelAnimationFrame(state.frame);
      state.frame = null;
      redraw();
    };
    const sample = (e) => {
      const r = svg.getBoundingClientRect();
      return {
        x: Ink.clamp(((e.clientX - r.left) * 256) / Math.max(1, r.width), 0, 256),
        y: Ink.clamp(((e.clientY - r.top) * 112) / Math.max(1, r.height), 0, 112),
        p:
          e.pointerType === 'pen'
            ? e.pressure > 0
              ? e.pressure
              : state.active?.at(-1)?.p || 0.5
            : 0.5,
        t: e.timeStamp || 0
      };
    };
    svg.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' || e.button !== 0 || state.active) return;
      e.preventDefault();
      svg.setPointerCapture?.(e.pointerId);
      state.pointer = e.pointerId;
      state.active = [sample(e)];
      redraw();
    });
    svg.addEventListener('pointermove', (e) => {
      if (!state.active || state.pointer !== e.pointerId) return;
      const samples = e.getCoalescedEvents?.() || [e];
      for (const point of samples) if (state.active.length < 2048) state.active.push(sample(point));
      status.textContent =
        e.pointerType === 'pen'
          ? 'Pressão: ' + Math.round((e.pressure || 0) * 100) + '%'
          : 'Mouse · pressão fixa';
      if (!state.frame)
        state.frame = this.win.requestAnimationFrame(() => {
          state.frame = null;
          redraw();
        });
    });
    const finish = (e, cancel = false) => {
      if (!state.active || state.pointer !== e.pointerId) return;
      if (!cancel) {
        if (state.active.length < 2048) state.active.push(sample(e));
        state.strokes.push(state.active);
        state.strokes = state.strokes.slice(-24);
      }
      state.active = null;
      flush();
      if (svg.hasPointerCapture?.(e.pointerId)) svg.releasePointerCapture(e.pointerId);
    };
    svg.addEventListener('pointerup', (e) => finish(e));
    svg.addEventListener('pointercancel', (e) => finish(e, true));
    svg.addEventListener('lostpointercapture', (e) => finish(e, true));
    button(box, 'Limpar teste', () => {
      state.strokes = [];
      stored.strokes = [];
      stored.before = Ink.clone(current());
      state.active = null;
      flush();
      status.textContent = 'Área de teste limpa.';
    });
    button(box, 'Usar ajuste atual como referência', () => {
      stored.before = Ink.clone(current());
      redraw();
    });
    redraw();
    const api = {
      redraw,
      state,
      dispose: () => {
        stored.strokes = state.strokes;
        if (state.frame) this.win.cancelAnimationFrame(state.frame);
        state.frame = null;
        state.active = null;
      }
    };
    this.brushTest = api;
    return api;
  };
  P.captureSettingsPlace = function () {
    if (this.settingsShell && this.flyout) {
      this.settingsPlaces ??= {};
      this.settingsPlaces[this.panelKind] = {
        scroll: this.flyout.scrollTop || 0,
        open: walk(this.flyout)
          .filter((n) => n.tagName === 'DETAILS' && n.open)
          .map((n) => textOf(n.children[0]))
      };
    }
  };
  P.restoreSettingsPlace = function () {
    const p = this.flyout,
      place = this.settingsPlaces?.[this.panelKind];
    if (!p || !place) return;
    for (const d of walk(p).filter((n) => n.tagName === 'DETAILS'))
      d.open = place.open.includes(textOf(d.children[0]));
    p.scrollTop = place.scroll;
  };
  P.navigateSettings = function (kind) {
    if (this.settingsShell && this.panelKind === kind) return;
    const route = routes.find((r) => r[0] === kind);
    if (!route) return;
    this[route[2]]();
    this.flyout?.focus({ preventScroll: true });
  };
  P.focusSetting = function (label) {
    const p = this.flyout;
    if (!p) return;
    const target = walk(p).find(
      (n) =>
        ['LABEL', 'BUTTON', 'SUMMARY', 'INPUT', 'SELECT'].includes(n.tagName) &&
        fold(I18n.attribute(n, 'aria-label') || textOf(n)).includes(fold(label))
    );
    if (!target) return;
    for (let node = target; node && node !== p; node = node.parentNode)
      if (node.tagName === 'DETAILS') node.open = true;
    target.classList.add('si-search-target');
    target.scrollIntoView?.({ block: 'center' });
    (
      walk(target).find(
        (n) => ['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA'].includes(n.tagName) && !n.disabled
      ) || target
    ).focus?.({ preventScroll: true });
  };
  P.searchSettings = function (query) {
    const q = fold(query).trim();
    this.settingsSearchResults.replaceChildren();
    for (const { b } of this.settingsLinks) b.hidden = !!q;
    if (!q) return;
    const catalog = this.settingsCatalog || [];
    const found = catalog
      .filter((item) =>
        q
          .split(/\s+/)
          .every((word) =>
            fold(
              item.label +
                ' ' +
                item.category +
                ' ' +
                I18n.t(item.label, {}, 'en') +
                ' ' +
                I18n.t(item.category, {}, 'en') +
                ' ' +
                (item.alias || '')
            ).includes(word)
          )
      )
      .sort((a, b) => Number(b.label !== b.category) - Number(a.label !== a.category))
      .slice(0, 24);
    if (!found.length)
      element(
        this.settingsSearchResults,
        'p',
        'si-panel-copy',
        'Nenhum resultado. Tente “pressão”, “backup” ou “atalho”.'
      );
    for (const item of found) {
      button(this.settingsSearchResults, item.label + ' · ' + item.category, () => {
        this.settingsSearch.value = '';
        this.searchSettings('');
        if (item.brush) this.openBrushPanel(this.plugin.settings.lastBrush);
        else this.navigateSettings(item.kind);
        this.focusSetting(item.target || item.label);
      });
    }
  };
  wrap('createSettingsModal', function (old, ...args) {
    const r = old.apply(this, args),
      nav = this.settingsShell.children[0],
      searchBox = element(nav, 'div', 'si-settings-search'),
      input = (this.settingsSearch = element(searchBox, 'input'));
    input.type = 'search';
    input.placeholder = 'Buscar configurações';
    input.setAttribute('aria-label', 'Buscar configurações');
    button(searchBox, 'Limpar', () => {
      input.value = '';
      this.searchSettings('');
      input.focus();
    });
    this.settingsSearchResults = element(nav, 'div', 'si-settings-results');
    this.settingsSearchResults.setAttribute('aria-label', 'Resultados da busca');
    this.settingsCatalog ??= routes.flatMap(([kind, category]) => [
      {
        kind,
        category,
        label: category,
        alias: {
          page: 'papel pauta grade linhas espacamento modelos reguas guias regioes minimapa camadas nota incorporar exportacao imprimir pdf salvar backup seguranca recuperacao historico diagnostico desempenho caderno paginas',
          interface:
            'interface densidade controles canhoto ferramentas barra gestos botoes posicoes pressao mesa',
          workflow:
            'atalhos teclas teclado favoritos pinceis imagem tamanho conta gotas cores temporario',
          precision:
            'snap encaixe extremidades cantos meio distancia origem objetos guias formas intersecoes centros velocidade espera',
          'radial-settings': 'radial zoom sensibilidade atalhos posicoes restaurar',
          'device-profiles': 'mesa digitalizadora dispositivo perfil pressao escrita pequena',
          navigation: 'navegacao medidas rotacao unidade centimetros milimetros polegadas escala',
          'preset-library': 'preset pincel importar exportar duplicar excluir biblioteca'
        }[kind]
      },
      ...(
        {
          page: [
            'Tipo de papel',
            'Espaço entre linhas / grade',
            'Tipo de grade',
            'Cópias de recuperação',
            'Exportar e imprimir',
            'Cópias de segurança automáticas'
          ],
          interface: [
            'Densidade dos controles',
            'Barra de ferramentas',
            'Modo canhoto',
            'Botão secundário',
            'Restaurar posições dos painéis'
          ],
          workflow: ['Salvar pincel atual nos favoritos', 'Restaurar atalhos'],
          precision: [
            'Ativar encaixe de pontos',
            'Encaixar em outros objetos',
            'Distância de encaixe',
            'Mostrar guias'
          ],
          'radial-settings': ['Menu radial', 'Zoom'],
          'device-profiles': [
            'Salvar perfil atual',
            'Prévia de pressão e largura',
            'Proteger escrita pequena'
          ],
          navigation: ['Rotação da vista', 'Unidade', 'Unidades por polegada'],
          'preset-library': ['Salvar pincel atual', 'Importar presets', 'Exportar presets']
        }[kind] || []
      ).map((label) => ({
        kind,
        category,
        label,
        alias: label === 'Cópias de segurança automáticas' ? 'backup backups' : '',
        target: label === 'Cópias de segurança automáticas' ? 'Criar backups automáticos' : ''
      }))
    ]);
    for (const label of [
      'Usar pressão da caneta',
      'Suavização',
      'Estabilização',
      'Curva de pressão',
      'Restaurar pressão',
      'Restaurar suavização'
    ])
      if (!this.settingsCatalog.some((x) => x.brush && x.label === label))
        this.settingsCatalog.push({ kind: 'brush', category: 'Pincel atual', label, brush: true });
    input.addEventListener('input', () => this.searchSettings(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && input.value) {
        e.preventDefault();
        e.stopPropagation();
        input.value = '';
        this.searchSettings('');
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.settingsSearchResults.querySelector?.('button')?.focus();
      }
    });
    return r;
  });
  wrap('openPagePanel', function (old, ...args) {
    const reopening = !this.settingsShell,
      last = this.plugin.settings.uiLastSettingsCategory || 'page';
    const r = old.apply(this, args);
    if (reopening && this.settingsShell && last !== 'page') this.navigateSettings(last);
    return r;
  });
  wrap('makePanel', function (old, ...args) {
    this.captureSettingsPlace();
    const r = old.apply(this, args);
    if (this.settingsShell) {
      this.settingsOpener?.setAttribute('aria-expanded', 'true');
      if (routes.some((x) => x[0] === this.panelKind)) this.settingsCategory = this.panelKind;
      else if (this.settingsCategory) {
        const category = this.settingsCategory;
        button(r, '← Voltar à categoria', () => this.navigateSettings(category)).className =
          'si-settings-return';
      }
    }
    return r;
  });
  for (const [kind, category, method] of routes)
    wrap(method, function (old, ...args) {
      const r = old.apply(this, args);
      if (this.panelKind !== kind || !this.flyout) return r;
      this.finishGuidance(this.flyout);
      this.restoreSettingsPlace();
      if (this.settingsShell) {
        this.settingsCatalog ??= [];
        for (const n of walk(this.flyout)) {
          if (!['LABEL', 'BUTTON'].includes(n.tagName)) continue;
          const label = (I18n.attribute(n, 'aria-label') || textOf(n)).trim();
          if (label.length < 3 || label.length > 100 || /^(×|←)/.test(label)) continue;
          if (!this.settingsCatalog.some((x) => x.kind === kind && x.label === label))
            this.settingsCatalog.push({ kind, category, label });
        }
      }
      return r;
    });
  P.refreshDisabledReasons = function (p) {
    p._siDisabledHints ??= new Map();
    for (const b of walk(p).filter((n) => n.tagName === 'BUTTON')) {
      if (!b.disabled) {
        p._siDisabledHints.get(b)?.remove();
        p._siDisabledHints.delete(b);
        b.setAttribute('aria-describedby', '');
        continue;
      }
      if (p._siDisabledHints.has(b)) continue;
      if (!b.title || b.title.startsWith('Indisponível')) {
        const label = textOf(b);
        b.title = /números|suavização|escrita/i.test(label)
          ? 'Selecione pelo menos um traço de tinta.'
          : /nós|pontos/i.test(label)
            ? 'Selecione um único contorno editável.'
            : /Unir|interseção|Subtrair|sobreposições/i.test(label)
              ? 'Selecione pelo menos duas formas fechadas.'
              : 'Confira os requisitos descritos nesta seção.';
      }
      const hint = element(b.parentNode, 'small', 'si-disabled-reason', textOf(b) + ': ' + b.title);
      hint.id = 'si-reason-' + Ink.uid();
      b.setAttribute('aria-describedby', hint.id);
      p._siDisabledHints.set(b, hint);
    }
  };
  P.finishGuidance = function (p) {
    if (this.flyout !== p || p.dataset.siGuidance) return;
    p.dataset.siGuidance = 'true';
    const kind = this.panelKind,
      prefs = routes.some((r) => r[0] === kind) && kind !== 'page';
    const scope =
      kind === 'page'
        ? 'Esta página · papel e grade / Preferências do plugin · arquivo e segurança'
        : prefs
          ? 'Preferências do plugin · neste vault'
          : kind === 'calibration'
            ? 'Próximos traços · teste fora da página'
            : null;
    if (scope) {
      const context = element(p, 'p', 'si-scope-hint', scope);
      p.children[0]?.after?.(context);
    }
    if (prefs || Brushes.SPECS[kind] || kind === 'calibration') {
      const status = element(
        p,
        'p',
        'si-save-status',
        this.plugin.preferenceStatus || 'Alterações salvas automaticamente'
      );
      status.setAttribute('role', 'status');
      this.preferenceStatusNode = status;
      p.addEventListener('input', () => {
        status.textContent = 'Ajustando…';
      });
    }
    if (kind === 'workflow') {
      button(p, 'Restaurar atalhos', () => {
        const s = this.plugin.settings,
          d = Brushes.settings({});
        const keys = [
          'shortcuts',
          'quickKeys',
          'temporaryKey',
          'returnBrushKey',
          'radialKey',
          'brushAdjustKey',
          'straightKey',
          'proportionKey'
        ];
        this.preferenceOperation(
          'Atalhos restaurados',
          () => Object.fromEntries(keys.map((k) => [k, s[k]])),
          (value) => Object.assign(s, value),
          () => {
            for (const key of keys) s[key] = Ink.clone(d[key]);
            void this.plugin.savePreferences();
            this.openWorkflow();
          }
        );
      }).title =
        'Restaura as teclas de ferramentas, gestos temporários, linha reta e proporção. Mantém favoritos e pincéis.';
    }
    if (kind === 'interface') {
      const advanced = element(p, 'details', 'si-menu-accordion');
      element(advanced, 'summary', '', 'Gestos e botões avançados');
      const labels = [
        'Riscar para apagar',
        'Gesto para desfazer',
        'Laço temporário',
        'Botão secundário abre menu radial',
        'Botão secundário',
        'Botão do meio',
        'Ponta borracha'
      ];
      for (const row of Array.from(p.children))
        if (row.tagName === 'LABEL' && labels.some((x) => textOf(row).trim() === x))
          advanced.appendChild(row);
      element(
        advanced,
        'p',
        'si-panel-copy',
        'Ative gestos apenas se fizerem parte do seu fluxo. Os botões disponíveis dependem do driver da mesa.'
      );
    }
    this.refreshDisabledReasons(p);
    for (const event of ['input', 'change'])
      p.addEventListener(event, () => this.refreshDisabledReasons(p));
    if (this.win.MutationObserver) {
      this.disabledObserver = new this.win.MutationObserver(() => {
        if (this.flyout === p) this.refreshDisabledReasons(p);
      });
      this.disabledObserver.observe(p, {
        subtree: true,
        attributes: true,
        attributeFilter: ['disabled']
      });
    }
  };
  wrap('polishPanel', function (old, p) {
    const r = old.call(this, p);
    this.finishGuidance(p);
    return r;
  });
  wrap('openBrushPanel', function (old, ...args) {
    const r = old.apply(this, args);
    if (this.flyout) this.finishGuidance(this.flyout);
    return r;
  });
  wrap('closePanel', function (old, ...args) {
    this.captureSettingsPlace();
    this.disabledObserver?.disconnect();
    this.disabledObserver = null;
    this.brushTest?.dispose();
    this.brushTest = null;
    this.preferenceStatusNode = null;
    const persist = !!this.settingsShell && !this.settingsSwitch,
      category = this.settingsCategory,
      opener = this.settingsOpener;
    const r = old.apply(this, args);
    if (persist) {
      opener?.setAttribute('aria-expanded', 'false');
      if (category && this.plugin.settings.uiLastSettingsCategory !== category) {
        this.plugin.settings.uiLastSettingsCategory = category;
        void this.plugin.savePreferences();
      }
    }
    return r;
  });
  wrap('build', function (old, ...args) {
    const r = old.apply(this, args);
    this.plugin.preferenceObservers ??= new Set();
    const update = (text) => {
      if (this.preferenceStatusNode) this.preferenceStatusNode.textContent = text;
    };
    this.plugin.preferenceObservers.add(update);
    this.cleanups.push(() => this.plugin.preferenceObservers.delete(update));
    return r;
  });
})(InkView);
