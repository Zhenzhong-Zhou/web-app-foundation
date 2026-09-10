#!/usr/bin/env node
/**
 * Verifies the drizzle snapshot chain before a generate.
 *
 * Every snapshot carries an `id` and a `prevId` pointing at the one before it.
 * Copying a snapshot file — which is the obvious way to fix a numbering
 * mistake — duplicates both, leaving two snapshots claiming one identity.
 * drizzle-kit reports that as a collision and refuses to generate, and the
 * message names the files without saying what is wrong with them.
 *
 * This has cost an hour twice. Five seconds here is the trade.
 *
 *   node scripts/check-snapshots.js
 */
const fs = require('node:fs');
const path = require('node:path');

const META = path.join(
  __dirname,
  '..',
  'src',
  'database',
  'migrations',
  'meta',
);

const files = fs
  .readdirSync(META)
  .filter((name) => /^\d+_snapshot\.json$/.test(name))
  .sort();

if (!files.length) {
  console.error(`No snapshots in ${META}`);
  process.exit(1);
}

let previous = null;
let broken = 0;

for (const name of files) {
  const snapshot = JSON.parse(fs.readFileSync(path.join(META, name), 'utf8'));
  const expected = previous ?? snapshot.prevId;
  const ok = snapshot.prevId === expected;

  if (!ok) broken += 1;

  console.log(
    `${ok ? 'ok   ' : 'BREAK'} ${name}  ${String(snapshot.id).slice(0, 8)} <- ${String(snapshot.prevId).slice(0, 8)}${ok ? '' : `  expected ${String(expected).slice(0, 8)}`}`,
  );

  previous = snapshot.id;
}

if (broken) {
  console.error(
    `\n${broken} broken link(s). Set the offending prevId to the previous snapshot's id;` +
      ' if two share an id, give the later one a fresh uuid and repoint the one after it.',
  );
  process.exit(1);
}

console.log(`\n${files.length} snapshots, chain intact.`);
