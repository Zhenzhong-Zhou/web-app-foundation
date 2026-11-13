/**
 * Tests for i18n-rules.mjs, on Node's own runner: scripts/ sits outside
 * both packages, so neither one's Vitest would find them.
 *
 *     node --test scripts/
 *
 * problemsOf is tested on its own, against the repository's glossary, so
 * its Words not to use and Placeholders filled with Chinese words rows are
 * the ones held. The run is tested on a
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
import { problemsOf, unspaced } from "./i18n-rules.mjs";

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

test("账单地址 and 税务登记号 are refused everywhere, for the words settled", () => {
  for (const id of ["invoices.billToMissing", "partners#addresses"]) {
    assert.deepEqual(problemsOf("请添加账单地址", id, "zh-Hans"), [
      "账单地址, for 开票地址, as Billing address says: 账单地址 sat beside 开票, one address under two names (Words not to use)",
    ]);
    assert.deepEqual(problemsOf("填写税务登记号", id, "zh-Hans"), [
      "税务登记号, for 税号, as Tax number says: the PDF said 税务登记号 where the screens say 税号, one number under two names (Words not to use)",
    ]);
  }
  // The Organization page's section keeps 税务登记; only the number is 税号.
  assert.deepEqual(
    problemsOf("税务登记", "organization.tax.title", "zh-Hans"),
    [],
  );
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

const FILLED = (names) =>
  `a space between Chinese and ${names}, which Chinese fills with Chinese words (Placeholders filled with Chinese words)`;

test("Chinese: a space between Chinese and a placeholder filled with Chinese words is refused, a tag between or not", () => {
  for (const [text, id, names] of [
    // The product's name, on either side of it.
    ["由 {name} 提供支持", "brand.poweredBy", "{name}"],
    ["由{name} 提供支持", "brand.poweredBy", "{name}"],
    // A built-in role's name, in bold, and before full-width punctuation.
    [
      "您将成为它的 <b>{role}</b> ：{description}",
      "invitation.organization.owner",
      "{role}",
    ],
    // Two placeholders, inside a plural.
    [
      "{count, plural, other {已同时取消勾选 {lines}，因为它们需要 {line}。}}",
      "roles.editor.alsoUnticked",
      "{lines} {line}",
    ],
    // A permission's name in “ ”, beside Chinese.
    [
      "拥有 {permission} 权限",
      "production.licence.needsOverride",
      "{permission}",
    ],
  ]) {
    assert.deepEqual(problemsOf(text, id, "zh-Hans"), [FILLED(names)], text);
  }
  for (const [text, id] of [
    ["由{name}提供支持", "brand.poweredBy"],
    [
      "您将成为它的<b>{role}</b>：{description}",
      "invitation.organization.owner",
    ],
    // A person's name, and a price list's, may be Latin: not listed there.
    ["由 {name} 提供支持", "home.welcome.wrote"],
    ["来自 {list}", "orders.lines.fromList"],
    // Beside Latin letters or digits, a space stays.
    ["在{list} 3 个结果", "search.showAll"],
    // Only Chinese is held to it.
    ["Propulsé par {name}", "brand.poweredBy"],
  ]) {
    for (const language of ["zh-Hans", "fr-CA"]) {
      assert.deepEqual(
        problemsOf(text, id, language),
        [],
        `${language} ${text}`,
      );
    }
  }
});

test("unspaced takes out only the spaces the rule refuses, naming the placeholders", () => {
  assert.deepEqual(
    unspaced("在 {list} 中查看全部 {count} 个", "search.showAll", "zh-Hans"),
    { text: "在{list}中查看全部 {count} 个", names: ["{list}"] },
  );
  assert.deepEqual(
    unspaced(
      "您将成为它的 <b>{role}</b> ：",
      "invitation.organization.owner",
      "zh-Hans",
    ),
    { text: "您将成为它的<b>{role}</b>：", names: ["{role}"] },
  );
  for (const [text, id, language] of [
    ["来自 {list}", "orders.lines.fromList", "zh-Hans"],
    ["在 {list} 中", "search.showAll", "fr-CA"],
  ]) {
    assert.deepEqual(unspaced(text, id, language), { text, names: [] }, text);
  }
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

const LEFT_IN_ENGLISH = [
  "the same as its English, so left in English (SAME_AS_ENGLISH lists those meant to be)",
];

test("a translation the same as its English is refused, ignoring case, spaces and punctuation", () => {
  // A French review's correction that was the English, in another case.
  assert.deepEqual(
    problemsOf(
      "Deleted User",
      "inventory.movements.deletedUser",
      "fr-CA",
      "Deleted user",
    ),
    LEFT_IN_ENGLISH,
  );
  assert.deepEqual(
    problemsOf("SAVE  changes!", "a.b", "zh-Hans", "Save changes."),
    LEFT_IN_ENGLISH,
  );
  // A plural's words are its own, and a guide's section is compared too.
  const plural = "{count, plural, one {# item} other {# items}}";
  assert.deepEqual(problemsOf(plural, "a.b", "fr-CA", plural), LEFT_IN_ENGLISH);
  const section = "## Every day {#today}\n\nPress **Refresh**.";
  assert.deepEqual(
    problemsOf(section, "home#today", "fr-CA", section),
    LEFT_IN_ENGLISH,
  );
  // Translated, it passes.
  assert.deepEqual(
    problemsOf(
      "Utilisateur supprimé",
      "inventory.movements.deletedUser",
      "fr-CA",
      "Deleted user",
    ),
    [],
  );
});

test("a translation listed in SAME_AS_ENGLISH may be its English, in its language only", () => {
  assert.deepEqual(
    problemsOf("Total", "documents.total", "fr-CA", "Total"),
    [],
  );
  assert.deepEqual(
    problemsOf("Letter", "audit.value.paper.letter", "zh-Hans", "Letter"),
    [],
  );
  // The French Total is listed; the Chinese one is not.
  assert.deepEqual(
    problemsOf("Total", "documents.total", "zh-Hans", "Total"),
    LEFT_IN_ENGLISH,
  );
});

test("a text with no word of its own outside its placeholders and tags is not compared, nor one with no English", () => {
  for (const text of [
    "{count} / {max}",
    "{name}, {count}",
    "{value}%",
    "{title} <muted>{count}</muted>",
    "{amount, number} · {day, date, short}",
  ]) {
    assert.deepEqual(problemsOf(text, "a.b", "fr-CA", text), [], text);
  }
  assert.deepEqual(problemsOf("Save", "a.b", "zh-Hans"), []);
});

test("a settled message is refused where its text is not the glossary's, in its language only", () => {
  // The glossary's own rows: what the Chinese extra round changed.
  for (const [id, text] of [
    ["documents.refusal.signedOut", "您已退出登录"],
    [
      "mail.invitation.expires",
      "链接只能用一次，有效期至 {date}（{zone} 时区）当天结束。密码由您自己设置。",
    ],
  ]) {
    const [problem, ...more] = problemsOf(text, id, "zh-Hans");
    assert.match(problem, /^not its settled text, .+ \(Settled messages\)$/);
    assert.deepEqual(more, [], id);
  }
  assert.deepEqual(
    problemsOf("您已退出登录", "documents.refusal.signedOut", "zh-Hans"),
    ["not its settled text, 您尚未登录 (Settled messages)"],
  );
  assert.deepEqual(
    problemsOf("您尚未登录", "documents.refusal.signedOut", "zh-Hans"),
    [],
  );
  // Settled in Chinese, so not in French.
  assert.deepEqual(
    problemsOf("Vous êtes déconnecté", "documents.refusal.signedOut", "fr-CA"),
    [],
  );
});

// ------------------------------------------------------------------ the run

const SETTLED =
  "| `licences.none` | 简体中文 | `暂无产品许可证。` | A test’s |";

const FILLED_ROW = "| `{tab}` | Only `home.*` | A tab's name | A test’s |";

const GLOSSARY = (
  where = "Everywhere but `licences.*` and `licences.md`",
  settled = SETTLED,
  filled = FILLED_ROW,
) => `# Glossary

## Words not to use

| Language | Not | Instead | Where |
| --- | --- | --- | --- |
| 简体中文 | 产品 | 商品 | ${where} |

## Settled messages

| Id | Language | Text | Decided in |
| --- | --- | --- | --- |
${settled}

## Placeholders filled with Chinese words

| Placeholder | Where | What fills it | Why |
| --- | --- | --- | --- |
${filled}

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
    "client/src/locales/en.json": JSON.stringify({
      "home.title": "Home",
      "home.seeIn": "See in {tab}",
    }),
    "server/src/i18n/en.json": JSON.stringify({
      "licences.none": "No licence: add one.",
    }),
    "client/src/help/guides/en/home.md": `# Home\n\nThe first page.\n\n## Every day {#today}\n\nPress **Refresh**.\n`,
    "client/src/locales/fr-CA.json": JSON.stringify({
      "home.title": "Accueil",
      "home.seeIn": "Voir dans {tab}",
    }),
    "client/src/locales/zh-Hans.json": JSON.stringify({
      "home.title": "首页",
      "home.seeIn": "在{tab}里查看",
    }),
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
    "Translations keep the glossary's words and punctuation: 6 messages and 4 guide sections in fr-CA and zh-Hans.\n",
  );
});

test("the run prints each problem by file and id, a guide's by section, and fails", (t) => {
  const run = fixture(t, {
    "client/src/locales/fr-CA.json": JSON.stringify({
      "home.title": "HOME",
      "home.seeIn": "Voir dans {tab}",
    }),
    "client/src/locales/zh-Hans.json": JSON.stringify({
      "home.title": "产品首页,",
      "home.seeIn": "在 {tab} 里查看",
    }),
    "client/src/help/guides/fr-CA/home.md": `# Accueil\n\nLa première page.\n\n## Chaque jour {#today}\n\nAppuyez sur **Actualiser** :\n`,
    "client/src/help/guides/zh-Hans/home.md": `# 首页\n\n第一个页面。\n\n## Every day {#today}\n\nPress **Refresh**.\n`,
    // A settled message reworded, and one settled that no catalogue has.
    "server/src/i18n/zh-Hans.json": JSON.stringify({
      "licences.none": "暂无许可证。",
    }),
    "docs/glossary.md": GLOSSARY(
      undefined,
      `${SETTLED}\n| \`home.gone\` | 简体中文 | \`已删除\` | A test’s |`,
    ),
  });
  assert.equal(run.status, 1);
  assert.equal(
    run.stderr,
    `client/src/locales/fr-CA.json: home.title: ${LEFT_IN_ENGLISH[0]}
client/src/help/guides/fr-CA/home.md: home#today: a colon without a no-break space (U+00A0) before it
client/src/locales/zh-Hans.json: home.title: 产品, for 商品 (Words not to use)
client/src/locales/zh-Hans.json: home.title: half-width , beside Chinese, for ，
client/src/locales/zh-Hans.json: home.seeIn: a space between Chinese and {tab}, which Chinese fills with Chinese words (Placeholders filled with Chinese words)
server/src/i18n/zh-Hans.json: licences.none: not its settled text, 暂无产品许可证。 (Settled messages)
client/src/help/guides/zh-Hans/home.md: home#today: ${LEFT_IN_ENGLISH[0]}
docs/glossary.md: home.gone: settled in zh-Hans, but in neither of its catalogues; take its row out of Settled messages

8 problems: change each by docs/glossary.md's Words not to use, Settled messages, Placeholders filled with Chinese words and Writing conventions; a translation meant to be its English goes in scripts/i18n-rules.mjs's SAME_AS_ENGLISH, with why.
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

test("the run refuses a Settled messages row it cannot read, naming it", (t) => {
  for (const [row, why] of [
    [
      "| licences.none | 简体中文 | `暂无产品许可证。` | A test’s |",
      "the row licences.none: its Id is not one message id in backquotes",
    ],
    [
      "| `licences.none` | Chinese | `暂无产品许可证。` | A test’s |",
      "the row licences.none: its language is neither Français (Canada) nor 简体中文",
    ],
    [
      "| `licences.none` | 简体中文 | 暂无产品许可证。 | A test’s |",
      "the row licences.none: its Text is not in backquotes",
    ],
    [
      "| `licences.none` | 简体中文 | `暂无产品许可证。` | |",
      "the row licences.none: it names no decision it comes from",
    ],
  ]) {
    const run = fixture(t, { "docs/glossary.md": GLOSSARY(undefined, row) });
    assert.equal(run.status, 1, row);
    assert.equal(
      run.stderr,
      `docs/glossary.md: Settled messages, ${why}.\n`,
      row,
    );
  }
});

test("the run refuses a Placeholders filled with Chinese words row it cannot read, naming it", (t) => {
  for (const [row, why] of [
    [
      "| {tab} | Only `home.*` | A tab's name | A test’s |",
      "the row {tab}: its Placeholder is not one {name} in backquotes",
    ],
    [
      "| `{tab}` | Somewhere | A tab's name | A test’s |",
      "the row {tab}: its Where starts with none of Everywhere, Everywhere but and Only",
    ],
  ]) {
    const run = fixture(t, {
      "docs/glossary.md": GLOSSARY(undefined, undefined, row),
    });
    assert.equal(run.status, 1, row);
    assert.equal(
      run.stderr,
      `docs/glossary.md: Placeholders filled with Chinese words, ${why}.\n`,
      row,
    );
  }
});
