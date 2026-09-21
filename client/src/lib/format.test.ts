import { describe, expect, it } from 'vitest';

import { formatDay } from './format';

describe('formatDay', () => {
  /**
   * The picked day is stored as UTC midnight. Read in a zone west of UTC that
   * instant is the previous evening, which is how 10 Oct displayed as 9 Oct
   * in Vancouver. formatDay reads it in UTC, so the result cannot depend on
   * where the test or the browser runs.
   */
  it('shows the day that was picked, in any timezone', () => {
    const shown = formatDay('2026-10-10T00:00:00.000Z');

    expect(shown).toContain('10');
    expect(shown).not.toContain('9 ');
    expect(shown).toContain('2026');
  });
});
