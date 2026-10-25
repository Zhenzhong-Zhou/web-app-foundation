import { RateLimited, signIn } from './client';
import { runLoad } from './load';
import { readManifest } from './manifest';
import {
  growthFor,
  knownMissLabel,
  type Result,
  verdictOf,
  writeReport,
} from './report';
import {
  concurrencyCheck,
  discover,
  type Org,
  readScenarios,
  type Scenario,
  WriteChain,
} from './scenarios';

/**
 * Response-time budgets against a running server (ADR-051).
 *
 * Usage, from `server/`, with the server running against a volume seed:
 *
 *     npm run perf
 *     npm run perf -- --scale large --url http://localhost:3000 --skip-stress
 *
 * Budgets at 10 connections fail the run at small scale and are shown at
 * large, a known miss excepted until its date (ADR-082); the concurrency
 * check fails it at either; the stress run at 100 connections only reports.
 * See perf/README.md for how to start the server.
 */

interface Phase {
  name: 'budget' | 'stress';
  connections: number;
  reads: { requests: number; warmup: number };
  writes: { requests: number; warmup: number };
}

const BUDGET: Phase = {
  name: 'budget',
  connections: 10,
  reads: { requests: 1_000, warmup: 50 },
  writes: { requests: 300, warmup: 50 },
};

const STRESS: Phase = {
  name: 'stress',
  connections: 100,
  reads: { requests: 3_000, warmup: 100 },
  writes: { requests: 900, warmup: 100 },
};

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const baseUrl = (
    valueOf(args, '--url') ??
    process.env.PERF_URL ??
    'http://localhost:3000'
  ).replace(/\/$/, '');
  const skipStress = args.includes('--skip-stress');

  const manifest = readManifest(valueOf(args, '--scale'));
  if (typeof manifest === 'string') {
    console.error(manifest);
    return 1;
  }

  const ready = await fetch(`${baseUrl}/health/ready`).catch(() => null);
  if (ready?.status !== 200) {
    console.error(`${baseUrl}/health/ready is not answering 200.`);
    return 1;
  }

  const startedAt = new Date().toISOString();
  // The day a known miss's end date is read against, in UTC.
  const day = startedAt.slice(0, 10);
  const budgetsEnforced = manifest.scale === 'small';

  console.log(
    `Perf against ${baseUrl}: ${manifest.scale} scale, ${manifest.organizations.length} organizations. Budgets ${budgetsEnforced ? 'enforced' : 'informational'}.`,
  );

  const orgs: Org[] = [];
  for (const [index, anchors] of manifest.organizations.entries()) {
    const session = await signIn(
      baseUrl,
      anchors.email,
      manifest.password,
      `organization ${index + 1}`,
    );
    const newcomer = await signIn(
      baseUrl,
      anchors.newcomerEmail,
      manifest.password,
      `organization ${index + 1}'s newcomer`,
    );
    orgs.push(await discover(session, anchors, newcomer));
  }

  // A tag per run keeps lot codes and references unique across reruns.
  const tag = Date.now().toString(36).toUpperCase();
  const results: Result[] = [];

  results.push(...(await runPhase(BUDGET, orgs, `${tag}B`, day)));

  console.log('Concurrency check: 200 shipments of one product…');
  const concurrency = await concurrencyCheck(orgs[0], tag);
  console.log(concurrency.passed ? '  passed' : '  FAILED');

  if (!skipStress) {
    results.push(...(await runPhase(STRESS, orgs, `${tag}S`, day)));
  }

  const { against, growth } = growthFor(manifest.scale, results);

  const { path, markdown } = writeReport({
    startedAt,
    finishedAt: new Date().toISOString(),
    baseUrl,
    scale: manifest.scale,
    seed: manifest.seed,
    seededAt: manifest.seededAt,
    organizations: manifest.organizations.length,
    counts: manifest.organizations[0].counts,
    budgetsEnforced,
    results,
    concurrency,
    growthAgainst: against,
    growth,
  });

  console.log(`\n${markdown}\n\nReport: ${path}`);

  const budgetFailed = results.some((result) => result.verdict === 'fail');
  return (budgetsEnforced && budgetFailed) || !concurrency.passed ? 1 : 0;
}

/**
 * Reads first, then the write chain in order: receive, ship, then invoice
 * the shipments just made, issue them, and credit what was issued.
 */
async function runPhase(
  phase: Phase,
  orgs: Org[],
  tag: string,
  day: string,
): Promise<Result[]> {
  const results: Result[] = [];
  const { connections } = phase;

  console.log(`\n${phase.name}: ${connections} connections`);

  for (const scenario of readScenarios(orgs)) {
    results.push(
      await measure(phase, scenario, { connections, ...phase.reads }, day),
    );
  }

  const writes = { connections, ...phase.writes };
  const chain = new WriteChain(orgs, writes, tag);
  await chain.prepare();

  results.push(await measure(phase, chain.receive(), writes, day));
  results.push(await measure(phase, chain.ship(), writes, day));
  await chain.draftInvoices();
  results.push(await measure(phase, chain.issue(), writes, day));
  results.push(await measure(phase, chain.credit(), writes, day));

  return results;
}

async function measure(
  phase: Phase,
  scenario: Scenario,
  options: { connections: number; requests: number; warmup: number },
  day: string,
): Promise<Result> {
  const stats = await runLoad(scenario.send, options);
  const knownMiss = scenario.knownMiss ?? null;

  const verdict =
    phase.name === 'budget'
      ? verdictOf(stats, scenario.budgetMs, knownMiss, day)
      : null;

  const p95 = `${Math.round(stats.p95)} ms`.padStart(8);
  const shown =
    verdict === 'known' && knownMiss
      ? knownMissLabel(knownMiss)
      : verdict === 'fail'
        ? 'over budget'
        : (verdict ?? '');

  console.log(
    `  ${scenario.name.padEnd(34)} p95 ${p95}  ${stats.errors} errors  ${shown}`,
  );

  return {
    phase: phase.name,
    name: scenario.name,
    kind: scenario.kind,
    connections: options.connections,
    budgetMs: scenario.budgetMs,
    knownMiss,
    stats,
    verdict,
  };
}

function valueOf(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

void main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(
      error instanceof RateLimited
        ? error.message
        : error instanceof Error
          ? (error.stack ?? error.message)
          : error,
    );
    process.exitCode = 1;
  });
