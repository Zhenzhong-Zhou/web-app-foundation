#!/usr/bin/env node
/**
 * The decide step of ADR-054's November 2026 amendment (R2, R5): with no
 * fluent reader, one text for each message and guide section of a review's
 * workbook, from ChatGPT's review and, for round 2, Claude's.
 *
 *     node scripts/i18n-decide.mjs --chatgpt <file> [--claude <file>] --out <file> [--meaning] [--model <id>]
 *     node scripts/i18n-decide.mjs --chatgpt review/zh-Hans.chatgpt.xlsx \
 *       --claude review/zh-Hans.claude.xlsx --out review/zh-Hans.decided.xlsx --meaning
 *     node scripts/i18n-decide.mjs --calibrate [--model <id>]
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
 * - today's, where only Claude changed it, unless a check finds today's
 *   wrong: then Claude's, where it passes both checks;
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
 * today's, and on today's where only Claude changed it. A text that fails
 * either falls back to the other review's, where that one passes, else to
 * today's.
 *
 * The meaning check asks Claude, through the Messages API, whether each
 * text makes a serious change to what its English says, as an LLM judge is
 * built: each item its message's id, its English and its text, and the
 * glossary's Terms with every request; the answer's reason first, then its
 * verdict. It rejects only a serious change: the meaning reversed or
 * contradicted; a number, date, amount, name, role, screen label or tax
 * wording changed; information the reader needs dropped; a claim the
 * English and the message's id do not support. It passes a text that
 * states what the context implies, uses the glossary's word, or says it
 * more plainly, and never judges style. 25 texts a request, on
 * claude-sonnet-5-5 unless --model names another, the API's default
 * fallback model taking a request the model declines. The key is read from
 * ANTHROPIC_API_KEY alone and is never printed or written; without it,
 * --meaning is refused before anything is read. Each answer is kept in
 * review/<language>.meaning.json by the model, the check's version, the
 * id, the English and the text, saved after each request, so a run
 * stopped part way, or a second one, asks only what has no answer yet,
 * and a new model or version asks every text again. Each answer comes back
 * through structured outputs, the API's JSON schema, so it always parses;
 * the API takes no temperature (it refuses one since version 2026-10-21)
 * and no forced tool on claude-sonnet-5-5.
 *
 * --calibrate tries the meaning check before a run spends on it, ten texts
 * a language in three sets. The 20 in i18n-decide.calibration.json's
 * planted, each copied from a catalogue on 12 November 2026, are asked
 * about with one error planted (a "not" dropped or added, a number changed,
 * a clause dropped, before tax and including tax swapped, a name changed),
 * to be caught, and unchanged, to be passed. Its rewrites name 20 of
 * ChatGPT's corrections in round 2's workbooks, each correct in a way the
 * check once flagged, to be passed: read from review/ by their ids, since
 * no text of a review is committed. A language's go in two requests, each
 * with five of each set and never one message twice, so no answer comes
 * from comparing the two. Nothing is kept. It prints each one caught or
 * missed, passed or flagged, and the three scores, and exits 1 under 18 of
 * 20 caught, or over 2 of 20 unchanged or of 20 rewrites flagged: the
 * meaning check is then not to be trusted with the decide step, for what
 * it misses, or for the corrections it would drop.
 *
 * It writes the decided workbook, its sheet named for the language as
 * export's is: Area, Id, Where, English, Translation and Placeholders to
 * keep as ChatGPT's workbook has them; Correction, the decided text, empty
 * where today's stays; and beside them Reason, the table's row, and
 * Fallback, each text that failed a check and why. `node
 * scripts/i18n-review.mjs import <file>` reads it as any returned
 * workbook. It prints the counts: agreed, ChatGPT, Claude, today's and set
 * aside, which add up to the rows; those fallen back by rule and by
 * meaning; with --claude, those only Claude changed and in how many a check
 * found today's wrong; and what the meaning check asked and the tokens it
 * used.
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
  "Usage:\n  node scripts/i18n-decide.mjs --chatgpt <file> [--claude <file>] --out <file> [--meaning] [--model <id>]\n" +
  "  node scripts/i18n-decide.mjs --calibrate [--model <id>]";

/**
 * The calibration's texts; how many of their planted errors it must catch,
 * at least; and how many of them unchanged, and of ChatGPT's rewrites, it
 * may flag, at most, each.
 */
