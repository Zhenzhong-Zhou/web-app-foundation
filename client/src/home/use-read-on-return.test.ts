import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useReadOnReturn } from './use-read-on-return';

/** The tab hidden or shown, as switching to another tab and back does. */
const showTab = (state: DocumentVisibilityState) => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
  document.dispatchEvent(new Event('visibilitychange'));
};

describe('useReadOnReturn', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('reads again when the tab is back after a minute or more, not after a glance away', () => {
    const read = vi.fn();
    renderHook(() => useReadOnReturn(read, 60_000));

    showTab('hidden');
    vi.advanceTimersByTime(59_000);
    showTab('visible');
    expect(read).not.toHaveBeenCalled();

    showTab('hidden');
    vi.advanceTimersByTime(60_000);
    showTab('visible');
    expect(read).toHaveBeenCalledTimes(1);
  });
});
