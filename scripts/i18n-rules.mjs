#!/usr/bin/env node
/**
 * The words and punctuation docs/glossary.md sets, held in the French and
 * Chinese translations (ADR-054's November 2026 amendment, R4): both
 * packages' catalogues and Help's guides.
 *
 *     node scripts/i18n-rules.mjs
 *
 * Each problem is printed as `<file>: <id>: <rule>`, and the run fails:
 *
 * - each row of the glossary's Words not to use, in its language and
 *   where it holds;
 * - a translation the same as its English, ignoring case, spaces and
 *   punctuation: English left in, as "Deleted User" was in a French
 *   review. Not where the English has no word of its own outside its
 *   placeholders and tags, as {count} / {max}, nor for a message listed
 *   in SAME_AS_ENGLISH below, by language and id, each with why;
 * - Chinese: a half-width , ? : ; or ! beside Chinese, for ，？：；！;
 * - French and Chinese: three full stops, for …, and an ASCII
 *   apostrophe, for ’. In a message, ICU's quote of a brace, '{', is not
 *   one;
 * - French, Quebec typography: no space before ? ! or ;, and a no-break
 *   space (U+00A0) before : and inside « », so a narrow screen never
 *   starts a line with a colon or leaves « at the end of one. An ordinary
 *   space there was the catalogue checks' fifth rule (08b6f708), moved
 *   here.
 *
 * A guide is checked section by section, each named as the review's
 * workbooks name it: <guide>#<id>, and <guide> for its title and opening.
 * So a message's id has a dot, and a guide's none.
 *
 * It exports problemsOf(text, id, language, english), one text's
 * problems, which the decide step runs on each text it decides; with no
 * English, a text is not compared with it. No dependencies:
 * scripts/verify.sh and the Docs workflow run it with Node alone. Its
 * tests are in i18n-rules.test.mjs: `node --test scripts/`.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const GLOSSARY = "docs/glossary.md";
const GUIDES = "client/src/help/guides";

/** The languages checked, by the code the files use and the glossary's name. */
const LANGUAGES = { "fr-CA": "Français (Canada)", "zh-Hans": "简体中文" };

/** Both packages' catalogues, in a language. */
const catalogues = (language) => [
  `client/src/locales/${language}.json`,
  `server/src/i18n/${language}.json`,
];

// ------------------------------------------------------ words not to use

/**
 * A row's Where, read: Everywhere; Everywhere but, then what it leaves
 * out; or Only, then all it holds for. Each pattern in backquotes: `x.*`
 * every message id under `x.`, `x.md` a guide, anything else one id.
 */
function scopeOf(where, row) {
  const refused = (why) =>
    new Error(`${GLOSSARY}: Words not to use, the row ${row}: ${why}.`);
  const [start, mode] =
    [
      ["Everywhere but", "but"],
      ["Everywhere", "all"],
      ["Only", "only"],
    ].find(([start]) => where.startsWith(start)) ?? [];
  const patterns = [...where.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
  if (!mode) {
    throw refused(
      "its Where starts with none of Everywhere, Everywhere but and Only",
    );
  }
  if (mode === "all" && patterns.length > 0) {
    throw refused(
      "Everywhere names nothing in backquotes; write Everywhere but",
    );
  }
  if (mode !== "all" && patterns.length === 0) {
    throw refused(`${start} names, in backquotes, what it means`);
  }
  const holds = (pattern, id) => {
    if (pattern.endsWith(".md")) {
      return !id.includes(".") && id.split("#")[0] === pattern.slice(0, -3);
    }
    if (pattern.endsWith(".*")) return id.startsWith(pattern.slice(0, -1));
    return id === pattern;
  };
  return (id) => {
    const named = patterns.some((pattern) => holds(pattern, id));
    return mode === "all" || (mode === "but" ? !named : named);
  };
}

/** The glossary's Words not to use, each row's language, words and scope. */
function readWordsNotToUse() {
  const lines = readFileSync(path.join(ROOT, GLOSSARY), "utf8").split("\n");
  const start = lines.indexOf("## Words not to use");
  if (start === -1) {
    throw new Error(`${GLOSSARY} has no section ## Words not to use.`);
  }
  const table = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("|")) table.push(line);
    else if (table.length > 0 || line.startsWith("#")) break;
  }
  if (table.length === 0) {
    throw new Error(`${GLOSSARY}: Words not to use has no table.`);
  }
  const codes = Object.fromEntries(
    Object.entries(LANGUAGES).map(([code, name]) => [name, code]),
  );
  // After its heading and the line under it.
  return table.slice(2).map((line) => {
    const [language, word, instead, where] = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (!codes[language]) {
      throw new Error(
        `${GLOSSARY}: Words not to use, the row ${word}: its language is neither ${Object.values(LANGUAGES).join(" nor ")}.`,
      );
    }
    return {
      language: codes[language],
      word,
      instead,
      holdsFor: scopeOf(where ?? "", word),
    };
  });
}