const CALIBRATION = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "i18n-decide.calibration.json",
);
const CALIBRATION_CAUGHT = 18;
const CALIBRATION_FLAGGED = 2;

/** The glossary, whose Terms each request of the meaning check gives. */
const GLOSSARY = path.join(ROOT, "docs", "glossary.md");

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
  // Today's stays unless a check finds it wrong: the rules check here, the
  // meaning check in resolve.
  const onlyClaude = {
    ...decision,
    onlyClaude: true,
    tries: [from("Claude", theirs)],
  };
  const wrong = decision.check(today.translation);
  if (wrong.length === 0) {
    return {
      ...onlyClaude,
      kept: today.translation,
      reason:
        "Only Claude changed it; today's passes the rules check, so it stays",
    };
  }
  return {
    ...onlyClaude,
    wrong: "rule",
    reason: `Only Claude changed it; today's fails the rules check: ${wrong.join("; ")}`,
  };
}

/**
 * A decision's text: the first it tries that passes the rules check and,
 * with the meaning check, its answer; today's if none does. Where only
 * Claude changed it and today's passed the rules check, today's stays
 * unless the meaning check finds it wrong. Pending, with the text to ask
 * about, where the meaning check has no answer yet.
 */
function resolve(decision, meaning) {
  const { id } = decision.row;
  if (decision.kept !== undefined) {
    const { kept, tries, ...rest } = decision;
    const answer = meaning?.answer(id, decision.english, kept);
    if (meaning && !answer) {
      return {
        ...decision,
        pending: { id, english: decision.english, text: kept },
      };
    }
    if (!answer || answer.verdict === "pass") {
      return {
        ...rest,
        source: "today",
        reason: meaning
          ? "Only Claude changed it; today's passes both checks, so it stays"
          : decision.reason,
      };
    }
    return resolve(
      {
        ...rest,
        tries,
        wrong: "meaning",
        reason: `Only Claude changed it; today's fails the meaning check: ${answer.reason}`,
      },
      meaning,
    );
  }
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
      const answer = meaning.answer(id, decision.english, text);
      if (!answer) {
        return {
          ...decision,
          pending: { id, english: decision.english, text },
        };
      }
      if (answer.verdict !== "pass") {
        fallbacks.push({
          by: "meaning",
          why: `${WHOSE[source]} fails the meaning check: ${answer.reason}`,
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

/**
 * The meaning check's version, kept with each answer beside its model: an
 * answer is reused only by the same model and version, so a change to the
 * question asks every text again. 2 (13 November 2026): the reason before
 * the verdict, only a serious change rejected, each item's id and the
 * glossary's Terms given. The first, unnumbered, was wrong about 4 times
 * in 5 that it flagged a text, in the chat's reading of 50.
 */
const VERSION = 2;

const SYSTEM = (language, terms) =>
  `You check translations for a small business's app for its stock, orders and invoices, from English into ${LANGUAGES[language]}. Each item is a message from the app's screens, emails or printed documents, or a section of its Help guides in Markdown: its id, which says where the app shows it and what it is about; its English; and its translation.

For each item, decide whether the translation makes a serious change to what the English says. Only these are serious:
- it reverses or contradicts the English, as by dropping or adding a "not";
- it changes a number, a date or period, an amount, a name, a role, a screen label, or tax wording such as "before tax" or "incl. tax";
- it drops information the reader needs, such as a condition, a limit, who does what, or what happens next;
- it claims something that neither the English nor the message's id supports.

Anything else passes. A translation passes when it states what the context implies, what the id and the English together make plain; when it uses the glossary's word for a term, below, where the English has a shorter or plainer one; and when it says the same more plainly, more fully or in another order. Wording, tone, style, punctuation and how natural it reads are checked elsewhere: never reject for them. Placeholders in braces, such as {count}, and tags such as <b>…</b> stand for what is filled in later. ICU plural and select forms say the same when each form says what the English's does; a language with fewer plural forms may merge them, or repeat one. Markdown, such as bold and links, is not meaning.

Answer every item by its n, the reason first, then the verdict. The reason: one or two short sentences in English saying what differs from the English, if anything, and whether it is one of the serious changes above. The verdict: "reject" for a serious change, "pass" for anything else.

The glossary's Terms, the words the app uses for its domain in each language:

${terms}`;

const SCHEMA = {
  type: "object",
  properties: {
    answers: {
      type: "array",
      items: {
        type: "object",
        // The reason before the verdict: the answer is written in this order.
        properties: {
          n: { type: "integer" },
          reason: { type: "string" },
          verdict: { type: "string", enum: ["pass", "reject"] },
        },
        required: ["n", "reason", "verdict"],
        additionalProperties: false,
      },
    },
  },
  required: ["answers"],
  additionalProperties: false,
};

/** The glossary's Terms: its section of that name, to the next of its level. */
function glossaryTerms() {
  const text = existsSync(GLOSSARY) ? readFileSync(GLOSSARY, "utf8") : "";
  const terms = /^## Terms\n[\s\S]*?(?=^## |(?![\s\S]))/m.exec(text)?.[0];
  if (!terms) {
    fail(
      `The meaning check gives the glossary's Terms with each request, and ${shown(GLOSSARY)} has no "## Terms" section.`,
    );
  }
  return terms.trim();
}

/**
 * The meaning check in a language: its answers, asked for and kept in
 * file, or in nothing where file is null, as for the calibration.
 */
function meaningCheck(language, model, key, file) {
  const system = SYSTEM(language, glossaryTerms());
  // An answer kept by an earlier version has no model, version or id, so
  // it is never this one's.
  const keyOf = (entry) =>
    JSON.stringify([
      entry.model ?? null,
      entry.version ?? null,
      entry.id ?? null,
      entry.english,
      entry.text,
    ]);
  const ours = (id, english, text) =>
    keyOf({ model, version: VERSION, id, english, text });
  const kept =
    file && existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
  const answers = new Map(kept.map((entry) => [keyOf(entry), entry]));
  const earlier = new Set(answers.keys());
  const used = new Set();
  const asked = new Set();
  const spent = { requests: 0, input: 0, output: 0 };

  const tokens = () =>
    `${spent.input.toLocaleString("en")} tokens in, ${spent.output.toLocaleString("en")} out`;
  const stop = (why) =>
    fail(
      `The meaning check stopped: ${why}. It used ${tokens()}. ` +
        (file
          ? `The answers so far are kept in ${shown(file)}; run the same command again, and it asks only the rest.`
          : "Nothing was kept; run the same command again."),
    );
  const save = () => {
    if (!file) return;
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify([...answers.values()], null, 2)}\n`);
  };

  /** One request: up to BATCH texts, each with its id and English. */
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
          system,
          messages: [
            {
              role: "user",
              content: JSON.stringify({
                items: batch.map(({ id, english, text }, i) => ({
                  n: i + 1,
                  id,
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
      if (item && ["pass", "reject"].includes(answer.verdict)) {
        answers.set(ours(item.id, item.english, item.text), {
          model,
          version: VERSION,
          id: item.id,
          english: item.english,
          text: item.text,
          reason: String(answer.reason ?? ""),
          verdict: answer.verdict,
        });
      }
    }
    save();
  }

  return {
    /** The answer about a text, by this model and version; none if not asked yet. */
    answer(id, english, text) {
      const key = ours(id, english, text);
      const found = answers.get(key);
      if (found) used.add(key);
      return found;
    },
    /**
     * Asks about each text, its id, English and text, BATCH a request,
     * saying on stderr how far it has gone; stops if none is answered.
     */
    async ask(items) {
      const before = answers.size;
      for (const item of items)
        asked.add(ours(item.id, item.english, item.text));
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
    spent,
    summary: () =>
      `${asked.size} texts asked in ${spent.requests} requests, ` +
      `${[...used].filter((key) => earlier.has(key)).length} answered by an earlier run; ${tokens()}`,
  };
}

// ----------------------------------------------------------- calibration

/**
 * ChatGPT's rewrites the calibration names, read from round 2's workbooks
 * by their ids, each its language, id, English and correction; refused,
 * naming what is missing, before anything is asked.
 */
function rewritesOf(sources) {
  const again =
    "Keep round 2's workbooks in review/ as ChatGPT returned them, then run --calibrate again.";
  return sources.flatMap(({ file, ids }) => {
    if (!existsSync(path.join(ROOT, file))) {
      fail(
        `--calibrate reads ${ids.length} of ChatGPT's rewrites from ${file}, which is not there. ${again}`,
      );
    }
    const { language, rows } = reviewOf(path.join(ROOT, file), "ChatGPT");
    return ids.map((id) => {
      const [row, ...more] = rows.filter((candidate) => candidate.id === id);
      const rewrite = row?.correction.trim();
      if (!rewrite || more.length > 0 || rewrite === row.translation.trim()) {
        fail(
          `--calibrate reads ChatGPT's rewrite of ${id} from ${file}, which has no one row of it with a correction. ${again}`,
        );
      }
      return { language, id, english: row.english, rewrite };
    });
  });
}

