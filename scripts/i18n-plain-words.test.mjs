/**
 * Every message says what to fix in words (#148; ADR-054's November 2026
 * amendment, R11): none shows a person a field's path or index, a type,
 * or how a request is sent, as "components.0.rate must be a percentage
 * with at most 4 decimal places, sent as a string" did. A test beside
 * i18n-rules.mjs's check, on Node's own runner:
 *
 *     node --test scripts/
 *
 * It reads both packages' catalogues in en, fr-CA and zh-Hans, and in each
 * message only its words: a placeholder's name and a select's keys, such
 * as {lineId} or creditedWithOutput, are ICU's and never shown. The
 * exceptions are listed below by id, each with why; one that no longer
 * needs to be there fails too, so the list only shrinks. FormatJS's parser
 * comes from client/node_modules, as i18n-review.mjs's does.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(ROOT, "client/package.json"));
const { parse, TYPE } = require("@formatjs/icu-messageformat-parser");

const LANGUAGES = ["en", "fr-CA", "zh-Hans"];
const CATALOGUES = ["client/src/locales", "server/src/i18n"];

/**
 * class-validator's own rules, as the server's ValidationPipe names them
 * (server/src/i18n/validation.ts). Their English is class-validator's,
 * the field named as the API names it, for the integrator who sent the
 * request (ADR-054): a screen checks before sending, so a person seldom
 * meets one. A field a screen lets through gets a DTO rule of its own, in
 * words, as the tax rate's is.
 */
const BUILT_IN =
  "class-validator's own sentence, naming the field as the API does for the integrator who sent it (ADR-054)";

/** Messages that may show what this test refuses, each with why. */
const EXCEPTIONS = new Map([
  ...[
    "arrayMaxSize",
    "arrayMinSize",
    "arrayUnique",
    "isArray",
    "isBoolean",
    "isBooleanString",
    "isDate",
    "isDefined",
    "isEmail",
    "isIn",
    "isInt",
    "isIso8601",
    "isNotEmpty",
    "isPositive",
    "isString",
    "isUuid",
    "matches",
    "max",
    "maxLength",
    "min",
    "minLength",
    "nested",
    "whitelist",
  ].map((rule) => [`validation.${rule}`, BUILT_IN]),
  [
    "organization.export.glossary.audit",
    "the export's glossary names the columns of audit_log.csv, payload among them, which are what the file holds",
  ],
]);

// ------------------------------------------------------------------ rules

/** What a message must not show a person, each read in its language. */
const RULES = [
  {
    name: "a field's path, filled in from {property}",
    found: ({ names }) => names.includes("property"),
  },
  {
    name: "a field's path or API name, such as components.0.rate or exchangeRate",
    found: ({ words }) =>
      /\b[A-Za-z_]\w*\.\d+\b/.test(words) || /\b[a-z]+[A-Z]\w*/.test(words),
  },
  {
    name: "a field's API name opening the sentence, such as rate must",
    found: ({ words }) => /^[a-z]\w* (?:must|should|doit|必须)/.test(words),
  },
  {
    name: "a type, such as a string, a UUID or an array",
    found: ({ words, language }) =>
      ({
        en: /\b(?:a string|a boolean|boolean (?:value|string)|a UUID|an array|an integer number|a Date instance|ISO 8601|object or array)\b/i,
        "fr-CA":
          /(?:une chaîne|booléen|UUID|un tableau|instance de Date|ISO 8601|objet ou un tableau)/i,
        "zh-Hans": /(?:字符串|布尔|UUID|数组|ISO 8601)/,
      })[language].test(words),
  },
  {
    name: "how a request is sent, such as sent as a string",
    found: ({ words, language }) =>
      ({
        en: /\b(?:sent as|JSON|request body|query string|payload)\b/i,
        "fr-CA": /(?:envoyée? comme|JSON|corps de la requête)/i,
        "zh-Hans": /(?:以字符串|JSON|请求体)/,
      })[language].test(words),
  },
];

