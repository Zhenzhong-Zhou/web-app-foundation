/**
 * Tests for i18n-decide.mjs, on Node's own runner: scripts/ sits outside
 * both packages, so neither one's Vitest would find them.
 *
 *     node --test scripts/
 *
 * Each test copies the decide step, with the review's script and the
 * rules check it reads, into a temporary folder laid out as the
 * repository is: a small glossary, a catalogue in each package and a
 * guide, in English and Chinese. It writes the reviews' workbooks there
 * and runs the step on them, with fetch replaced by a stub loaded before
 * it, which answers the meaning check and logs each request: no test
 * reaches the API or reads a real key. Both packages' node_modules are
 * linked in for their FormatJS, as for i18n-review.test.mjs.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { folder, write } from "./git-fixture.mjs";
import { readWorkbook, workbook } from "./i18n-review.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const KEY = "sk-test-not-a-real-key";

const GLOSSARY = `# Glossary

## Words not to use

| Language | Not | Instead | Where |
| --- | --- | --- | --- |
| 简体中文 | 再订货点 | 库存下限 | Everywhere |
`;

/** Each message: its English and today's Chinese, by package. */
const SCREENS = {
  "orders.save": ["Save", "保存"],
  "orders.delete": ["Delete the order", "删除订单"],
  "orders.stock": ["Stock", "存货"],
  "orders.list": ["Today's orders", "今天的订单"],
  "orders.saved": ["Saved, {name}", "已保存,{name}"],
  "orders.help": ["Help", "帮助"],
};
const SERVER = { "mail.subject": ["Invoice {number}", "发票 {number}"] };

/** Help on Home: its opening and one section, as the workbook's rows hold them. */
const HOME = {
  home: ["# Home\n\nThe first page.", "# 首页\n\n第一个页面。"],
  "home#today": [
    "## Every day {#today}\n\nSee [Orders](/orders).",
    "## 每天 {#today}\n\n查看[订单](/orders)。",
  ],
};

const catalogue = (messages, at) =>
  `${JSON.stringify(
    Object.fromEntries(
      Object.entries(messages).map(([id, texts]) => [id, texts[at]]),
    ),
    null,
    2,
  )}\n`;

const guide = (at) =>
  `${Object.values(HOME)
    .map((texts) => texts[at])
    .join("\n\n")}\n`;

/**
 * Logs each request to requests.jsonl beside it, and answers each text
 * the same, but those listed in not-same.json, leaving out those listed in
 * unanswered.json; the request fail-at.json numbers, if any, is refused as
 * the API refuses one when it is busy.
 */
const STUB = `import { appendFileSync, existsSync, readFileSync } from "node:fs";
const here = new URL(".", import.meta.url);
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  appendFileSync(new URL("requests.jsonl", here), JSON.stringify({ url, headers: init.headers, body }) + "\\n");
  const sent = readFileSync(new URL("requests.jsonl", here), "utf8").trim().split("\\n").length;
  if (existsSync(new URL("fail-at.json", here)) && sent === JSON.parse(readFileSync(new URL("fail-at.json", here), "utf8"))) {
    return new Response(
      JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }),
      { status: 529, headers: { "content-type": "application/json" } },
    );
  }
  const notSame = existsSync(new URL("not-same.json", here))
    ? JSON.parse(readFileSync(new URL("not-same.json", here), "utf8"))
    : [];
  const unanswered = existsSync(new URL("unanswered.json", here))
    ? JSON.parse(readFileSync(new URL("unanswered.json", here), "utf8"))
    : [];
  const { items } = JSON.parse(body.messages[0].content);
  const answers = items.filter(({ translation }) => !unanswered.includes(translation)).map(({ n, translation }) =>
    notSame.includes(translation)
      ? { n, same: false, why: "It drops the order." }
      : { n, same: true, why: "" },
  );
  return new Response(
    JSON.stringify({
      type: "message",
      stop_reason: "end_turn",
      content: [{ type: "thinking", thinking: "" }, { type: "text", text: JSON.stringify({ answers }) }],
      usage: { input_tokens: 1000, output_tokens: 200 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
};
`;

