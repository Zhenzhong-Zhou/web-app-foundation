#!/usr/bin/env node
// Runs /fix-issue <N> through the Claude Agent SDK, so the API key's
// monthly credit pays for it: the credit covers the Agent SDK, not Claude
// Code (ADR-089's amendment, "small fixes on the API credit, by a runner
// in the repository"). Started from the main working folder; the fix runs
// in a second one, ../waf-fix unless --folder names another, so a build
// can go on here meanwhile.
//
//   read -s ANTHROPIC_API_KEY && export ANTHROPIC_API_KEY
//   (cd scripts/fix-issue && npm ci)                once on each Mac, and after the SDK's raise
//   node scripts/fix-issue/run.mjs --probe          one cheap call: proves the key, the credit and the skill
//   node scripts/fix-issue/run.mjs 514              /fix-issue 514 in ../waf-fix
//   node scripts/fix-issue/run.mjs 514 leave a/b.ts leave and its paths go to /fix-issue as they are
//   node scripts/fix-issue/run.mjs --resume last    finish the last fix, when it ended UNFINISHED or UNKNOWN
//   node scripts/fix-issue/run.mjs --spent          this credit month's runs and their total
//
// Options: --folder <path> (default ../waf-fix beside the main folder),
// --model <name> (default opus), --budget <USD> (default 15, 0.5 for a
// probe).
//
// Guards: it stops before any work unless the session is paid by
// ANTHROPIC_API_KEY (never the plan) and /fix-issue is found; it refuses
// to start from a second working folder, to fix in the main one, a fix or
// a resume in a folder whose test or e2e database another working folder
// names too (the lock's check, scripts/one-at-a-time.mjs), and a new fix
// in a folder with uncommitted changes to tracked files; a hook
// refuses a merge or a force-push anywhere in a Bash command (main's
// protection on GitHub refuses both too); it stops at the budget.
//
// Headless: when the agent's turn ends, the session ends, so nothing may
// run in the background (CLAUDE_CODE_DISABLE_BACKGROUND_TASKS, Bash
// commands up to 90 minutes in the foreground, and a line appended to the
// system prompt). After a fix it reads the folder's git state and says
// UNFINISHED when changes are left uncommitted or no pull request is open
// for the branch, UNKNOWN when GitHub could not be asked, and already
// fixed, with the gh issue close line, when the session ends
// "DONE: already fixed by <commit> in #<PR>" and the folder is detached
// with a clean tree; otherwise it gives the merge command, after the one
// that frees the branch from that folder.
//
// Each run's every message is kept in tmp/fix-runs/logs/, and its line,
// with the SDK's cost, in tmp/fix-runs/runs.tsv, both in the main working
// folder. Before a run it warns once the credit month is past 80 % of
// CREDIT_USD. The key's value is taken out of every line it logs or
// prints. What its test checks is in lib.mjs, which never loads the
// SDK; it is imported here only when a run starts.
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  Stop,
  afterRun,
  checkClean,
  checkInit,
  checkKey,
  checkShared,
  creditWarning,
  fixFolder,
  lastFix,
  logsFolder,
  mainFolder,
  parseArguments,
  payerOf,
  promptFor,
  readRuns,
  recordRun,
  refusedCommand,
  runsFile,
  spentReport,
  tally,
  withoutKey,
} from "./lib.mjs";

/** The credit: US$100 a month, renewed on the 9th, 00:00 UTC. */
const CREDIT_USD = 100;
const CREDIT_DAY = 9;
const credit = { usd: CREDIT_USD, day: CREDIT_DAY };

const HEADLESS =
  "You run headless, through the Agent SDK: when your turn ends, the session ends, and no notification will ever wake you again. " +
  "So run every command in the foreground and wait for it, however long it takes; never start one in the background or plan to pick it up later; " +
  "and finish the whole task, its commit, push and pull request included, before your last message.";

function stop(message) {
  console.error(`run.mjs: ${message}`);
  process.exit(1);
}

function short(text, size = 160) {
  const one = withoutKey(String(text ?? ""), process.env.ANTHROPIC_API_KEY)
    .replace(/\s+/g, " ")
    .trim();
  return one.length > size ? `${one.slice(0, size - 1)}…` : one;
}

function describe(block) {
  const input = block.input ?? {};
  const what =
    input.command ??
    input.file_path ??
    input.pattern ??
    input.description ??
    input.prompt ??
    "";
  return `  [${block.name}] ${short(what, 140)}`;
}

let args;
let main;
let folder;
let runs;
let rows;
let resumed;
try {
  args = parseArguments(process.argv.slice(2));
  main = mainFolder(path.dirname(fileURLToPath(import.meta.url)));
  runs = runsFile(main);
  rows = readRuns(runs);
  if (args.mode === "spent") {
    console.log(spentReport(rows, new Date(), credit, runs).join("\n"));
    process.exit(0);
  }
  checkKey(process.env);
  folder = fixFolder(main, args.folder);
  if (args.mode !== "probe") checkShared(folder, process.env);
  if (args.mode === "fix") checkClean(folder);
  if (args.mode === "resume") resumed = lastFix(rows, runs);
} catch (error) {
  if (error instanceof Stop) stop(error.message);
  throw error;
}

