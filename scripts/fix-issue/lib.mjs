/**
 * The fix runner's parts that its test checks (ADR-089's amendment,
 * "small fixes on the API credit, by a runner in the repository"): the
 * arguments, the folder guards, the cost list and the report after a run.
 * Nothing here imports the Agent SDK, so the scripts' tests and CI need
 * nothing installed in this folder; run.mjs imports it only when a run
 * starts.
 */
import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import path from "node:path";

/** A refusal before any work: run.mjs prints it and exits 1. */
export class Stop extends Error {}

const RUNNER = "node scripts/fix-issue/run.mjs";

const FLAGS = new Set(["--probe", "--spent"]);
const VALUED = new Set(["--resume", "--folder", "--model", "--budget"]);

/**
 * The command line, as a mode and its options: a fix (an issue's number,
 * then `leave` and its paths, passed on to /fix-issue as they stand), or
 * --probe, --resume last or --spent, one at a time.
 */
export function parseArguments(argv) {
  const given = {};
  const words = [];
  for (let at = 0; at < argv.length; at += 1) {
    const word = argv[at];
    if (!word.startsWith("--")) {
      words.push(word);
      continue;
    }
    if (Object.hasOwn(given, word)) throw new Stop(`${word} is given twice`);
    if (FLAGS.has(word)) {
      given[word] = true;
    } else if (VALUED.has(word)) {
      const value = argv[at + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Stop(`${word} needs a value after it`);
      }
      given[word] = value;
      at += 1;
    } else {
      throw new Stop(
        `${word} is not an option; they are --probe, --resume last, --spent, --folder, --model and --budget`,
      );
    }
  }

  // Each mode, as it is named in a refusal, and whether the line gives it.
  const modes = [
    ["probe", "--probe", Object.hasOwn(given, "--probe")],
    ["resume", "--resume", Object.hasOwn(given, "--resume")],
    ["spent", "--spent", Object.hasOwn(given, "--spent")],
    ["fix", "an issue's number", words.length > 0],
  ].filter(([, , chosen]) => chosen);
  if (modes.length === 0) {
    throw new Stop(
      `give an issue's number, as in: ${RUNNER} 514; or --probe, --resume last or --spent`,
    );
  }
  if (modes.length > 1) {
    throw new Stop(
      `one at a time, not ${modes.map(([, name]) => name).join(" with ")}`,
    );
  }

  const [[mode]] = modes;
  if (mode === "spent") {
    const others = ["--folder", "--model", "--budget"].filter((flag) =>
      Object.hasOwn(given, flag),
    );
    if (others.length) {
      throw new Stop(`--spent takes nothing else, not ${others.join(", ")}`);
    }
    return { mode };
  }
  if (mode === "resume" && given["--resume"] !== "last") {
    throw new Stop(`--resume takes last, as in: ${RUNNER} --resume last`);
  }
  if (mode === "fix") {
    const [issue, ...rest] = words;
    if (!/^[1-9]\d*$/.test(issue)) {
      throw new Stop(`${issue} is not an issue's number`);
    }
    if (rest.length && (rest[0] !== "leave" || rest.length < 2)) {
      throw new Stop(
        `after the number, only leave and the paths to leave alone, as in: ${RUNNER} ${issue} leave client/src/a.ts`,
      );
    }
  }

  const budget = Number(given["--budget"] ?? (mode === "probe" ? 0.5 : 15));
  if (!Number.isFinite(budget) || budget <= 0) {
    throw new Stop("--budget must be a positive number of US dollars");
  }
  return {
    mode,
    issue: mode === "fix" ? words[0] : undefined,
    words,
    folder: given["--folder"],
    model: given["--model"] ?? "opus",
    budget,
  };
}

export const PROBE_PROMPT =
  "Use no tools. Reply in one line: the model you run on, and whether the slash command /fix-issue is available to you.";

export const RESUME_PROMPT =
  "The session ended before the task was finished, and anything left running in the background was lost with it. Finish /fix-issue now: check the folder's state, run what is still owed in the foreground (scripts/verify.sh included), then commit, push and open the pull request, and end with the report.";

