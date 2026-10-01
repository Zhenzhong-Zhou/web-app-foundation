import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import type { Stats } from './load';

/** Gitignored; CI uploads it as an artifact. */
export const REPORTS = join(__dirname, 'reports');

/**
 * Growth above this from small to large means an endpoint reads in
 * proportion to the data rather than to a page: fine today, a problem by
 * the time a customer reaches the large scale.
 */
export const GROWTH_FLAG = 3;

export type Scale = 'small' | 'large';

export interface Result {
  phase: 'budget' | 'stress';
  name: string;
  kind: 'read' | 'write';
  connections: number;
  budgetMs: number;
  stats: Stats;
  /** Within budget with no errors. Null under stress, which never fails. */
  passed: boolean | null;
}

export interface ConcurrencyResult {
  passed: boolean;
  connections: number;
  attempted: number;
  shipped: number;
  errors: number;
  errorSamples: string[];
  stockBefore: string;
  stockAfter: string;
  /** Per order: shipments that succeeded, and what the order says shipped. */
  orders: { reference: string; shipped: number; fulfilled: string }[];
  reasons: string[];
}

export interface Growth {
  name: string;
  smallP95: number;
  largeP95: number;
  ratio: number;
  flagged: boolean;
}

export interface Report {
  startedAt: string;
  finishedAt: string;
  baseUrl: string;
  scale: Scale;
  seed: number;
  seededAt: string;
  organizations: number;
  /** Rows in the first organization: what this ran against. */
  counts: Record<string, number>;
  budgetsEnforced: boolean;
  results: Result[];
  concurrency: ConcurrencyResult;
  /** The report the growth column compares with, if there is one. */
  growthAgainst: string | null;
  growth: Growth[];
}

/**
 * p95 at 10 connections against the latest report of the other scale, per
 * endpoint. Small and large are run separately (large overnight), so the
 * comparison reads whichever came last, in either direction.
 */
export function growthFor(
  scale: Scale,
  results: Result[],
): { against: string | null; growth: Growth[] } {
  const other: Scale = scale === 'small' ? 'large' : 'small';

  if (!existsSync(REPORTS)) return { against: null, growth: [] };

  // Timestamped names sort in time order; the plan check's files end in
  // -plans.json and so never match.
  const latest = readdirSync(REPORTS)
    .filter((name) => name.endsWith(`-${other}.json`))
    .sort()
    .at(-1);

  if (!latest) return { against: null, growth: [] };

  const previous = JSON.parse(
    readFileSync(join(REPORTS, latest), 'utf8'),
  ) as Report;

  const theirs = new Map(
    previous.results
      .filter((result) => result.phase === 'budget')
      .map((result) => [result.name, result.stats.p95]),
  );

  const growth = results
    .filter((result) => result.phase === 'budget' && theirs.has(result.name))
    .map((result) => {
      const mine = result.stats.p95;
      const other95 = theirs.get(result.name)!;
      const smallP95 = scale === 'small' ? mine : other95;
      const largeP95 = scale === 'small' ? other95 : mine;
      const ratio = smallP95 > 0 ? largeP95 / smallP95 : 0;

      return {
        name: result.name,
        smallP95,
        largeP95,
        ratio,
        flagged: ratio > GROWTH_FLAG,
      };
    });

  return { against: latest, growth };
}

/** Writes the JSON, and the markdown to the CI step summary if there is one. */
export function writeReport(report: Report): {
  path: string;
  markdown: string;
} {
  mkdirSync(REPORTS, { recursive: true });

  const stamp = report.startedAt.replace(/[:.]/g, '-');
  const path = join(REPORTS, `${stamp}-${report.scale}.json`);
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);

  const markdown = toMarkdown(report);

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  }

  return { path, markdown };
}

function toMarkdown(report: Report): string {
  const budget = report.results.filter((result) => result.phase === 'budget');
  const stress = report.results.filter((result) => result.phase === 'stress');
  const other = report.scale === 'small' ? 'large' : 'small';
  const growth = new Map(report.growth.map((row) => [row.name, row]));

  const lines = [
    `## Perf: ${report.scale} scale, ${report.organizations} organizations, seed ${report.seed}`,
    '',
    `Run ${report.startedAt} against ${report.baseUrl}, data seeded ${report.seededAt}.`,
    report.budgetsEnforced
      ? 'Budgets enforced: a miss or an error fails the run.'
      : 'Budgets informational: they are set against the small scale (ADR-051).',
    '',
    '### 10 connections, against the budgets',
    '',
    `| Endpoint | Requests | p50 | p95 | p99 | Req/s | Errors | Budget | Result | p95 at ${other} | Growth, large ÷ small |`,
    '|---|---|---|---|---|---|---|---|---|---|---|',
    ...budget.map((result) => {
      const row = growth.get(result.name);
      const theirs = row
        ? ms(report.scale === 'small' ? row.largeP95 : row.smallP95)
        : '—';
      const ratio = row
        ? row.flagged
          ? `**${row.ratio.toFixed(1)}×, grows with data**`
          : `${row.ratio.toFixed(1)}×`
        : '—';

      return `| ${cells(result)} | ${result.budgetMs} | ${verdict(result, report.budgetsEnforced)} | ${theirs} | ${ratio} |`;
    }),
    '',
    report.growthAgainst
      ? `Growth compares with ${report.growthAgainst}. Over ${GROWTH_FLAG}× means the endpoint reads in proportion to the data, not to a page.`
      : `No ${other}-scale report yet, so no growth column. Run the other scale once to fill it.`,
    '',
    `### Concurrency: ${report.concurrency.attempted} shipments of one product from ${report.concurrency.connections} connections`,
    '',
    report.concurrency.passed
      ? `Passed. Stock ${report.concurrency.stockBefore} → ${report.concurrency.stockAfter}, ${report.concurrency.shipped} shipped, no errors, every order's shipped quantity matches.`
      : `**Failed:** ${report.concurrency.reasons.join(' ')}`,
    ...report.concurrency.errorSamples.map((sample) => `- ${sample}`),
  ];

  if (stress.length > 0) {
    lines.push(
      '',
      '### 100 connections, stress (reported, never fails)',
      '',
      '| Endpoint | Requests | p50 | p95 | p99 | Req/s | Errors |',
      '|---|---|---|---|---|---|---|',
      ...stress.map((result) => `| ${cells(result)} |`),
    );
  }

  const failures = report.results.filter(
    (result) => result.stats.errorSamples.length > 0,
  );

  if (failures.length > 0) {
    lines.push('', '### Errors seen');
    for (const result of failures) {
      lines.push('', `${result.phase}, ${result.name}:`);
      lines.push(...result.stats.errorSamples.map((sample) => `- ${sample}`));
    }
  }

  return lines.join('\n');
}

function cells(result: Result): string {
  const { stats } = result;
  return [
    result.name,
    stats.requests,
    ms(stats.p50),
    ms(stats.p95),
    ms(stats.p99),
    stats.rps.toFixed(0),
    stats.errors,
  ].join(' | ');
}

function verdict(result: Result, enforced: boolean): string {
  if (result.passed) return 'pass';
  return enforced ? '**FAIL**' : 'over';
}

function ms(value: number): string {
  return `${Math.round(value)} ms`;
}