let wordsNotToUse;

// ------------------------------------------------------ same as the English

/** A word French writes as English does, and so do its messages. */
const french = (word) => `${word}: French writes it so too`;

/**
 * The translations the same as their English that are not English left
 * in, by language and id, each with why; any other is refused.
 */
const SAME_AS_ENGLISH = [
  [
    "fr-CA",
    french("Action, Actions"),
    [
      "audit.action",
      "audit.field.action",
      "common.actions",
      "exports.column.action",
      "orders.lines.actions",
    ],
  ],
  ["fr-CA", french("active, a recipe’s status"), ["boms.status.active"]],
  [
    "fr-CA",
    french("Code, the Terms’ word for a variant’s code"),
    [
      "audit.field.sku",
      "documents.sku",
      "exports.column.code",
      "exports.column.sku",
      "locations.code",
      "partners.code",
      "products.sku",
    ],
  ],
  ["fr-CA", french("Contacts"), ["partners.contacts"]],
  [
    "fr-CA",
    french("Date"),
    [
      "documents.dateOn",
      "exports.column.date",
      "invoices.date",
      "orders.documents.date",
    ],
  ],
  ["fr-CA", french("Description"), ["products.description"]],
  ["fr-CA", french("Dimensions"), ["products.variant.dimensionsLabel"]],
  [
    "fr-CA",
    french("Document, Documents"),
    [
      "audit.field.documents",
      "orders.documents.document",
      "settings.numbering.document",
      "settings.org.tab.documents",
    ],
  ],
  [
    "fr-CA",
    french("Images"),
    ["audit.field.fileId", "audit.field.fileIds", "products.gallery.title"],
  ],
  ["fr-CA", french("Indigo, a colour"), ["settings.branding.preset.indigo"]],
  ["fr-CA", french("Invitation, the Terms’ word"), ["audit.type.invitation"]],
  [
    "fr-CA",
    french("Licence, Licences, the Terms’ word"),
    [
      "audit.field.licence",
      "audit.type.productLicence",
      "boms.licence",
      "help.guide.licences",
      "layout.nav.licences",
      "licences.title",
      "products.licences",
    ],
  ],
  [
    "fr-CA",
    french("Logo"),
    ["audit.field.logoFileId", "settings.branding.logo"],
  ],
  [
    "fr-CA",
    french("Lot, Lots, the Terms’ word"),
    [
      "audit.field.lotId",
      "audit.type.lot",
      "costs.set.entryWithLot",
      "documents.lot",
      "exports.column.lot",
      "inventory.lot",
      "inventory.lot.title",
      "products.lots",
      "recent.kind.lot",
      "search.kind.lot",
    ],
  ],
  [
    "fr-CA",
    french("Maximum"),
    [
      "audit.field.maximumQuantity",
      "exports.column.maximum",
      "inventory.reorder.maximum",
    ],
  ],
  ["fr-CA", french("Menu, the Terms’ word"), ["layout.bar.menu"]],
  ["fr-CA", french("minute, minutes"), ["settings.security.minutes"]],
  ["fr-CA", french("Navigation"), ["layout.navigation"]],
  [
    "fr-CA",
    french("Note, Notes"),
    [
      "boms.notes",
      "common.notes",
      "documents.noteText",
      "exports.column.note",
      "inventory.note",
    ],
  ],
  [
    "fr-CA",
    french("Notifications, the Terms’ word"),
    ["layout.notifications.title"],
  ],
  [
    "fr-CA",
    french("Permissions, the Terms’ word"),
    ["audit.field.permissions"],
  ],
  [
    "fr-CA",
    french("Position, the Terms’ word"),
    [
      "exports.column.position",
      "inventory.reorder.box.position",
      "inventory.reorder.position",
    ],
  ],
  [
    "fr-CA",
    french("Production"),
    [
      "account.access.area.production",
      "audit.value.reason.production",
      "inventory.reason.production",
      "layout.nav.production",
      "roles.template.production",
    ],
  ],
  [
    "fr-CA",
    french("Site, Zone, the Terms’ words"),
    ["locations.type.site", "locations.type.zone"],
  ],
  [
    "fr-CA",
    french("Stock, the Terms’ word"),
    ["inventory.tab.stock", "settings.org.tab.stock"],
  ],
  [
    "fr-CA",
    french("Total"),
    [
      "audit.field.total",
      "documents.total",
      "exports.column.total",
      "invoices.totalIn",
      "orders.lines.total",
    ],
  ],
  [
    "fr-CA",
    french("Type, Types"),
    [
      "audit.field.type",
      "exports.column.type",
      "locations.typeLabel",
      "products.tabs",
      "products.typeLabel",
    ],
  ],
  ["fr-CA", french("Version"), ["boms.version"]],
  [
    "fr-CA",
    "A unit’s symbol, g, kg, ml or mm, the same in every language, or litre, which French writes so too",
    [
      "products.unit.g",
      "products.unit.kg",
      "products.unit.litre",
      "products.unit.ml",
      "products.unitCount.g",
      "products.unitCount.kg",
      "products.unitCount.litre",
      "products.unitCount.ml",
      "products.variant.dimensions",
      "products.variant.grams",
    ],
  ],
  [
    "fr-CA",
    "A4, a paper size’s name in every language",
    ["audit.value.paper.a4", "settings.org.paper.a4"],
  ],
  [
    "zh-Hans",
    "A4 and Letter, the paper sizes’ names, as Paper size on the Organization page names them in Chinese too",
    ["audit.value.paper.a4", "audit.value.paper.letter"],
  ],
  ...["fr-CA", "zh-Hans"].map((language) => [
    language,
    "v, for a recipe’s version, as every language writes it",
    ["boms.versionOption"],
  ]),
];