/** What the session is asked: the words of a fix are passed on as they stand. */
export function promptFor(args) {
  if (args.mode === "probe") return PROBE_PROMPT;
  if (args.mode === "resume") return RESUME_PROMPT;
  return `/fix-issue ${args.words.join(" ")}`;
}

/**
 * A log line with the key's value taken out wherever it stands, so a
 * session that prints its environment leaves no key in tmp/fix-runs/logs/.
 */
export function withoutKey(line, key) {
  return key ? line.split(key).join("[ANTHROPIC_API_KEY]") : line;
}

/** Without the key, the session would be paid by the plan, or not start. */
export function checkKey(env) {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Stop(
      "ANTHROPIC_API_KEY is not set. First: read -s ANTHROPIC_API_KEY && export ANTHROPIC_API_KEY",
    );
  }
}

/** The SDK's own names for what pays a session: its ApiKeySource type. */
const PAYERS = [
  "ANTHROPIC_API_KEY",
  "apiKeyHelper",
  "/login managed key",
  "none",
  "user",
  "project",
  "org",
  "temporary",
  "oauth",
];

/**
 * Names what pays a session from that list, never the value the session
 * handed over: a value the list lacks prints as "another source". The
 * field names a source, not a key, but only a name from the list ever
 * reaches a line the runner prints or logs.
 */
export function payerOf(source) {
  return PAYERS.find((name) => name === source) ?? "another source";
}

/**
 * The session's first message: paid by the key, and /fix-issue loaded in
 * the folder for a fix. Gives what was found, and why it stops, if it does.
 */
