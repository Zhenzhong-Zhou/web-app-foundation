/**
 * Tests for i18n-review.mjs, on Node's own runner: scripts/ sits outside
 * both packages, so neither one's Vitest would find them.
 *
 *     node --test scripts/
 *
 * Each test copies the script into a temporary folder laid out as the
 * repository is, with a small catalogue in each package, and runs it
 * there, since the script reads the catalogues beside it. Both packages'
 * node_modules are linked in for their FormatJS, so run `npm install` in
 * client/ and server/ first.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { git, repository, write } from "./git-fixture.mjs";
import { readWorkbook, workbook } from "./i18n-review.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const CATALOGUES = {
  // Out of order, so the export's rows show it sorts them by id.
  "client/src/locales/en.json": {
    greeting: "Hello, {name}",
    farewell: "Don't go",
  },
  "client/src/locales/fr-CA.json": {
    farewell: "Ne pars pas",
    greeting: "Bonjour, {name}",
  },
  "client/src/locales/zh-Hans.json": {
    farewell: "别走",
    greeting: "你好，{name}",
  },
  "server/src/i18n/en.json": { "mail.subject": "Invoice {number}" },
  "server/src/i18n/fr-CA.json": { "mail.subject": "Facture {number}" },
  "server/src/i18n/zh-Hans.json": { "mail.subject": "发票 {number}" },
};

/** Where each message is defined, which export's Where column names. */
const SOURCES = {
  "client/src/app.tsx": `intl.formatMessage({ id: "farewell", defaultMessage: "Don't go" });
intl.formatMessage({ id: "greeting", defaultMessage: "Hello, {name}" });
`,
  "server/src/mail.ts": `t({ id: "mail.subject", defaultMessage: "Invoice {number}" });
`,
};

const HEADER = [
  "Area",
  "Id",
  "Where",
  "English",
  "Translation",
  "Correction",
  "Note",
  "Placeholders to keep",
];

const writeJson = (root, file, value) =>
  write(root, file, `${JSON.stringify(value, null, 2)}\n`);

const readText = (root, file) => readFileSync(path.join(root, file), "utf8");

const sheet = (root, file) => readWorkbook(readFileSync(path.join(root, file)));

/** A temporary repository: the script, the catalogues and their sources. */
function fixture(t) {
  const root = repository(t, "i18n-review");
  mkdirSync(path.join(root, "scripts"));
  copyFileSync(
    path.join(ROOT, "scripts/i18n-review.mjs"),
    path.join(root, "scripts/i18n-review.mjs"),
  );
  for (const area of ["client", "server"]) {
    mkdirSync(path.join(root, area));
    symlinkSync(
      path.join(ROOT, area, "node_modules"),
      path.join(root, area, "node_modules"),
    );
  }
  for (const [file, messages] of Object.entries(CATALOGUES)) {
    writeJson(root, file, messages);
  }
  for (const [file, text] of Object.entries(SOURCES)) write(root, file, text);
  return root;
}

/** The fixture's copy of the script, run as a person runs it. */
const review = (root, ...args) =>
  spawnSync(
    process.execPath,
    [path.join(root, "scripts/i18n-review.mjs"), ...args],
    { encoding: "utf8" },
  );

/**
 * The workbook as a reviewer returns it: each id's Correction filled in,
 * the rows in the order given, saved over the export.
 */
function correct(root, file, corrections, order = (rows) => rows) {
  const {
    sheetName,
    rows: [header, ...messages],
  } = sheet(root, file);
  const id = header.indexOf("Id");
  const correction = header.indexOf("Correction");
  for (const row of messages) {
    if (Object.hasOwn(corrections, row[id])) {
      row[correction] = corrections[row[id]];
    }
  }
  const columns = header.map((title) => ({ title, width: 30 }));
  writeFileSync(
    path.join(root, file),
    workbook(sheetName, columns, [header, ...order(messages)]),
  );
}

test("export writes a row per message, the screens' then the server's", (t) => {
  const root = fixture(t);

  const run = review(root, "export");
  assert.equal(run.status, 0, run.stderr);

  const french = sheet(root, "review/fr-CA.xlsx");
  assert.equal(french.sheetName, "fr-CA");
  assert.deepEqual(french.rows, [
    HEADER,
    [
      "Screens",
      "farewell",
      "client/src/app.tsx",
      "Don't go",
      "Ne pars pas",
      "",
      "",
      "",
    ],
    [
      "Screens",
      "greeting",
      "client/src/app.tsx",
      "Hello, {name}",
      "Bonjour, {name}",
      "",
      "",
      "{name}",
    ],
    [
      "Server",
      "mail.subject",
      "server/src/mail.ts",
      "Invoice {number}",
      "Facture {number}",
      "",
      "",
      "{number}",
    ],
  ]);

  const chinese = sheet(root, "review/zh-Hans.xlsx");
  assert.equal(chinese.sheetName, "zh-Hans");
  assert.deepEqual(
    chinese.rows.map((row) => row[HEADER.indexOf("Translation")]),
    ["Translation", "别走", "你好，{name}", "发票 {number}"],
  );
});

