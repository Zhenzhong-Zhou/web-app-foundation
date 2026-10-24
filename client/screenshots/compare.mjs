/**
 * Two runs of `npm run screenshots` on one page, each picture before beside
 * after, to look over a visual change:
 *
 *     npm run screenshots:compare -- [--out <folder>] <before> <after>
 *
 * Each folder holds one run's pictures, named as capture.spec.ts names them,
 * `<order>-<page>.<language>.<mode>.<width>.png`. The page is written as
 * compare.html in --out's folder, or without it in the nearest folder that
 * holds both, when that is inside the repository's tmp/; anywhere else,
 * such as the repository itself when one run is still screenshots/out, it
 * asks for --out rather than leave a page git would see. The page finds the
 * pictures by relative path, so it opens from its folder without a server.
 *
 * Grouped by page, then language, mode and width in the order they are
 * taken, with checkboxes to show only some. A pair whose files are the same
 * bytes is marked identical; one whose files differ may still look the
 * same, a pixel of anti-aliasing apart, so a difference is for a person to
 * judge. A picture in one run only is shown beside its gap.
 *
 * No dependencies: Node's own modules only.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const LANGUAGES = { en: 'English', 'fr-CA': 'Français', 'zh-Hans': '中文' };
const MODES = { light: 'Light', dark: 'Dark' };
const WIDTHS = { desktop: 'Desktop', laptop: 'Laptop', phone: 'Phone' };

const USAGE =
  'Usage: npm run screenshots:compare -- [--out <folder>] <before folder> <after folder>';

let options;
try {
  options = parseArgs({
    options: { out: { type: 'string' } },
    allowPositionals: true,
  });
} catch (error) {
  console.error(`${error.message}\n${USAGE}`);
  process.exit(2);
}
if (options.positionals.length !== 2) {
  console.error(USAGE);
  process.exit(2);
}

// npm runs the script in client/; the folders are read from where it was
// typed.
const typedIn = process.env.INIT_CWD ?? process.cwd();
const [before, after] = options.positionals.map((folder) =>
  path.resolve(typedIn, folder),
);

function pictures(folder) {
  try {
    return readdirSync(folder).filter((name) => name.endsWith('.png'));
  } catch {
    console.error(`No folder ${folder}.`);
    process.exit(1);
  }
}

/** Where the page goes: --out, or the nearest folder holding both. */
let out;
if (options.values.out) {
  out = path.resolve(typedIn, options.values.out);
  mkdirSync(out, { recursive: true });
} else {
  out = before;
  while (path.relative(out, after).split(path.sep)[0] === '..') {
    out = path.dirname(out);
  }
  // Inside tmp/, which git ignores; anywhere else the page could be
  // committed by mistake, at the repository's root at worst.
  const tmp = fileURLToPath(new URL('../../tmp', import.meta.url));
  const inside = path.relative(tmp, out);
  if (inside.startsWith('..') || path.isAbsolute(inside)) {
    console.error(
      `The folder holding both runs is ${out}, outside the repository's tmp/. ` +
        'Say where the page goes: --out ../tmp/<branch>, for one.',
    );
    process.exit(2);
  }
}

