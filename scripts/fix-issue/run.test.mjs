/**
 * Tests for the fix runner, on Node's own runner, with the scripts' tests:
 *
 *     node --test scripts/
 *
 * They import lib.mjs alone, never run.mjs, which loads the Agent SDK:
 * so nothing is installed in this folder for them, and no call is paid.
 * The folder guards run real git in a temporary repository with a second
 * working folder beside it, as git-fixture.mjs makes them; the report
 * after a run has a stand-in for git and gh.
 */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { folder, git, write } from "../git-fixture.mjs";
import {
  RUNS_HEADER,
  Stop,
  afterRun,
  checkClean,
  checkInit,
  checkKey,
  creditMonth,
  creditWarning,
  fixFolder,
  lastFix,
  mainFolder,
  parseArguments,
  promptFor,
  readRuns,
  recordRun,
  refusedCommand,
  spent,
  spentReport,
  tally,
  vancouverTime,
} from "./lib.mjs";

const CREDIT = { usd: 100, day: 9 };

/** A refusal whose message matches. */
const refuses = (run, message) =>
  assert.throws(
    run,
    (error) => error instanceof Stop && message.test(error.message),
  );

const parsed = (line) => parseArguments(line ? line.split(" ") : []);

test("a number is a fix, on Opus, at US$15, its prompt /fix-issue <N>", () => {
  const args = parsed("514");
  assert.equal(args.mode, "fix");
  assert.equal(args.issue, "514");
  assert.equal(args.model, "opus");
  assert.equal(args.budget, 15);
  assert.equal(args.folder, undefined);
  assert.equal(promptFor(args), "/fix-issue 514");
});

test("leave and its paths are passed on as they stand", () => {
  const args = parsed("514 leave client/src/a.ts server/b.ts");
  assert.equal(
    promptFor(args),
    "/fix-issue 514 leave client/src/a.ts server/b.ts",
  );
});

test("the options go anywhere on the line", () => {
  const args = parsed("--model sonnet 514 --budget 3 --folder ../other");
  assert.deepEqual(
    [args.mode, args.issue, args.model, args.budget, args.folder],
    ["fix", "514", "sonnet", 3, "../other"],
  );
});

test("--resume last, --probe at US$0.50 and --spent", () => {
  const resume = parsed("--resume last");
  assert.equal(resume.mode, "resume");
  assert.match(
    promptFor(resume),
    /^The session ended before the task was finished/,
  );
  const probe = parsed("--probe");
  assert.equal(probe.mode, "probe");
  assert.equal(probe.budget, 0.5);
  assert.match(promptFor(probe), /^Use no tools\./);
  assert.equal(parsed("--probe --budget 1").budget, 1);
  assert.deepEqual(parsed("--spent"), { mode: "spent" });
});

