import { type KnownMiss, verdictOf } from './report';
import { readScenarios } from './scenarios';

// The typo lookup's (ADR-082).
const typoMiss: KnownMiss = {
  issue: '#225',
  until: '2026-11-30',
  ceilingMs: 450,
};

describe('verdictOf', () => {
  const day = '2026-10-26';

  const typo = (p95: number, on = day, errors = 0) =>
    verdictOf({ p95, errors }, 300, typoMiss, on);

  it('passes within the budget', () => {
    expect(typo(300)).toBe('pass');
  });

  it('reads a miss under the ceiling as known', () => {
    expect(typo(353)).toBe('known');
  });

  it('reads a miss at the ceiling as known', () => {
    expect(typo(450)).toBe('known');
  });

  it('fails a miss over the ceiling', () => {
    expect(typo(451)).toBe('fail');
  });

  it('holds through its end date and fails the day after', () => {
    expect(typo(353, '2026-11-30')).toBe('known');
    expect(typo(353, '2026-12-01')).toBe('fail');
  });

  it('fails with errors, within the budget or the ceiling', () => {
    expect(typo(200, day, 1)).toBe('fail');
    expect(typo(353, day, 1)).toBe('fail');
  });

  it('fails a miss without a known miss, as before', () => {
    expect(verdictOf({ p95: 301, errors: 0 }, 300, null, day)).toBe('fail');
  });
});

describe('known misses', () => {
  // The scenarios with nobody to send to: only what each one carries.
  const scenarios = readScenarios([]);

  it('each name an issue and an end date', () => {
    for (const { knownMiss } of scenarios) {
      if (!knownMiss) continue;
      expect(knownMiss.issue).toMatch(/^#\d+$/);
      expect(knownMiss.until).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('include the typo lookup’s', () => {
    const typo = scenarios.find(({ name }) => name === 'GET /lookup?q=typo');
    expect(typo?.knownMiss).toEqual(typoMiss);
  });
});
