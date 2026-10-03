import { describe, expect, it } from 'vitest';

import { formatDay } from './format';

describe('formatDay', () => {
  /**
   * A calendar day arrives as YYYY-MM-DD (ADR-052). `new Date()` reads that
   * as UTC midnight, which in a zone west of UTC is the previous evening:
   * how 10 Oct once displayed as 9 Oct in Vancouver. formatDay reads it in
   * UTC, so the result cannot depend on where the test or the browser runs.
   */
  it('shows the day that was sent, in any timezone', () => {
    const shown = formatDay('2026-10-10');

    expect(shown).toContain('10');
    expect(shown).not.toContain('9 ');
    expect(shown).toContain('2026');
  });

  // Audit rows from before ADR-052 hold the instant, UTC midnight.
  it('reads an old UTC-midnight instant as the same day', () => {
    expect(formatDay('2026-10-10T00:00:00.000Z')).toBe(formatDay('2026-10-10'));
  });
});