/**
 * A message's words and its placeholders' names, from FormatJS's parse:
 * a select's or a plural's options are words, their keys are not.
 */
function partsOf(message) {
  const words = [];
  const names = [];
  const walk = (elements) => {
    for (const element of elements) {
      if (element.type === TYPE.literal) words.push(element.value);
      else if (element.type === TYPE.pound) words.push("#");
      else {
        if (element.value !== undefined) names.push(element.value);
        // An argument stands in the sentence; keep the words apart.
        if (element.type !== TYPE.tag) words.push(" ");
        if (element.children) walk(element.children);
        for (const option of Object.values(element.options ?? {})) {
          walk(option.value);
          words.push(" ");
        }
      }
    }
  };
  walk(parse(message));
  return { words: words.join("").trim(), names };
}

/** What a message shows that it must not, by each rule's name. */
function problemsOf(message, language) {
  const parts = { ...partsOf(message), language };
  return RULES.filter((rule) => rule.found(parts)).map((rule) => rule.name);
}

/** Every message in every catalogue, with its file, id and language. */
function everyMessage() {
  return CATALOGUES.flatMap((folder) =>
    LANGUAGES.flatMap((language) => {
      const file = `${folder}/${language}.json`;
      const catalogue = JSON.parse(readFileSync(path.join(ROOT, file), "utf8"));
      return Object.entries(catalogue).map(([id, message]) => ({
        file,
        id,
        language,
        message,
      }));
    }),
  );
}

// ------------------------------------------------------------------ tests

test("each rule catches what #148 found, in each language", () => {
  const cases = [
    ["{property} must be a string", "en", 0],
    ["components.0.rate must be a percentage", "en", 1],
    ["exchangeRate must be greater than zero", "en", 1],
    ["rate must be a percentage", "en", 2],
    ["country 必须是两个字母的代码", "zh-Hans", 2],
    ["The value must be a UUID", "en", 3],
    ["La valeur doit être une chaîne", "fr-CA", 3],
    ["值必须是数组", "zh-Hans", 3],
    ["Up to 4 decimal places, sent as a string", "en", 4],
    ["D’au plus 4 décimales, envoyé comme chaîne", "fr-CA", 4],
    ["最多 4 位小数，并以字符串发送", "zh-Hans", 4],
  ];
  for (const [message, language, rule] of cases) {
    assert.ok(
      problemsOf(message, language).includes(RULES[rule].name),
      `${message}: ${RULES[rule].name}`,
    );
  }
});

test("a message in words passes, its placeholders and select keys aside", () => {
  const cases = [
    [
      "Enter a rate as a percentage from 0 to 100, with up to 4 decimal places.",
      "en",
    ],
    ["No line {lineId} on this order", "en"],
    [
      "A {actual} run cannot be {verb, select, creditedWithOutput {credited with output} other {{verb}}}",
      "en",
    ],
    ["You’re signed in as {email}. <signOut>Sign out</signOut>", "en"],
    ["Prochain numéro : un nombre entier, 1 ou plus.", "fr-CA"],
    ["请以百分比输入税率，在 0 到 100 之间，最多 4 位小数。", "zh-Hans"],
    ["A logo can be up to 2 MB. Choose a smaller file.", "en"],
  ];
  for (const [message, language] of cases) {
    assert.deepEqual(problemsOf(message, language), [], message);
  }
});

test("no message shows a field's path, an index, a type or how it is sent", () => {
  const problems = everyMessage()
    .filter(({ id }) => !EXCEPTIONS.has(id))
    .flatMap(({ file, id, language, message }) =>
      problemsOf(message, language).map((rule) => `${file}: ${id}: ${rule}`),
    );
  assert.deepEqual(problems, []);
});

test("each exception is still needed, in some language", () => {
  const messages = everyMessage();
  const unneeded = [...EXCEPTIONS.keys()].filter(
    (id) =>
      !messages.some(
        (message) =>
          message.id === id &&
          problemsOf(message.message, message.language).length > 0,
      ),
  );
  assert.deepEqual(unneeded, []);
});
