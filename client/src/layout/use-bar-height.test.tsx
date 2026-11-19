import { render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { barHeight, useBarHeight } from './use-bar-height';

function Bar() {
  const bar = useRef<HTMLElement>(null);
  useBarHeight(bar);
  return <header ref={bar} />;
}

describe('useBarHeight', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('sets the bar’s height on the root, again only when it changes', () => {
    let height = 56;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      () => ({ height }) as DOMRect,
    );
    let resized = () => {};
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resized = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    const set = vi.spyOn(CSSStyleDeclaration.prototype, 'setProperty');

    const { unmount } = render(<Bar />);
    expect(barHeight()).toBe(56);

    // The window grows wider: the bar resizes, its height the same.
    resized();
    resized();
    expect(set).toHaveBeenCalledTimes(1);

    // Larger text: a taller bar.
    height = 64.5;
    resized();
    expect(set).toHaveBeenCalledTimes(2);
    expect(barHeight()).toBe(64.5);

    unmount();
    expect(barHeight()).toBe(0);
  });
});