const sameAsEnglishAllowed = new Set(
  SAME_AS_ENGLISH.flatMap(([language, , ids]) =>
    ids.map((id) => `${language}\n${id}`),
  ),
);

/** A text as compared with its English: no case, spaces or punctuation. */
const bare = (text) => text.toLowerCase().replace(/[\s\p{P}]/gu, "");

/**
 * The English's own words: without its placeholders, {name} or
 * {amount, number}, and its tags. A plural's or a select's words stay.
 */
const ownWords = (english) =>
  english
    .replace(/<\/?[\w-]+>/g, "")
    .replace(/\{\s*[\w.]+\s*(?:,\s*(?:number|date|time)\b[^{}]*)?\}/g, "");

// ------------------------------------------------------------ the rules

/** A Chinese character or full-width punctuation, “ and ” among it. */
const CHINESE = "[\\p{Script=Han}\\u3000-\\u303F\\uFF00-\\uFFEF\\u201C\\u201D]";
const HALF_WIDTH = new RegExp(
  `(?<=${CHINESE})[,?:;!]|[,?:;!](?=${CHINESE})`,
  "gu",
);
const FULL_WIDTH = { ",": "，", "?": "？", ":": "：", ";": "；", "!": "！" };

/** Each different match of the pattern in the text, in order. */
const found = (text, pattern) => [
  ...new Set([...text.matchAll(pattern)].map((match) => match[0])),
];

/**
 * One text's problems, each as a rule broken: a message (its id has a
 * dot) in ICU, or a guide's section in Markdown (`home#today`, or `home`
 * for its opening), in fr-CA or zh-Hans, its English beside it.
 */
