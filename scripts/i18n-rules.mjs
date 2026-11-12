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
 * It exports problemsOf(text, id, language), one text's problems, which
 * the decide step runs on each text it decides. No dependencies:
 * scripts/verify.sh and the Docs workflow run it with Node alone. Its
 * tests are in i18n-rules.test.mjs: `node --test scripts/`.
 */
import { readdirSync, readFileSync } from "node:fs";
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
 * for its opening), in fr-CA or zh-Hans.
 */
export function problemsOf(text, id, language) {
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

/** Every text checked, in a language: each message, then each section. */
function textsIn(language) {
  const texts = [];
  for (const file of catalogues(language)) {
    const catalogue = JSON.parse(readFileSync(path.join(ROOT, file), "utf8"));
    for (const [id, text] of Object.entries(catalogue)) {
      texts.push({ file, id, text });
    }
  }
  const folder = `${GUIDES}/${language}`;
  for (const name of readdirSync(path.join(ROOT, folder)).sort()) {
    if (!name.endsWith(".md")) continue;
    const file = `${folder}/${name}`;
    const text = readFileSync(path.join(ROOT, file), "utf8");
    for (const section of sectionsOf(name.slice(0, -3), text)) {
      texts.push({ file, ...section });
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
      for (const { file, id, text } of textsIn(language)) {
        if (id.includes(".")) messages++;
        else sections++;
        for (const problem of problemsOf(text, id, language)) {
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
      `\n${failures.length} problems: change each by ${GLOSSARY}'s Words not to use and Writing conventions.`,
    );
    process.exit(1);
  }
  console.log(
    `Translations keep the glossary's words and punctuation: ${messages} messages and ${sections} guide sections in ${Object.keys(LANGUAGES).join(" and ")}.`,
  );
}