export function checkInit(message, mode) {
  const found = (message.slash_commands ?? []).some(
    (name) => name.replace(/^\//, "") === "fix-issue",
  );
  let stop;
  if (message.apiKeySource !== "ANTHROPIC_API_KEY") {
    stop = `this session would be paid by "${payerOf(message.apiKeySource)}", not the API key, so it stops before any work.`;
  } else if (!found && mode === "fix") {
    stop =
      "/fix-issue is not loaded in that folder, so it stops before any work.";
  }
  return { found, stop };
}

const MERGE_REFUSED =
  "the runner never merges a pull request: Bob merges it, from the terminal, once he has read it. End with the report, which gives the merge command.";
const FORCE_REFUSED =
  "the runner never force-pushes: push a new commit on the branch instead.";

/** A git push flag or refspec that forces: --force and its kin, -f alone or among others, or +<ref>. */
const forces = (word) =>
  /^--force(-with-lease|-if-includes)?(=|$)/.test(word) ||
  /^-[a-z]*f[a-z]*$/i.test(word) ||
  word.startsWith("+");

/**
 * Why a Bash command is refused, or null: a pull request merged (gh pr
 * merge, or GitHub's API asked to merge one) or a push that forces,
 * wherever it stands in the command, not only at its start: after a cd,
 * an &&, a pipe or in a subshell, with options before git's or gh's
 * subcommand, a flag after the branch, or a +refspec. Quotes are read
 * through, so `gh pr merge` quoted in another command is refused too, the
 * safe side. The run's PreToolUse hook gives the reason to the session.
 * main's protection on GitHub still refuses both, whatever gets past this.
 */
export function refusedCommand(command) {
  const text = String(command ?? "");
  if (/mergePullRequest|\/pulls\/[^/\s]+\/merge\b/.test(text)) {
    return MERGE_REFUSED;
  }
  for (const part of text.split(/&&|\|\||[;&|\n()`]/)) {
    const words = part
      .trim()
      .split(/\s+/)
      .map((word) => word.replace(/^['"]+|['"]+$/g, ""));
    for (let at = 0; at < words.length; at += 1) {
      if (words[at] === "gh") {
        const pr = words.indexOf("pr", at + 1);
        if (pr !== -1 && words[pr + 1] === "merge") return MERGE_REFUSED;
      }
      if (words[at] === "git") {
        // git's own options first, -C and -c with a value each.
        let next = at + 1;
        while (words[next]?.startsWith("-")) {
          next += /^-[Cc]$/.test(words[next]) ? 2 : 1;
        }
        if (words[next] === "push" && words.slice(next + 1).some(forces)) {
          return FORCE_REFUSED;
        }
      }
    }
  }
  return null;
}

/** A command's output in a folder, its last newline dropped; a failure throws. */
function output(cwd, command, args) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).replace(/\n$/, "");
}

const git = (cwd, ...args) => output(cwd, "git", args);

/**
 * The main working folder, the parent of the folder git shares, found
 * from the one the runner sits in. Refused from a second working folder,
 * whose own git folder is not the shared one.
 */
export function mainFolder(from) {
  let top;
  let gitDir;
  let common;
  try {
    [top, gitDir, common] = git(
      from,
      "rev-parse",
      "--path-format=absolute",
      "--show-toplevel",
      "--git-dir",
      "--git-common-dir",
    ).split("\n");
  } catch {
    throw new Stop(`${from} is not in a git repository`);
  }
  const main = path.dirname(realpathSync(common));
  if (realpathSync(gitDir) !== realpathSync(common)) {
    throw new Stop(
      `${top} is a second working folder; run it from the main working folder: cd ${main} && ${RUNNER} …`,
    );
  }
  return main;
}

/**
 * The folder the fix runs in: ../waf-fix beside the main folder, or the
 * one --folder names, from the folder the runner was started in. Refused
 * when it is the main folder, where a build runs, or not a working folder
 * of this repository; when missing, the refusal gives the commands that
 * make it.
 */
export function fixFolder(main, given, cwd = process.cwd()) {
  const folder =
    given === undefined
      ? path.join(path.dirname(main), "waf-fix")
      : path.resolve(cwd, given);
  if (!existsSync(folder)) {
    const there = path.relative(main, folder);
    throw new Stop(
      [
        `no folder at ${folder}. Make it, from the main working folder:`,
        `  git worktree add --detach ${there} origin/main`,
        `  (cd ${there}/server && npm ci) && (cd ${there}/client && npm ci)`,
      ].join("\n"),
    );
  }
  let top;
  let common;
  try {
    [top, common] = git(
      folder,
      "rev-parse",
      "--path-format=absolute",
      "--show-toplevel",
      "--git-common-dir",
    ).split("\n");
  } catch {
    throw new Stop(`${folder} is not a working folder of this repository`);
  }
  if (path.dirname(realpathSync(common)) !== main) {
    throw new Stop(`${folder} is not a working folder of this repository`);
  }
  if (realpathSync(top) === main) {
    throw new Stop(
      `${folder} is in the main working folder, where a build runs; a fix runs in a second one, ../waf-fix unless --folder names another`,
    );
  }
  if (realpathSync(top) !== realpathSync(folder)) {
    throw new Stop(`${folder} is inside a working folder; give it, ${top}`);
  }
  return realpathSync(top);
}

/** A new fix starts from a folder with no uncommitted changes to tracked files. */
export function checkClean(folder) {
  const changes = git(folder, "status", "--porcelain", "--untracked-files=no");
  if (changes) {
    throw new Stop(
      `${folder} has uncommitted changes, which a new fix would start on:\n${changes}\nCommit or discard them there, or finish the last fix: ${RUNNER} --resume last`,
    );
  }
}

/** The cost list's columns, the header row of a new list. */
export const RUNS_HEADER = [
  "time",
  "issue",
  "model",
  "minutes",
  "turns",
  "cost_usd",
  "pull_request",
  "session",
];

/** The cost list and the logs, in the main working folder's tmp/, which git ignores. */
export const runsFile = (main) =>
  path.join(main, "tmp", "fix-runs", "runs.tsv");
export const logsFolder = (main) => path.join(main, "tmp", "fix-runs", "logs");

/** A time in Vancouver, to the minute, with its offset: 2026-11-08T19:20-07:00. */
export function vancouverTime(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Vancouver",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  const wall = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
  );
  const offset = Math.round(
    (wall - Math.floor(date.getTime() / 60000) * 60000) / 60000,
  );
  const sign = offset < 0 ? "-" : "+";
  const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
  const minutes = String(Math.abs(offset) % 60).padStart(2, "0");
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}${sign}${hours}:${minutes}`;
}

/** One run's line: its start in Vancouver, minutes rounded, the cost to the cent. */
export function runLine(run) {
  return [
    vancouverTime(run.time),
    run.issue,
    run.model,
    String(Math.round(run.minutes)),
    run.turns === undefined ? "" : String(run.turns),
    run.cost === undefined ? "" : run.cost.toFixed(2),
    run.pr,
    run.session,
  ].join("\t");
}

/** Appends a run's line, after the header row when the list is new. */
export function recordRun(file, run) {
  mkdirSync(path.dirname(file), { recursive: true });
  const header =
    existsSync(file) && statSync(file).size > 0
      ? ""
      : `${RUNS_HEADER.join("\t")}\n`;
  appendFileSync(file, `${header}${runLine(run)}\n`);
}

/** The list's lines, the header row left out; none when there is no list. */
export function readRuns(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim() && !line.startsWith(`${RUNS_HEADER[0]}\t`))
    .map((line) => {
      const [time, issue, model, minutes, turns, cost, pr, session] =
        line.split("\t");
      return {
        time,
        at: new Date(time),
        issue,
        model,
        minutes: Number(minutes),
        turns: turns ? Number(turns) : undefined,
        cost: cost ? Number(cost) : undefined,
        pr,
        session,
      };
    });
}

/**
 * The last fix in the list, a probe passed over: what --resume last
 * finishes, when it ended UNFINISHED or UNKNOWN. Refused when it opened
 * its pull request, since a resume would pay to finish it again.
 */
export function lastFix(rows, file) {
  const row = rows.findLast((one) => one.issue !== "probe");
  if (!row) throw new Stop(`no earlier fix in ${file} to resume`);
  if (row.pr !== "UNFINISHED" && row.pr !== "UNKNOWN") {
    throw new Stop(
      `the last fix, #${row.issue} of ${row.time}, ended with its pull request, ${row.pr}, so there is nothing to finish`,
    );
  }
  return row;
}

/** The credit month holding a moment: from the credit's day, 00:00 UTC, to the next month's. */
export function creditMonth(now, day) {
  const month =
    now.getUTCDate() >= day ? now.getUTCMonth() : now.getUTCMonth() - 1;
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), month, day)),
    end: new Date(Date.UTC(now.getUTCFullYear(), month + 1, day)),
  };
}

