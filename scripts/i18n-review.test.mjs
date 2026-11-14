/**
 * Tests for i18n-review.mjs, on Node's own runner: scripts/ sits outside
 * both packages, so neither one's Vitest would find them.
 *
 *     node --test scripts/
 *
 * Each test copies the script, with the rules check whose Settled
 * messages import reads, into a temporary folder laid out as the
 * repository is, with a small catalogue in each package, two small guides
 * and a glossary, and runs it there, since the script reads the files
 * beside it. Both packages' node_modules are linked in for their
 * FormatJS, so run `npm install` in client/ and server/ first.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { git, repository, write } from "./git-fixture.mjs";
import { readWorkbook, workbook, zip } from "./i18n-review.mjs";

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

/** Two small guides, each with its opening and sections, in every language. */
const GUIDES = {
  "client/src/help/guides/en/home.md": `# Home

Home is the first page you see.

## Every day {#today}

Press **Refresh** to read the counts again. Late orders are on [Orders](/orders#late).

## Words you’ll meet {#words}

- **Late**: past its day.
`,
  "client/src/help/guides/fr-CA/home.md": `# Accueil

L’accueil est la première page que vous voyez.

## Chaque jour {#today}

Appuyez sur **Actualiser** pour relire les totaux. Les commandes en retard sont dans [Commandes](/orders#late).

## Les mots que vous verrez {#words}

- **En retard** : après son jour.
`,
  "client/src/help/guides/zh-Hans/home.md": `# 首页

首页是您看到的第一个页面。

## 每天 {#today}

点**刷新**重新读取数量。逾期的订单在[订单](/orders#late)里。

## 常见词 {#words}

- **逾期**：已过了它的日期。
`,
  "client/src/help/guides/en/orders.md": `# Orders

## Raise an order {#raise}

Press **Raise an order**.
`,
  "client/src/help/guides/fr-CA/orders.md": `# Commandes

## Créer une commande {#raise}

Appuyez sur **Créer une commande**.
`,
  "client/src/help/guides/zh-Hans/orders.md": `# 订单

## 创建订单 {#raise}

点**创建订单**。
`,
};

/** The glossary's Settled messages: the Chinese farewell. */
const GLOSSARY = `# Glossary

## Settled messages

| Id | Language | Text | Decided in |
| --- | --- | --- | --- |
| \`farewell\` | 简体中文 | \`别走\` | A test’s |
`;

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
  for (const script of ["i18n-review.mjs", "i18n-rules.mjs"]) {
    copyFileSync(
      path.join(ROOT, "scripts", script),
      path.join(root, "scripts", script),
    );
  }
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
  for (const [file, text] of Object.entries({
    ...SOURCES,
    ...GUIDES,
    "docs/glossary.md": GLOSSARY,
  })) {
    write(root, file, text);
  }
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

/** Every catalogue's text, to show an import refused wrote nothing. */
const allCatalogues = (root) =>
  Object.fromEntries(
    Object.keys(CATALOGUES).map((file) => [file, readText(root, file)]),
  );

test("import refuses a correction whose English changed since the export, writing nothing", (t) => {
  const root = fixture(t);
  assert.equal(review(root, "export").status, 0);
  correct(root, "review/fr-CA.xlsx", {
    greeting: "Salut, {name}",
    "mail.subject": "Facture no {number}",
  });

  // greeting's English is reworded after the export.
  writeJson(root, "client/src/locales/en.json", {
    ...CATALOGUES["client/src/locales/en.json"],
    greeting: "Hi, {name}",
  });
  const before = allCatalogues(root);

  const run = review(root, "import", path.join(root, "review/fr-CA.xlsx"));
  assert.equal(run.status, 1);
  assert.match(run.stderr, /^Nothing written\./);
  assert.match(
    run.stderr,
    /row 3 greeting: its English changed since the export, so clear its Correction; the next round reads it/,
  );
  assert.doesNotMatch(run.stderr, /mail\.subject/);
  assert.deepEqual(allCatalogues(root), before);
});

test("import refuses a correction whose translation changed since the export", (t) => {
  const root = fixture(t);
  assert.equal(review(root, "export").status, 0);
  correct(root, "review/zh-Hans.xlsx", { "mail.subject": "发票 {number} 号" });

  // Someone else's commit corrects the same message after the export.
  writeJson(root, "server/src/i18n/zh-Hans.json", {
    "mail.subject": "发票 #{number}",
  });
  const before = allCatalogues(root);

  const run = review(root, "import", path.join(root, "review/zh-Hans.xlsx"));
  assert.equal(run.status, 1);
  assert.match(
    run.stderr,
    /row 4 mail\.subject: its translation changed since the export, so clear its Correction; the next round reads it/,
  );
  assert.deepEqual(allCatalogues(root), before);
});

