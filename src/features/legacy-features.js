const installFeatures = (() => {
  const module = { exports: {} };
  ('use strict');

  module.exports = function installFeatures(View, Ink, Brushes, { element, button, Notice }) {
    const P = View.prototype,
      wrap = (name, fn) => {
        const old = P[name];
        P[name] = function (...args) {
          return fn.call(this, old, ...args);
        };
      };
    P.viewportBounds = function () {
      return Workflow.viewport(this.camera, this.zoom, this.size());
    };
    P.rememberView = function () {
      if (this.navigating) return;
      this.navBack ??= [];
      const state = { camera: { ...this.camera }, zoom: this.zoom };
      if (JSON.stringify(this.navBack.at(-1)) !== JSON.stringify(state)) {
        this.navBack.push(state);
        if (this.navBack.length > 80) this.navBack.shift();
      }
      this.navForward = [];
    };
    P.navigateView = function (forward) {
      const from = forward ? this.navForward : this.navBack;
      if (!from?.length) return;
      this.finish(false);
      const to = forward ? (this.navBack ??= []) : (this.navForward ??= []);
      to.push({ camera: { ...this.camera }, zoom: this.zoom });
      const state = from.pop();
      this.camera = state.camera;
      this.zoom = state.zoom;
      this.syncZoom();
      this.render();
    };
    P.centerView = function (world, angle = this.camera.angle || 0) {
      const size = this.size(),
        q = Ink.worldToScreen(world, { x: 0, y: 0, angle }, this.zoom);
      this.camera = { x: size.w / 2 - q.x, y: size.h / 2 - q.y, angle };
    };
    P.rotateView = function (degrees) {
      if (!this.s) return;
      this.finish(false);
      this.rememberView();
      const center = this.worldCenter();
      this.centerView(center, (degrees * Math.PI) / 180);
      this.render();
    };
    for (const name of ['fit', 'fitRegion', 'setZoom'])
      wrap(name, function (old, ...args) {
        if (this.s) this.rememberView();
        return old.apply(this, args);
      });
    wrap('wheel', function (old, e) {
      if (!e.ctrlKey && !e.metaKey && Date.now() - (this.lastNavWheel || 0) > 500)
        this.rememberView();
      this.lastNavWheel = Date.now();
      return old.call(this, e);
    });
    wrap('down', function (old, e) {
      if (this.mode === 'pan' || this.spaceDown || e.button === 1) this.rememberView();
      return old.call(this, e);
    });
    wrap('onLoadFile', async function (old, ...args) {
      this.isolation = null;
      this.navBack = [];
      this.navForward = [];
      const result = await old.apply(this, args);
      this.navBack = [];
      const style = this.plugin.settings.pageStyles.find((x) => x.id === this.s?.doc.linkedStyle);
      if (
        style &&
        (style.background !== this.s.doc.background || style.template !== this.s.doc.template)
      )
        this.commitMeta({ background: style.background, template: style.template });
      return result;
    });
    wrap('build', function (old) {
      old.call(this);
      const nav = element(this.toolbar, 'div', 'si-toolbar-zoom');
      button(nav, '↺ Vista', () => this.openNavigation());
      button(nav, '←', () => this.navigateView(false)).title = 'Voltar à vista anterior';
      button(nav, '→', () => this.navigateView(true)).title = 'Avançar na navegação';
    });
    P.openNavigation = function () {
      const p = this.makePanel(this.organizeButton, 'Navegação e medidas', 'navigation');
      this.numberField(
        p,
        'Rotação da vista (graus)',
        Math.round(((this.camera.angle || 0) * 180) / Math.PI),
        -180,
        180,
        (v) => this.rotateView(v),
        15
      );
      button(p, 'Restaurar orientação', () => this.rotateView(0));
      button(p, 'Voltar à vista anterior', () => this.navigateView(false));
      button(p, 'Avançar na navegação', () => this.navigateView(true));
      this.choiceField(
        p,
        'Unidade',
        this.plugin.settings.measurementUnit,
        [
          ['px', 'Unidades do canvas'],
          ['mm', 'Milímetros'],
          ['cm', 'Centímetros'],
          ['in', 'Polegadas']
        ],
        (v) => {
          this.plugin.settings.measurementUnit = v;
          void this.plugin.savePreferences();
          this.drawOverlay();
        }
      );
      this.numberField(
        p,
        'Unidades por polegada',
        this.plugin.settings.unitsPerInch,
        1,
        10000,
        (v) => {
          this.plugin.settings.unitsPerInch = v;
          void this.plugin.savePreferences();
          this.drawOverlay();
        }
      );
      element(
        p,
        'p',
        'si-panel-copy',
        'A rotação afeta somente a vista. As medidas dependem da escala configurada; não medem o tamanho físico da tela.'
      );
    };
    P.selectionAllowed = function (e) {
      return (
        Ink.isEditable(this.s.doc, e) &&
        (!this.isolation || Workflow.groupPath(e).includes(this.isolation)) &&
        (!this.selectionType || e.type === this.selectionType) &&
        (!this.selectionColor || e.color.toLowerCase() === this.selectionColor.toLowerCase())
      );
    };
    wrap('editableObjects', function (old) {
      return old.call(this).filter((e) => this.selectionAllowed(e));
    });
    P.selectionHit = function (e, points) {
      return this.plugin.settings.selectionMode === 'contained'
        ? Workflow.contained(e, points, this.visible)
        : this.visible.lasso(e, points);
    };
    P.cycleHit = function (hits, p, event) {
      if (!hits.length) return null;
      const same =
        this.lastHit &&
        Ink.dist(p, this.lastHit.p) < 5 / this.zoom &&
        hits.map((e) => e.id).join('|') === this.lastHit.key;
      const index = event.altKey && same ? (this.lastHit.index + 1) % hits.length : 0;
      this.lastHit = { p, key: hits.map((e) => e.id).join('|'), index };
      return hits[index];
    };
    P.groupIds = function (ids) {
      return Workflow.expandGroups(
        this.editableObjects().filter(
          (e) => !this.isolation || Workflow.groupPath(e).includes(this.isolation)
        ),
        ids,
        this.isolation
      );
    };
    P.expandSelection = function () {
      this.selected = Workflow.expandGroups(
        this.editableObjects().filter(
          (e) => !this.isolation || Workflow.groupPath(e).includes(this.isolation)
        ),
        this.selected,
        this.isolation
      );
    };
    wrap('beginSelect', function (old, ...args) {
      const result = old.apply(this, args);
      if (!args[1].altKey) {
        this.expandSelection();
        if (this.active?.selected) this.active.selected = new Set(this.selected);
      }
      return result;
    });
    P.groupSelection = function (ungroup = false) {
      const ids = new Set(this.selectedElements().map((e) => e.id));
      if (!ids.size || (!ungroup && ids.size < 2)) return;
      const group = Ink.uid();
      if (!ungroup && this.selectedElements().some((e) => Workflow.groupPath(e).length >= 16)) {
        new Notice('Limite de 16 níveis de grupo.');
        return;
      }
      this.commitElements(
        this.s.doc.elements.map((e) => {
          if (!ids.has(e.id)) return e;
          const path = Workflow.groupPath(e).slice(),
            level = this.isolation ? path.indexOf(this.isolation) + 1 : 0;
          if (ungroup) path.splice(level, 1);
          else path.splice(level, 0, group);
          const out = { ...e, groupPath: path };
          if (path.length) out.groupId = path[0];
          else delete out.groupId;
          return out;
        })
      );
    };
    P.openSelectionControls = function () {
      const p = this.makePanel(this.organizeButton, 'Seleção e grupos', 'selection-controls');
      this.choiceField(
        p,
        'Área de seleção',
        this.plugin.settings.selectionMode,
        [
          ['touch', 'Tocar no objeto'],
          ['contained', 'Conter todo o objeto']
        ],
        (v) => {
          this.plugin.settings.selectionMode = v;
          void this.plugin.savePreferences();
        }
      );
      this.choiceField(
        p,
        'Filtrar tipo',
        this.selectionType || '',
        [
          ['', 'Todos'],
          ...[
            'stroke',
            'line',
            'arrow',
            'rectangle',
            'triangle',
            'circle',
            'ellipse',
            'text',
            'image'
          ].map((x) => [x, x])
        ],
        (v) => (this.selectionType = v)
      );
      const color = element(p, 'input');
      color.type = 'color';
      color.value = this.selectionColor || '#202020';
      color.setAttribute('aria-label', 'Cor do filtro');
      color.addEventListener('input', () => (this.selectionColor = color.value));
      button(p, 'Filtrar pela cor escolhida', () => (this.selectionColor = color.value));
      button(p, 'Limpar filtros', () => {
        this.selectionColor = null;
        this.selectionType = null;
        this.openSelectionControls();
      });
      button(p, 'Isolar grupo selecionado', () => {
        const e = this.selectedElements()[0],
          path = e && Workflow.groupPath(e),
          i = this.isolation ? path?.indexOf(this.isolation) + 1 : 0;
        if (!path?.[i]) {
          new Notice('Selecione um grupo ou subgrupo.');
          return;
        }
        this.isolation = path[i];
        this.selected.clear();
        this.closePanel();
        this.hint.textContent =
          'Grupo isolado: somente seus membros podem ser selecionados. Use Sair do isolamento em Organizar.';
        this.drawOverlay();
      });
      button(p, 'Sair do isolamento', () => {
        this.isolation = null;
        this.selected.clear();
        this.closePanel();
        this.drawOverlay();
      });
      element(
        p,
        'p',
        'si-panel-copy',
        'Alt + clique repetido alterna objetos sobrepostos. Agrupar preserva subgrupos; Desagrupar remove um nível.'
      );
    };
    P.applyGeometryRules = function (elements) {
      const map = new Map(elements.map((e) => [e.id, e]));
      return elements.map((e) => {
        const rule = e.geometryRule;
        if (!rule || !Ink.isEditable(this.s.doc, e)) return e;
        const target = map.get(rule.targetId);
        if (rule.targetId && (!target || target.geometryRule || target.id === e.id)) return e;
        const next = Workflow.constrain(e, target, rule.kind);
        return JSON.stringify(next) === JSON.stringify(e) ? e : next;
      });
    };
    wrap('changed', function (old) {
      const before = this.s.doc.elements,
        after = this.applyGeometryRules(before);
      if (after.some((e, i) => e !== before[i])) {
        const op = this.s.history.undoStack.at(-1);
        if (op && op.after.length === before.length && op.after.every((e, i) => e === before[i]))
          op.after = after.slice();
        this.s.doc.elements = after;
      }
      return old.call(this);
    });
    P.duplicateSelection = function () {
      if (!this.editable()) return;
      const selected = this.selectedElements(),
        ids = new Map(selected.map((e) => [e.id, Ink.uid()])),
        copies = Workflow.cloneGroups(selected).map((e) => {
          const copy = {
            ...Ink.transform(e, { dx: 24 / this.zoom, dy: 24 / this.zoom }),
            id: ids.get(e.id)
          };
          if (copy.bindings) {
            copy.bindings = {};
            for (const [key, b] of Object.entries(e.bindings))
              if (ids.has(b.targetId)) copy.bindings[key] = { ...b, targetId: ids.get(b.targetId) };
          }
          if (copy.geometryRule?.targetId) {
            if (ids.has(copy.geometryRule.targetId))
              copy.geometryRule = {
                ...copy.geometryRule,
                targetId: ids.get(copy.geometryRule.targetId)
              };
            else delete copy.geometryRule;
          }
          return copy;
        });
      this.safeCommit([...this.s.doc.elements, ...copies]);
      this.selected = new Set(copies.map((e) => e.id));
      this.updateSuggestion();
    };
    P.openProperties = function () {
      const chosen = this.selectedElements(),
        b = Ink.bounds(chosen);
      if (!b) {
        new Notice('Selecione objetos primeiro.');
        return;
      }
      const p = this.makePanel(this.organizeButton, 'Propriedades e geometria', 'properties'),
        session = this.s,
        revision = session.revision;
      let x = b.x,
        y = b.y,
        w = b.w,
        h = b.h,
        angle = 0,
        dimension = 'width',
        persistent = false;
      this.numberField(p, 'X', x, -1e8, 1e8, (v) => (x = v), 0.1);
      this.numberField(p, 'Y', y, -1e8, 1e8, (v) => (y = v), 0.1);
      this.numberField(
        p,
        'Largura proporcional',
        w,
        0.1,
        1e7,
        (v) => {
          w = v;
          dimension = 'width';
        },
        0.1
      );
      this.numberField(
        p,
        'Altura proporcional',
        h,
        0.1,
        1e7,
        (v) => {
          h = v;
          dimension = 'height';
        },
        0.1
      );
      this.numberField(p, 'Girar seleção (graus)', 0, -180, 180, (v) => (angle = v), 1);
      if (chosen.length === 2) {
        const a = Ink.elementBounds(chosen[0]),
          c = Ink.elementBounds(chosen[1]),
          unit = this.plugin.settings.measurementUnit,
          ppi = this.plugin.settings.unitsPerInch,
          ratio = { px: 1, mm: 25.4 / ppi, cm: 2.54 / ppi, in: 1 / ppi }[unit],
          distance = Math.hypot(a.x + a.w / 2 - c.x - c.w / 2, a.y + a.h / 2 - c.y - c.h / 2);
        element(
          p,
          'p',
          'si-panel-copy',
          'Distância entre centros: ' + (distance * ratio).toFixed(2) + ' ' + unit
        );
      }
      element(
        p,
        'p',
        'si-panel-copy',
        'A última dimensão editada define a escala, preservando proporções. A rotação é relativa ao estado atual.'
      );
      button(p, 'Aplicar propriedades', () => {
        if (this.s !== session || session.revision !== revision) {
          new Notice('O desenho mudou. Reabra as propriedades.');
          return;
        }
        const scale = dimension === 'width' ? w / Math.max(0.1, b.w) : h / Math.max(0.1, b.h),
          ids = new Set(chosen.map((e) => e.id));
        const transformed = chosen.map((e) =>
            Ink.transform(e, {
              scale,
              angle: (angle * Math.PI) / 180,
              origin: { x: b.x + b.w / 2, y: b.y + b.h / 2 }
            })
          ),
          nextBounds = Ink.bounds(transformed),
          map = new Map(
            transformed.map((e) => [
              e.id,
              Ink.transform(e, { dx: x - nextBounds.x, dy: y - nextBounds.y })
            ])
          );
        this.safeCommit(this.s.doc.elements.map((e) => (ids.has(e.id) ? map.get(e.id) : e)));
        this.closePanel();
      });
      this.toggleField(
        p,
        'Manter restrição geométrica após editar',
        false,
        (v) => (persistent = v)
      );
      button(p, 'Remover restrições da seleção', () => {
        const ids = new Set(this.selectedElements().map((e) => e.id));
        this.commitElements(
          this.s.doc.elements.map((e) => {
            if (!ids.has(e.id)) return e;
            const next = { ...e };
            delete next.geometryRule;
            return next;
          })
        );
        this.closePanel();
      });
      for (const [kind, label] of [
        ['square', 'Ajustar para quadrado'],
        ['circle', 'Ajustar para círculo'],
        ['parallel', 'Paralela à primeira linha'],
        ['perpendicular', 'Perpendicular à primeira linha'],
        ['equal', 'Mesmo comprimento da primeira linha']
      ])
        button(p, label, () => {
          if (this.s !== session || session.revision !== revision) {
            new Notice('O desenho mudou. Reabra o painel.');
            return;
          }
          const ref = chosen.find((e) => ['line', 'arrow'].includes(e.type)),
            ids = new Set(chosen.map((e) => e.id));
          if (
            persistent &&
            ref?.geometryRule &&
            ['parallel', 'perpendicular', 'equal'].includes(kind)
          ) {
            new Notice('Use como referência uma linha sem restrições.');
            return;
          }
          this.safeCommit(
            this.s.doc.elements.map((e) => {
              if (
                !ids.has(e.id) ||
                (['parallel', 'perpendicular', 'equal'].includes(kind) && e === ref)
              )
                return e;
              const next = Workflow.constrain(e, ref, kind);
              if (next === e) return e;
              return persistent
                ? {
                    ...next,
                    geometryRule: {
                      kind,
                      ...(['parallel', 'perpendicular', 'equal'].includes(kind)
                        ? { targetId: ref.id }
                        : {})
                    }
                  }
                : next;
            })
          );
          this.closePanel();
        });
      element(
        p,
        'p',
        'si-panel-copy',
        'Restrições são opcionais e reversíveis. Linhas de referência precisam estar sem restrições; objetos bloqueados não são alterados.'
      );
    };
    P.safeCommit = function (elements) {
      try {
        Ink.parse(Ink.serialize({ ...this.s.doc, elements }));
        this.commitElements(elements);
        return true;
      } catch (e) {
        new Notice(e.message);
        return false;
      }
    };
    P.openDeviceProfiles = function () {
      const p = this.makePanel(this.organizeButton, 'Perfis de dispositivo', 'device-profiles'),
        name = element(p, 'input');
      name.placeholder = 'Ex.: Wacom · escrita pequena';
      button(p, 'Salvar perfil atual', () => {
        const profiles = this.plugin.settings.deviceProfiles;
        if (profiles.length >= 20) {
          new Notice('Limite de 20 perfis.');
          return;
        }
        profiles.push({
          id: Ink.uid(),
          name: (name.value || 'Perfil').slice(0, 80),
          brushes: Ink.clone(this.plugin.settings.brushes),
          penOnly: this.plugin.settings.penOnly,
          eraserSize: this.plugin.settings.eraserSize
        });
        void this.plugin.savePreferences();
        this.openDeviceProfiles();
      });
      for (const profile of this.plugin.settings.deviceProfiles) {
        const row = element(p, 'div', 'si-layer-row');
        button(row, profile.name, () => {
          this.finish(false);
          for (const kind of Object.keys(Brushes.SPECS))
            this.plugin.settings.brushes[kind] = Brushes.normalizedBrush
              ? Brushes.normalizedBrush(kind, profile.brushes?.[kind])
              : Brushes.settings({ brushes: profile.brushes }).brushes[kind];
          this.plugin.settings.penOnly = !!profile.penOnly;
          this.plugin.settings.eraserSize = Ink.clamp(Number(profile.eraserSize) || 12, 4, 40);
          void this.plugin.savePreferences();
          this.updateTools();
          this.closePanel();
        });
        button(row, 'Remover', () => {
          this.plugin.settings.deviceProfiles = this.plugin.settings.deviceProfiles.filter(
            (x) => x !== profile
          );
          void this.plugin.savePreferences();
          this.openDeviceProfiles();
        });
      }
      this.toggleField(
        p,
        'Prévia de pressão e largura',
        this.plugin.settings.cursorPreview,
        (v) => {
          this.plugin.settings.cursorPreview = v;
          void this.plugin.savePreferences();
        }
      );
      this.toggleField(
        p,
        'Proteger escrita pequena (novos traços)',
        this.plugin.settings.brushes.write.adaptiveInk,
        (v) => {
          for (const kind of Object.keys(Brushes.SPECS))
            this.plugin.settings.brushes[kind].adaptiveInk = v;
          void this.plugin.savePreferences();
        }
      );
      element(
        p,
        'p',
        'si-panel-copy',
        'Troca manual: o navegador nem sempre identifica o modelo da mesa. A proteção reduz o filtro em traços pequenos para preservar detalhes e acentos.'
      );
    };
    P.openSessionHistory = function () {
      this.finish(false);
      const session = this.s,
        revision = session.revision,
        history = session.history,
        p = this.makePanel(this.organizeButton, 'Histórico visual da sessão', 'session-history'),
        ops = [...history.undoStack, ...history.redoStack.slice().reverse()],
        current = history.undoStack.length;
      let index = current;
      const preview = element(p, 'div', 'si-thumbnail'),
        details = element(p, 'p', 'si-panel-copy');
      const render = () => {
        const doc = Ink.clone(session.doc);
        if (index < current) {
          for (let i = current - 1; i >= index; i--) {
            const op = ops[i];
            if (op.metaBefore) {
              for (const key of [
                'layers',
                'activeLayer',
                'template',
                'background',
                'drafting',
                'regions',
                'linkedStyle'
              ]) {
                if (op.metaBefore[key] === undefined) delete doc[key];
                else doc[key] = Ink.clone(op.metaBefore[key]);
              }
            }
            if (op.layerBefore) Object.assign(doc, Ink.clone(op.layerBefore));
          }
        } else
          for (let i = current; i < index; i++) {
            const op = ops[i];
            if (op.metaAfter) {
              for (const key of [
                'layers',
                'activeLayer',
                'template',
                'background',
                'drafting',
                'regions',
                'linkedStyle'
              ]) {
                if (op.metaAfter[key] === undefined) delete doc[key];
                else doc[key] = Ink.clone(op.metaAfter[key]);
              }
            }
            if (op.layerAfter) Object.assign(doc, Ink.clone(op.layerAfter));
          }
        doc.elements = index ? ops[index - 1].after : ops[0]?.before || doc.elements;
        preview.innerHTML = Ink.svg(doc);
        details.textContent =
          'Etapa ' +
          index +
          ' · ' +
          doc.elements.length +
          ' objetos' +
          (index === current ? ' · atual' : '');
      };
      this.choiceField(
        p,
        'Etapa',
        String(current),
        Array.from({ length: ops.length + 1 }, (_, i) => [
          String(i),
          'Etapa ' + i + (i === current ? ' (atual)' : '')
        ]),
        (v) => {
          index = Number(v);
          render();
        }
      );
      render();
      button(p, 'Ir para esta etapa', () => {
        if (this.s !== session || session.revision !== revision) {
          new Notice('O histórico mudou. Reabra o painel.');
          return;
        }
        this.closePanel();
        while (history.undoStack.length > index) this.undo();
        while (history.undoStack.length < index) this.redo();
      });
      element(
        p,
        'p',
        'si-panel-copy',
        'Até 80 operações nesta sessão. Uma nova edição descarta o futuro.'
      );
    };
    P.saveJSON = function (name, value) {
      const blob = new this.win.Blob([JSON.stringify(value, null, 2)], {
          type: 'application/json'
        }),
        url = this.win.URL.createObjectURL(blob),
        a = element(this.root, 'a');
      a.href = url;
      a.download = name;
      a.click();
      a.remove();
      this.win.setTimeout(() => this.win.URL.revokeObjectURL(url), 1000);
    };
    wrap('openAssets', function (old) {
      old.call(this);
      const p = this.flyout,
        query = element(p, 'input');
      query.placeholder = 'Pesquisar nome ou categoria';
      query.setAttribute('aria-label', 'Pesquisar elementos');
      const cards = Array.from(p.children).filter((e) => e.className === 'si-asset-card'),
        assets = this.plugin.settings.assets;
      cards.forEach((card, index) => {
        const asset = assets[index];
        if (!asset) return;
        const category = element(card, 'input');
        category.placeholder = 'Categoria';
        category.value = asset.category || 'Geral';
        category.setAttribute('aria-label', 'Categoria');
        category.addEventListener('change', () => {
          asset.category = category.value.slice(0, 80) || 'Geral';
          void this.plugin.savePreferences();
        });
      });
      query.addEventListener('input', () =>
        cards.forEach(
          (card, i) =>
            (card.hidden = !(String(assets[i]?.name) + ' ' + String(assets[i]?.category || 'Geral'))
              .toLocaleLowerCase()
              .includes(query.value.toLocaleLowerCase()))
        )
      );
      button(p, 'Exportar coleção JSON', () => this.saveJSON('smart-ink-elementos.json', assets));
      const input = element(p, 'input');
      input.type = 'file';
      input.accept = '.json';
      input.setAttribute('aria-label', 'Importar coleção de elementos');
      input.addEventListener('change', async () => {
        try {
          const file = input.files?.[0];
          if (!file) return;
          if (file.size > 10000000) throw new Error('Arquivo acima de 10 MB.');
          const imported = Workflow.validateAssets(JSON.parse(await file.text()));
          const combined = [...this.plugin.settings.assets, ...imported];
          Workflow.validateAssets(combined);
          this.plugin.settings.assets = combined;
          await this.plugin.savePreferences();
          this.openAssets();
        } catch (e) {
          new Notice(e.message);
        }
      });
    });
    wrap('insertAsset', function (old, doc) {
      return old.call(this, { ...doc, elements: Workflow.cloneGroups(doc.elements) });
    });
    P.syncPageStyle = async function (style) {
      for (const value of this.plugin.sessions.values()) {
        const session = await value;
        if (session.error || session.doc.linkedStyle !== style.id) continue;
        const before = {
            background: session.doc.background,
            template: session.doc.template || 'plain'
          },
          after = { background: style.background, template: style.template };
        session.history.push(session.doc.elements, session.doc.elements);
        Object.assign(session.history.undoStack.at(-1), { layerBefore: before, layerAfter: after });
        Object.assign(session.doc, after);
        session.revision++;
        session.notify();
        await this.plugin.saveSession(session);
      }
    };
    P.openPageStyles = function () {
      const p = this.makePanel(this.organizeButton, 'Estilos de papel do vault', 'page-styles'),
        name = element(p, 'input');
      name.placeholder = 'Nome do estilo';
      button(p, 'Salvar papel atual', () => {
        const styles = this.plugin.settings.pageStyles;
        if (styles.length >= 20) return;
        styles.push({
          id: Ink.uid(),
          name: (name.value || 'Papel').slice(0, 80),
          background: this.s.doc.background,
          template: this.s.doc.template || 'plain'
        });
        void this.plugin.savePreferences();
        this.openPageStyles();
      });
      for (const style of this.plugin.settings.pageStyles) {
        const row = element(p, 'div', 'si-layer-row');
        button(row, 'Vincular: ' + style.name, () => {
          this.commitMeta({
            background: style.background,
            template: style.template,
            linkedStyle: style.id
          });
          this.closePanel();
        });
        button(row, 'Atualizar estilo com este papel', () => {
          style.background = this.s.doc.background;
          style.template = this.s.doc.template || 'plain';
          void this.plugin.savePreferences();
          void this.syncPageStyle(style);
          new Notice('Estilo atualizado nas páginas abertas; outras sincronizam ao abrir.');
        });
      }
      button(p, 'Sincronizar estilo vinculado', () => {
        const style = this.plugin.settings.pageStyles.find((x) => x.id === this.s.doc.linkedStyle);
        if (!style) {
          new Notice('Nenhum estilo vinculado disponível.');
          return;
        }
        this.commitMeta({ background: style.background, template: style.template });
        this.closePanel();
      });
      button(p, 'Desvincular', () => {
        this.commitMeta({ linkedStyle: null });
        this.closePanel();
      });
      element(
        p,
        'p',
        'si-panel-copy',
        'Estilos compartilhados neste vault. Páginas abertas sincronizam ao atualizar o estilo; outras, ao abrir. Alterações permitem Desfazer; objetos desenhados conservam suas cores.'
      );
    };
    const actions = [
      'write',
      'pencil',
      'marker',
      'erase',
      'select',
      'lasso',
      'connector',
      'color',
      'thin',
      'thick',
      'undo',
      'redo',
      'rulers',
      'fit'
    ];
    const labels = {
      write: 'Caneta',
      pencil: 'Lápis',
      marker: 'Marca-texto',
      erase: 'Borracha',
      select: 'Cursor',
      lasso: 'Laço',
      connector: 'Conector',
      color: 'Cor',
      thin: 'Mais fino',
      thick: 'Mais grosso',
      undo: 'Desfazer',
      redo: 'Refazer',
      rulers: 'Réguas',
      fit: 'Enquadrar'
    };
    P.radialEntries = function () {
      const context = this.mode === 'connector' || this.shapeAssist ? 'diagram' : 'writing',
        defaults =
          context === 'diagram'
            ? ['select', 'connector', 'lasso', 'color', 'thin', 'thick', 'undo', 'fit']
            : ['write', 'erase', 'select', 'lasso', 'color', 'thin', 'thick', 'undo'],
        items = this.plugin.settings.radialPresets[context] || defaults;
      return items.slice(0, 8).map((key) => [
        labels[key] || labels.write,
        () => {
          if (['write', 'pencil', 'marker', 'erase', 'select', 'lasso', 'connector'].includes(key))
            this.selectTool(key, false, false);
          else if (key === 'color') this.openBrushPanel(this.plugin.settings.lastBrush);
          else if (key === 'thin' || key === 'thick')
            this.setBrush(
              {
                width:
                  this.plugin.settings.brushes[this.plugin.settings.lastBrush].width +
                  (key === 'thin' ? -1 : 1)
              },
              true
            );
          else if (key === 'rulers') this.openDraftingPanel();
          else if (['undo', 'redo', 'fit'].includes(key)) this[key]();
        }
      ]);
    };
    P.openRadialSettings = function () {
      const p = this.makePanel(this.organizeButton, 'Personalizar menu radial', 'radial-settings');
      for (const context of ['writing', 'diagram']) {
        element(p, 'strong', '', context === 'writing' ? 'Escrita' : 'Diagramas');
        const defaults =
          context === 'writing'
            ? ['write', 'erase', 'select', 'lasso', 'color', 'thin', 'thick', 'undo']
            : ['select', 'connector', 'lasso', 'color', 'thin', 'thick', 'undo', 'fit'];
        for (let i = 0; i < 8; i++)
          this.choiceField(
            p,
            'Posição ' + (i + 1),
            this.plugin.settings.radialPresets[context]?.[i] || defaults[i],
            actions.map((x) => [x, labels[x]]),
            (v) => {
              this.plugin.settings.radialPresets[context] ??= defaults.slice();
              this.plugin.settings.radialPresets[context][i] = v;
              void this.plugin.savePreferences();
            }
          );
      }
    };
    P.rasterize = async function (doc, { transparent = false, scale = 2 } = {}) {
      const b = Ink.expand(
          Ink.bounds(Ink.renderElements(doc)) || { x: 0, y: 0, w: 800, h: 600 },
          16
        ),
        factor = Math.min(scale, 8192 / b.w, 8192 / b.h, Math.sqrt(16000000 / (b.w * b.h)));
      if (!Number.isFinite(factor) || factor <= 0) throw new Error('Área inválida.');
      const canvas = this.root.ownerDocument.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(b.w * factor));
      canvas.height = Math.max(1, Math.ceil(b.h * factor));
      const svg = Ink.svg(doc, '', { transparent, bounds: b }),
        blob = new this.win.Blob([svg], { type: 'image/svg+xml' }),
        url = this.win.URL.createObjectURL(blob);
      try {
        const image = new this.win.Image();
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = () => reject(new Error('Falha ao renderizar PNG.'));
          image.src = url;
        });
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas;
      } finally {
        this.win.URL.revokeObjectURL(url);
      }
    };
    P.exportPNG = async function (copy = false) {
      try {
        this.finish(false);
        let elements = this.selected.size
          ? this.selectedElements()
          : Ink.renderElements(this.s.doc);
        elements = Ink.resolveConnections(elements).map((e) => {
          const n = { ...e };
          delete n.bindings;
          return n;
        });
        if (!elements.length) throw new Error('Não há objetos para exportar.');
        const canvas = await this.rasterize({ ...this.s.doc, elements }, { transparent: true }),
          blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('PNG indisponível.');
        if (copy) {
          if (!this.win.ClipboardItem || !this.win.navigator?.clipboard?.write)
            throw new Error('Área de transferência de imagens indisponível. Use Salvar PNG.');
          await this.win.navigator.clipboard.write([
            new this.win.ClipboardItem({ 'image/png': blob })
          ]);
          new Notice('PNG copiado.');
        } else {
          const path = this.s.file.path.replace(/\.smartink$/, '') + '-' + Ink.uid() + '.png';
          await this.app.vault.createBinary(path, await blob.arrayBuffer());
          new Notice('PNG salvo: ' + path);
        }
      } catch (e) {
        new Notice(e.message);
      }
    };
    wrap('openExportOptions', function (old) {
      old.call(this);
      button(this.flyout, 'Salvar PNG transparente (seleção ou página)', () =>
        this.exportPNG(false)
      );
      button(this.flyout, 'Copiar PNG transparente', () => this.exportPNG(true));
    });
    wrap('openOrganize', function (old) {
      old.call(this);
      for (const [label, name] of [
        ['Perfis de dispositivo', 'openDeviceProfiles'],
        ['Seleção e grupos', 'openSelectionControls'],
        ['Propriedades e geometria', 'openProperties'],
        ['Histórico visual da sessão', 'openSessionHistory'],
        ['Estilos de papel do vault', 'openPageStyles'],
        ['Personalizar menu radial', 'openRadialSettings'],
        ['Navegação e medidas', 'openNavigation']
      ])
        button(this.flyout, label, () => this[name]()).className = 'si-menu-action';
    });
    wrap('updateSuggestion', function (old) {
      old.call(this);
      if (this.suggestion && this.selectedElements().length) {
        button(this.suggestion, 'Propriedades', () => this.openProperties());
      }
    });
    wrap('drawOverlay', function (old) {
      old.call(this);
      if (!this.s || !this.overlay) return;
      const ctx = this.overlay.getContext('2d'),
        b = this.selectionBox();
      if (b) {
        const d = Workflow.dimensions(
          this.selectedElements(),
          this.plugin.settings.measurementUnit,
          this.plugin.settings.unitsPerInch
        );
        if (d) {
          ctx.save();
          ctx.font = 12 / this.zoom + 'px sans-serif';
          ctx.fillStyle = '#0078d4';
          ctx.fillText(
            d.w.toFixed(2) + ' × ' + d.h.toFixed(2) + ' ' + d.unit,
            b.x,
            b.y + b.h + 20 / this.zoom
          );
          ctx.restore();
        }
      }
      if (this.plugin.settings.cursorPreview && Brushes.SPECS[this.mode]) {
        const p = this.active?.stroke?.points.at(-1) || this.hoverPoint;
        if (p) {
          const brush = this.plugin.settings.brushes[this.mode],
            pressure = Ink.clamp(p.p ?? 0.5, 0, 1),
            width = brush.pressure
              ? brush.width *
                (brush.minWidth +
                  (1 - brush.minWidth) *
                    Math.pow(
                      Ink.clamp(
                        (pressure - brush.pressureMin) / (brush.pressureMax - brush.pressureMin),
                        0,
                        1
                      ),
                      brush.pressureGamma
                    ))
              : brush.width;
          ctx.save();
          ctx.strokeStyle = brush.color;
          ctx.fillStyle = '#555';
          ctx.lineWidth = 1 / this.zoom;
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0.5 / this.zoom, width / 2), 0, Math.PI * 2);
          ctx.stroke();
          ctx.font = 11 / this.zoom + 'px sans-serif';
          ctx.fillText(
            Math.round(pressure * 100) + '% · ' + width.toFixed(1),
            p.x + 14 / this.zoom,
            p.y - 12 / this.zoom
          );
          ctx.restore();
        }
      }
    });
  };

  return module.exports;
})();
