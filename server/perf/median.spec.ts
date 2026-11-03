import type { Stats } from './load';
import {
  type Judgement,
  judgementMarkdown,
  judgeRounds,
  median,
  planTimes,
} from './median';
import type { KnownMiss, Report, Result } from './report';

// The typo lookup's (ADR-082), as in report.spec.ts.
const typoMiss: KnownMiss = {
  issue: '#225',
  until: '2026-11-30',
  ceilingMs: 450,
};

const LIST = 'GET /orders';
const TYPO = 'GET /lookup?q=typo';

function stats(p95: number, errors = 0): Stats {
  return {
    requests: 1_000,
    errors,
    p50: p95 / 2,
    p95,
    p99: p95 * 1.2,
    max: p95 * 1.5,
    rps: 100,
    errorSamples: [],
  };
}

function budget(name: string, p95: number, errors = 0): Result {
  return {
    phase: 'budget',
    name,
    kind: 'read',
    connections: 10,
    budgetMs: 300,
    knownMiss: name === TYPO ? typoMiss : null,
    stats: stats(p95, errors),
    verdict: null,
  };
}

/** A round's report: the list's p95, then the typo lookup's. */
function round(
  number: number | null,
  list: number,
  typo = 200,
  options: {
    errors?: number;
    scale?: 'small' | 'large';
    passed?: boolean;
  } = {},
): Report {
  const scale = options.scale ?? 'small';

  return {
    startedAt: `2026-11-02T1${number ?? 0}:00:00.000Z`,
    finishedAt: `2026-11-02T1${number ?? 0}:20:00.000Z`,
    baseUrl: 'http://localhost:3000',
    scale,
    seed: 51,
    seededAt: '2026-11-02T10:00:00.000Z',
    organizations: 5,
    counts: {},
    budgetsEnforced: scale === 'small',
    round: number,
    results: [
      budget(LIST, list, options.errors),
      budget(TYPO, typo),
      // The stress pass, the first round's only, is never judged.
      { ...budget(LIST, 4_000), phase: 'stress', connections: 100 },
    ],
    concurrency: {
      passed: options.passed ?? true,
      connections: 10,
      attempted: 200,
      shipped: 200,
      errors: 0,
      errorSamples: [],
      stockBefore: '1000',
      stockAfter: '800',
      orders: [],
      reasons: [],
    },
    growthAgainst: null,
    growth: [],
  };
}

/** Judged, or the test fails with the refusal. */
function judged(reports: Report[]): Judgement {
  const judgement = judgeRounds(reports);
  if (typeof judgement === 'string') throw new Error(judgement);
  return judgement;
}

const resultFor = (judgement: Judgement, name: string) =>
  judgement.results.find((result) => result.name === name)!;

describe('median', () => {
  it('takes the middle value, whatever the order', () => {
    expect(median([137, 95, 101])).toBe(101);
  });

  it('takes halfway between the two middle values of an even count', () => {
    expect(median([95, 137, 101, 120])).toBe(110.5);
  });
});