test("import takes a correction whose English changed only in its apostrophes", (t) => {
  const root = fixture(t);
  assert.equal(review(root, "export").status, 0);
  correct(root, "review/fr-CA.xlsx", { farewell: "Ne t’en va pas" });

  // #184's kind of change: ' for ’, nothing a reviewer reads differently.
  writeJson(root, "client/src/locales/en.json", {
    ...CATALOGUES["client/src/locales/en.json"],
    farewell: "Don’t go",
  });

  const run = review(root, "import", path.join(root, "review/fr-CA.xlsx"));
  assert.equal(run.status, 0, run.stderr);
  assert.equal(
    readText(root, "client/src/locales/fr-CA.json"),
    `${JSON.stringify({ farewell: "Ne t’en va pas", greeting: "Bonjour, {name}" }, null, 2)}\n`,
  );
});

test("import refuses a correction to a settled message, naming it, and takes one that keeps its text", (t) => {
  const root = fixture(t);
  assert.equal(review(root, "export").status, 0);
  correct(root, "review/zh-Hans.xlsx", {
    farewell: "不要走",
    greeting: "您好，{name}",
  });
  const before = allCatalogues(root);

  const run = review(root, "import", path.join(root, "review/zh-Hans.xlsx"));
  assert.equal(run.status, 1);
  assert.match(run.stderr, /^Nothing written\./);
  assert.match(
    run.stderr,
    /row 2 farewell: settled, its text held by docs\/glossary\.md's Settled messages, so clear its Correction, or change its row there first/,
  );
  assert.doesNotMatch(run.stderr, /greeting/);
  assert.deepEqual(allCatalogues(root), before);

  // Settled in Chinese only, and a Correction that is today's text is no
  // change to it.
  correct(root, "review/zh-Hans.xlsx", { farewell: "别走" });
  correct(root, "review/fr-CA.xlsx", { farewell: "Ne t’en va pas" });
  for (const language of ["zh-Hans", "fr-CA"]) {
    const again = review(
      root,
      "import",
      path.join(root, `review/${language}.xlsx`),
    );
    assert.equal(again.status, 0, again.stderr);
  }
  assert.deepEqual(
    JSON.parse(readText(root, "client/src/locales/zh-Hans.json")),
    { farewell: "别走", greeting: "您好，{name}" },
  );
  assert.equal(
    JSON.parse(readText(root, "client/src/locales/fr-CA.json")).farewell,
    "Ne t’en va pas",
  );
});

test("import refuses a workbook without the English or Translation title, naming it", (t) => {
  const root = fixture(t);
  assert.equal(review(root, "export").status, 0);

  // The reviewer deletes the Translation column before returning it.
  const file = "review/fr-CA.xlsx";
  const { sheetName, rows } = sheet(root, file);
  const at = HEADER.indexOf("Translation");
  const kept = rows.map((row) => row.filter((_, index) => index !== at));
  writeFileSync(
    path.join(root, file),
    workbook(
      sheetName,
      kept[0].map((title) => ({ title, width: 30 })),
      kept,
    ),
  );

  const run = review(root, "import", path.join(root, file));
  assert.equal(run.status, 1);
  assert.match(run.stderr, /^The first row has no Translation title\./);
});

test("the reader reads a workbook whose tags carry a namespace prefix, as some of ChatGPT's do", () => {
  const main = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const book = zip([
    [
      "xl/workbook.xml",
      `<x:workbook xmlns:x="${main}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><x:sheets><x:sheet name="zh-Hans" sheetId="1" r:id="rId1"/></x:sheets></x:workbook>`,
    ],
    [
      "xl/_rels/workbook.xml.rels",
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    ],
    [
      "xl/sharedStrings.xml",
      `<x:sst xmlns:x="${main}"><x:si><x:t>Correction</x:t></x:si><x:si><x:r><x:t>别</x:t></x:r><x:r><x:t>走开</x:t></x:r></x:si></x:sst>`,
    ],
    [
      "xl/worksheets/sheet1.xml",
      `<x:worksheet xmlns:x="${main}"><x:sheetData>` +
        `<x:row r="1"><x:c r="A1" t="inlineStr"><x:is><x:t>Id</x:t></x:is></x:c><x:c r="C1" t="s"><x:v>0</x:v></x:c></x:row>` +
        `<x:row r="2"><x:c r="A2" t="inlineStr"><x:is><x:t xml:space="preserve">farewell</x:t></x:is></x:c><x:c r="B2"/><x:c r="C2" t="s"><x:v>1</x:v></x:c></x:row>` +
        `</x:sheetData></x:worksheet>`,
    ],
  ]);

  assert.deepEqual(readWorkbook(book), {
    sheetName: "zh-Hans",
    rows: [
      ["Id", "", "Correction"],
      ["farewell", "", "别走开"],
    ],
  });
});

