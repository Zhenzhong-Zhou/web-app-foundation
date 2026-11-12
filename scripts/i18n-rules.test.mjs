/**
 * Tests for i18n-rules.mjs, on Node's own runner: scripts/ sits outside
 * both packages, so neither one's Vitest would find them.
 *
 *     node --test scripts/
 *
 * problemsOf is tested on its own, against the repository's glossary, so
 * its Words not to use rows are the ones held. The run is tested on a
 * copy of the script in a temporary folder laid out as the repository
 * is, with a small glossary, a catalogue in each package and a guide.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { folder, write } from "./git-fixture.mjs";
import { problemsOf } from "./i18n-rules.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const NBSP = " ";

const PRODUCT =
  "产品, for 商品 for the goods sold, 物品 for any item (Words not to use)";
const PHOTO = "照片, for 头像 (Words not to use)";

test("产品 is refused outside the licences' messages and guide, and kept in them", () => {
  for (const id of ["products.types.good", "items#markets", "items"]) {
    assert.deepEqual(problemsOf("一个产品", id, "zh-Hans"), [PRODUCT], id);
  }
  for (const id of [
    "licences.empty",
    "permissions.productLicences.view",
    "account.access.thing.licences",
    "licences",
    "licences#add",
  ]) {
    assert.deepEqual(problemsOf("天然健康产品", id, "zh-Hans"), [], id);
  }
  // A row holds in its own language only.
  assert.deepEqual(problemsOf("产品", "products.title", "fr-CA"), []);
});

test("照片 is refused only where it means a person's picture", () => {
  for (const id of [
    "account.photo.add",
    "people.card.photo",
    "account",
    "people#your-details",
  ]) {
    assert.deepEqual(problemsOf("添加照片", id, "zh-Hans"), [PHOTO], id);
  }
  for (const id of [
    "products.gallery.empty",
    "files.photo.type",
    "items#add",
  ]) {
    assert.deepEqual(problemsOf("添加照片", id, "zh-Hans"), [], id);
  }
});

test("再订货点 is refused everywhere", () => {
  for (const id of ["inventory.reorder.title", "inventory#reorder-points"]) {
    assert.deepEqual(problemsOf("已有再订货点", id, "zh-Hans"), [
      "再订货点, for 库存下限 (Words not to use)",
    ]);
  }
});

test("Chinese: a half-width , ? : ; or ! beside Chinese is refused, each once", () => {
  assert.deepEqual(problemsOf("邮箱:请检查,然后重试,好吗?", "a.b", "zh-Hans"), [
    "half-width : , ? beside Chinese, for ： ， ？",
  ]);
  for (const mark of [",", "?", ":", ";", "!"]) {
    assert.equal(problemsOf(`已保存${mark}`, "a.b", "zh-Hans").length, 1, mark);
    assert.equal(problemsOf(`${mark}已保存`, "a.b", "zh-Hans").length, 1, mark);
  }
  // Beside full-width punctuation too.
  assert.equal(problemsOf("（已保存）,", "a.b", "zh-Hans").length, 1);
});

test("Chinese: full-width punctuation, half-width beside Latin, and ICU's syntax pass", () => {
  for (const text of [
    "邮箱：请检查，然后重试；好吗？好！",
    "PNG、JPEG 或 WebP, 最大 5 MB",
    "10:30 到 11:00",
    "{count, plural, other {# 个物品}}",
    "{kind, select, good {商品} other {物品}}",
  ]) {
    assert.deepEqual(problemsOf(text, "a.b", "zh-Hans"), [], text);
  }
  // A French text is not held to Chinese punctuation.
  assert.deepEqual(problemsOf("Bas, Épuisé", "a.b", "fr-CA"), []);
});

test("three full stops are refused for …, in French and in Chinese", () => {
  assert.deepEqual(problemsOf("保存中...", "a.b", "zh-Hans"), [
    "three full stops, for …",
  ]);
  assert.deepEqual(problemsOf("Enregistrement...", "a.b", "fr-CA"), [
    "three full stops, for …",
  ]);
  assert.deepEqual(problemsOf("保存中…", "a.b", "zh-Hans"), []);
  assert.deepEqual(problemsOf("Enregistrement…", "a.b", "fr-CA"), []);
});

test("an ASCII apostrophe is refused, but ICU's quote of a brace in a message", () => {
  const apostrophe = ["an ASCII apostrophe ', for ’"];
  assert.deepEqual(problemsOf("l'article", "a.b", "fr-CA"), apostrophe);
  assert.deepEqual(problemsOf("Panivo's 物品", "a.b", "zh-Hans"), apostrophe);
  assert.deepEqual(problemsOf("l’article", "a.b", "fr-CA"), []);
  assert.deepEqual(
    problemsOf("Écrivez '{YYYY}' pour l’année", "a.b", "fr-CA"),
    [],
  );
  // A guide is Markdown: there, the same quote is an apostrophe.
  assert.deepEqual(
    problemsOf("Écrivez '{YYYY}' pour l’année", "home#today", "fr-CA"),
    apostrophe,
  );
});

test("French: a space before ? ! or ; is refused, ordinary or no-break", () => {
  assert.deepEqual(problemsOf("Qu’est-ce que c’est ?", "a.b", "fr-CA"), [
    "a space before ?, where Quebec typography has none",
  ]);
  assert.deepEqual(
    problemsOf(`Oui${NBSP}! Non${NBSP}; peut-être ?`, "a.b", "fr-CA"),
    ["a space before ! ; ?, where Quebec typography has none"],
  );
  assert.deepEqual(problemsOf("Oui! Non; peut-être?", "a.b", "fr-CA"), []);
  // Chinese is not held to Quebec spacing.
  assert.deepEqual(problemsOf("Panivo ?", "a.b", "zh-Hans"), []);
});

test("French: a colon takes a no-break space before it", () => {
  const colon = ["a colon without a no-break space (U+00A0) before it"];
  assert.deepEqual(problemsOf("Prix : 3 $", "a.b", "fr-CA"), colon);
  assert.deepEqual(problemsOf("Prix: 3 $", "a.b", "fr-CA"), colon);
  assert.deepEqual(problemsOf("Ajoutez ceci :", "a.b", "fr-CA"), colon);
  assert.deepEqual(
    problemsOf("- **Code** :\nson code", "items", "fr-CA"),
    colon,
  );
  for (const text of [
    `Prix${NBSP}: 3 $`,
    "De 9:00 à 17:30",
    "{day, date, ::yyyyMMdd}",
  ]) {
    assert.deepEqual(problemsOf(text, "a.b", "fr-CA"), [], text);
  }
});

test("French: guillemets take a no-break space inside", () => {
  const guillemets = ["guillemets without a no-break space (U+00A0) inside"];
  assert.deepEqual(
    problemsOf("« Rester connecté »", "a.b", "fr-CA"),
    guillemets,
  );
  assert.deepEqual(problemsOf("«Rester connecté»", "a.b", "fr-CA"), guillemets);
  assert.deepEqual(
    problemsOf(`«${NBSP}Rester connecté »`, "a.b", "fr-CA"),
    guillemets,
  );
  assert.deepEqual(
    problemsOf(`«${NBSP}Rester connecté${NBSP}»`, "a.b", "fr-CA"),
    [],
  );
});

// ------------------------------------------------------------------ the run

const GLOSSARY = (
  where = "Everywhere but `licences.*` and `licences.md`",
) => `# Glossary

## Words not to use

| Language | Not | Instead | Where |
| --- | --- | --- | --- |
| 简体中文 | 产品 | 商品 | ${where} |

## Writing conventions
`;

/** The repository, small: clean, but for what `files` replaces. */
function fixture(t, files = {}) {
  const root = folder(t, "i18n-rules");
  mkdirSync(path.join(root, "scripts"));
  copyFileSync(
    path.join(ROOT, "scripts/i18n-rules.mjs"),
    path.join(root, "scripts/i18n-rules.mjs"),
  );
  const clean = {
    "docs/glossary.md": GLOSSARY(),
    "client/src/locales/fr-CA.json": JSON.stringify({
      "home.title": "Accueil",
    }),
    "client/src/locales/zh-Hans.json": JSON.stringify({ "home.title": "首页" }),
    "server/src/i18n/fr-CA.json": JSON.stringify({
      "licences.none": `Aucune licence${NBSP}: ajoutez-en une.`,
    }),
    "server/src/i18n/zh-Hans.json": JSON.stringify({
      "licences.none": "暂无产品许可证。",
    }),
    "client/src/help/guides/fr-CA/home.md": `# Accueil\n\nLa première page.\n\n## Chaque jour {#today}\n\nAppuyez sur **Actualiser**.\n`,
    "client/src/help/guides/zh-Hans/home.md": `# 首页\n\n第一个页面。\n\n## 每天 {#today}\n\n点**刷新**。\n`,
  };
  for (const [file, text] of Object.entries({ ...clean, ...files })) {
    write(root, file, text);
  }
  return spawnSync(process.execPath, ["scripts/i18n-rules.mjs"], {
    cwd: root,
    encoding: "utf8",
  });
}

