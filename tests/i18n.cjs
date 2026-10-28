'use strict';
const assert = require('node:assert/strict'),
  { setup } = require('./harness.cjs');
const h = setup(),
  I = h.I18n;
try {
  assert.equal(I.language('auto', 'pt-PT'), 'pt-BR');
  assert.equal(I.language('auto', 'en-US'), 'en');
  assert.equal(I.t('Restaurar pressão', {}, 'en'), 'Reset pressure');
  assert.equal(
    I.t('Restaurar Curva de pressão ao valor de abertura', {}, 'en'),
    'Reset Pressure curve to the opening value'
  );
  assert.equal(I.t('Escolher algarismo 7', {}, 'en'), 'Choose digit 7');
  assert.equal(I.t('Chave ausente {n}', { n: 3 }, 'en'), 'Chave ausente 3');
  assert.equal(h.Brushes.settings({ uiLanguage: 'en' }).uiLanguage, 'en');
  assert.equal(h.Brushes.settings({ uiLanguage: 'bogus' }).uiLanguage, 'auto');
  // A minimal text-node DOM tests round-trip localization, canonical labels and user data isolation.
  const text = (value) => ({ nodeType: 3, nodeValue: value }),
    ui = text('Aplicar alterações'),
    user = text('Caneta'),
    field = { value: 'Caneta' };
  const label = {
    nodeType: 1,
    childNodes: [ui],
    attrs: { 'aria-label': 'Aplicar alterações' },
    getAttribute(k) {
      return this.attrs[k] ?? null;
    },
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
    closest() {
      return null;
    }
  };
  ui.parentElement = { closest: () => null };
  user.parentElement = { closest: () => ({}) };
  const root = {
    childNodes: [label],
    ownerDocument: {
      createTreeWalker() {
        let i = 0;
        return { nextNode: () => [ui, user][i++] || null };
      }
    },
    getAttribute: () => null,
    querySelectorAll: () => [label],
    closest: () => null
  };
  I.localize(root, 'en');
  assert.equal(ui.nodeValue, 'Apply changes');
  assert.equal(user.nodeValue, 'Caneta');
  assert.equal(field.value, 'Caneta');
  assert.equal(I.canonical(label), 'Aplicar alterações');
  assert.equal(I.attribute(label, 'aria-label'), 'Aplicar alterações');
  assert.equal(label.attrs['aria-label'], 'Apply changes');
  I.localize(root, 'pt-BR');
  assert.equal(ui.nodeValue, 'Aplicar alterações');
  assert.equal(label.attrs['aria-label'], 'Aplicar alterações');
  ui.nodeValue = 'Cancelar';
  I.localize(root, 'en');
  assert.equal(ui.nodeValue, 'Cancel');
  assert.equal(I.canonical(label), 'Cancelar');
  const defaults = h.Brushes.settings({});
  assert.equal(defaults.uiLanguage, 'auto');
  console.log(
    'PASS: locale detection/persistence, English labels, interpolation/fallback, canonical action labels, live language round-trip and user text isolation'
  );
} finally {
  h.dispose();
}