// ------------------------------------------------------------------ guides

const GUIDE_FILES = Object.keys(GUIDES);

/** Every catalogue's and guide's text, to show what an import changed. */
const allFiles = (root) =>
  Object.fromEntries(
    [...Object.keys(CATALOGUES), ...GUIDE_FILES].map((file) => [
      file,
      readText(root, file),
    ]),
  );

test("export --only guides writes a row per section, each guide's opening first", (t) => {
  const root = fixture(t);

  const run = review(root, "export", "--only", "guides");
  assert.equal(run.status, 0, run.stderr);
  assert.match(
    run.stdout,
    /review\/fr-CA\.guides\.xlsx: 5 sections to review\./,
  );
  assert.equal(existsSync(path.join(root, "review/fr-CA.xlsx")), false);

  const french = sheet(root, "review/fr-CA.guides.xlsx");
  assert.equal(french.sheetName, "fr-CA");
  const at = (title) => HEADER.indexOf(title);
  assert.deepEqual(
    french.rows.map((row) => [
      row[at("Area")],
      row[at("Id")],
      row[at("Where")],
      row[at("Placeholders to keep")],
    ]),
    [
      ["Area", "Id", "Where", "Placeholders to keep"],
      ["Guides", "home", "client/src/help/guides/fr-CA/home.md", ""],
      [
        "Guides",
        "home#today",
        "client/src/help/guides/fr-CA/home.md",
        "{#today} (/orders#late)",
      ],
      [
        "Guides",
        "home#words",
        "client/src/help/guides/fr-CA/home.md",
        "{#words}",
      ],
      ["Guides", "orders", "client/src/help/guides/fr-CA/orders.md", ""],
      [
        "Guides",
        "orders#raise",
        "client/src/help/guides/fr-CA/orders.md",
        "{#raise}",
      ],
    ],
  );
  assert.deepEqual(
    [french.rows[1][at("English")], french.rows[1][at("Translation")]],
    [
      "# Home\n\nHome is the first page you see.",
      "# Accueil\n\nL’accueil est la première page que vous voyez.",
    ],
  );
  assert.equal(
    french.rows[2][at("English")],
    "## Every day {#today}\n\nPress **Refresh** to read the counts again. Late orders are on [Orders](/orders#late).",
  );
});

test("export --only catalogues writes no guides' workbook, and --only takes nothing else", (t) => {
  const root = fixture(t);

  const run = review(root, "export", "--only", "catalogues");
  assert.equal(run.status, 0, run.stderr);
  assert.equal(existsSync(path.join(root, "review/fr-CA.xlsx")), true);
  assert.equal(existsSync(path.join(root, "review/fr-CA.guides.xlsx")), false);

  const wrong = review(root, "export", "--only", "emails");
  assert.equal(wrong.status, 1);
  assert.match(wrong.stderr, /^Usage:/);
});

test("export --since lists the sections new or changed since, not those changed only in their quotes", (t) => {
  const root = fixture(t);
  git(root, "add", ".");
  git(root, "commit", "--quiet", "--message", "The guides last exported");
  const baseline = git(root, "rev-parse", "--short", "HEAD").trim();

  const home = GUIDES["client/src/help/guides/en/home.md"]
    .replace("read the counts again", "read the counts now")
    .replace("Words you’ll meet", "Words you'll meet")
    .concat("\n## Customise Home {#customise}\n\nPress **Customise Home**.\n");
  write(root, "client/src/help/guides/en/home.md", home);
  write(
    root,
    "client/src/help/guides/fr-CA/orders.md",
    GUIDES["client/src/help/guides/fr-CA/orders.md"].replace(
      "Appuyez sur",
      "Touchez",
    ),
  );

  const run = review(root, "export", "--since", baseline, "--only", "guides");
  assert.equal(run.status, 0, run.stderr);
  assert.match(
    run.stdout,
    new RegExp(
      `fr-CA\\.guides\\.since-${baseline}\\.xlsx: 3 sections new or changed since ${baseline}; ` +
        "1 left out, their English changed only in its apostrophes",
    ),
  );

  const { rows } = sheet(root, `review/fr-CA.guides.since-${baseline}.xlsx`);
  assert.deepEqual(
    rows.map((row) => [row[HEADER.indexOf("Id")], row.at(-1)]),
    [
      ["Id", `Since ${baseline}`],
      ["home#today", "English changed"],
      ["home#customise", "New"],
      ["orders#raise", "Translation changed"],
    ],
  );
});

