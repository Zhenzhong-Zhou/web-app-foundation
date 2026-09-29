import { describe, expect, it } from 'vitest';

import { ApiError } from '../lib/api';
import { authMessageFor } from './auth-message';

describe('authMessageFor', () => {
  it('says how long to wait when the throttler says', () => {
    const limited = new ApiError('Too Many Requests', 429, undefined, 900);

    expect(authMessageFor(limited)).toBe(
      'Too many attempts. Try again in 900 seconds.',
    );
  });

  it('does not guess a wait it was not told', () => {
    expect(authMessageFor(new ApiError('Too Many Requests', 429))).toBe(
      'Too many attempts. Try again later.',
    );
  });

  /**
   * The same words for a wrong password and an unknown address (ADR-011):
   * the server chose them, and rewording here is where a leak would start.
   */
  it('shows any other refusal in the server’s words', () => {
    expect(authMessageFor(new ApiError('Invalid email or password', 401))).toBe(
      'Invalid email or password',
    );
  });

  it('says the server could not be reached when nothing answered', () => {
    expect(authMessageFor(new TypeError('Failed to fetch'))).toBe(
      'Could not reach the server.',
    );
  });
});
