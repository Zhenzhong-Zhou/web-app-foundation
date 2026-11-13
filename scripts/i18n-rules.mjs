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
 * - each row of its Settled messages: the message's text in either
 *   package's catalogue, in the row's language, not the row's, or no
 *   catalogue holding the message;
 * - a translation the same as its English, ignoring case, spaces and
 *   punctuation: English left in, as "Deleted User" was in a French
 *   review. Not where the English has no word of its own outside its
 *   placeholders and tags, as {count} / {max}, nor for a message listed
 *   in SAME_AS_ENGLISH below, by language and id, each with why;
 * - Chinese: a half-width , ? : ; or ! beside Chinese, for ，？：；！;
 * - Chinese: a space between Chinese and a placeholder its Placeholders
 *   filled with Chinese words lists where its row holds, a tag between or
 *   not: 由{name}提供支持, never 由 {name} 提供支持, where {name} is the
 *   product's Chinese name;
 * - a message's plural branch for a category its language never uses, by
 *   Intl.PluralRules: one in Chinese, whose plurals have other alone, so
 *   that branch is never shown. =1, exactly one, is no category: it says
 *   one where one's words differ on purpose, 它 beside 它们. A
 *   selectordinal's likewise, by the language's ordinal categories;
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
 * English, a text is not compared with it. And settledMessages(), the
 * Settled messages, which the decide step keeps and import refuses to
 * correct; and unspaced(text, id, language), a text without the spaces
 * beside the placeholders filled with Chinese words, and
 * withoutUnusedPlurals(text, id, language), a message without those
 * plural branches, which the decide step takes where they and the spaces
 * are a text's only problems. No dependencies:
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
function scopeOf(where, row, table = "Words not to use") {
  const refused = (why) =>
    new Error(`${GLOSSARY}: ${table}, the row ${row}: ${why}.`);
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

/** A language's code, by the name the glossary's tables give it. */
const CODES = Object.fromEntries(
  Object.entries(LANGUAGES).map(([code, name]) => [name, code]),
);
const NEITHER = `its language is neither ${Object.values(LANGUAGES).join(" nor ")}`;

/**
 * The rows of the glossary's table in its section of that name, each its
 * cells, after the table's heading and the line under it. A cell's \| is
 * a | in its text.
 */
function tableIn(section) {
  const lines = readFileSync(path.join(ROOT, GLOSSARY), "utf8").split("\n");
  const start = lines.indexOf(`## ${section}`);
  if (start === -1) {
    throw new Error(`${GLOSSARY} has no section ## ${section}.`);
  }
  const table = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("|")) table.push(line);
    else if (table.length > 0 || line.startsWith("#")) break;
  }
  if (table.length === 0) {
    throw new Error(`${GLOSSARY}: ${section} has no table.`);
  }
  return table.slice(2).map((line) =>
    line
      .split(/(?<!\\)\|/)
      .slice(1, -1)
      .map((cell) => cell.trim().replace(/\\\|/g, "|")),
  );
}

/** The glossary's Words not to use, each row's language, words and scope. */
function readWordsNotToUse() {
  return tableIn("Words not to use").map(([language, word, instead, where]) => {
    if (!CODES[language]) {
      throw new Error(
        `${GLOSSARY}: Words not to use, the row ${word}: ${NEITHER}.`,
      );
    }
    return {
      language: CODES[language],
      word,
      instead,
      holdsFor: scopeOf(where ?? "", word),
    };
  });
}

let wordsNotToUse;

// ------------------------------------------------------ settled messages

/**
 * The glossary's Settled messages: each language's, by id, its text. A
 * row names one message id and its whole text, each in backquotes, and
 * the decision it comes from.
 */
