#!/usr/bin/env node
/**
 * The decide step of ADR-054's November 2026 amendment (R2, R5): with no
 * fluent reader, one text for each message and guide section of a review's
 * workbook, from ChatGPT's review and, for round 2, Claude's.
 *
 *     node scripts/i18n-decide.mjs --chatgpt <file> [--claude <file>] --out <file> [--meaning] [--model <id>]
 *     node scripts/i18n-decide.mjs --chatgpt review/zh-Hans.chatgpt.xlsx \
 *       --claude review/zh-Hans.claude.xlsx --out review/zh-Hans.decided.xlsx --meaning
 *
 * It reads each workbook with i18n-review.mjs's reader, a row by its Area
 * and Id and a column by its title: Area, Id, English, Translation and
 * Correction, as export wrote them. A column a review added, such as Why,
 * is not read. A review changed a message where its Correction is filled
 * in and differs from its Translation. Each message then takes, by the
 * amendment's table:
 *
 * - the fix both reviews made, where they made the same one;
 * - ChatGPT's, where both changed it differently, or only ChatGPT did;
 * - today's, where only Claude changed it, unless the rules check finds
 *   today's wrong: then Claude's;
 * - today's, where neither did. With no --claude, a message ChatGPT kept
 *   stays today's.
 *
 * Today's is the translation in the catalogue or guide now. A message a
 * review changed is set aside where its English or translation is no
 * longer what the workbook says, or it is gone, as import would refuse
 * it: its Correction cleared and the reason written; the next round reads
 * it at its new text. English changed only in its apostrophes or quotation
 * marks counts as the same, as it does for import.
 *
 * Each text decided is checked before it goes in. The rules check:
 * i18n-rules.mjs's problemsOf, the glossary's words and punctuation, and
 * import's own checks, a message's ICU and placeholders and a section's
 * heading and links, so import takes the decided workbook whole. With
 * --meaning, the meaning check too, on each text that differs from
 * today's. A text that fails either falls back to the other review's,
 * where that one passes, else to today's.
 *
 * The meaning check asks Claude, through the Messages API, whether each
 * text says what its English says, with nothing added, dropped or
 * reversed (numbers, names, a "not" and "before tax" among them), style
 * never judged: 25 texts a request, on claude-sonnet-5-5 unless --model
 * names another, the API's default fallback model taking a request the
 * model declines. The key is read from ANTHROPIC_API_KEY alone and is
 * never printed or written; without it, --meaning is refused before
 * anything is read. Each answer is kept in review/<language>.meaning.json
 * by the English and the text, saved after each request, so a run stopped
 * part way, or a second one, asks only what has no answer yet.
 *
 * It writes the decided workbook, its sheet named for the language as
 * export's is: Area, Id, Where, English, Translation and Placeholders to
 * keep as ChatGPT's workbook has them; Correction, the decided text, empty
 * where today's stays; and beside them Reason, the table's row, and
 * Fallback, each text that failed a check and why. `node
 * scripts/i18n-review.mjs import <file>` reads it as any returned
 * workbook. It prints the counts: agreed, ChatGPT, Claude, today's and set
 * aside, which add up to the rows; those fallen back by rule and by
 * meaning; and what the meaning check asked and the tokens it used.
 *
 * Its tests, in i18n-decide.test.mjs, run it on a small catalogue and
 * guide in a temporary folder, fetch stubbed: `node --test scripts/`. Like
 * i18n-review.mjs, it needs client/'s and server/'s node_modules.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readWorkbook, targetsFor, workbook } from "./i18n-review.mjs";
import { problemsOf } from "./i18n-rules.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The languages a workbook's sheet can be named for, as the meaning check names them. */
const LANGUAGES = {
  "fr-CA": "French, as written in Canada (fr-CA)",
  "zh-Hans": "Simplified Chinese (zh-Hans)",
};

/** The titles read from a review's workbook; any other is left alone. */
const TITLES = ["Area", "Id", "English", "Translation", "Correction"];