/** The month's lines and their total; a line without a cost counts nothing. */
export function spent(rows, now, credit) {
  const { start, end } = creditMonth(now, credit.day);
  const inMonth = rows.filter((row) => row.at >= start && row.at < end);
  const total = inMonth.reduce((sum, row) => sum + (row.cost ?? 0), 0);
  return { start, end, rows: inMonth, total };
}

const dollars = (amount) => `US$${amount.toFixed(2)}`;
const day = (date) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);

/** What --spent prints: the month's lines, then their total against the credit. */
export function spentReport(rows, now, credit, file) {
  const month = spent(rows, now, credit);
  const lines = [];
  if (!rows.length)
    lines.push(`No runs yet: ${file} is written by the first one.`);
  lines.push(
    `Credit month ${day(month.start)} to ${day(month.end)}, 00:00 UTC: ${dollars(month.total)} of US$${credit.usd}, ${Math.round((100 * month.total) / credit.usd)} %, over ${month.rows.length} run${month.rows.length === 1 ? "" : "s"}.`,
  );
  for (const row of month.rows) {
    lines.push(
      [
        `  ${row.time}`,
        row.issue === "probe" ? "probe" : `#${row.issue}`,
        row.model,
        `${row.minutes} min`,
        row.turns === undefined ? "? turns" : `${row.turns} turns`,
        row.cost === undefined ? "US$?" : dollars(row.cost),
        row.pr,
      ].join("  "),
    );
  }
  if (month.rows.some((row) => row.cost === undefined)) {
    lines.push(
      "US$? is a run stopped before the SDK gave its cost; the Console has it.",
    );
  }
  lines.push(
    "The SDK's costs are estimates; the Console's balance is the real one.",
  );
  return lines;
}