/** "a", "a and b", "a, b and c". */
const listed = (parts) =>
  parts.length > 1
    ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`
    : (parts[0] ?? "");

/**
 * Asks the meaning check about each text with its error planted and
 * unchanged, and about each of ChatGPT's rewrites, a language at a time,
 * and prints each caught or missed and passed or flagged. True where it
 * caught enough and flagged few enough of each set to pass.
 */
async function calibrate(model, key) {
  const { planted: items, rewrites: sources } = JSON.parse(
    readFileSync(CALIBRATION, "utf8"),
  );
  const rewrites = rewritesOf(sources);
  const languages = [...new Set(items.map((item) => item.language))];
  const spent = { requests: 0, input: 0, output: 0 };
  const plantedLines = [];
  const unchangedLines = [];
  const rewriteLines = [];
  let caught = 0;
  let flagged = 0;
  let rewritesFlagged = 0;
  const said = (answer) => answer.reason.trim() || "It gave no reason.";
  for (const language of languages) {
    const ours = items.filter((item) => item.language === language);
    const theirs = rewrites.filter((item) => item.language === language);
    const check = meaningCheck(language, model, key, null);
    // Two requests, each the texts planted and unchanged by turns and half
    // the rewrites, as a run mixes texts to catch with texts to pass, and
    // never one message twice, so no answer comes from comparing the two.
    for (const half of [0, 1]) {
      await check.ask([
        ...ours.map((item, at) => ({
          id: item.id,
          english: item.english,
          text: at % 2 === half ? item.planted : item.translation,
        })),
        ...theirs
          .filter((_, at) => at % 2 === half)
          .map(({ id, english, rewrite }) => ({ id, english, text: rewrite })),
      ]);
    }
    for (const name of Object.keys(spent)) spent[name] += check.spent[name];
    for (const { id, error, english, translation, planted } of ours) {
      const answer = check.answer(id, english, planted);
      const where = `${language} ${id}, ${error}`;
      if (answer?.verdict === "reject") {
        caught += 1;
        plantedLines.push(`- Caught: ${where}. ${said(answer)}`);
      } else {
        plantedLines.push(
          `- Missed: ${where}. ${answer ? `It passed it: ${said(answer)}` : "It gave no answer."} ` +
            `${JSON.stringify(planted)} for ${JSON.stringify(english)}.`,
        );
      }
      // Unanswered counts as flagged: only a text it passes passes.
      const plain = check.answer(id, english, translation);
      if (plain?.verdict === "pass") {
        unchangedLines.push(`- Passed: ${language} ${id}, unchanged.`);
      } else {
        flagged += 1;
        unchangedLines.push(
          `- Flagged: ${language} ${id}, unchanged. ` +
            `${plain ? said(plain) : "It gave no answer, which counts as flagged."} ` +
            `${JSON.stringify(translation)} for ${JSON.stringify(english)}.`,
        );
      }
    }
    for (const { id, english, rewrite } of theirs) {
      const answer = check.answer(id, english, rewrite);
      if (answer?.verdict === "pass") {
        rewriteLines.push(`- Passed: ${language} ${id}, ChatGPT's rewrite.`);
      } else {
        rewritesFlagged += 1;
        rewriteLines.push(
          `- Flagged: ${language} ${id}, ChatGPT's rewrite. ` +
            `${answer ? said(answer) : "It gave no answer, which counts as flagged."} ` +
            `${JSON.stringify(rewrite)} for ${JSON.stringify(english)}.`,
        );
      }
    }
  }
  const short = listed([
    ...(caught < CALIBRATION_CAUGHT
      ? [`fewer than ${CALIBRATION_CAUGHT} caught`]
      : []),
    ...(flagged > CALIBRATION_FLAGGED
      ? [`more than ${CALIBRATION_FLAGGED} unchanged texts flagged`]
      : []),
    ...(rewritesFlagged > CALIBRATION_FLAGGED
      ? [`more than ${CALIBRATION_FLAGGED} rewrites flagged`]
      : []),
  ]);
  console.log(
    [
      `The meaning check's calibration, on ${model}: ${items.length} texts from the catalogues, each asked about with one error planted and unchanged, ` +
        `and ${rewrites.length} of ChatGPT's rewrites, each correct.`,
      "With one error planted, to be caught:",
      ...plantedLines,
      "Unchanged, to be passed:",
      ...unchangedLines,
      "ChatGPT's rewrites, to be passed:",
      ...rewriteLines,
      `Caught ${caught} of ${items.length} planted errors; flagged ${flagged} of ${items.length} unchanged texts ` +
        `and ${rewritesFlagged} of ${rewrites.length} rewrites; in ${spent.requests} requests, ` +
        `${spent.input.toLocaleString("en")} tokens in, ${spent.output.toLocaleString("en")} out.`,
      short
        ? `${short[0].toUpperCase()}${short.slice(1)}: the meaning check is not to be trusted with the decide step yet. ` +
          "Stop here, and paste this output into the chat."
        : `At least ${CALIBRATION_CAUGHT} caught, and at most ${CALIBRATION_FLAGGED} unchanged texts and ${CALIBRATION_FLAGGED} rewrites flagged: ` +
          "the meaning check can be trusted with the decide step. Go on.",
    ].join("\n"),
  );
  return !short;
}

