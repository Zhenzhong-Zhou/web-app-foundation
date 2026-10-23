import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useWhileVisible } from './use-while-visible';

/** The tab hidden or shown, as switching to another tab and back does. */
const showTab = (state: DocumentVisibilityState) => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
  document.dispatchEvent(new Event('visibilitychange'));
};

describe('useWhileVisible', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks as it starts and every interval while in front, nothing while hidden, and at once when back', () => {
    const tick = vi.fn();
    renderHook(() => useWhileVisible(tick, 1000));
    expect(tick).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2000);
    expect(tick).toHaveBeenCalledTimes(3);

    showTab('hidden');
    vi.advanceTimersByTime(10_000);
    expect(tick).toHaveBeenCalledTimes(3);

    showTab('visible');
    expect(tick).toHaveBeenCalledTimes(4);
    vi.advanceTimersByTime(1000);
    expect(tick).toHaveBeenCalledTimes(5);
  });

  it('waits an interval first when asked not to ask as it starts', () => {
    const tick = vi.fn();
    renderHook(() => useWhileVisible(tick, 1000, false));
    expect(tick).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it('asks nothing while null, and at once when a function comes', () => {
    const tick = vi.fn();
    const { rerender } = renderHook(
      ({ asking }) => useWhileVisible(asking ? tick : null, 1000),
      { initialProps: { asking: false } },
    );
    vi.advanceTimersByTime(5000);
    expect(tick).not.toHaveBeenCalled();

    rerender({ asking: true });
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it('calls the latest function without starting over when it is made anew', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ tick }) => useWhileVisible(tick, 1000, false),
      { initialProps: { tick: first } },
    );
    vi.advanceTimersByTime(600);
    rerender({ tick: second });
    vi.advanceTimersByTime(400);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