test("import writes a corrected section over its own in the guide, and nothing else", (t) => {
  const root = fixture(t);
  assert.equal(review(root, "export", "--only", "guides").status, 0);
  const before = allFiles(root);

  correct(root, "review/fr-CA.guides.xlsx", {
    "home#today":
      "## Chaque jour {#today}\n\nAppuyez sur **Actualiser** pour relire les totaux tout de suite.\nLes commandes en retard sont dans [Commandes](/orders#late).\n",
    orders: "# Les commandes",
  });

  const run = review(
    root,
    "import",
    path.join(root, "review/fr-CA.guides.xlsx"),
  );
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /guides\/fr-CA\/home\.md: 1 corrected\./);
  assert.match(run.stdout, /guides\/fr-CA\/orders\.md: 1 corrected\./);
  assert.match(
    run.stdout,
    /Now run `npx vitest run src\/help\/guides\.test\.ts` in client\/, and `node scripts\/i18n-rules\.mjs`, then look at `git diff`\./,
  );

  const after = allFiles(root);
  assert.equal(
    after["client/src/help/guides/fr-CA/home.md"],
    before["client/src/help/guides/fr-CA/home.md"].replace(
      "pour relire les totaux. Les commandes",
      "pour relire les totaux tout de suite.\nLes commandes",
    ),
  );
  assert.equal(
    after["client/src/help/guides/fr-CA/orders.md"],
    before["client/src/help/guides/fr-CA/orders.md"].replace(
      "# Commandes",
      "# Les commandes",
    ),
  );
  for (const file of Object.keys(before).filter(
    (file) => !file.startsWith("client/src/help/guides/fr-CA/"),
  )) {
    assert.equal(after[file], before[file], file);
  }
});

test("import refuses a section whose English or translation changed since the export, writing nothing", (t) => {
  const root = fixture(t);
  assert.equal(review(root, "export", "--only", "guides").status, 0);
  correct(root, "review/fr-CA.guides.xlsx", {
    "home#today":
      "## Chaque jour {#today}\n\nAppuyez sur **Actualiser**. Les commandes en retard sont dans [Commandes](/orders#late).",
    "home#words":
      "## Les mots que vous verrez {#words}\n\n- **En retard** : passé son jour.",
  });

  write(
    root,
    "client/src/help/guides/en/home.md",
    GUIDES["client/src/help/guides/en/home.md"].replace("again", "now"),
  );
  write(
    root,
    "client/src/help/guides/fr-CA/home.md",
    GUIDES["client/src/help/guides/fr-CA/home.md"].replace(
      "après son jour",
      "passé sa date",
    ),
  );
  const before = allFiles(root);

  const run = review(
    root,
    "import",
    path.join(root, "review/fr-CA.guides.xlsx"),
  );
  assert.equal(run.status, 1);
  assert.match(run.stderr, /^Nothing written\./);
  assert.match(
    run.stderr,
    /row 3 home#today: its English changed since the export, so clear its Correction; the next round reads it/,
  );
  assert.match(
    run.stderr,
    /row 4 home#words: its translation changed since the export, so clear its Correction; the next round reads it/,
  );
  assert.deepEqual(allFiles(root), before);
});

test("import refuses a section's correction that loses its heading or its links, or adds a heading", (t) => {
  const root = fixture(t);
  assert.equal(review(root, "export", "--only", "guides").status, 0);
  correct(root, "review/fr-CA.guides.xlsx", {
    home: "Accueil\n\nLa première page.",
    "home#today":
      "## Chaque jour {#jour}\n\nAppuyez sur **Actualiser**. Voir [Commandes](/orders#late).",
    "home#words":
      "## Les mots que vous verrez {#words}\n\n- **En retard** : voir [Commandes](/orders).",
    "orders#raise":
      "## Créer une commande {#raise}\n\nAppuyez sur **Créer une commande**.\n\n## Ensuite {#next}",
  });
  const before = allFiles(root);

  const run = review(
    root,
    "import",
    path.join(root, "review/fr-CA.guides.xlsx"),
  );
  assert.equal(run.status, 1);
  assert.match(
    run.stderr,
    /row 2 home: its first line is not the guide's title, # …/,
  );
  assert.match(
    run.stderr,
    /row 3 home#today: its first line is not its heading, ## … \{#today\}/,
  );
  assert.match(
    run.stderr,
    /row 4 home#words: links to \/orders; the English links to nothing/,
  );
  assert.match(
    run.stderr,
    /row 6 orders#raise: another of its lines is a heading; a section has one/,
  );
  assert.deepEqual(allFiles(root), before);
});