const escape = (text) =>
  text.replace(
    /[&<>"]/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char],
  );
const link = (file) =>
  path.relative(out, file).split(path.sep).map(encodeURIComponent).join('/');
const label = (names, key) => names[key] ?? key;

// Known values in the order they are taken, any other after them by name
// (Infinity less Infinity is NaN, which falls through to the name).
const rank = (names, key) => {
  const at = Object.keys(names).indexOf(key);
  return at === -1 ? Infinity : at;
};
const byRank = (names) => (a, b) =>
  rank(names, a) - rank(names, b) || a.localeCompare(b);

const shots = new Map();
for (const name of new Set([...pictures(before), ...pictures(after)])) {
  const parts = name.slice(0, -'.png'.length).split('.');
  if (parts.length !== 4) {
    console.error(`Skipped ${name}: not named as npm run screenshots names.`);
    continue;
  }
  const [page, language, mode, width] = parts;
  if (!shots.has(page)) shots.set(page, []);
  shots.get(page).push({ name, language, mode, width });
}

if (shots.size === 0) {
  console.error('No pictures in either folder.');
  process.exit(1);
}

const pages = [...shots.keys()].sort();
const seen = (key) => [
  ...new Set([...shots.values()].flat().map((s) => s[key])),
];
const languages = seen('language').sort(byRank(LANGUAGES));
const modes = seen('mode').sort(byRank(MODES));
const widths = seen('width').sort(byRank(WIDTHS));

function side(folder, heading, name) {
  const file = path.join(folder, name);
  let bytes;
  try {
    bytes = readFileSync(file);
  } catch {
    return {
      bytes: null,
      html: `<p><span>${heading}</span>Not in this run</p>`,
    };
  }
  const src = escape(link(file));
  return {
    bytes,
    html: `<a href="${src}" target="_blank"><span>${heading}</span><img loading="lazy" src="${src}" alt="${heading}: ${escape(name)}"></a>`,
  };
}

function pair({ name, language, mode, width }) {
  const old = side(before, 'Before', name);
  const now = side(after, 'After', name);
  const missing = old.bytes === null || now.bytes === null;
  const same = !missing && old.bytes.equals(now.bytes);
  const note = missing
    ? 'in one run only'
    : same
      ? 'identical'
      : 'files differ';

  const html = `
      <figure class="pair ${escape(width)}" data-language="${escape(language)}" data-mode="${escape(mode)}" data-width="${escape(width)}" data-same="${same}">
        <figcaption>${escape([label(LANGUAGES, language), label(MODES, mode), label(WIDTHS, width)].join(' · '))}
          <span class="${same ? 'same' : 'moved'}">${note}</span></figcaption>
        <div class="sides">
          ${old.html}
          ${now.html}
        </div>
      </figure>`;
  return { html, same, missing };
}

const inOrder = (a, b) =>
  byRank(LANGUAGES)(a.language, b.language) ||
  byRank(MODES)(a.mode, b.mode) ||
  byRank(WIDTHS)(a.width, b.width);

const compared = new Map(
  pages.map((page) => [page, shots.get(page).sort(inOrder).map(pair)]),
);
const all = [...compared.values()].flat();
const pairs = all.length;
const identical = all.filter((each) => each.same).length;
const alone = all.filter((each) => each.missing).length;

const sections = pages
  .map(
    (page) => `
  <section class="page" id="${escape(page)}">
    <h2>${escape(page)}</h2>${compared
      .get(page)
      .map((each) => each.html)
      .join('')}
  </section>`,
  )
  .join('');

const boxes = (legend, key, values, names) => `
    <fieldset><legend>${legend}</legend>
      ${values.map((value) => `<label><input type="checkbox" name="${key}" value="${escape(value)}" checked> ${escape(label(names, value))}</label>`).join('\n      ')}</fieldset>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Screenshots before and after</title>
<style>
  :root { --bg: #eef0f3; --panel: #ffffff; --text: #141a24; --muted: #5b6575; --line: #d5d9e0; --moved: #8a5300; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0f1217; --panel: #1e232c; --text: #e6e9ef; --muted: #a3acba; --line: #333a46; --moved: #f2c26b; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 system-ui, sans-serif; }
  header { position: sticky; top: 0; z-index: 1; background: var(--panel); border-bottom: 1px solid var(--line); padding: 12px 16px; }
  header h1 { margin: 0 0 4px; font-size: 18px; }
  header p { margin: 0 0 8px; color: var(--muted); }
  fieldset { display: inline-flex; gap: 12px; border: 0; padding: 0; margin: 0 20px 0 0; flex-wrap: wrap; }
  legend { float: left; margin-right: 8px; color: var(--muted); }
  main { padding: 16px; max-width: 1600px; margin: 0 auto; }
  nav ul { columns: 3 220px; margin: 0 0 24px; padding-left: 20px; }
  .page { margin-bottom: 40px; }
  .page h2 { font-size: 20px; border-bottom: 1px solid var(--line); padding-bottom: 4px; }
  .pair { margin: 0 0 20px; background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 8px; }
  .pair figcaption { margin-bottom: 6px; font-weight: 600; }
  .pair figcaption span { font-weight: 400; margin-left: 8px; color: var(--muted); }
  .pair figcaption .moved { color: var(--moved); }
  .sides { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .pair.phone .sides { grid-template-columns: repeat(2, minmax(0, 390px)); }
  .sides a, .sides p { display: block; margin: 0; color: var(--muted); text-decoration: none; }
  .sides span { display: block; font-size: 13px; }
  .sides img { display: block; width: 100%; height: auto; border: 1px solid var(--line); }
  .hidden { display: none; }
</style>
</head>
<body>
<header>
  <h1>Screenshots before and after</h1>
  <p>Before is <code>${escape(link(before) || '.')}</code>, after is <code>${escape(link(after) || '.')}</code>: ${pairs} pictures, ${identical} identical, ${alone} in one run only. Files that differ may still look the same. Click a picture to open it full size.</p>
  <form id="filters">${boxes('Language', 'language', languages, LANGUAGES)}${boxes('Mode', 'mode', modes, MODES)}${boxes('Width', 'width', widths, WIDTHS)}
    <fieldset><legend>Show</legend>
      <label><input type="checkbox" name="differOnly"> Only pictures whose files differ</label></fieldset>
  </form>
</header>
<main>
  <nav><ul>
${pages.map((page) => `      <li><a href="#${escape(page)}">${escape(page)}</a></li>`).join('\n')}
  </ul></nav>${sections}
</main>
<script>
  const form = document.getElementById('filters');
  function apply() {
    const on = (name) => new Set([...form.querySelectorAll('input[name="' + name + '"]:checked')].map((box) => box.value));
    const language = on('language'), mode = on('mode'), width = on('width');
    const differOnly = form.elements.differOnly.checked;
    for (const pair of document.querySelectorAll('.pair')) {
      const shown = language.has(pair.dataset.language) && mode.has(pair.dataset.mode) && width.has(pair.dataset.width)
        && (!differOnly || pair.dataset.same === 'false');
      pair.classList.toggle('hidden', !shown);
    }
  }
  form.addEventListener('change', apply);
  apply();
</script>
</body>
</html>
`;

const page = path.join(out, 'compare.html');
writeFileSync(page, html);
console.log(
  `Wrote ${page}: ${pairs} pictures, ${identical} identical, ${alone} in one run only.`,
);
