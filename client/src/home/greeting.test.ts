import { afterEach, describe, expect, it, vi } from 'vitest';

import { ENGLISH } from '../i18n/catalogues';
import { makeIntl } from '../i18n/intl';
import { greeting } from './greeting';

describe('greeting', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // Home's date and time are the organization's, so its greeting is too
  // (ADR-091's review): 4:20 a.m. in UTC is 8:20 p.m. in Vancouver.
  it('greets by the organization’s clock', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-06T04:20:00Z'));
    const intl = makeIntl('en', ENGLISH);

    expect(greeting(intl, 'Sam', 'UTC')).toBe('Good morning, Sam');
    expect(greeting(intl, 'Sam', 'America/Vancouver')).toBe(
      'Good evening, Sam',
    );
  });
});