export function problemsOf(text, id, language, english) {
  wordsNotToUse ??= readWordsNotToUse();
  const problems = [];

  for (const row of wordsNotToUse) {
    if (
      row.language === language &&
      row.holdsFor(id) &&
      text.includes(row.word)
    ) {
      problems.push(`${row.word}, for ${row.instead} (Words not to use)`);
    }
  }

  if (
    english !== undefined &&
    /\p{L}/u.test(ownWords(english)) &&
    bare(text) === bare(english) &&
    !sameAsEnglishAllowed.has(`${language}\n${id}`)
  ) {
    problems.push(
      "the same as its English, so left in English (SAME_AS_ENGLISH lists those meant to be)",
    );
  }

  if (language === "zh-Hans") {
    const half = found(text, HALF_WIDTH);
    if (half.length > 0) {
      problems.push(
        `half-width ${half.join(" ")} beside Chinese, for ${half.map((mark) => FULL_WIDTH[mark]).join(" ")}`,
      );
    }
  }

  if (text.includes("...")) problems.push("three full stops, for …");

  // A message's '{…}' quotes a brace, as ICU reads it; nothing else does.
  const prose = id.includes(".") ? text.replace(/'[{}#|][^']*'/g, "") : text;
  if (prose.includes("'")) problems.push("an ASCII apostrophe ', for ’");

  if (language === "fr-CA") {
    const spaced = found(text, /(?<=\s)[?!;]/g);
    if (spaced.length > 0) {
      problems.push(
        `a space before ${spaced.join(" ")}, where Quebec typography has none`,
      );
    }
    // A colon a space follows, or nothing: not 14:30, nor a skeleton's ::.
    if (/(?<! ):(?=\s|$)/.test(text)) {
      problems.push("a colon without a no-break space (U+00A0) before it");
    }
    if (/«(?! )|(?<! )»/.test(text)) {
      problems.push("guillemets without a no-break space (U+00A0) inside");
    }
  }

  return problems;
}

// ------------------------------------------------------------------- main

/** A guide's heading, as client/src/help/markdown.ts reads it. */
const SECTION = /^## \S.*? \{#([a-z0-9]+(?:-[a-z0-9]+)*)\}$/;

/** A guide's opening, as <guide>, then each section as <guide>#<id>. */
function sectionsOf(guide, text) {
  const parts = [{ id: guide, lines: [] }];
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const heading = SECTION.exec(line);
    if (heading) parts.push({ id: `${guide}#${heading[1]}`, lines: [] });
    parts.at(-1).lines.push(line);
  }
  return parts.map(({ id, lines }) => ({ id, text: lines.join("\n") }));
}

const readText = (file) =>
  existsSync(path.join(ROOT, file))
    ? readFileSync(path.join(ROOT, file), "utf8")
    : null;

/**
 * Every text checked, in a language: each message, then each section,
 * each with its English, if it has one.
 */
function textsIn(language) {
  const texts = [];
  const englishCatalogues = catalogues("en");
  catalogues(language).forEach((file, at) => {
    const catalogue = JSON.parse(readFileSync(path.join(ROOT, file), "utf8"));
    const english = JSON.parse(readText(englishCatalogues[at]) ?? "{}");
    for (const [id, text] of Object.entries(catalogue)) {
      texts.push({ file, id, text, english: english[id] });
    }
  });
  const folder = `${GUIDES}/${language}`;
  for (const name of readdirSync(path.join(ROOT, folder)).sort()) {
    if (!name.endsWith(".md")) continue;
    const file = `${folder}/${name}`;
    const guide = name.slice(0, -3);
    const englishText = readText(`${GUIDES}/en/${name}`);
    const english = new Map(
      englishText === null
        ? []
        : sectionsOf(guide, englishText).map((part) => [part.id, part.text]),
    );
    const text = readFileSync(path.join(ROOT, file), "utf8");
    for (const section of sectionsOf(guide, text)) {
      texts.push({ file, ...section, english: english.get(section.id) });
    }
  }
  return texts;
}

// Run, not imported: the decide step and the tests import problemsOf.
if (import.meta.main) {
  const failures = [];
  let messages = 0;
  let sections = 0;
  try {
    for (const language of Object.keys(LANGUAGES)) {
      for (const { file, id, text, english } of textsIn(language)) {
        if (id.includes(".")) messages++;
        else sections++;
        for (const problem of problemsOf(text, id, language, english)) {
          failures.push(`${file}: ${id}: ${problem}`);
        }
      }
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  if (failures.length > 0) {
    console.error(failures.join("\n"));
    console.error(
      `\n${failures.length} problems: change each by ${GLOSSARY}'s Words not to use and Writing conventions; ` +
        "a translation meant to be its English goes in scripts/i18n-rules.mjs's SAME_AS_ENGLISH, with why.",
    );
    process.exit(1);
  }
  console.log(
    `Translations keep the glossary's words and punctuation: ${messages} messages and ${sections} guide sections in ${Object.keys(LANGUAGES).join(" and ")}.`,
  );
}