/** The decided workbook's: import's, with the reason beside each row. */
const COLUMNS = [
  { title: "Area", width: 10 },
  { title: "Id", width: 34 },
  { title: "Where", width: 34 },
  { title: "English", width: 60 },
  { title: "Translation", width: 60 },
  { title: "Correction", width: 60 },
  { title: "Placeholders to keep", width: 22 },
  { title: "Reason", width: 40 },
  { title: "Fallback", width: 50 },
];

const USAGE =
  "Usage:\n  node scripts/i18n-decide.mjs --chatgpt <file> [--claude <file>] --out <file> [--meaning] [--model <id>]";

/** A file as the repository names it, or in full outside it. */
const shown = (file) => {
  const relative = path.relative(ROOT, file);
  return relative.startsWith("..") ? file : relative;
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

// ---------------------------------------------------------------- reviews

/** A review's workbook: its language, and its rows by the titles read. */
function reviewOf(file, who) {
  let book;
  try {
    book = readWorkbook(readFileSync(file));
  } catch (error) {
    fail(
      `${who}'s workbook, ${shown(file)}, could not be read: ${error.message}.`,
    );
  }
  const [header = [], ...rows] = book.rows;
  const missing = TITLES.filter((title) => !header.includes(title));
  if (missing.length > 0) {
    fail(
      `${who}'s workbook, ${shown(file)}, has no ${missing.join(" or ")} title in its first row. ` +
        `Keep the titles export wrote: ${TITLES.join(", ")}.`,
    );
  }
  const cell = (row, title) =>
    header.includes(title) ? (row[header.indexOf(title)] ?? "") : "";
  return {
    language: book.sheetName,
    rows: rows
      .map((row) => ({
        area: cell(row, "Area"),
        id: cell(row, "Id"),
        where: cell(row, "Where"),
        english: cell(row, "English"),
        translation: cell(row, "Translation"),
        correction: cell(row, "Correction"),
        keep: cell(row, "Placeholders to keep"),
      }))
      .filter((row) => row.area || row.id),
  };
}

const rowKey = (row) => `${row.area}\n${row.id}`;

// --------------------------------------------------------------- deciding

/** Who each text came from, as the Fallback column names it. */
const WHOSE = {
  agreed: "The fix both made",
  ChatGPT: "ChatGPT's",
  Claude: "Claude's",
};

/**
 * A row's decision before the meaning check: decided already (today's, or
 * set aside), or the texts to try in turn, today's after the last.
 * `claude` is Claude's row, null where its workbook has none, undefined
 * with no --claude.
 */
function decisionOf(row, claude, targets, language) {
  const withClaude = claude !== undefined;
  const target = targets.get(row.area);
  const cell = (text) => (target ? target.cell(text) : text);
  // A review's text where it changed the message, as import reads it.
  const fix = (review) => {
    if (!review) return null;
    const correction = cell(review.correction).trim();
    return correction && correction !== cell(review.translation).trim()
      ? correction
      : null;
  };
  const chatgpt = fix(row);
  const theirs = fix(claude);

  if (!chatgpt && !theirs) {
    return {
      row,
      source: "today",
      reason: withClaude ? "Neither review changed it" : "ChatGPT kept it",
    };
  }

  const today = target?.find(row.id) ?? null;
  if (!today) {
    return {
      row,
      source: "set aside",
      reason: `Set aside: not in ${row.area} today, so there is nothing to correct`,
    };
  }
  const changed = new Set();
  for (const review of [row, claude]) {
    if (!review) continue;
    if (!target.same(cell(review.english), today.english)) {
      changed.add("English");
    }
    if (cell(review.translation) !== today.translation) {
      changed.add("translation");
    }
  }
  if (changed.size > 0) {
    return {
      row,
      source: "set aside",
      reason: `Set aside: its ${[...changed].join(" and its ")} changed since the export; the next round reads it at its new text`,
    };
  }

  const decision = {
    row,
    english: today.english,
    check: (text) => [
      ...problemsOf(text, row.id, language),
      ...[target.check(row.id, text)].filter(Boolean),
    ],
  };
  const from = (source, text) => ({ source, text });

  if (chatgpt && chatgpt === theirs) {
    return {
      ...decision,
      reason: "Both reviews made the same fix",
      tries: [from("agreed", chatgpt)],
    };
  }
  if (chatgpt && theirs) {
    return {
      ...decision,
      reason: "Both changed it, differently; ChatGPT's leads",
      tries: [from("ChatGPT", chatgpt), from("Claude", theirs)],
    };
  }
  if (chatgpt) {
    return {
      ...decision,
      reason: withClaude ? "Only ChatGPT changed it" : "ChatGPT changed it",
      tries: [from("ChatGPT", chatgpt)],
    };
  }
  // One vote against one: ChatGPT read it and kept it, and ChatGPT leads.
  const wrong = decision.check(today.translation);
  if (wrong.length === 0) {
    return {
      row,
      source: "today",
      reason:
        "Only Claude changed it; today's passes the rules check, so it stays",
    };
  }
  return {
    ...decision,
    reason: `Only Claude changed it; today's fails the rules check: ${wrong.join("; ")}`,
    tries: [from("Claude", theirs)],
  };
}

/**
 * A decision's text: the first it tries that passes the rules check and,
 * with the meaning check, its answer; today's if none does. Pending, with
 * the text to ask about, where the meaning check has no answer yet.
 */
function resolve(decision, meaning) {
  if (!decision.tries) return decision;
  const fallbacks = [];
  for (const { source, text } of decision.tries) {
    const problems = decision.check(text);
    if (problems.length > 0) {
      fallbacks.push({
        by: "rule",
        why: `${WHOSE[source]} fails the rules check: ${problems.join("; ")}`,
      });
      continue;
    }
    if (meaning) {
      const answer = meaning.answer(decision.english, text);
      if (!answer) {
        return { ...decision, pending: { english: decision.english, text } };
      }
      if (!answer.same) {
        fallbacks.push({
          by: "meaning",
          why: `${WHOSE[source]} fails the meaning check: ${answer.why}`,
        });
        continue;
      }
    }
    return { ...decision, source, text, fallbacks };
  }
  return { ...decision, source: "today", fallbacks };
}

/** The Fallback column: each text that failed and why, then what went in. */
function fallbackCell({ fallbacks = [], source }) {
  if (fallbacks.length === 0) return "";
  const sentence = (text) => `${text.trim().replace(/[.。]$/, "")}.`;
  return [
    ...fallbacks.map(({ why }) => sentence(why)),
    source === "today" ? "Today's stays." : `${WHOSE[source]} goes in.`,
  ].join(" ");
}

// ------------------------------------------------------- the meaning check

const API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5-5";
const BATCH = 25;

const SYSTEM = (language) =>
  `You check translations for a small business's app for its stock, orders and invoices, from English into ${LANGUAGES[language]}. Each item is a message from the app's screens, emails or printed documents, or a section of its Help guides in Markdown, with its translation.

For each item, decide whether the translation says what the English says. It does not when it adds something the English does not say, drops something the English says, or reverses it: a number or amount, a name, a date or period, a "not", a condition such as "before tax", who does what, or what happens next.

Judge meaning only. Wording, word choice, tone, style, punctuation and how natural the translation reads are checked elsewhere: a free translation that says the same is the same. Placeholders in braces, such as {count}, and tags such as <link>…</link> stand for what is filled in later. ICU plural and select forms say the same when each form says what the English's does, and a language with fewer plural forms may merge them. Markdown, such as bold and links, is not meaning.

Answer every item by its n: same, and why, one short sentence in English saying what was added, dropped or reversed, or an empty string when the translation says the same.`;

const SCHEMA = {
  type: "object",
  properties: {
    answers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          n: { type: "integer" },
          same: { type: "boolean" },
          why: { type: "string" },
        },
        required: ["n", "same", "why"],
        additionalProperties: false,
      },
    },
  },
  required: ["answers"],
  additionalProperties: false,
};