/** A temporary repository: the three scripts, the glossary, the catalogues and the guide. */
function fixture(t, extra = {}) {
  const root = folder(t, "i18n-decide");
  mkdirSync(path.join(root, "scripts"));
  for (const script of [
    "i18n-decide.mjs",
    "i18n-decide.calibration.json",
    "i18n-review.mjs",
    "i18n-rules.mjs",
  ]) {
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
  const screens = { ...SCREENS, ...extra };
  write(root, "docs/glossary.md", GLOSSARY);
  write(root, "client/src/locales/en.json", catalogue(screens, 0));
  write(root, "client/src/locales/zh-Hans.json", catalogue(screens, 1));
  write(root, "server/src/i18n/en.json", catalogue(SERVER, 0));
  write(root, "server/src/i18n/zh-Hans.json", catalogue(SERVER, 1));
  write(root, "client/src/help/guides/en/home.md", guide(0));
  write(root, "client/src/help/guides/zh-Hans/home.md", guide(1));
  write(root, "stub-fetch.mjs", STUB);
  mkdirSync(path.join(root, "review"));
  return { root, screens };
}

const HEADER = [
  "Area",
  "Id",
  "Where",
  "English",
  "Translation",
  "Correction",
  "Note",
  "Placeholders to keep",
  "Why",
];

/**
 * A review's workbook as it comes back: a row per message and section,
 * as export wrote them from the fixture, each Correction from corrections
 * by id, and Why, a column the reviews added, filled in.
 */
function review(root, file, screens, corrections) {
  const rows = [
    ...Object.entries(screens).map(([id, texts]) => ["Screens", id, texts]),
    ...Object.entries(SERVER).map(([id, texts]) => ["Server", id, texts]),
    ...Object.entries(HOME).map(([id, texts]) => ["Guides", id, texts]),
  ].map(([area, id, [english, translation]]) => [
    area,
    id,
    "",
    english,
    translation,
    corrections[id] ?? "",
    "",
    "",
    corrections[id] ? "Not read." : "",
  ]);
  writeFileSync(
    path.join(root, file),
    workbook(
      "zh-Hans",
      HEADER.map((title) => ({ title, width: 30 })),
      [HEADER, ...rows],
    ),
  );
}

/** The decide step, run from the fixture's root as a person runs it, fetch stubbed. */
function decide(root, args, env = {}) {
  const { ANTHROPIC_API_KEY, ...rest } = process.env;
  return spawnSync(
    process.execPath,
    [
      "--import",
      pathToFileURL(path.join(root, "stub-fetch.mjs")).href,
      "scripts/i18n-decide.mjs",
      ...args,
    ],
    { cwd: root, encoding: "utf8", env: { ...rest, ...env } },
  );
}

/** The decided workbook's rows, by id: its Correction, Reason and Fallback. */
function decided(root, file = "review/zh-Hans.decided.xlsx") {
  const { sheetName, rows } = readWorkbook(readFileSync(path.join(root, file)));
  assert.equal(sheetName, "zh-Hans");
  const [header, ...body] = rows;
  assert.deepEqual(header, [
    "Area",
    "Id",
    "Where",
    "English",
    "Translation",
    "Correction",
    "Placeholders to keep",
    "Reason",
    "Fallback",
  ]);
  return Object.fromEntries(
    body.map((row) => [
      row[1],
      { correction: row[5], reason: row[7], fallback: row[8] },
    ]),
  );
}

/** The requests the stub was sent, in order. */
const requests = (root) =>
  existsSync(path.join(root, "requests.jsonl"))
    ? readFileSync(path.join(root, "requests.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
    : [];

const ROUND_2 = [
  "--chatgpt",
  "review/zh-Hans.chatgpt.xlsx",
  "--claude",
  "review/zh-Hans.claude.xlsx",
  "--out",
  "review/zh-Hans.decided.xlsx",
];

/** Round 2's two reviews, one message for each row of the amendment's table. */
function round2(root, screens = SCREENS, extra = {}) {
  review(root, "review/zh-Hans.chatgpt.xlsx", screens, {
    "orders.save": "保存更改",
    "orders.delete": "删除此订单",
    "orders.stock": "库存",
    ...extra.chatgpt,
  });
  review(root, "review/zh-Hans.claude.xlsx", screens, {
    "orders.save": "保存更改",
    "orders.delete": "删掉订单",
    "orders.list": "订单列表",
    "orders.saved": "已保存，{name}",
    ...extra.claude,
  });
}

test("each message is decided by the amendment's table, ChatGPT leading", (t) => {
  const { root } = fixture(t);
  round2(root);

  const run = decide(root, ROUND_2);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(
    run.stdout,
    `review/zh-Hans.decided.xlsx: 9 rows, zh-Hans.
- Agreed 1, ChatGPT 2, Claude 1, today's 5, set aside 0.
- Fallen back: 0 by rule, 0 by meaning.
- Only Claude changed it: 2; today's found wrong in 1 by rule.
- The meaning check: not run; --meaning runs it.
`,
  );

  assert.deepEqual(decided(root), {
    "orders.save": {
      correction: "保存更改",
      reason: "Both reviews made the same fix",
      fallback: "",
    },
    "orders.delete": {
      correction: "删除此订单",
      reason: "Both changed it, differently; ChatGPT's leads",
      fallback: "",
    },
    "orders.stock": {
      correction: "库存",
      reason: "Only ChatGPT changed it",
      fallback: "",
    },
    "orders.list": {
      correction: "",
      reason:
        "Only Claude changed it; today's passes the rules check, so it stays",
      fallback: "",
    },
    "orders.saved": {
      correction: "已保存，{name}",
      reason:
        "Only Claude changed it; today's fails the rules check: half-width , beside Chinese, for ，",
      fallback: "",
    },
    "orders.help": {
      correction: "",
      reason: "Neither review changed it",
      fallback: "",
    },
    "mail.subject": {
      correction: "",
      reason: "Neither review changed it",
      fallback: "",
    },
    home: { correction: "", reason: "Neither review changed it", fallback: "" },
    "home#today": {
      correction: "",
      reason: "Neither review changed it",
      fallback: "",
    },
  });
});

test("with no --claude, a message ChatGPT kept stays today's", (t) => {
  const { root } = fixture(t);
  round2(root);

  const run = decide(root, [
    "--chatgpt",
    "review/zh-Hans.chatgpt.xlsx",
    "--out",
    "review/zh-Hans.decided.xlsx",
  ]);
  assert.equal(run.status, 0, run.stderr);
  assert.match(
    run.stdout,
    /- Agreed 0, ChatGPT 3, Claude 0, today's 6, set aside 0\./,
  );
  const rows = decided(root);
  assert.deepEqual(rows["orders.save"], {
    correction: "保存更改",
    reason: "ChatGPT changed it",
    fallback: "",
  });
  assert.deepEqual(rows["orders.saved"], {
    correction: "",
    reason: "ChatGPT kept it",
    fallback: "",
  });
});

test("a message changed since the export is set aside, its Correction cleared", (t) => {
  const { root } = fixture(t);
  round2(root);

  // After the export: orders.stock's English reworded, orders.delete's
  // translation corrected by hand, orders.save removed, and orders.list's
  // English changed only in an apostrophe.
  const { "orders.save": removed, ...rest } = SCREENS;
  const today = {
    ...rest,
    "orders.stock": ["Stock on hand", "存货"],
    "orders.delete": ["Delete the order", "删除该订单"],
    "orders.list": ["Today’s orders", "今天的订单"],
  };
  write(root, "client/src/locales/en.json", catalogue(today, 0));
  write(root, "client/src/locales/zh-Hans.json", catalogue(today, 1));

  const run = decide(root, ROUND_2);
  assert.equal(run.status, 0, run.stderr);
  assert.match(
    run.stdout,
    /- Agreed 0, ChatGPT 0, Claude 1, today's 5, set aside 3\./,
  );
  const rows = decided(root);
  assert.deepEqual(
    ["orders.save", "orders.delete", "orders.stock"].map((id) => [
      id,
      rows[id].correction,
      rows[id].reason,
    ]),
    [
      [
        "orders.save",
        "",
        "Set aside: not in Screens today, so there is nothing to correct",
      ],
      [
        "orders.delete",
        "",
        "Set aside: its translation changed since the export; the next round reads it at its new text",
      ],
      [
        "orders.stock",
        "",
        "Set aside: its English changed since the export; the next round reads it at its new text",
      ],
    ],
  );
  assert.equal(
    rows["orders.list"].reason,
    "Only Claude changed it; today's passes the rules check, so it stays",
  );
});

test("a text that fails the rules check falls back to the other review's, else to today's", (t) => {
  const { root } = fixture(t);
  round2(root, SCREENS, {
    chatgpt: {
      // A half-width comma beside Chinese; Claude's passes.
      "orders.delete": "删除订单,好吗",
      // A placeholder lost, which import would refuse.
      "orders.saved": "已保存",
      // The glossary's word not to use.
      "orders.stock": "再订货点",
      // A guide's section that loses its link.
      "home#today": "## 每天 {#today}\n\n查看订单。",
    },
  });

  const run = decide(root, ROUND_2);
  assert.equal(run.status, 0, run.stderr);
  assert.match(
    run.stdout,
    /- Agreed 1, ChatGPT 0, Claude 2, today's 6, set aside 0\.\n- Fallen back: 4 by rule, 0 by meaning\./,
  );
  const rows = decided(root);
  assert.deepEqual(rows["orders.delete"], {
    correction: "删掉订单",
    reason: "Both changed it, differently; ChatGPT's leads",
    fallback:
      "ChatGPT's fails the rules check: half-width , beside Chinese, for ，. Claude's goes in.",
  });
  assert.deepEqual(rows["orders.saved"], {
    correction: "已保存，{name}",
    reason: "Both changed it, differently; ChatGPT's leads",
    fallback:
      "ChatGPT's fails the rules check: keeps no placeholders; the English has {name}. Claude's goes in.",
  });
  assert.deepEqual(rows["orders.stock"], {
    correction: "",
    reason: "Only ChatGPT changed it",
    fallback:
      "ChatGPT's fails the rules check: 再订货点, for 库存下限 (Words not to use). Today's stays.",
  });
  assert.deepEqual(rows["home#today"], {
    correction: "",
    reason: "Only ChatGPT changed it",
    fallback:
      "ChatGPT's fails the rules check: links to nothing; the English links to /orders. Today's stays.",
  });
});

test("--meaning asks about each text that differs from today's, and today's where only Claude changed it, 25 a request, and falls back on a changed meaning", (t) => {
  // 30 more messages ChatGPT changed, so the texts take two requests.
  const more = Object.fromEntries(
    Array.from({ length: 30 }, (_, i) => [
      `orders.line${i + 1}`,
      [`Line ${i + 1}`, `第 ${i + 1} 行`],
    ]),
  );
  const { root, screens } = fixture(t, more);
  round2(root, screens, {
    chatgpt: Object.fromEntries(
      Object.keys(more).map((id, i) => [id, `订单第 ${i + 1} 行`]),
    ),
  });
  // ChatGPT's Delete drops what it deletes; Claude's, asked next, does not.
  write(root, "not-same.json", JSON.stringify(["删除此订单"]));

  const run = decide(root, [...ROUND_2, "--meaning"], {
    ANTHROPIC_API_KEY: KEY,
  });
  assert.equal(run.status, 0, run.stderr);
  assert.match(
    run.stdout,
    /- Agreed 1, ChatGPT 31, Claude 2, today's 5, set aside 0\.\n- Fallen back: 0 by rule, 1 by meaning\.\n- Only Claude changed it: 2; today's found wrong in 1 by rule and 0 by meaning\.\n- The meaning check: 36 texts asked in 3 requests, 0 answered by an earlier run; 3,000 tokens in, 600 out\./,
  );
  assert.deepEqual(decided(root)["orders.delete"], {
    correction: "删掉订单",
    reason: "Both changed it, differently; ChatGPT's leads",
    fallback:
      "ChatGPT's fails the meaning check: It drops the order. Claude's goes in.",
  });

  const sent = requests(root);
  assert.deepEqual(
    sent.map(({ body }) => JSON.parse(body.messages[0].content).items.length),
    [25, 10, 1],
  );
  for (const { url, headers, body } of sent) {
    assert.equal(url, "https://api.anthropic.com/v1/messages");
    assert.equal(headers["x-api-key"], KEY);
    assert.equal(headers["anthropic-version"], "2026-10-21");
    assert.equal(body.model, "claude-sonnet-5-5");
    assert.match(body.system, /Simplified Chinese \(zh-Hans\)/);
  }
  // Texts that differ from today's, and today's List, which only Claude
  // changed; not today's Saved, which the rules check found wrong. Claude's
  // Delete in the last.
  const asked = sent.flatMap(({ body }) =>
    JSON.parse(body.messages[0].content).items.map((item) => item.translation),
  );
  assert.equal(asked.includes("保存"), false);
  assert.equal(asked.includes("已保存,{name}"), false);
  assert.deepEqual(asked.slice(0, 5), [
    "保存更改",
    "删除此订单",
    "库存",
    "今天的订单",
    "已保存，{name}",
  ]);
  assert.deepEqual(
    sent[2].body.messages[0].content,
    JSON.stringify({
      items: [{ n: 1, english: "Delete the order", translation: "删掉订单" }],
    }),
  );

  // The key is sent, never printed or written.
  const kept = readFileSync(
    path.join(root, "review/zh-Hans.meaning.json"),
    "utf8",
  );
  const written = JSON.stringify(
    readWorkbook(readFileSync(path.join(root, "review/zh-Hans.decided.xlsx"))),
  );
  for (const text of [run.stdout, run.stderr, kept, written]) {
    assert.equal(text.includes(KEY), false);
  }
  assert.deepEqual(JSON.parse(kept).slice(0, 2), [
    { english: "Save", text: "保存更改", same: true, why: "" },
    {
      english: "Delete the order",
      text: "删除此订单",
      same: false,
      why: "It drops the order.",
    },
  ]);
});

test("where only Claude changed it, --meaning asks about today's too, and today's found wrong takes Claude's where it passes both checks", (t) => {
  const { root } = fixture(t);
  round2(root, SCREENS, { claude: { "orders.help": "帮助中心" } });
  // Today's List and Help change the meaning; so does Claude's Help.
  write(
    root,
    "not-same.json",
    JSON.stringify(["今天的订单", "帮助", "帮助中心"]),
  );

  const run = decide(root, [...ROUND_2, "--meaning"], {
    ANTHROPIC_API_KEY: KEY,
  });
  assert.equal(run.status, 0, run.stderr);
  assert.match(
    run.stdout,
    /- Agreed 1, ChatGPT 2, Claude 2, today's 4, set aside 0\.\n- Fallen back: 0 by rule, 1 by meaning\.\n- Only Claude changed it: 3; today's found wrong in 1 by rule and 2 by meaning\.\n- The meaning check: 8 texts asked in 2 requests,/,
  );
  const rows = decided(root);
  assert.deepEqual(rows["orders.list"], {
    correction: "订单列表",
    reason:
      "Only Claude changed it; today's fails the meaning check: It drops the order.",
    fallback: "",
  });
  assert.deepEqual(rows["orders.help"], {
    correction: "",
    reason:
      "Only Claude changed it; today's fails the meaning check: It drops the order.",
    fallback:
      "Claude's fails the meaning check: It drops the order. Today's stays.",
  });
  // Today's Saved fails the rules check, so only Claude's is asked about.
  assert.deepEqual(rows["orders.saved"], {
    correction: "已保存，{name}",
    reason:
      "Only Claude changed it; today's fails the rules check: half-width , beside Chinese, for ，",
    fallback: "",
  });

  const asked = requests(root).map(({ body }) =>
    JSON.parse(body.messages[0].content).items.map((item) => item.translation),
  );
  assert.deepEqual(asked, [
    ["保存更改", "删除此订单", "库存", "今天的订单", "已保存，{name}", "帮助"],
    ["订单列表", "帮助中心"],
  ]);

  // Today's passing both checks stays, and says so: asked afresh.
  write(root, "not-same.json", "[]");
  rmSync(path.join(root, "review/zh-Hans.meaning.json"));
  const again = decide(root, [...ROUND_2, "--meaning"], {
    ANTHROPIC_API_KEY: KEY,
  });
  assert.equal(again.status, 0, again.stderr);
  assert.deepEqual(decided(root)["orders.list"], {
    correction: "",
    reason: "Only Claude changed it; today's passes both checks, so it stays",
    fallback: "",
  });
});

test("--calibrate asks about each text planted and unchanged, half of each a request, prints both scores, and fails under 18 of 20 caught or over 2 of 20 flagged", (t) => {
  const { root } = fixture(t);
  const items = JSON.parse(
    readFileSync(
      path.join(ROOT, "scripts/i18n-decide.calibration.json"),
      "utf8",
    ),
  );
  // Its texts: 20, ten a language, each with an error planted.
  assert.equal(items.length, 20);
  for (const language of ["zh-Hans", "fr-CA"]) {
    assert.equal(items.filter((item) => item.language === language).length, 10);
  }
  for (const item of items) {
    assert.notEqual(item.planted, item.translation, item.id);
  }
  const planted = items.map((item) => item.planted);
  const unchanged = items.map((item) => item.translation);
  const languageOf = new Map(
    items.flatMap((item) => [
      [item.planted, item.language],
      [item.translation, item.language],
    ]),
  );
  const env = { ANTHROPIC_API_KEY: KEY };
  /** A run where the texts in notSame are flagged and those in unanswered get no answer. */
  const calibrate = (notSame, { args = [], unanswered = [] } = {}) => {
    write(root, "not-same.json", JSON.stringify(notSame));
    write(root, "unanswered.json", JSON.stringify(unanswered));
    return decide(root, ["--calibrate", ...args], env);
  };

  // All planted caught but the first two, and the first two unchanged
  // flagged: it passes, just.
  const passed = calibrate([...planted.slice(2), ...unchanged.slice(0, 2)]);
  assert.equal(passed.status, 0, passed.stderr);
  const lines = passed.stdout.trim().split("\n");
  assert.equal(lines.length, 45);
  assert.deepEqual(lines.slice(0, 2), [
    "The meaning check's calibration, on claude-sonnet-5-5: 20 texts from the catalogues, each asked about with one error planted and unchanged.",
    "With one error planted, to be caught:",
  ]);
  assert.equal(
    lines[2],
    `- Missed: zh-Hans ${items[0].id}, ${items[0].error}. It answered that the text says the same: ` +
      `${JSON.stringify(items[0].planted)} for ${JSON.stringify(items[0].english)}.`,
  );
  assert.equal(
    lines[4],
    `- Caught: zh-Hans ${items[2].id}, ${items[2].error}. It drops the order.`,
  );
  assert.equal(lines[22], "Unchanged, to be passed:");
  assert.equal(
    lines[23],
    `- Flagged: zh-Hans ${items[0].id}, unchanged. It drops the order. ` +
      `${JSON.stringify(items[0].translation)} for ${JSON.stringify(items[0].english)}.`,
  );
  assert.equal(lines[25], `- Passed: zh-Hans ${items[2].id}, unchanged.`);
  assert.deepEqual(lines.slice(-2), [
    "Caught 18 of 20 planted errors, and flagged 2 of 20 unchanged texts, in 4 requests; 4,000 tokens in, 800 out.",
    "At least 18 caught and at most 2 flagged: the meaning check can be trusted with the decide step. Go on.",
  ]);

  // Two requests a language, each with five planted and five unchanged,
  // never one message twice; every text asked about once.
  const sent = requests(root).map(({ body }) => ({
    system: body.system,
    texts: JSON.parse(body.messages[0].content).items,
  }));
  assert.equal(sent.length, 4);
  sent.forEach(({ system, texts }, at) => {
    const language = at < 2 ? "zh-Hans" : "fr-CA";
    assert.match(
      system,
      at < 2
        ? /Simplified Chinese \(zh-Hans\)/
        : /French, as written in Canada \(fr-CA\)/,
    );
    assert.equal(texts.length, 10);
    assert.equal(new Set(texts.map((item) => item.english)).size, 10);
    assert.equal(
      texts.filter((item) => planted.includes(item.translation)).length,
      5,
    );
    for (const item of texts) {
      assert.equal(languageOf.get(item.translation), language);
    }
  });
  assert.deepEqual(
    sent.flatMap(({ texts }) => texts.map((item) => item.translation)).sort(),
    [...planted, ...unchanged].sort(),
  );
  // Nothing kept, and the key never printed.
  assert.deepEqual(readdirSync(path.join(root, "review")), []);
  for (const text of [passed.stdout, passed.stderr]) {
    assert.equal(text.includes(KEY), false);
  }

  const verdict = (run) => run.stdout.trim().split("\n").slice(-2);
  const stop =
    ": the meaning check is not to be trusted with the decide step yet. Stop here, and paste this output into the chat.";

  // All but three caught, none flagged, on the model named: it stops.
  const missed = calibrate(planted.slice(3), {
    args: ["--model", "claude-opus-5-5"],
  });
  assert.equal(missed.status, 1);
  assert.equal(requests(root)[4].body.model, "claude-opus-5-5");
  assert.deepEqual(verdict(missed), [
    "Caught 17 of 20 planted errors, and flagged 0 of 20 unchanged texts, in 4 requests; 4,000 tokens in, 800 out.",
    `Fewer than 18 caught${stop}`,
  ]);

  // All caught, two unchanged flagged and a third unanswered, which counts
  // as flagged: it stops.
  const flagged = calibrate([...planted, ...unchanged.slice(10, 12)], {
    unanswered: [unchanged[19]],
  });
  assert.equal(flagged.status, 1);
  assert.equal(
    flagged.stdout.trim().split("\n")[42],
    `- Flagged: fr-CA ${items[19].id}, unchanged. It gave no answer, which counts as flagged. ` +
      `${JSON.stringify(items[19].translation)} for ${JSON.stringify(items[19].english)}.`,
  );
  assert.deepEqual(verdict(flagged), [
    "Caught 20 of 20 planted errors, and flagged 3 of 20 unchanged texts, in 4 requests; 4,000 tokens in, 800 out.",
    `More than 2 flagged${stop}`,
  ]);

  // Both at once: it says both.
  const both = calibrate([...planted.slice(3), ...unchanged.slice(0, 3)]);
  assert.equal(both.status, 1);
  assert.equal(
    verdict(both)[1],
    `Fewer than 18 caught and more than 2 flagged${stop}`,
  );

  // It runs alone.
  const mixed = decide(root, ["--calibrate", "--meaning"], env);
  assert.equal(mixed.status, 1);
  assert.match(mixed.stderr, /^Usage:/);
});

test("a second run reuses the answers kept, asking only what is new", (t) => {
  const { root } = fixture(t);
  round2(root);
  const env = { ANTHROPIC_API_KEY: KEY };

  assert.equal(decide(root, [...ROUND_2, "--meaning"], env).status, 0);
  assert.equal(requests(root).length, 1);

  const again = decide(root, [...ROUND_2, "--meaning"], env);
  assert.equal(again.status, 0, again.stderr);
  assert.equal(requests(root).length, 1);
  assert.match(
    again.stdout,
    /- The meaning check: 0 texts asked in 0 requests, 5 answered by an earlier run; 0 tokens in, 0 out\./,
  );

  // ChatGPT's Stock changes: only it is asked, on the model named.
  round2(root, SCREENS, { chatgpt: { "orders.stock": "现有库存" } });
  const third = decide(
    root,
    [...ROUND_2, "--meaning", "--model", "claude-opus-5-5"],
    env,
  );
  assert.equal(third.status, 0, third.stderr);
  const sent = requests(root);
  assert.equal(sent.length, 2);
  assert.equal(sent[1].body.model, "claude-opus-5-5");
  assert.deepEqual(
    JSON.parse(sent[1].body.messages[0].content).items.map(
      (item) => item.translation,
    ),
    ["现有库存"],
  );
  assert.match(
    third.stdout,
    /1 texts asked in 1 requests, 4 answered by an earlier run/,
  );
});

test("a meaning check stopped part way keeps what it was answered, and the next run asks only the rest", (t) => {
  const more = Object.fromEntries(
    Array.from({ length: 30 }, (_, i) => [
      `orders.line${i + 1}`,
      [`Line ${i + 1}`, `第 ${i + 1} 行`],
    ]),
  );
  const { root, screens } = fixture(t, more);
  round2(root, screens, {
    chatgpt: Object.fromEntries(
      Object.keys(more).map((id, i) => [id, `订单第 ${i + 1} 行`]),
    ),
  });
  write(root, "fail-at.json", "2");
  const env = { ANTHROPIC_API_KEY: KEY };

  const stopped = decide(root, [...ROUND_2, "--meaning"], env);
  assert.equal(stopped.status, 1);
  assert.match(
    stopped.stderr,
    /The meaning check stopped: the API answered 529, Overloaded\. It used 1,000 tokens in, 200 out\. The answers so far are kept in review\/zh-Hans\.meaning\.json; run the same command again, and it asks only the rest\./,
  );
  assert.equal(
    existsSync(path.join(root, "review/zh-Hans.decided.xlsx")),
    false,
  );
  assert.equal(
    JSON.parse(
      readFileSync(path.join(root, "review/zh-Hans.meaning.json"), "utf8"),
    ).length,
    25,
  );

  const again = decide(root, [...ROUND_2, "--meaning"], env);
  assert.equal(again.status, 0, again.stderr);
  assert.match(
    again.stdout,
    /- The meaning check: 10 texts asked in 1 requests, 25 answered by an earlier run;/,
  );
});

test("--meaning or --calibrate with no key is refused before anything is read, naming how to set it", (t) => {
  const { root } = fixture(t);
  round2(root);

  const run = decide(root, [...ROUND_2, "--meaning"]);
  assert.equal(run.status, 1);
  assert.match(
    run.stderr,
    /^--meaning needs the API key in this terminal: run `read -s ANTHROPIC_API_KEY && export ANTHROPIC_API_KEY`/,
  );
  assert.equal(
    existsSync(path.join(root, "review/zh-Hans.decided.xlsx")),
    false,
  );
  assert.deepEqual(requests(root), []);

  const calibrate = decide(root, ["--calibrate"]);
  assert.equal(calibrate.status, 1);
  assert.match(
    calibrate.stderr,
    /^--calibrate needs the API key in this terminal: run `read -s ANTHROPIC_API_KEY && export ANTHROPIC_API_KEY`/,
  );
  assert.deepEqual(requests(root), []);
});

test("a workbook without a title the step reads is refused, naming it", (t) => {
  const { root } = fixture(t);
  round2(root);
  const file = path.join(root, "review/zh-Hans.claude.xlsx");
  const { sheetName, rows } = readWorkbook(readFileSync(file));
  const at = HEADER.indexOf("Translation");
  const kept = rows.map((row) => row.filter((_, index) => index !== at));
  writeFileSync(
    file,
    workbook(
      sheetName,
      kept[0].map((title) => ({ title, width: 30 })),
      kept,
    ),
  );

  const run = decide(root, ROUND_2);
  assert.equal(run.status, 1);
  assert.match(
    run.stderr,
    /^Claude's workbook, .*zh-Hans\.claude\.xlsx, has no Translation title in its first row\./,
  );
  assert.equal(
    existsSync(path.join(root, "review/zh-Hans.decided.xlsx")),
    false,
  );
});