test("export --since leaves out English changed only in its apostrophes", (t) => {
  const root = fixture(t);
  git(root, "add", ".");
  git(
    root,
    "commit",
    "--quiet",
    "--message",
    "The catalogues the last round was exported at",
  );
  const baseline = git(root, "rev-parse", "--short", "HEAD").trim();

  writeJson(root, "client/src/locales/en.json", {
    farewell: "Don’t go",
    greeting: "Hi, {name}",
    welcome: "Welcome",
  });
  writeJson(root, "client/src/locales/fr-CA.json", {
    ...CATALOGUES["client/src/locales/fr-CA.json"],
    welcome: "Bienvenue",
  });
  writeJson(root, "client/src/locales/zh-Hans.json", {
    ...CATALOGUES["client/src/locales/zh-Hans.json"],
    welcome: "欢迎",
  });

  const run = review(root, "export", "--since", baseline);
  assert.equal(run.status, 0, run.stderr);
  assert.match(
    run.stdout,
    new RegExp(
      `fr-CA\\.since-${baseline}\\.xlsx: 2 messages new or changed since ${baseline}; ` +
        "1 left out, their English changed only in its apostrophes",
    ),
  );

  const { rows } = sheet(root, `review/fr-CA.since-${baseline}.xlsx`);
  assert.deepEqual(
    rows.map((row) => [row[HEADER.indexOf("Id")], row.at(-1)]),
    [
      ["Id", `Since ${baseline}`],
      ["greeting", "English changed"],
      ["welcome", "New"],
    ],
  );
});

test("import writes each correction into its message's catalogue, by its id", (t) => {
  const root = fixture(t);
  assert.equal(review(root, "export").status, 0);
  const before = Object.fromEntries(
    Object.keys(CATALOGUES).map((file) => [file, readText(root, file)]),
  );

  // Reversed, as a reviewer's sort might leave them, so a row's place
  // says nothing about which message it corrects.
  correct(
    root,
    "review/fr-CA.xlsx",
    { greeting: "Salut, {name}", "mail.subject": "Facture no {number}" },
    (rows) => rows.toReversed(),
  );

  const run = review(root, "import", path.join(root, "review/fr-CA.xlsx"));
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /client\/src\/locales\/fr-CA\.json: 1 corrected\./);
  assert.match(run.stdout, /server\/src\/i18n\/fr-CA\.json: 1 corrected\./);

  assert.equal(
    readText(root, "client/src/locales/fr-CA.json"),
    `${JSON.stringify({ farewell: "Ne pars pas", greeting: "Salut, {name}" }, null, 2)}\n`,
  );
  assert.equal(
    readText(root, "server/src/i18n/fr-CA.json"),
    `${JSON.stringify({ "mail.subject": "Facture no {number}" }, null, 2)}\n`,
  );
  for (const file of Object.keys(CATALOGUES).filter(
    (file) => !file.endsWith("/fr-CA.json"),
  )) {
    assert.equal(readText(root, file), before[file], file);
  }
});

test("import refuses a correction to a message removed since the export, writing nothing", (t) => {
  const root = fixture(t);
  assert.equal(review(root, "export").status, 0);
  correct(root, "review/fr-CA.xlsx", {
    farewell: "Ne t’en va pas",
    greeting: "Salut, {name}",
  });

  // farewell leaves the code, and so its catalogues, after the export.
  writeJson(root, "client/src/locales/en.json", { greeting: "Hello, {name}" });
  writeJson(root, "client/src/locales/fr-CA.json", {
    greeting: "Bonjour, {name}",
  });
  const before = readText(root, "client/src/locales/fr-CA.json");

  const run = review(root, "import", path.join(root, "review/fr-CA.xlsx"));
  assert.equal(run.status, 1);
  assert.match(run.stderr, /^Nothing written\./);
  assert.match(
    run.stderr,
    /row 2 farewell: removed from Screens since the export, so there is nothing to correct; clear the row's Correction/,
  );
  assert.equal(readText(root, "client/src/locales/fr-CA.json"), before);
});
