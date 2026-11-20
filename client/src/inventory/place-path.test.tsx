import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PlacePath } from './place-path';

const DEEP = {
  locationName: 'Shelf 1-B',
  locationCode: '1B',
  locationPath: ['Main warehouse', 'Ambient', 'Aisle 1'],
};
const WHOLE = 'Main warehouse › Ambient › Aisle 1 › Shelf 1-B (1B)';

/**
 * The path's box `room` px wide, and each text 8 px a letter, as the
 * hidden ruler measures it.
 */
function room(width: number) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      return {
        width:
          this.getAttribute('aria-hidden') === 'true'
            ? (this.textContent?.length ?? 0) * 8
            : width,
      } as DOMRect;
    },
  );
}

/** What the path draws: its cut where it is cut, else its whole. */
const drawn = (container: HTMLElement) => {
  const box = container.querySelector(
    ':scope > div > span:not([aria-hidden])',
  )!;
  return (box.querySelector('[aria-hidden="true"]') ?? box).textContent;
};

describe('PlacePath (ADR-090, amended November 2026; 93a, #639)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the whole path where it fits, taking no focus', () => {
    room(WHOLE.length * 8);
    const { container } = render(<PlacePath place={DEEP} />);

    expect(drawn(container)).toBe(WHOLE);
    expect(container.querySelector('[tabindex]')).toBeNull();
  });

  it('cuts its middle where it does not fit, the warehouse and the place whole', () => {
    // Room for one place between, not two.
    room('Main warehouse › … › Aisle 1 › Shelf 1-B (1B)'.length * 8);
    const { container, unmount } = render(<PlacePath place={DEEP} />);
    expect(drawn(container)).toBe(
      'Main warehouse › … › Aisle 1 › Shelf 1-B (1B)',
    );
    unmount();

    room(100);
    const view = render(<PlacePath place={DEEP} />);
    expect(drawn(view.container)).toBe('Main warehouse › … › Shelf 1-B (1B)');
    // The column's least is the shortest cut, never less.
    expect(
      view.container.querySelector('[data-least]')!.getAttribute('data-least'),
    ).toBe('Main warehouse › … › Shelf 1-B (1B)');
  });

  it('never cuts a path with nothing between its warehouse and the place', () => {
    room(100);
    const { container } = render(
      <PlacePath
        place={{
          locationName: 'Quarantine',
          locationCode: 'QUAR',
          locationPath: ['Richmond warehouse'],
        }}
      />,
    );

    expect(drawn(container)).toBe('Richmond warehouse › Quarantine (QUAR)');
    expect(
      container.querySelector('[data-least]')!.getAttribute('data-least'),
    ).toBe('Richmond warehouse › Quarantine (QUAR)');
  });

  it('cut, reads whole to a screen reader, and shows it whole on hover, on focus and on a tap', async () => {
    room(100);
    const user = userEvent.setup();
    render(<PlacePath place={DEEP} />);
    const path = screen.getByLabelText(WHOLE);
    expect(path).toHaveAttribute('tabindex', '0');

    await user.hover(path);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(WHOLE);
    await user.keyboard('{Escape}');
    await vi.waitFor(() =>
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument(),
    );
    await user.unhover(path);

    await user.tab();
    expect(path).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(WHOLE);
    await user.tab();
    await vi.waitFor(() =>
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument(),
    );

    // A tablet has no hover: a tap shows it at once, not after a press
    // held for MUI's 700 ms.
    fireEvent.touchStart(path);
    await vi.waitFor(
      () => expect(screen.getByRole('tooltip')).toHaveTextContent(WHOLE),
      { timeout: 300 },
    );
  });
});