/** The meaning check in a language: its answers, kept and asked for. */
function meaningCheck(language, model, key) {
  const file = path.join(ROOT, "review", `${language}.meaning.json`);
  const keyOf = (english, text) => JSON.stringify([english, text]);
  const kept = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
  const answers = new Map(
    kept.map((entry) => [keyOf(entry.english, entry.text), entry]),
  );
  const earlier = new Set(answers.keys());
  const used = new Set();
  const asked = new Set();
  const spent = { requests: 0, input: 0, output: 0 };

  const tokens = () =>
    `${spent.input.toLocaleString("en")} tokens in, ${spent.output.toLocaleString("en")} out`;
  const stop = (why) =>
    fail(
      `The meaning check stopped: ${why}. It used ${tokens()}. ` +
        `The answers so far are kept in ${shown(file)}; run the same command again, and it asks only the rest.`,
    );
  const save = () => {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify([...answers.values()], null, 2)}\n`);
  };

  /** One request: up to BATCH texts, each with its English. */
  async function request(batch) {
    let response;
    try {
      response = await fetch(API, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2026-10-21",
          "anthropic-beta": "server-side-fallback-2026-07-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 16000,
          fallbacks: "default",
          output_config: {
            effort: "medium",
            format: { type: "json_schema", schema: SCHEMA },
          },
          system: SYSTEM(language),
          messages: [
            {
              role: "user",
              content: JSON.stringify({
                items: batch.map(({ english, text }, i) => ({
                  n: i + 1,
                  english,
                  translation: text,
                })),
              }),
            },
          ],
        }),
      });
    } catch (error) {
      stop(`the API could not be reached (${error.message})`);
    }
    const message = await response.json().catch(() => null);
    if (!response.ok) {
      stop(
        `the API answered ${response.status}, ${message?.error?.message ?? response.statusText}`,
      );
    }
    spent.requests += 1;
    spent.input += message?.usage?.input_tokens ?? 0;
    spent.output += message?.usage?.output_tokens ?? 0;
    if (message?.stop_reason !== "end_turn") {
      const category = message?.stop_details?.category;
      stop(
        `its answer ended with ${message?.stop_reason}${category ? ` (${category})` : ""}, not end_turn`,
      );
    }
    const text = (message.content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");
    let given;
    try {
      given = JSON.parse(text).answers;
    } catch {
      stop("its answer was not the JSON asked for");
    }
    for (const answer of Array.isArray(given) ? given : []) {
      const item = batch[answer?.n - 1];
      if (item && typeof answer.same === "boolean") {
        answers.set(keyOf(item.english, item.text), {
          english: item.english,
          text: item.text,
          same: answer.same,
          why: String(answer.why ?? ""),
        });
      }
    }
    save();
  }

  return {
    answer(english, text) {
      const key = keyOf(english, text);
      const found = answers.get(key);
      if (found) used.add(key);
      return found;
    },
    /**
     * Asks about each text, BATCH a request, saying on stderr how far it
     * has gone; stops if none is answered.
     */
    async ask(items) {
      const before = answers.size;
      for (const item of items) asked.add(keyOf(item.english, item.text));
      for (let at = 0; at < items.length; at += BATCH) {
        await request(items.slice(at, at + BATCH));
        console.error(
          `The meaning check: ${Math.min(at + BATCH, items.length)} of ${items.length} texts asked.`,
        );
      }
      if (answers.size === before) {
        stop(`it answered none of the ${items.length} texts asked`);
      }
    },
    summary: () =>
      `${asked.size} texts asked in ${spent.requests} requests, ` +
      `${[...used].filter((key) => earlier.has(key)).length} answered by an earlier run; ${tokens()}`,
  };
}

// ------------------------------------------------------------------- main

/** The options, each at most once, in any order; null for anything else. */
function optionsOf(args) {
  const options = {};
  for (let at = 0; at < args.length; at += 1) {
    if (args[at] === "--meaning" && !options.meaning) {
      options.meaning = true;
      continue;
    }
    const name = {
      "--chatgpt": "chatgpt",
      "--claude": "claude",
      "--out": "out",
      "--model": "model",
    }[args[at]];
    const value = args[at + 1];
    if (!name || name in options || !value || value.startsWith("--")) {
      return null;
    }
    options[name] = value;
    at += 1;
  }
  return options.chatgpt && options.out ? options : null;
}

const options = optionsOf(process.argv.slice(2));
if (!options) fail(USAGE);

const key = process.env.ANTHROPIC_API_KEY;
if (options.meaning && !key) {
  fail(
    "--meaning needs the API key in this terminal: run `read -s ANTHROPIC_API_KEY && export ANTHROPIC_API_KEY`, " +
      "paste the key and press Return, then this command again.",
  );
}

const out = path.resolve(options.out);
if (
  [options.chatgpt, options.claude].some(
    (file) => file && path.resolve(file) === out,
  )
) {
  fail(
    "--out names a review's own workbook. Write the decided one beside it, as review/<language>.decided.xlsx.",
  );
}

const chatgpt = reviewOf(path.resolve(options.chatgpt), "ChatGPT");
const language = chatgpt.language;
if (!Object.hasOwn(LANGUAGES, language)) {
  fail(
    `ChatGPT's workbook's sheet is named "${language}", not one of ${Object.keys(LANGUAGES).join(", ")}. ` +
      "Keep the sheet name export wrote.",
  );
}
const claude =
  options.claude && reviewOf(path.resolve(options.claude), "Claude");
if (claude && claude.language !== language) {
  fail(
    `Claude's workbook is for ${claude.language} and ChatGPT's for ${language}: give two of one language.`,
  );
}

const theirs = new Map(
  claude ? claude.rows.map((row) => [rowKey(row), row]) : [],
);
const targets = targetsFor(language);
const decisions = chatgpt.rows.map((row) =>
  decisionOf(
    row,
    claude ? (theirs.get(rowKey(row)) ?? null) : undefined,
    targets,
    language,
  ),
);
const ours = new Set(chatgpt.rows.map(rowKey));
const unmatched = claude
  ? claude.rows.filter((row) => !ours.has(rowKey(row))).length
  : 0;

const meaning =
  options.meaning && meaningCheck(language, options.model ?? MODEL, key);
let results;
for (;;) {
  results = decisions.map((decision) => resolve(decision, meaning));
  const pending = new Map(
    results
      .filter((result) => result.pending)
      .map(({ pending }) => [JSON.stringify(pending), pending]),
  );
  if (pending.size === 0) break;
  await meaning.ask([...pending.values()]);
}

mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(
  out,
  workbook(language, COLUMNS, [
    COLUMNS.map((column) => column.title),
    ...results.map((result) => [
      result.row.area,
      result.row.id,
      result.row.where,
      result.row.english,
      result.row.translation,
      result.text ?? "",
      result.row.keep,
      result.reason,
      fallbackCell(result),
    ]),
  ]),
);

const count = (source) =>
  results.filter((result) => result.source === source).length;
const fellBack = (by) =>
  results.filter((result) => result.fallbacks?.some((f) => f.by === by)).length;
console.log(
  [
    `${shown(out)}: ${results.length} rows, ${language}.`,
    `- Agreed ${count("agreed")}, ChatGPT ${count("ChatGPT")}, Claude ${count("Claude")}, today's ${count("today")}, set aside ${count("set aside")}.`,
    `- Fallen back: ${fellBack("rule")} by rule, ${fellBack("meaning")} by meaning.`,
    meaning
      ? `- The meaning check: ${meaning.summary()}.`
      : "- The meaning check: not run; --meaning runs it.",
    ...(unmatched > 0
      ? [
          `- ${unmatched} rows of Claude's workbook are not in ChatGPT's, and were left out.`,
        ]
      : []),
  ].join("\n"),
);