// ------------------------------------------------------------------- main

/** The options, each at most once, in any order; null for anything else. */
function optionsOf(args) {
  const options = {};
  for (let at = 0; at < args.length; at += 1) {
    const flag = { "--meaning": "meaning", "--calibrate": "calibrate" }[
      args[at]
    ];
    if (flag && !options[flag]) {
      options[flag] = true;
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
  if (options.calibrate) {
    return Object.keys(options).every((name) =>
      ["calibrate", "model"].includes(name),
    )
      ? options
      : null;
  }
  return options.chatgpt && options.out ? options : null;
}

const options = optionsOf(process.argv.slice(2));
if (!options) fail(USAGE);

const key = process.env.ANTHROPIC_API_KEY;
if ((options.meaning || options.calibrate) && !key) {
  fail(
    `${options.calibrate ? "--calibrate" : "--meaning"} needs the API key in this terminal: ` +
      "run `read -s ANTHROPIC_API_KEY && export ANTHROPIC_API_KEY`, " +
      "paste the key and press Return, then this command again.",
  );
}

/** The decide step itself, on the reviews' workbooks the options name. */
async function decide(options, key) {
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
    options.meaning &&
    meaningCheck(
      language,
      options.model ?? MODEL,
      key,
      path.join(ROOT, "review", `${language}.meaning.json`),
    );
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
    results.filter((result) => result.fallbacks?.some((f) => f.by === by))
      .length;
  const onlyClaude = results.filter((result) => result.onlyClaude);
  const foundWrong = (by) =>
    onlyClaude.filter((result) => result.wrong === by).length;
  console.log(
    [
      `${shown(out)}: ${results.length} rows, ${language}.`,
      `- Agreed ${count("agreed")}, ChatGPT ${count("ChatGPT")}, Claude ${count("Claude")}, today's ${count("today")}, set aside ${count("set aside")}.`,
      `- Fallen back: ${fellBack("rule")} by rule, ${fellBack("meaning")} by meaning.`,
      ...(claude
        ? [
            `- Only Claude changed it: ${onlyClaude.length}; today's found wrong in ${foundWrong("rule")} by rule` +
              (meaning ? ` and ${foundWrong("meaning")} by meaning.` : "."),
          ]
        : []),
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
}

if (options.calibrate) {
  process.exitCode = (await calibrate(options.model ?? MODEL, key)) ? 0 : 1;
} else {
  await decide(options, key);
}
