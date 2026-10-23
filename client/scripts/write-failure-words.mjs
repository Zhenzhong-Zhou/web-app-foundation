/**
 * Writes src/i18n/compiled/failure-words.json: the few messages that say a
 * language's catalogue would not load, in each language but English
 * (ADR-081, as built). The catalogue that failed is the one that holds
 * them, so they ship in the main chunk instead, and the person reads why
 * in the language they chose. English is there already.
 *
 * Their ids are src/i18n/failure-ids.json, which language-failure.tsx
 * reads too. Taken from the compiled catalogues `formatjs compile-folder`
 * has just written, so the translations stay in src/locales/ with every
 * other; run after it by `npm run i18n:compile`, and by the dev server's
 * recompile (vite.config.ts).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPILED = path.join(CLIENT, 'src/i18n/compiled');
const IDS = JSON.parse(
  readFileSync(path.join(CLIENT, 'src/i18n/failure-ids.json'), 'utf8'),
);
const OTHERS = ['fr-CA', 'zh-Hans'];

const words = {};
for (const locale of OTHERS) {
  const catalogue = JSON.parse(
    readFileSync(path.join(COMPILED, `${locale}.json`), 'utf8'),
  );
  words[locale] = {};
  for (const id of IDS) {
    if (!(id in catalogue)) {
      console.error(`${id} is missing from ${locale}'s catalogue.`);
      process.exit(1);
    }
    words[locale][id] = catalogue[id];
  }
}

writeFileSync(path.join(COMPILED, 'failure-words.json'), JSON.stringify(words));