describe('judgeRounds', () => {
  it('leaves an odd round out: one slow runner fails nothing', () => {
    const judgement = judged([round(1, 95), round(2, 101), round(3, 420)]);
    const list = resultFor(judgement, LIST);

    expect(list.rounds).toEqual([95, 101, 420]);
    expect(list.median).toBe(101);
    expect(list.verdict).toBe('pass');
    expect(judgement.failed).toBe(false);
  });

  it('fails when two rounds of three miss', () => {
    const judgement = judged([round(1, 95), round(2, 310), round(3, 420)]);

    expect(resultFor(judgement, LIST).verdict).toBe('fail');
    expect(judgement.failed).toBe(true);
  });

  it('judges only the budgets, in the first round’s order, not the stress pass', () => {
    const judgement = judged([round(1, 95), round(2, 101), round(3, 120)]);

    expect(judgement.results.map((result) => result.name)).toEqual([
      LIST,
      TYPO,
    ]);
  });

  it('judges a known miss on the median, against its ceiling', () => {
    // 353 is over the budget of 300 and under the ceiling of 450; the
    // round at 520 alone would have failed a run of its own.
    const known = judged([
      round(1, 95, 340),
      round(2, 95, 353),
      round(3, 95, 520),
    ]);
    expect(resultFor(known, TYPO).median).toBe(353);
    expect(resultFor(known, TYPO).verdict).toBe('known');
    expect(known.failed).toBe(false);

    // Two rounds past the ceiling put the median past it.
    const over = judged([
      round(1, 95, 340),
      round(2, 95, 460),
      round(3, 95, 520),
    ]);
    expect(resultFor(over, TYPO).verdict).toBe('fail');
    expect(over.failed).toBe(true);
  });

  it('reads a known miss’s end date on the first round’s day', () => {
    const late = [round(1, 95, 353), round(2, 95, 353), round(3, 95, 353)];
    for (const report of late) {
      report.startedAt = report.startedAt.replace('2026-11-02', '2026-12-01');
    }

    expect(resultFor(judged(late), TYPO).verdict).toBe('fail');
  });

  it('fails a budget with an error in any round, its median within budget', () => {
    const judgement = judged([
      round(1, 95),
      round(2, 101, 200, { errors: 1 }),
      round(3, 120),
    ]);
    const list = resultFor(judgement, LIST);

    expect(list.errors).toBe(1);
    expect(list.verdict).toBe('fail');
    expect(judgement.failed).toBe(true);
  });

  it('shows a median over budget at large scale, but fails nothing', () => {
    const large = { scale: 'large' as const };
    const judgement = judged([
      round(1, 400, 200, large),
      round(2, 410, 200, large),
      round(3, 420, 200, large),
    ]);

    expect(resultFor(judgement, LIST).verdict).toBe('fail');
    expect(judgement.failed).toBe(false);
  });

  it('shows a round’s failed concurrency check, which fails that round’s job, not the median', () => {
    const judgement = judged([
      round(1, 95),
      round(2, 101, 200, { passed: false }),
      round(3, 120),
    ]);

    expect(judgement.rounds.map((one) => one.concurrencyPassed)).toEqual([
      true,
      false,
      true,
    ]);
    expect(judgement.failed).toBe(false);
  });

  it('refuses a missing round: two rounds are no median', () => {
    expect(judgeRounds([round(1, 95), round(3, 120)])).toMatch(
      /^Round 2 of 3 has no report/,
    );
    expect(judgeRounds([])).toMatch(/^Round 1 of 3 has no report/);
  });

  it('refuses a run judged on its own, which is no round', () => {
    expect(
      judgeRounds([round(null, 95), round(2, 101), round(3, 120)]),
    ).toMatch(/^Round 1 of 3 has no report/);
  });

  it('refuses a round given twice', () => {
    expect(
      judgeRounds([round(1, 95), round(2, 101), round(2, 99), round(3, 120)]),
    ).toMatch(/^Round 2 has 2 reports/);
  });

  it('refuses rounds that timed different endpoints', () => {
    const other = round(3, 120);
    other.results = other.results.filter((result) => result.name !== TYPO);

    expect(judgeRounds([round(1, 95), round(2, 101), other])).toMatch(
      /^Round 3 timed other endpoints than round 1/,
    );
  });
});

describe('planTimes', () => {
  it('adds up each probe’s statements, in the plan check’s order', () => {
    expect(
      planTimes({
        explained: [
          { probe: 'home', planningMs: 0.5, executionMs: 1 },
          { probe: 'orders: open', planningMs: 0.25, executionMs: 3 },
          { probe: 'home', planningMs: 0.75, executionMs: 2 },
        ],
      }),
    ).toEqual([
      { probe: 'home', statements: 2, planningMs: 1.25, executionMs: 3 },
      {
        probe: 'orders: open',
        statements: 1,
        planningMs: 0.25,
        executionMs: 3,
      },
    ]);
  });
});

describe('judgementMarkdown', () => {
  const judgement = judged([round(1, 95), round(2, 137), round(3, 101)]);

  it('gives the median and each round’s figure', () => {
    expect(judgementMarkdown(judgement, null)).toContain(
      '| GET /orders | 101 ms | 95 ms | 137 ms | 101 ms | 0 | 300 | pass |',
    );
  });

  it('gives each probe’s plan time, or says the plan check left none', () => {
    const plans = {
      explained: [{ probe: 'home', planningMs: 11, executionMs: 15 }],
    };

    expect(judgementMarkdown(judgement, plans)).toContain(
      '| home | 1 | 11.0 ms | 15.0 ms |',
    );
    expect(judgementMarkdown(judgement, null)).toContain(
      'No plan check report',
    );
  });
});
