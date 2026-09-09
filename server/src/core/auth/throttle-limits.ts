/**
 * Throttle limits, multiplied by a factor the environment can set.
 *
 * Decorators evaluate at class-definition time, before Nest builds its
 * injector, so ConfigService is not available here and process.env is read
 * directly — the one place in the codebase that is true.
 *
 * The factor exists for the e2e suite, which registers an organisation per
 * isolated test and hits a production limit of 5/minute within one file. The
 * alternative is tests that pass or fail depending on how many ran before
 * them, which is worse than a knob.
 *
 * Never set above 1 in production. Nothing enforces that, which is why it is
 * a multiplier rather than an override: a missing variable leaves the real
 * limits in place instead of removing them.
 */
const FACTOR = Number(process.env.THROTTLE_FACTOR ?? 1);

export function limit(perMinute: number): number {
  return Math.max(1, Math.round(perMinute * FACTOR));
}
