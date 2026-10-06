/**
 * Fails when the catalogues and the code disagree (ADR-054).
 *
 * 1. src/locales/en.json is exactly what the code says: every message the
 *    components define, with its English, and nothing else. A message added
 *    in code and not extracted would ship in English to everyone; one left
 *    in the catalogue after the code dropped it is a translation nobody
 *    reads.
 * 2. Every id is named by its feature folder: `orders.receive.title`, not a
 *    hash and not an English sentence, so a copy edit never orphans a
 *    translation.
 * 3. Every other catalogue has exactly English's keys, and each translation
 *    the same placeholders as its English: a `{name}` dropped or renamed is
 *    a sentence that prints with a hole in it.
 * 4. Every message parses as ICU.
 *
 * What it cannot see is a translation gone stale after its English changed;
 * ADR-054 has that commit list the keys in the handoff instead.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse, TYPE } from '@formatjs/icu-messageformat-parser';

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES = path.join(CLIENT, 'src/locales');
const OTHERS = ['fr-CA', 'zh-Hans'];
const ID = /^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)+$/;

const problems = [];
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));

// 1. What the code says, extracted afresh, against what is committed.
const scratch = mkdtempSync(path.join(tmpdir(), 'catalogue-'));
const extracted = path.join(scratch, 'en.json');
try {
  execFileSync(
    path.join(CLIENT, 'node_modules/.bin/formatjs'),
    [
      'extract',
      'src/**/*.{ts,tsx}',
      '--ignore',
      'src/**/*.test.{ts,tsx}',
      '--ignore',
      'src/test/**',
      '--format',
      'simple',
      '--throws',
      '--out-file',
      extracted,
    ],
    { cwd: CLIENT, stdio: ['ignore', 'ignore', 'inherit'] },
  );
} catch {
  console.error('Extraction failed; the error is above.');
  process.exit(1);
}

const code = read(extracted);
rmSync(scratch, { recursive: true, force: true });
const english = read(path.join(LOCALES, 'en.json'));

const notExtracted = Object.keys(code).filter((id) => english[id] !== code[id]);
const notInCode = Object.keys(english).filter((id) => !(id in code));
if (notExtracted.length > 0 || notInCode.length > 0) {
  problems.push(
    'src/locales/en.json does not match the code. Run `npm run i18n:extract`.' +
      (notExtracted.length
        ? `\n  New or changed: ${notExtracted.join(', ')}`
        : '') +
      (notInCode.length ? `\n  No longer used: ${notInCode.join(', ')}` : ''),
  );
}

// 2. Ids named by feature folder.
const badIds = Object.keys(code).filter((id) => !ID.test(id));
if (badIds.length > 0) {
  problems.push(
    `Ids must be named by feature folder, like orders.receive.title: ${badIds.join(', ')}`,
  );
}

/** The argument and tag names a message uses, or an error if it won't parse. */
function placeholders(message) {
  const names = new Set();
  const walk = (elements) => {
    for (const element of elements) {
      if (element.type === TYPE.literal || element.type === TYPE.pound)
        continue;
      names.add(element.value);
      if (element.type === TYPE.tag) walk(element.children);
      if (element.type === TYPE.select || element.type === TYPE.plural) {
        for (const option of Object.values(element.options)) walk(option.value);
      }
    }
  };
  walk(parse(message));
  return names;
}

function parsed(locale, id, message) {
  try {
    return placeholders(message);
  } catch (error) {
    problems.push(`${locale} ${id} is not valid ICU: ${error.message}`);
    return null;
  }
}

const englishPlaceholders = Object.fromEntries(
  Object.entries(english).map(([id, message]) => [
    id,
    parsed('en', id, message),
  ]),
);

// 3 and 4. Every other catalogue against English.
for (const locale of OTHERS) {
  const catalogue = read(path.join(LOCALES, `${locale}.json`));

  const missing = Object.keys(english).filter((id) => !(id in catalogue));
  const extra = Object.keys(catalogue).filter((id) => !(id in english));
  if (missing.length > 0) {
    problems.push(`${locale}.json lacks: ${missing.join(', ')}`);
  }
  if (extra.length > 0) {
    problems.push(
      `${locale}.json has keys English does not: ${extra.join(', ')}`,
    );
  }

  for (const [id, message] of Object.entries(catalogue)) {
    const theirs = parsed(locale, id, message);
    const ours = englishPlaceholders[id];
    if (!theirs || !ours) continue;

    const same =
      theirs.size === ours.size && [...ours].every((name) => theirs.has(name));
    if (!same) {
      problems.push(
        `${locale} ${id} uses {${[...theirs].join(', ')}}; English uses {${[...ours].join(', ')}}`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}

console.log(
  `Catalogues agree: ${Object.keys(english).length} messages in en, ${OTHERS.join(' and ')}.`,
);