/** Before a run: a warning once the month is past 80 % of the credit. */
export function creditWarning(rows, now, credit) {
  const { total } = spent(rows, now, credit);
  if (total <= 0.8 * credit.usd) return null;
  return `warning: this credit month has spent ${dollars(total)} of US$${credit.usd}, past 80 %, by the SDK's estimates; the Console has the real balance (${RUNNER} --spent lists the runs).`;
}

/**
 * A run's results: more than one when a notification woke the session
 * again, as in #514's first run. The SDK's cost is the query's total so
 * far, so the last one's; the turns are each result's own.
 */
export function tally(results) {
  const last = results.at(-1);
  return {
    ok: Boolean(last) && last.subtype === "success" && !last.is_error,
    turns: results.length
      ? results.reduce((sum, result) => sum + (result.num_turns ?? 0), 0)
      : undefined,
    cost: last?.total_cost_usd,
  };
}

/**
 * The folder after a fix: its branch, last commit, uncommitted files and
 * pull request, and how it ended, the cost list's column: UNFINISHED with
 * the command that resumes it when changes are left or no pull request is
 * open, with --folder when the fix ran in a folder --folder named, since a
 * resume runs in ../waf-fix otherwise; UNKNOWN when GitHub could not be
 * asked, which a resume would otherwise pay to find out; or the pull
 * request's URL, with the merge command, after the one that detaches the
 * folder, since git deletes no branch another folder has checked out.
 */
export function afterRun(folder, run = output, { named = false } = {}) {
  // What the folder says, or "" when a command fails: the report is
  // written, and the run's line kept, whatever fails.
  const ask = (command, args) => {
    try {
      return run(folder, command, args);
    } catch {
      return "";
    }
  };
  const changes = ask("git", ["status", "--porcelain"]);
  const branch = ask("git", ["branch", "--show-current"]);
  const last = ask("git", ["log", "-1", "--oneline"]);
  const listArgs = ["pr", "list", "--head", branch, "--json", "number,url"];
  const listing = `gh ${listArgs.join(" ")}`;
  let pr;
  let unknown = false;
  if (branch) {
    try {
      pr = JSON.parse(run(folder, "gh", listArgs))[0];
    } catch {
      unknown = true;
    }
  }
  const outcome = changes
    ? "UNFINISHED"
    : unknown
      ? "UNKNOWN"
      : (pr?.url ?? "UNFINISHED");
  const resume = `${RUNNER} --resume last${named ? ` --folder ${folder}` : ""}`;
  const lines = [
    "",
    "— the folder after the run —",
    `branch ${branch || "(none: detached)"} · last commit ${last}`,
    pr
      ? `pull request ${pr.url}`
      : unknown
        ? `could not ask GitHub for the pull request: ${listing}`
        : "no pull request open for this branch",
  ];
  if (changes) lines.push(`uncommitted:\n${changes}`);
  lines.push(
    outcome === "UNFINISHED"
      ? `UNFINISHED: run  ${resume}  to finish it.`
      : outcome === "UNKNOWN"
        ? `UNKNOWN: when  ${listing}  lists no pull request, run  ${resume}  to finish it.`
        : [
            "Once its checks pass and you have read it, free its branch from that folder, then merge it squashed:",
            `  git -C ${folder} switch --detach`,
            `  gh pr merge ${pr.number} --squash --delete-branch`,
          ].join("\n"),
  );
  const unfinished = outcome === "UNFINISHED" || outcome === "UNKNOWN";
  return { lines, outcome, unfinished, pr: pr?.url };
}
