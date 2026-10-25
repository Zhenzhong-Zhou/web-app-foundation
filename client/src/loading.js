/**
 * The mode the app will open in, before anything draws (ADR-082): this
 * device's choice of Light or Dark, which MUI keeps under `mui-mode`, else
 * the system's. Its class on <html> gives the page, and index.html's
 * loading mark, that mode's colours, so in Dark the page is dark from the
 * first moment, with no white flash; MUI's theme then keeps the class.
 * A choice also turns the browser's bar to it, as theme-color.ts goes on
 * doing once the app runs.
 *
 * A file of its own, not inline, so a Content-Security-Policy (#142) needs
 * no hash for it; and a classic script, not a module, so it runs before
 * the page draws. Not imported by anything: vite.config.ts writes it into
 * /assets/ under a name from its content, which a browser keeps for a
 * year, and adds its tag to index.html.
 */
(() => {
  let chosen = null;
  try {
    chosen = localStorage.getItem('mui-mode');
  } catch {
    // Storage refused (a locked-down browser): the system's mode.
  }

  const root = document.documentElement;
  if (chosen === 'light' || chosen === 'dark') {
    const colour = document.querySelector(
      `meta[name="theme-color"][media*="${chosen}"]`,
    ).content;
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
      meta.content = colour;
    }
    root.classList.add(chosen);
  } else {
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.add(dark ? 'dark' : 'light');
  }
})();

/**
 * The app's own files did not load: its entry, or a file the entry imports,
 * refused or cut off, which the module script reports as an error. The
 * mark would stay up over nothing, its bar sliding as if the app were on
 * its way, so it gives way to one line and Reload, in the reader's
 * language as the app would choose it: the one chosen on this device, else
 * the first of the browser's the app speaks, else English. The words come
 * from the catalogues, written in by vite.config.ts, since none is loaded.
 */
(() => {
  const WORDS = '%LOADING_FAILED%';

  /** As lib/locales.ts's matchLocale: any English, any French, Simplified Chinese. */
  function match(tag) {
    try {
      const locale = new Intl.Locale(tag).maximize();
      if (locale.language === 'en') return 'en';
      if (locale.language === 'fr') return 'fr-CA';
      if (locale.language === 'zh' && locale.script === 'Hans') {
        return 'zh-Hans';
      }
    } catch {
      // Not a language tag.
    }
    return null;
  }

  function language() {
    try {
      const stored = localStorage.getItem('language');
      if (stored in WORDS) return stored;
    } catch {
      // Storage refused: the browser's language.
    }
    for (const tag of navigator.languages) {
      const locale = match(tag);
      if (locale) return locale;
    }
    return 'en';
  }

  addEventListener(
    'error',
    (event) => {
      const mark = document.getElementById('loading-mark');
      const script = event.target;
      if (!mark || !(script instanceof HTMLScriptElement)) return;
      if (script.type !== 'module') return;

      const locale = language();
      const words = WORDS[locale];
      const line = document.createElement('p');
      line.textContent = words.line;
      const reload = document.createElement('button');
      reload.type = 'button';
      reload.textContent = words.reload;
      reload.addEventListener('click', () => location.reload());

      const failed = document.createElement('div');
      failed.className = 'failed';
      failed.lang = locale;
      failed.setAttribute('role', 'alert');
      failed.append(line, reload);
      mark.replaceChildren(failed);
      reload.focus();
    },
    // A script's error does not bubble: caught on its way down.
    true,
  );
})();