test("the run passes clean translations, counting what it read", (t) => {
  const run = fixture(t);
  assert.equal(run.stderr, "");
  assert.equal(run.status, 0);
  assert.equal(
    run.stdout,
    "Translations keep the glossary's words and punctuation: 4 messages and 4 guide sections in fr-CA and zh-Hans.\n",
  );
});

test("the run prints each problem by file and id, a guide's by section, and fails", (t) => {
  const run = fixture(t, {
    "client/src/locales/zh-Hans.json": JSON.stringify({
      "home.title": "产品首页,",
    }),
    "client/src/help/guides/fr-CA/home.md": `# Accueil\n\nLa première page.\n\n## Chaque jour {#today}\n\nAppuyez sur **Actualiser** :\n`,
  });
  assert.equal(run.status, 1);
  assert.equal(
    run.stderr,
    `client/src/help/guides/fr-CA/home.md: home#today: a colon without a no-break space (U+00A0) before it
client/src/locales/zh-Hans.json: home.title: 产品, for 商品 (Words not to use)
client/src/locales/zh-Hans.json: home.title: half-width , beside Chinese, for ，

3 problems: change each by docs/glossary.md's Words not to use and Writing conventions.
`,
  );
});

test("the run refuses a Words not to use row it cannot read, naming it", (t) => {
  for (const [where, why] of [
    [
      "Somewhere",
      "its Where starts with none of Everywhere, Everywhere but and Only",
    ],
    ["Only the licences", "Only names, in backquotes, what it means"],
    [
      "Everywhere: `licences.*`",
      "Everywhere names nothing in backquotes; write Everywhere but",
    ],
  ]) {
    const run = fixture(t, { "docs/glossary.md": GLOSSARY(where) });
    assert.equal(run.status, 1, where);
    assert.equal(
      run.stderr,
      `docs/glossary.md: Words not to use, the row 产品: ${why}.\n`,
      where,
    );
  }
});
