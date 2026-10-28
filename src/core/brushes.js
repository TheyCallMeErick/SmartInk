const Brushes = (() => {
  const module = { exports: {} };
  ('use strict');
  const SPECS = {
    write: {
      label: 'Caneta',
      min: 0.5,
      max: 16,
      step: 0.5,
      presets: [1, 2, 3, 5, 8],
      defaults: { color: '#202020', width: 2, pressure: true, smoothing: 0.55, opacity: 1 }
    },
    pencil: {
      label: 'Lápis',
      min: 0.5,
      max: 12,
      step: 0.5,
      presets: [1, 2, 3, 5, 8],
      defaults: { color: '#5b5b5b', width: 2, pressure: true, smoothing: 0.45, opacity: 0.6 }
    },
    marker: {
      label: 'Marca-texto',
      min: 8,
      max: 48,
      step: 1,
      presets: [8, 12, 18, 28, 40],
      defaults: { color: '#ffd800', width: 18, pressure: false, smoothing: 0.4, opacity: 0.3 }
    }
  };
  const PALETTE = [
    ['#202020', 'Preto'],
    ['#666666', 'Cinza'],
    ['#a0a0a0', 'Cinza claro'],
    ['#c8c8c8', 'Prata'],
    ['#e5e5e5', 'Cinza suave'],
    ['#ffffff', 'Branco'],
    ['#7f1d1d', 'Vinho'],
    ['#c42b1c', 'Vermelho'],
    ['#ff6b35', 'Laranja'],
    ['#ffb900', 'Âmbar'],
    ['#ffd800', 'Amarelo'],
    ['#fff1a6', 'Amarelo claro'],
    ['#0b5b31', 'Verde escuro'],
    ['#107c10', 'Verde'],
    ['#6bb700', 'Verde lima'],
    ['#00b294', 'Verde água'],
    ['#9adbd0', 'Menta'],
    ['#c5e8c2', 'Verde claro'],
    ['#003e73', 'Azul marinho'],
    ['#0078d4', 'Azul'],
    ['#0099bc', 'Azul turquesa'],
    ['#00bcf2', 'Ciano'],
    ['#83beec', 'Azul claro'],
    ['#c7e5f6', 'Azul suave'],
    ['#5c2d91', 'Roxo'],
    ['#886ce4', 'Violeta'],
    ['#b146c2', 'Orquídea'],
    ['#e43ba6', 'Rosa'],
    ['#f4a6cd', 'Rosa claro'],
    ['#8e562e', 'Marrom']
  ];
  const color = (c) => typeof c === 'string' && /^#[a-f0-9]{6}$/i.test(c);
  function normalizedBrush(kind, value = {}) {
    if (!value || typeof value !== 'object') value = {};
    const spec = SPECS[kind],
      d = spec.defaults;
    const finite = (v, lo, hi, def) =>
      typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def;
    const pressureMin = finite(value.pressureMin, 0, 0.95, 0),
      pressureMax = finite(value.pressureMax, pressureMin + 0.05, 1, 1);
    return {
      adaptiveInk: value.adaptiveInk === true,
      cornerProtection: finite(value.cornerProtection, 0, 1, 0.5),
      engine: 'perfect-freehand-1.2.3',
      streamline: finite(value.streamline, 0, 1, 0.25),
      minWidth: finite(value.minWidth, 0.05, 1, 0.2),
      pressureGamma: finite(value.pressureGamma, 0.25, 4, 1),
      pressureMin,
      pressureMax,
      color: color(value.color) ? value.color.toLowerCase() : d.color,
      width: finite(value.width, spec.min, spec.max, d.width),
      pressure:
        kind !== 'marker' && (typeof value.pressure === 'boolean' ? value.pressure : d.pressure),
      smoothing: finite(value.smoothing, 0, 1, d.smoothing),
      opacity: finite(value.opacity, 0.1, 1, d.opacity)
    };
  }
  function settings(saved = {}) {
    if (!saved || typeof saved !== 'object') saved = {};
    const reserved = [
      ...Object.values(saved.shortcuts || {}),
      ...Object.values(saved.quickKeys || {}),
      saved.radialKey,
      saved.temporaryKey,
      saved.brushAdjustKey,
      saved.straightKey,
      saved.proportionKey,
      'KeyI',
      'KeyX',
      'KeyB',
      'KeyQ',
      'KeyR',
      'KeyE',
      'KeyD',
      'KeyV',
      'KeyL',
      'KeyC',
      'KeyF'
    ];
    const returnBrushKey =
      [saved.returnBrushKey, 'KeyW', 'KeyN', 'KeyU', 'KeyJ'].find(
        (k) => /^Key[A-Z]$/.test(k) && !reserved.includes(k)
      ) || '';
    const old = {
      color: saved.color,
      width: saved.width,
      pressure: saved.pressure,
      smoothing: saved.smoothing
    };
    const brushes = {};
    for (const kind of Object.keys(SPECS))
      brushes[kind] = normalizedBrush(kind, saved.brushes?.[kind] || (kind === 'write' ? old : {}));
    return {
      uiLanguage: ['pt-BR', 'en'].includes(saved.uiLanguage) ? saved.uiLanguage : 'auto',
      uiLastSettingsCategory: [
        'page',
        'interface',
        'workflow',
        'preset-library',
        'precision',
        'radial-settings',
        'device-profiles',
        'navigation'
      ].includes(saved.uiLastSettingsCategory)
        ? saved.uiLastSettingsCategory
        : 'page',
      selectionSlop: Math.max(
        0,
        Math.min(20, Number.isFinite(saved.selectionSlop) ? saved.selectionSlop : 5)
      ),
      returnBrushKey,
      digitAuto: saved.digitAuto === true,
      digitSamples: DigitAssist.validSamples(saved.digitSamples),
      continueInk: saved.continueInk === true,
      hoverSnap: saved.hoverSnap !== false,
      brushAdjustKey: /^Key[A-Z]$/.test(saved.brushAdjustKey) ? saved.brushAdjustKey : 'KeyD',
      notebookPaths: Array.isArray(saved.notebookPaths)
        ? saved.notebookPaths
            .filter((p) => typeof p === 'string' && p.endsWith('.smartink-book.json'))
            .slice(-30)
        : [],
      lastNotebook: typeof saved.lastNotebook === 'string' ? saved.lastNotebook : '',
      backupsEnabled: saved.backupsEnabled !== false,
      radialDirectional: saved.radialDirectional === true,
      quickShapeMaxError: Math.max(0.02, Math.min(0.12, Number(saved.quickShapeMaxError) || 0.075)),
      proportionKey: /^(Shift|Control|Alt|Meta|Key[A-Z])$/.test(saved.proportionKey)
        ? saved.proportionKey
        : 'Shift',
      snapIntersections: saved.snapIntersections === true,
      snapCenters: saved.snapCenters === true,
      snapGrid: saved.snapGrid === true,
      snapVelocity: saved.snapVelocity === true,
      selectionOperation: ['add', 'subtract'].includes(saved.selectionOperation)
        ? saved.selectionOperation
        : 'replace',
      minimapVisible: saved.minimapVisible === true,
      customPresets: Array.isArray(saved.customPresets)
        ? saved.customPresets
            .slice(0, 64)
            .filter((x) => x && SPECS[x.kind])
            .map((x) => ({
              id: String(x.id || 'preset').slice(0, 100),
              name: String(x.name || 'Pincel').slice(0, 80),
              kind: x.kind,
              brush: normalizedBrush(x.kind, x.brush)
            }))
        : [],
      quickKeys: {
        eyedropper: 'KeyI',
        swapColor: 'KeyX',
        swapFavorite: 'KeyB',
        temporarySelect: 'KeyQ',
        ...(saved.quickKeys || {})
      },
      penButtons:
        saved.penButtons && typeof saved.penButtons === 'object'
          ? saved.penButtons
          : { secondary: 'radial', middle: 'pan', eraser: 'erase' },
      deviceProfiles: Array.isArray(saved.deviceProfiles) ? saved.deviceProfiles.slice(0, 20) : [],
      pageStyles: Array.isArray(saved.pageStyles) ? saved.pageStyles.slice(0, 20) : [],
      radialPresets:
        saved.radialPresets && typeof saved.radialPresets === 'object' ? saved.radialPresets : {},
      cursorPreview: saved.cursorPreview !== false,
      selectionMode: saved.selectionMode === 'contained' ? 'contained' : 'touch',
      measurementUnit: ['px', 'mm', 'cm', 'in'].includes(saved.measurementUnit)
        ? saved.measurementUnit
        : 'px',
      unitsPerInch: Math.min(10000, Math.max(1, Number(saved.unitsPerInch) || 96)),
      layout: ['top', 'bottom', 'left', 'right'].includes(saved.layout) ? saved.layout : 'top',
      leftHanded: !!saved.leftHanded,
      largeControls: !!saved.largeControls,
      radialKey: /^Key[A-Z]$/.test(saved.radialKey) ? saved.radialKey : 'KeyR',
      radialButton: saved.radialButton !== false,
      panelPositions:
        saved.panelPositions && typeof saved.panelPositions === 'object'
          ? saved.panelPositions
          : {},
      assets: Array.isArray(saved.assets) ? saved.assets.slice(0, 20) : [],
      gestures: {
        scratch: !!saved.gestures?.scratch,
        undo: !!saved.gestures?.undo,
        lasso: !!saved.gestures?.lasso
      },
      snapWriting: saved.snapWriting === true,
      snapTypes: {
        endpoints: saved.snapTypes?.endpoints !== false,
        corners: saved.snapTypes?.corners !== false,
        midpoints: saved.snapTypes?.midpoints !== false
      },
      snapRadius: Math.min(24, Math.max(3, Number(saved.snapRadius) || 9)),
      holdDelay: Math.min(2000, Math.max(300, Number(saved.holdDelay) || 650)),
      imageMax: Math.min(8192, Math.max(512, Number(saved.imageMax) || 2560)),
      favorites: Array.isArray(saved.favorites)
        ? saved.favorites
            .filter((f) => f && SPECS[f.kind])
            .slice(0, 8)
            .map((f) => ({
              name: String(f.name || 'Pincel').slice(0, 40),
              kind: f.kind,
              brush: normalizedBrush(f.kind, f.brush)
            }))
        : [],
      shortcuts: {
        write: 'Digit1',
        pencil: 'Digit2',
        marker: 'Digit3',
        erase: 'Digit4',
        select: 'KeyV',
        lasso: 'KeyL',
        connector: 'KeyC',
        focus: 'KeyF',
        ...(saved.shortcuts || {})
      },
      temporaryKey: /^(Key[A-Z]|Digit[0-9]|F[1-9]|F1[0-2])$/.test(saved.temporaryKey)
        ? saved.temporaryKey
        : 'KeyE',
      snapPoints: saved.snapPoints !== false,
      snapOrigin: saved.snapOrigin !== false,
      snapObjects: saved.snapObjects !== false,
      radialZoom: saved.radialZoom !== false,
      smartGuides: saved.smartGuides !== false,
      holdShapes: saved.holdShapes !== false,
      eraserMode: saved.eraserMode === 'object' ? 'object' : 'partial',
      compareInk: !!saved.compareInk,
      straightKey:
        typeof saved.straightKey === 'string' &&
        /^(Control|Shift|Alt|Meta|Key[A-Z]|F[1-9]|F1[0-2])$/.test(saved.straightKey)
          ? saved.straightKey
          : 'Control',
      guidesVisible: saved.guidesVisible !== false,
      guideSnap: saved.guideSnap !== false,
      folder: typeof saved.folder === 'string' && saved.folder.trim() ? saved.folder : 'Smart Ink',
      penOnly: !!saved.penOnly,
      brushes,
      lastBrush: Object.prototype.hasOwnProperty.call(SPECS, saved.lastBrush)
        ? saved.lastBrush
        : 'write',
      recentColors: Array.isArray(saved.recentColors)
        ? [...new Set(saved.recentColors.filter(color).map((c) => c.toLowerCase()))].slice(0, 6)
        : [],
      eraserSize:
        typeof saved.eraserSize === 'number' && Number.isFinite(saved.eraserSize)
          ? Math.min(40, Math.max(4, saved.eraserSize))
          : 12
    };
  }
  function updateBrush(state, kind, patch) {
    state.brushes[kind] = normalizedBrush(kind, { ...state.brushes[kind], ...patch });
    return state.brushes[kind];
  }
  function rememberColor(state, c) {
    if (color(c))
      state.recentColors = [
        c.toLowerCase(),
        ...state.recentColors.filter((x) => x !== c.toLowerCase())
      ].slice(0, 6);
  }
  // Fully snapshot the brush so future palette changes cannot recolor existing ink.
  function strokeStyle(state, kind) {
    const b = normalizedBrush(kind, state.brushes[kind]);
    return { ...b };
  }
  module.exports = { SPECS, PALETTE, settings, updateBrush, rememberColor, strokeStyle };

  return module.exports;
})();