const issue = args.mode === "probe" ? "probe" : (args.issue ?? resumed.issue);
if (resumed) {
  console.log(
    `resuming #${resumed.issue}'s run of ${resumed.time}, which ended ${resumed.pr}, session ${resumed.session}`,
  );
}
const warning = creditWarning(rows, new Date(), credit);
if (warning) console.log(warning);

let query;
try {
  ({ query } = await import("@anthropic-ai/claude-agent-sdk"));
} catch (error) {
  if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
  stop(
    "the Agent SDK is not installed here. First: (cd scripts/fix-issue && npm ci)",
  );
}

const label =
  issue === "probe"
    ? "probe"
    : `issue-${issue}${args.mode === "resume" ? "-resume" : ""}`;
const logs = logsFolder(main);
mkdirSync(logs, { recursive: true });
const logFile = path.join(
  logs,
  `${label}-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`,
);
const prompt = promptFor(args);

const abort = new AbortController();
const options = {
  cwd: folder,
  model: args.model,
  abortController: abort,
  systemPrompt: { type: "preset", preset: "claude_code", append: HEADLESS },
  env: {
    ...process.env,
    CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "1",
    BASH_DEFAULT_TIMEOUT_MS: "5400000",
    BASH_MAX_TIMEOUT_MS: "5400000",
  },
  ...(resumed ? { resume: resumed.session } : {}),
  settingSources: ["project", "local"],
  permissionMode: "dontAsk",
  allowedTools:
    args.mode === "probe"
      ? []
      : [
          "Read",
          "Write",
          "Edit",
          "Glob",
          "Grep",
          "Bash",
          "Agent",
          "Skill",
          "TodoWrite",
          "TaskStop",
          "Monitor",
          "WebFetch",
          "WebSearch",
        ],
  // A merge or a force-push refused wherever it stands in a command, which
  // deny rules, matching a command's start, cannot do.
  hooks: {
    PreToolUse: [
      {
        matcher: "Bash",
        hooks: [
          async (input) => {
            const reason = refusedCommand(input.tool_input?.command);
            return reason
              ? {
                  hookSpecificOutput: {
                    hookEventName: "PreToolUse",
                    permissionDecision: "deny",
                    permissionDecisionReason: reason,
                  },
                }
              : {};
          },
        ],
      },
    ],
  },
  maxBudgetUsd: args.budget,
  maxTurns: args.mode === "probe" ? 2 : 300,
};

// Ctrl-C, or the terminal closed: the session is stopped, and its line
// still written, so --resume last can find it. A second one quits at once.
let interrupted = false;
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    if (interrupted) process.exit(130);
    interrupted = true;
    console.error(
      `\nrun.mjs: ${signal}, so the session stops; again to quit at once.`,
    );
    abort.abort();
  });
}

console.log(`${label}: ${prompt}`);
console.log(
  `folder ${folder} · model ${args.model} · budget US$${args.budget} · log ${logFile}`,
);

const started = new Date();
const results = [];
let session;
let model = args.model;
let stopped = false;
let failure;
try {
  for await (const message of query({ prompt, options })) {
    appendFileSync(
      logFile,
      `${withoutKey(JSON.stringify(message), process.env.ANTHROPIC_API_KEY)}\n`,
    );

    if (message.type === "system" && message.subtype === "init") {
      session = message.session_id;
      model = message.model ?? model;
      console.log(
        `session ${message.session_id}: model ${message.model}, paid by ${payerOf(message.apiKeySource)}, Claude Code ${message.claude_code_version}`,
      );
      const check = checkInit(message, args.mode);
      console.log(
        `/fix-issue ${check.found ? "found" : "NOT found"} among ${message.slash_commands?.length ?? 0} slash commands`,
      );
      if (check.stop) {
        console.error(`run.mjs: ${check.stop}`);
        stopped = true;
        abort.abort();
        break;
      }
    } else if (message.type === "assistant") {
      for (const block of message.message?.content ?? []) {
        if (block.type === "text" && block.text.trim())
          console.log(short(block.text, 400));
        else if (block.type === "tool_use") console.log(describe(block));
      }
    } else if (message.type === "result") {
      results.push(message);
      const minutes = Math.round((message.duration_ms ?? 0) / 60000);
      console.log("\n— result —");
      if (message.result) {
        console.log(withoutKey(message.result, process.env.ANTHROPIC_API_KEY));
      }
      console.log(
        `${message.subtype} · ${message.num_turns} turns · ${minutes} min · about US$${(message.total_cost_usd ?? 0).toFixed(2)} (an estimate; the Console has the real figure)`,
      );
    }
  }
} catch (error) {
  if (!abort.signal.aborted) failure = error?.message ?? String(error);
}
if (stopped) process.exit(1);

const result = tally(results);
const report =
  args.mode === "probe"
    ? undefined
    : afterRun(folder, undefined, {
        named: args.folder !== undefined,
        issue,
        result: results.at(-1)?.result,
      });
if (report) console.log(report.lines.join("\n"));
if (session) {
  recordRun(runs, {
    time: started,
    issue,
    model,
    minutes: (Date.now() - started.getTime()) / 60000,
    turns: result.turns,
    cost: result.cost,
    pr: report ? report.outcome : "-",
    session,
  });
  console.log(`\ncost list: ${runs}`);
}
if (failure) stop(failure);
process.exit(interrupted ? 130 : result.ok && !report?.unfinished ? 0 : 1);
