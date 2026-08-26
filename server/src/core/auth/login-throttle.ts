import type { ThrottlerGetTrackerFunction } from '@nestjs/throttler';

/**
 * Login rate limiting, keyed on email **and** IP together (ADR-011).
 *
 * IP alone fails twice over: an attacker rotating addresses walks past it, and
 * one corporate NAT locks out everyone behind it. Email alone is worse — it
 * hands anyone a way to lock a chosen victim out of their own account.
 *
 * Counting happens in @nestjs/throttler's in-memory store, so these limits are
 * per-instance and break silently across replicas. That is the first real
 * trigger for Redis (ADR-011), not a reason to skip the limit now.
 */
export const LOGIN_ATTEMPT_LIMIT = 10;
export const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60_000;

/**
 * A const rather than a `function` so the library's own signature supplies the
 * parameter types — conventions.md's function-declaration rule is about stack
 * traces, and this is a value handed to a decorator.
 *
 * Reads the *raw* body: guards run before pipes, so the DTO's @Transform has
 * not happened yet and the email must be normalised here as well.
 */
export const loginTracker: ThrottlerGetTrackerFunction = (req) => {
  const body: unknown = req.body;
  const email =
    typeof body === 'object' &&
    body !== null &&
    'email' in body &&
    typeof body.email === 'string'
      ? body.email.trim().toLowerCase()
      : '';

  const ip: unknown = req.ip;
  return `${email}|${typeof ip === 'string' ? ip : 'unknown'}`;
};
