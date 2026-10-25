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
