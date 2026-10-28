/* Localization is scoped to plugin UI; document text and input values are untouched. */
(function installLocalization(View) {
  const P = View.prototype,
    wrap = (name, fn) => {
      const old = P[name];
      P[name] = function (...args) {
        return fn.call(this, old, ...args);
      };
    };
  P.uiLocale = function () {
    return I18n.language(
      this.plugin.settings.uiLanguage,
      this.root.ownerDocument.documentElement?.lang || this.win.navigator?.language || 'pt-BR'
    );
  };
  P.localizeUI = function () {
    I18n.locale = this.uiLocale();
    this.translationObserver?.disconnect();
    I18n.localize(this.root, I18n.locale);
    this.translationObserver?.observe(this.root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['title', 'aria-label', 'placeholder']
    });
  };
  wrap('build', function (old, ...args) {
    const r = old.apply(this, args);
    this.plugin.localizedViews ??= new Set();
    this.plugin.localizedViews.add(this);
    if (this.win.MutationObserver)
      this.translationObserver = new this.win.MutationObserver((records) => {
        if (
          !records.some(
            (r) =>
              r.type === 'characterData' ||
              r.type === 'attributes' ||
              Array.from(r.addedNodes || []).some(
                (n) => n.nodeType === 3 || (n.nodeType === 1 && n.tagName.toLowerCase() !== 'path')
              )
          )
        )
          return;
        this.localizeUI();
      });
    this.localizeUI();
    this.cleanups.push(() => {
      this.translationObserver?.disconnect();
      this.plugin.localizedViews.delete(this);
    });
    return r;
  });
  wrap('openInterface', function (old, ...args) {
    const r = old.apply(this, args);
    this.choiceField(
      this.flyout,
      'Idioma',
      this.plugin.settings.uiLanguage,
      [
        ['auto', 'Automático'],
        ['pt-BR', 'Português (Brasil)'],
        ['en', 'English']
      ],
      (value) => {
        this.plugin.settings.uiLanguage = value;
        I18n.locale = this.uiLocale();
        void this.plugin.savePreferences();
        for (const view of this.plugin.localizedViews || []) view.localizeUI();
      }
    );
    return r;
  });
})(InkView);

(function () {
  const display = InkSettings.prototype.display;
  InkSettings.prototype.display = function () {
    const result = display.call(this);
    I18n.localize(this.containerEl, I18n.locale);
    return result;
  };
})();