function readSettled() {
  const settled = new Map(
    Object.keys(LANGUAGES).map((code) => [code, new Map()]),
  );
  for (const [idCell = "", language, textCell = "", from] of tableIn(
    "Settled messages",
  )) {
    const id = /^`([^`\s]+)`$/.exec(idCell)?.[1];
    const refused = (why) =>
      new Error(
        `${GLOSSARY}: Settled messages, the row ${id ?? idCell}: ${why}.`,
      );
    if (!id) throw refused("its Id is not one message id in backquotes");
    if (!CODES[language]) throw refused(NEITHER);
    const text = /^`(.+)`$/.exec(textCell)?.[1];
    if (text === undefined) throw refused("its Text is not in backquotes");
    if (!from) throw refused("it names no decision it comes from");
    settled.get(CODES[language]).set(id, text);
  }
  return settled;
}

let settled;

/**
 * The glossary's Settled messages, a Map by language, then id, of each
 * one's text: what the decide step keeps and import refuses to correct.
 */
export function settledMessages() {
  settled ??= readSettled();
  return settled;
}

// --------------------------------------- placeholders filled with Chinese

const FILLED = "Placeholders filled with Chinese words";

/**
 * The glossary's Placeholders filled with Chinese words: each row's
 * placeholder, by its name, and where the row holds, read as Words not to
 * use reads its Where.
 */
function readFilledWithChinese() {
  return tableIn(FILLED).map(([cell = "", where]) => {
    const name = /^`\{(\w+)\}`$/.exec(cell)?.[1];
    if (!name) {
      throw new Error(
        `${GLOSSARY}: ${FILLED}, the row ${cell}: its Placeholder is not one {name} in backquotes.`,
      );
    }
    return { name, holdsFor: scopeOf(where ?? "", `{${name}}`, FILLED) };
  });
}

let filledWithChinese;

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

/** A tag's start or end, which a space may stand outside of. */
const TAGS = "(?:</?[\\w-]+>)*";

/**
 * A Chinese text without its spaces between Chinese and a placeholder the
 * glossary's Placeholders filled with Chinese words lists where its row
 * holds, a tag between or not, and those placeholders: `{ text, names }`.
 * Any other text, and a Chinese one with no such space, as it is.
 */
export function unspaced(text, id, language) {
  if (language !== "zh-Hans") return { text, names: [] };
  filledWithChinese ??= readFilledWithChinese();
  const names = [];
  let without = text;
  for (const { name, holdsFor } of filledWithChinese) {
    if (!holdsFor(id)) continue;
    const placeholder = `\\{${name}\\}`;
    const next = without
      .replace(
        new RegExp(`(?<=${CHINESE})\\s+(?=${TAGS}${placeholder})`, "gu"),
        "",
      )
      .replace(
        new RegExp(`(?<=${placeholder}${TAGS})\\s+(?=${CHINESE})`, "gu"),
        "",
      );
    if (next !== without) {
      names.push(`{${name}}`);
      without = next;
    }
  }
  return { text: without, names };
}

// ------------------------------------------------------ plural categories

/**
 * Where the brace opened just before `from` closes: the index after its },
 * or -1. ICU's quote, '{' or '}', hides a brace.
 */
function closing(text, from) {
  let depth = 1;
  for (let at = from; at < text.length; at++) {
    if (text[at] === "'" && /[{}#|]/.test(text[at + 1] ?? "")) {
      at = text.indexOf("'", at + 1);
      if (at === -1) return -1;
    } else if (text[at] === "{") depth++;
    else if (text[at] === "}" && --depth === 0) return at + 1;
  }
  return -1;
}

/**
 * Each branch of a message's plurals and selectordinals for a category its
 * language never uses, by Intl.PluralRules: one in Chinese, whose plurals
 * have other alone. Each its kind, its key, the categories the language
 * does use, and where it stands in the text, the space before it included.
 * =1, exactly one, is no category, and is never one of them.
 */
function unusedBranches(text, language) {
  const branches = [];
  for (const match of text.matchAll(
    /\{\s*\w+\s*,\s*(plural|selectordinal)\s*,/g,
  )) {
    const kind = match[1];
    const used = new Intl.PluralRules(language, {
      type: kind === "plural" ? "cardinal" : "ordinal",
    }).resolvedOptions().pluralCategories;
    const option = /\s*(=\d+|\w+)\s*\{/y;
    option.lastIndex = match.index + match[0].length;
    for (let key; (key = option.exec(text));) {
      const end = closing(text, option.lastIndex);
      if (end === -1) break;
      if (!key[1].startsWith("=") && !used.includes(key[1])) {
        branches.push({ kind, key: key[1], used, start: key.index, end });
      }
      option.lastIndex = end;
    }
  }
  return branches;
}

/**
 * A message without its plurals' branches for a category its language
 * never uses, which no reader is ever shown, and those categories:
 * `{ text, categories }`. A guide's section, and a message with none, as
 * it is.
 */
export function withoutUnusedPlurals(text, id, language) {
  if (!id.includes(".")) return { text, categories: [] };
  const unused = unusedBranches(text, language);
  let without = text;
  // From the last, so each branch's place still holds; one inside another
  // dropped goes with it.
  for (const { start, end } of unused.toSorted((a, b) => b.start - a.start)) {
    if (!unused.some((outer) => outer.start < start && end <= outer.end)) {
      without = without.slice(0, start) + without.slice(end);
    }
  }
  return {
    text: without,
    categories: [...new Set(unused.map(({ key }) => key))],
  };
}

/** Words joined as a sentence lists them: one, many and other. */
const listed = (words) =>
  words.length > 1
    ? `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`
    : words.join("");

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

  const settledText = settledMessages().get(language)?.get(id);
  if (settledText !== undefined && text !== settledText) {
    problems.push(`not its settled text, ${settledText} (Settled messages)`);
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

  if (id.includes(".")) {
    const unused = unusedBranches(text, language);
    for (const kind of ["plural", "selectordinal"]) {
      const branches = unused.filter((branch) => branch.kind === kind);
      if (branches.length > 0) {
        const keys = [...new Set(branches.map(({ key }) => key))];
        problems.push(
          `${kind} ${listed(keys)}, which ${language} never shows: its ${kind}s have ${listed(branches[0].used)} only (Intl.PluralRules); =1 is exactly one`,
        );
      }
    }
  }

  if (language === "zh-Hans") {
    const half = found(text, HALF_WIDTH);
    if (half.length > 0) {
      problems.push(
        `half-width ${half.join(" ")} beside Chinese, for ${half.map((mark) => FULL_WIDTH[mark]).join(" ")}`,
      );
    }
    const { names } = unspaced(text, id, language);
    if (names.length > 0) {
      problems.push(
        `a space between Chinese and ${names.join(" ")}, which Chinese fills with Chinese words (${FILLED})`,
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
    // A colon a space follows, or nothing, not 14:30; and any colon a
    // plain space comes before, as in Note :{x} or **Note :**, but a
    // skeleton's ::.
    if (/(?<! ):(?=\s|$)| :(?!:)/.test(text)) {
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
      const texts = textsIn(language);
      for (const { file, id, text, english } of texts) {
        if (id.includes(".")) messages++;
        else sections++;
        for (const problem of problemsOf(text, id, language, english)) {
          failures.push(`${file}: ${id}: ${problem}`);
        }
      }
      const inCatalogues = new Set(
        texts
          .filter(({ file }) => catalogues(language).includes(file))
          .map(({ id }) => id),
      );
      for (const id of settledMessages().get(language).keys()) {
        if (!inCatalogues.has(id)) {
          failures.push(
            `${GLOSSARY}: ${id}: settled in ${language}, but in neither of its catalogues; take its row out of Settled messages`,
          );
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
      `\n${failures.length} problems: change each by ${GLOSSARY}'s Words not to use, Settled messages, ${FILLED} and Writing conventions; ` +
        "a translation meant to be its English goes in scripts/i18n-rules.mjs's SAME_AS_ENGLISH, with why.",
    );
    process.exit(1);
  }
  console.log(
    `Translations keep the glossary's words and punctuation: ${messages} messages and ${sections} guide sections in ${Object.keys(LANGUAGES).join(" and ")}.`,
  );
}
