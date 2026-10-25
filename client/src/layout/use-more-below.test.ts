import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useMoreBelow } from './use-more-below';

/**
 * The rail's box and its links, measured as the rail at 1440 × 900 is
 * under a name that takes its foot to two lines: 848 px shown, the links
 * and the 8 px after them 853. jsdom lays nothing out, so the sizes are
 * given.
 */
function rail(scrollHeight: number) {
  const scroller = document.createElement('div');
  const content = document.createElement('div');
  content.style.paddingBottom = '8px';
  scroller.append(content);
  document.body.append(scroller);
  Object.defineProperty(scroller, 'clientHeight', { value: 848 });
  Object.defineProperty(scroller, 'scrollHeight', { value: scrollHeight });
  Object.defineProperty(scroller, 'scrollTop', { value: 0, writable: true });

  const { result } = renderHook(() => useMoreBelow());
  act(() => {
    result.current.content(content);
    result.current.scroller(scroller);
  });
  return { scroller, result };
}

describe('useMoreBelow', () => {
  // Every link in view: what runs on under the foot is the space after them.
  it('is not more when all that is hidden is the space after the content', () => {
    const { result } = rail(853);

    expect(result.current.more).toBe(false);
  });

  it('is more while the content runs on under the box, until scrolled to its end', () => {
    const { scroller, result } = rail(870);
    expect(result.current.more).toBe(true);

    act(() => {
      scroller.scrollTop = 14;
      scroller.dispatchEvent(new Event('scroll'));
    });

    expect(result.current.more).toBe(false);
  });
});
