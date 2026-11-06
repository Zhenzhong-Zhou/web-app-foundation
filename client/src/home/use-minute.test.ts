import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useMinute } from './use-minute';

describe('useMinute', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-05T15:42:30Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('moves on at each minute, and never between', () => {
    const { result } = renderHook(() => useMinute());
    expect(result.current.toISOString()).toBe('2026-11-05T15:42:30.000Z');

    // Half a minute to the next: nothing changes until it comes.
    act(() => vi.advanceTimersByTime(29_000));
    expect(result.current.toISOString()).toBe('2026-11-05T15:42:30.000Z');
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.toISOString()).toBe('2026-11-05T15:43:00.000Z');

    // Then on every minute after.
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.toISOString()).toBe('2026-11-05T15:44:00.000Z');
  });
});