test("bad input is refused, saying what to give", () => {
  refuses(() => parsed(""), /give an issue's number/);
  refuses(() => parsed("abc"), /abc is not an issue's number/);
  refuses(() => parsed("0"), /0 is not an issue's number/);
  refuses(() => parsed("514 fix"), /only leave and the paths/);
  refuses(() => parsed("514 leave"), /only leave and the paths/);
  refuses(() => parsed("--resume"), /--resume needs a value/);
  refuses(() => parsed("--resume 0123-abcd"), /--resume takes last/);
  refuses(() => parsed("--probe 514"), /one at a time/);
  refuses(() => parsed("--resume last 514"), /one at a time/);
  refuses(() => parsed("--spent --probe"), /one at a time/);
  refuses(() => parsed("--spent --model opus"), /--spent takes nothing else/);
  refuses(() => parsed("--probe --probe"), /given twice/);
  refuses(() => parsed("514 --budget 0"), /--budget must be a positive number/);
  refuses(
    () => parsed("514 --budget ten"),
    /--budget must be a positive number/,
  );
  refuses(() => parsed("514 --budget --probe"), /--budget needs a value/);
  refuses(() => parsed("514 --fast"), /--fast is not an option/);
});

test("without ANTHROPIC_API_KEY it stops, saying how to set it", () => {
  refuses(
    () => checkKey({}),
    /read -s ANTHROPIC_API_KEY && export ANTHROPIC_API_KEY/,
  );
  checkKey({ ANTHROPIC_API_KEY: "sk-ant-test" });
});

test("the session stops unless the key pays and a fix finds /fix-issue", () => {
  const init = (apiKeySource, slash_commands) => ({
    apiKeySource,
    slash_commands,
  });
  assert.deepEqual(
    checkInit(init("ANTHROPIC_API_KEY", ["/review", "fix-issue"]), "fix"),
    {
      found: true,
      stop: undefined,
    },
  );
  assert.match(
    checkInit(init("none", ["fix-issue"]), "fix").stop,
    /paid by "none"/,
  );
  assert.match(
    checkInit(init("ANTHROPIC_API_KEY", ["review"]), "fix").stop,
    /not loaded/,
  );
  assert.equal(
    checkInit(init("ANTHROPIC_API_KEY", []), "probe").stop,
    undefined,
  );
});

/**
 * A main working folder with one commit, and beside it, in the same
 * temporary folder, a second one at that commit, as `git worktree add`
 * makes ../waf-fix.
 */
function folders(t, second = "waf-fix") {
  const parent = folder(t, "fix-runner");
  const main = path.join(parent, "main");
  mkdirSync(main);
  git(main, "init", "--quiet");
  write(main, "a.txt", "one\n");
  write(main, "server/b.txt", "two\n");
  git(main, "add", ".");
  git(main, "commit", "--quiet", "-m", "first");
  if (second)
    git(
      main,
      "worktree",
      "add",
      "--quiet",
      "--detach",
      path.join(parent, second),
    );
  return {
    parent,
    main: realpathSync(main),
    second: second && realpathSync(path.join(parent, second)),
  };
}

test("the main folder is found from it or a folder in it", (t) => {
  const { main } = folders(t);
  assert.equal(mainFolder(main), main);
  assert.equal(mainFolder(path.join(main, "server")), main);
});

test("started from a second folder, it says to run it from the main one", (t) => {
  const { main, second } = folders(t);
  refuses(
    () => mainFolder(path.join(second, "server")),
    new RegExp(
      `is a second working folder; run it from the main working folder: cd ${main} `,
    ),
  );
});

test("the fix runs in ../waf-fix beside the main folder, or the folder given", (t) => {
  const { parent, main, second } = folders(t);
  assert.equal(fixFolder(main, undefined), second);
  assert.equal(fixFolder(main, "../waf-fix", main), second);
  assert.equal(fixFolder(main, path.join(parent, "waf-fix")), second);
});

test("the main folder itself, or a folder in it, is refused", (t) => {
  const { main } = folders(t);
  refuses(
    () => fixFolder(main, main),
    /in the main working folder, where a build runs/,
  );
  refuses(() => fixFolder(main, "server", main), /in the main working folder/);
});

test("a folder missing is refused, with the commands that make it", (t) => {
  const { main } = folders(t, null);
  assert.throws(
    () => fixFolder(main, undefined),
    (error) =>
      error instanceof Stop &&
      error.message.includes(
        "git worktree add --detach ../waf-fix origin/main",
      ) &&
      error.message.includes(
        "(cd ../waf-fix/server && npm ci) && (cd ../waf-fix/client && npm ci)",
      ),
  );
});

test("a folder of no repository, or another one, is refused", (t) => {
  const { parent, main } = folders(t);
  const plain = path.join(parent, "plain");
  mkdirSync(plain);
  refuses(
    () => fixFolder(main, plain),
    /not a working folder of this repository/,
  );
  const other = path.join(parent, "other");
  mkdirSync(other);
  git(other, "init", "--quiet");
  refuses(
    () => fixFolder(main, other),
    /not a working folder of this repository/,
  );
  refuses(
    () => fixFolder(main, path.join(parent, "waf-fix", "server")),
    /is inside a working folder/,
  );
});

test("a new fix refuses a folder with uncommitted tracked changes, naming them", (t) => {
  const { second } = folders(t);
  checkClean(second);
  writeFileSync(path.join(second, "untracked.txt"), "new\n");
  checkClean(second);
  writeFileSync(path.join(second, "a.txt"), "changed\n");
  refuses(
    () => checkClean(second),
    /uncommitted changes, which a new fix would start on:\n M a\.txt\n/,
  );
});

test("a time in Vancouver keeps its offset", () => {
  assert.equal(
    vancouverTime(new Date("2026-07-01T12:00:59Z")),
    "2026-07-01T05:00-07:00",
  );
  assert.equal(
    vancouverTime(new Date("2026-01-15T12:00:00Z")),
    "2026-01-15T04:00-08:00",
  );
});

const RUN = {
  time: new Date("2026-07-01T12:00:00Z"),
  issue: "514",
  model: "claude-opus-5-5",
  minutes: 12.4,
  turns: 39,
  cost: 1.7012,
  pr: "https://github.com/o/r/pull/520",
  session: "032e852f",
};

test("each run is a line in the cost list, under a header row when the list is new", (t) => {
  const file = path.join(folder(t, "fix-runs"), "tmp", "fix-runs", "runs.tsv");
  recordRun(file, RUN);
  recordRun(file, {
    ...RUN,
    issue: "probe",
    minutes: 0.2,
    turns: undefined,
    cost: undefined,
    pr: "-",
  });
  assert.equal(
    readFileSync(file, "utf8"),
    [
      RUNS_HEADER.join("\t"),
      "2026-07-01T05:00-07:00\t514\tclaude-opus-5-5\t12\t39\t1.70\thttps://github.com/o/r/pull/520\t032e852f",
      "2026-07-01T05:00-07:00\tprobe\tclaude-opus-5-5\t0\t\t\t-\t032e852f",
      "",
    ].join("\n"),
  );
  const rows = readRuns(file);
  assert.deepEqual(
    rows.map((row) => [row.issue, row.minutes, row.turns, row.cost, row.pr]),
    [
      ["514", 12, 39, 1.7, "https://github.com/o/r/pull/520"],
      ["probe", 0, undefined, undefined, "-"],
    ],
  );
  assert.equal(rows[0].at.toISOString(), "2026-07-01T12:00:00.000Z");
});

/** Rows as the list gives them back, from lines of a time, an issue, a cost and a pull request. */
function rowsOf(t, ...lines) {
  const file = path.join(folder(t, "fix-runs"), "runs.tsv");
  const text = lines.map(([time, issue, cost, pr = "UNFINISHED"]) =>
    [time, issue, "claude-opus-5-5", "10", "30", cost, pr, `s-${issue}`].join(
      "\t",
    ),
  );
  writeFileSync(file, [RUNS_HEADER.join("\t"), ...text, ""].join("\n"));
  return readRuns(file);
}

test("--resume last finishes the last fix, a probe after it passed over", (t) => {
  const rows = rowsOf(
    t,
    ["2026-11-09T10:00-07:00", "514", "1.70"],
    ["2026-11-09T11:00-07:00", "520", "0.90"],
    ["2026-11-09T12:00-07:00", "probe", "0.06", "-"],
  );
  assert.equal(lastFix(rows, "runs.tsv").session, "s-520");
  refuses(
    () => lastFix(rows.slice(2), "runs.tsv"),
    /no earlier fix in runs\.tsv to resume/,
  );
});

test("--resume last refuses a fix that opened its pull request, naming it", (t) => {
  const rows = rowsOf(
    t,
    ["2026-11-09T10:00-07:00", "514", "1.70"],
    [
      "2026-11-09T11:00-07:00",
      "520",
      "0.90",
      "https://github.com/o/r/pull/521",
    ],
    ["2026-11-09T12:00-07:00", "probe", "0.06", "-"],
  );
  refuses(
    () => lastFix(rows, "runs.tsv"),
    /^the last fix, #520 of 2026-11-09T11:00-07:00, ended with its pull request, https:\/\/github\.com\/o\/r\/pull\/521, so there is nothing to finish$/,
  );
});

test("the credit month runs from the 9th, 00:00 UTC", () => {
  const month = (iso) => {
    const { start, end } = creditMonth(new Date(iso), 9);
    return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
  };
  assert.deepEqual(month("2026-11-08T23:59:59Z"), ["2026-10-09", "2026-11-09"]);
  assert.deepEqual(month("2026-11-09T00:00:00Z"), ["2026-11-09", "2026-12-09"]);
  assert.deepEqual(month("2027-01-05T12:00:00Z"), ["2026-12-09", "2027-01-09"]);
});

test("a line on the 8th and one on the 9th fall in different months", (t) => {
  const rows = rowsOf(
    t,
    ["2026-11-08T12:00-07:00", "500", "5.00"],
    // 23:59 and 00:00 UTC, the credit's own edge.
    ["2026-11-08T16:59-07:00", "501", "1.00"],
    ["2026-11-08T17:00-07:00", "502", "2.00"],
    ["2026-11-09T12:00-07:00", "503", "3.00"],
  );
  const issues = (now) =>
    spent(rows, new Date(now), CREDIT).rows.map((row) => row.issue);
  assert.deepEqual(issues("2026-11-08T20:00:00Z"), ["500", "501"]);
  assert.deepEqual(issues("2026-11-20T20:00:00Z"), ["502", "503"]);
  assert.equal(spent(rows, new Date("2026-11-20T20:00:00Z"), CREDIT).total, 5);
});

test("--spent lists the month's runs and their total against the credit", (t) => {
  const rows = rowsOf(
    t,
    ["2026-11-01T10:00-07:00", "490", "9.00"],
    [
      "2026-11-09T10:00-07:00",
      "514",
      "1.70",
      "https://github.com/o/r/pull/520",
    ],
    ["2026-11-09T12:00-07:00", "probe", "", "-"],
  );
  assert.deepEqual(
    spentReport(rows, new Date("2026-11-20T00:00:00Z"), CREDIT, "runs.tsv"),
    [
      "Credit month 9 Nov 2026 to 9 Dec 2026, 00:00 UTC: US$1.70 of US$100, 2 %, over 2 runs.",
      "  2026-11-09T10:00-07:00  #514  claude-opus-5-5  10 min  30 turns  US$1.70  https://github.com/o/r/pull/520",
      "  2026-11-09T12:00-07:00  probe  claude-opus-5-5  10 min  30 turns  US$?  -",
      "US$? is a run stopped before the SDK gave its cost; the Console has it.",
      "The SDK's costs are estimates; the Console's balance is the real one.",
    ],
  );
});

test("--spent with no list yet says so, at nothing spent", () => {
  const lines = spentReport(
    [],
    new Date("2026-11-20T00:00:00Z"),
    CREDIT,
    "tmp/fix-runs/runs.tsv",
  );
  assert.equal(
    lines[0],
    "No runs yet: tmp/fix-runs/runs.tsv is written by the first one.",
  );
  assert.match(lines[1], /: US\$0\.00 of US\$100, 0 %, over 0 runs\.$/);
});

test("a run warns once the month is past 80 % of the credit, not before", (t) => {
  const now = new Date("2026-11-20T00:00:00Z");
  const at80 = rowsOf(
    t,
    ["2026-11-01T10:00-07:00", "490", "50.00"],
    ["2026-11-09T10:00-07:00", "514", "40.00"],
    ["2026-11-10T10:00-07:00", "515", "40.00"],
  );
  assert.equal(creditWarning(at80, now, CREDIT), null);
  const past = rowsOf(
    t,
    ["2026-11-09T10:00-07:00", "514", "40.00"],
    ["2026-11-10T10:00-07:00", "515", "40.01"],
  );
  assert.match(
    creditWarning(past, now, CREDIT),
    /^warning: .* US\$80\.01 of US\$100, past 80 %/,
  );
});

test("a run's turns are each result's, its cost the last result's total", () => {
  // #514's first run: a notification woke the session after its result.
  const results = [
    {
      subtype: "success",
      is_error: false,
      num_turns: 35,
      total_cost_usd: 0.789,
    },
    {
      subtype: "success",
      is_error: false,
      num_turns: 4,
      total_cost_usd: 0.8918,
    },
  ];
  assert.deepEqual(tally(results), { ok: true, turns: 39, cost: 0.8918 });
  assert.equal(
    tally([{ subtype: "error_max_budget_usd", num_turns: 80 }]).ok,
    false,
  );
  assert.deepEqual(tally([]), { ok: false, turns: undefined, cost: undefined });
});

/** git and gh as the report calls them, answered from the answers given; each call kept. */
function standIn(answers) {
  const calls = [];
  const run = (cwd, command, args) => {
    const said = [command, ...args].join(" ");
    calls.push(said);
    if (!(said in answers))
      throw new Error(`the stand-in does not answer: ${said}`);
    return answers[said];
  };
  return { run, calls };
}

const ON_BRANCH = {
  "git status --porcelain": "",
  "git branch --show-current": "fix-520-a-typo",
  "git log -1 --oneline": "abc1234 A typo in the Help guide (#520)",
  "gh pr list --head fix-520-a-typo --json number,url":
    '[{"number":521,"url":"https://github.com/o/r/pull/521"}]',
};

test("after a fix with its pull request, the folder detached, then the merge command, squashed", () => {
  const { run, calls } = standIn(ON_BRANCH);
  const report = afterRun("/waf-fix", run);
  assert.equal(report.unfinished, false);
  assert.equal(report.pr, "https://github.com/o/r/pull/521");
  assert.equal(report.outcome, "https://github.com/o/r/pull/521");
  assert.deepEqual(report.lines.slice(1), [
    "— the folder after the run —",
    "branch fix-520-a-typo · last commit abc1234 A typo in the Help guide (#520)",
    "pull request https://github.com/o/r/pull/521",
    "Once its checks pass and you have read it, free its branch from that folder, then merge it squashed:\n  git -C /waf-fix switch --detach\n  gh pr merge 521 --squash --delete-branch",
  ]);
  assert.equal(calls.length, 4);
});

test("changes left uncommitted are UNFINISHED, named, with the resume command", () => {
  const { run } = standIn({
    ...ON_BRANCH,
    "git status --porcelain": " M client/src/a.ts\n?? b.ts",
  });
  const report = afterRun("/waf-fix", run);
  assert.equal(report.unfinished, true);
  assert.ok(report.lines.includes("uncommitted:\n M client/src/a.ts\n?? b.ts"));
  assert.equal(
    report.lines.at(-1),
    "UNFINISHED: run  node scripts/fix-issue/run.mjs --resume last  to finish it.",
  );
});

test("a fix in a folder --folder named resumes with --folder, there", () => {
  const { run } = standIn({
    ...ON_BRANCH,
    "git status --porcelain": " M client/src/a.ts",
  });
  const report = afterRun("/other", run, { named: true });
  assert.equal(
    report.lines.at(-1),
    "UNFINISHED: run  node scripts/fix-issue/run.mjs --resume last --folder /other  to finish it.",
  );
});

test("no pull request, or no branch, is UNFINISHED", () => {
  const none = standIn({
    ...ON_BRANCH,
    "gh pr list --head fix-520-a-typo --json number,url": "[]",
  });
  const report = afterRun("/waf-fix", none.run);
  assert.equal(report.unfinished, true);
  assert.ok(report.lines.includes("no pull request open for this branch"));

  const detached = standIn({ ...ON_BRANCH, "git branch --show-current": "" });
  const alone = afterRun("/waf-fix", detached.run);
  assert.equal(alone.unfinished, true);
  assert.match(alone.lines[2], /^branch \(none: detached\)/);
  assert.ok(!detached.calls.some((call) => call.startsWith("gh ")));
});

test("GitHub not answering is UNKNOWN, with the listing to run before a resume", () => {
  const { run } = standIn(ON_BRANCH);
  const failing = (cwd, command, args) => {
    if (command === "gh") throw new Error("gh: could not connect");
    return run(cwd, command, args);
  };
  const report = afterRun("/waf-fix", failing);
  assert.equal(report.unfinished, true);
  assert.equal(report.outcome, "UNKNOWN");
  assert.equal(report.pr, undefined);
  assert.ok(
    report.lines.includes(
      "could not ask GitHub for the pull request: gh pr list --head fix-520-a-typo --json number,url",
    ),
  );
  assert.equal(
    report.lines.at(-1),
    "UNKNOWN: when  gh pr list --head fix-520-a-typo --json number,url  lists no pull request, run  node scripts/fix-issue/run.mjs --resume last  to finish it.",
  );
});

test("--resume last finishes a fix that ended UNKNOWN", (t) => {
  const rows = rowsOf(t, ["2026-11-09T10:00-07:00", "514", "1.70", "UNKNOWN"]);
  assert.equal(lastFix(rows, "runs.tsv").session, "s-514");
});

test("a merge is refused wherever it stands in the command", () => {
  for (const command of [
    "gh pr merge 521 --squash --delete-branch",
    "cd ../waf-fix && gh pr merge 521 --squash",
    "gh -R o/r pr merge 521",
    "gh api -X PUT repos/o/r/pulls/521/merge",
    "gh api graphql -f query='mutation { mergePullRequest(input: {}) { clientMutationId } }'",
    `bash -c "gh pr merge 521"`,
  ]) {
    assert.match(
      refusedCommand(command),
      /never merges a pull request/,
      command,
    );
  }
});

test("a push that forces is refused wherever it stands, its flag anywhere", () => {
  for (const command of [
    "git push --force",
    "git push origin HEAD --force",
    "git push origin fix-520 -f",
    "git push -uf origin fix-520",
    "git push --force-with-lease origin fix-520",
    "git push origin +fix-520",
    "git -C ../waf-fix push origin fix-520 --force",
    "npm test && git push origin fix-520 --force",
    "(cd ../waf-fix; git push -f)",
    `sh -c 'git push origin HEAD --force'`,
  ]) {
    assert.match(refusedCommand(command), /never force-pushes/, command);
  }
});

test("an ordinary push, the pull request's other commands and git's other subcommands pass", () => {
  for (const command of [
    "git push -u origin fix-520-a-typo",
    "git push origin HEAD",
    "gh pr create --title 'A typo (#520)' --body-file body.md",
    "gh pr list --head fix-520 --json number,url",
    'git commit -m "Never push -f, the runner says"',
    "git fetch --force origin main",
    "git merge --ff-only origin/main",
    undefined,
  ]) {
    assert.equal(refusedCommand(command), null, command);
  }
});
