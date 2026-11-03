import type { Explained } from './plans';
import {
  type KnownMiss,
  ms,
  type Report,
  type Scale,
  type Verdict,
  verdict,
  verdictOf,
} from './report';

/**
 * A timed run on CI is this many rounds, each a job seeding fresh on a
 * runner of its own, and each budget is judged by the median of their 95th
 * percentiles (ADR-051, amended November 2026). Shared runners vary by about
 * 30% from run to run: one slow runner no longer fails the run, two do.
 * .github/workflows/perf.yml's matrix holds the same number.
 */
export const ROUNDS = 3;

/** The middle value, or halfway between the two middle ones. */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** One budget across the rounds, judged on its median. */
export interface MedianResult {
  name: string;
  budgetMs: number;
  knownMiss: KnownMiss | null;
  /** Each round's p95, the first round's first. */
  rounds: number[];
  median: number;
  /** Every round's together: an error fails the budget, in any round. */
  errors: number;
  verdict: Verdict;
}

export interface Judgement {
  scale: Scale;
  organizations: number;
  budgetsEnforced: boolean;
  /** Each round's start and its concurrency check, the first round's first. */
  rounds: { startedAt: string; concurrencyPassed: boolean }[];
  results: MedianResult[];
  /** A median missed where budgets are enforced. */
  failed: boolean;
}

/**
 * The rounds' budgets judged by their median, or why they cannot be: a
 * round with no report, most often because its job failed before writing
 * one, or rounds that timed different endpoints. Two rounds of three are
 * no median, so a missing one is refused rather than judged without.
 *
 * The concurrency check is no timing: a round's fails that round's own job
 * (perf/report.ts, failsItsRun), and is only shown here.
 */
export function judgeRounds(reports: Report[]): Judgement | string {
  const rounds: Report[] = [];

  for (let round = 1; round <= ROUNDS; round++) {
    const mine = reports.filter((report) => report.round === round);

    if (mine.length === 0) {
      return `Round ${round} of ${ROUNDS} has no report: its job failed before writing one, or its artifact is missing. Open that job, then run the workflow again.`;
    }
    if (mine.length > 1) {
      return `Round ${round} has ${mine.length} reports: give the reports of one run only.`;
    }

    rounds.push(mine[0]);
  }

  const budgets = rounds.map((report) =>
    report.results.filter((result) => result.phase === 'budget'),
  );
  const names = (results: Report['results']) =>
    results.map((result) => result.name).join('\n');

  const odd = budgets.findIndex(
    (results) => names(results) !== names(budgets[0]),
  );
  if (odd >= 0) {
    return `Round ${odd + 1} timed other endpoints than round 1, so they have no median: were the rounds the same commit?`;
  }

  const [first] = rounds;
  // The run's day in UTC, its first round's: a known miss's end date.
  const day = first.startedAt.slice(0, 10);

  const results = budgets[0].map((result, index): MedianResult => {
    const timed = budgets.map((round) => round[index].stats);
    const p95 = median(timed.map((stats) => stats.p95));
    const errors = timed.reduce((sum, stats) => sum + stats.errors, 0);

    return {
      name: result.name,
      budgetMs: result.budgetMs,
      knownMiss: result.knownMiss,
      rounds: timed.map((stats) => stats.p95),
      median: p95,
      errors,
      verdict: verdictOf(
        { p95, errors },
        result.budgetMs,
        result.knownMiss,
        day,
      ),
    };
  });

  return {
    scale: first.scale,
    organizations: first.organizations,
    budgetsEnforced: first.budgetsEnforced,
    rounds: rounds.map((report) => ({
      startedAt: report.startedAt,
      concurrencyPassed: report.concurrency.passed,
    })),
    results,
    failed:
      first.budgetsEnforced &&
      results.some((result) => result.verdict === 'fail'),
  };
}

/**
 * What the median job reads of a plan check's report, declared by the
 * check itself (perf/plans.ts), so a field renamed there fails the build
 * here rather than a table of NaN ms.
 */
export interface PlansReport {
  explained: Pick<Explained, 'probe' | 'planningMs' | 'executionMs'>[];
}

/**
 * Each probe's statements together, as the plan check ran them, alone and
 * without load: the time load does not change, beside the medians.
 */
export function planTimes(plans: PlansReport): {
  probe: string;
  statements: number;
  planningMs: number;
  executionMs: number;
}[] {
  const probes = new Map<
    string,
    { statements: number; planningMs: number; executionMs: number }
  >();

  for (const entry of plans.explained) {
    const probe = probes.get(entry.probe) ?? {
      statements: 0,
      planningMs: 0,
      executionMs: 0,
    };
    probe.statements += 1;
    probe.planningMs += entry.planningMs;
    probe.executionMs += entry.executionMs;
    probes.set(entry.probe, probe);
  }

  return [...probes].map(([probe, times]) => ({ probe, ...times }));
}

/** The median job's summary. */
export function judgementMarkdown(
  judgement: Judgement,
  plans: PlansReport | null,
): string {
  const numbers = judgement.rounds.map((_, index) => index + 1);
  const enforced = judgement.budgetsEnforced;
  const known = judgement.results.filter((result) => result.knownMiss);
  const failedConcurrency = judgement.rounds.flatMap((round, index) =>
    round.concurrencyPassed ? [] : [index + 1],
  );

  const lines = [
    `## Perf: the median of ${ROUNDS} rounds, ${judgement.scale} scale, ${judgement.organizations} organizations`,
    '',
    `Rounds started ${judgement.rounds.map((round) => round.startedAt).join(', ')}.`,
    enforced
      ? 'Budgets enforced on the median: a median over its budget, or an error in any round, fails the run. One slow round does not.'
      : 'Budgets informational: they are set against the small scale (ADR-051).',
    '',
    '### 10 connections, the median p95 against the budgets',
    '',
    `| Endpoint | Median p95 | ${numbers.map((round) => `Round ${round}`).join(' | ')} | Errors | Budget | Result |`,
    `|---|---|${numbers.map(() => '---|').join('')}---|---|---|`,
    ...judgement.results.map(
      (result) =>
        `| ${result.name} | ${ms(result.median)} | ${result.rounds.map(ms).join(' | ')} | ${result.errors} | ${result.budgetMs} | ${verdict(result, enforced)} |`,
    ),
    ...(known.length > 0
      ? [
          '',
          '### Known misses (ADR-082), on the median',
          '',
          ...known.map(
            (result) =>
              `- ${result.name}: ${result.knownMiss!.issue}, until ${result.knownMiss!.until}, ceiling ${result.knownMiss!.ceilingMs} ms. Median ${ms(result.median)}: ${verdict(result, enforced)}.`,
          ),
        ]
      : []),
    '',
    '### Concurrency, in each round',
    '',
    failedConcurrency.length === 0
      ? 'Passed in every round.'
      : `**Failed in ${failedConcurrency.map((round) => `round ${round}`).join(' and ')}**, which fails that round's own job: its summary says why.`,
    '',
    '### Plan time, from the first round’s plan check',
    '',
  ];

  if (plans) {
    lines.push(
      "Each probe's statements, explained once with no load beside them: the time load does not change.",
      '',
      '| Probe | Statements | Planning | Execution |',
      '|---|---|---|---|',
      ...planTimes(plans).map(
        (probe) =>
          `| ${probe.probe} | ${probe.statements} | ${probe.planningMs.toFixed(1)} ms | ${probe.executionMs.toFixed(1)} ms |`,
      ),
    );
  } else {
    lines.push(
      'No plan check report: the first round’s plan check did not run, or wrote nothing. Open its job.',
    );
  }

  return lines.join('\n');
}
