import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TableOrCards } from './table-or-cards';

/** A window this wide, for MUI's width queries. */
function widthOf(width: number) {
  vi.stubGlobal('matchMedia', (query: string) => {
    const min = /min-width:\s*([\d.]+)px/.exec(query);
    const max = /max-width:\s*([\d.]+)px/.exec(query);
    return {
      matches:
        (!min || width >= Number(min[1])) && (!max || width <= Number(max[1])),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
  });
}

const LIST = { table: <p>the table</p>, cards: <p>the cards</p> };

/** Items' switch, shared (ADR-090's width switch; ADR-093). */
describe('TableOrCards', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('draws the table from 600 px, and only the table', () => {
    widthOf(600);
    render(<TableOrCards loading={false} {...LIST} />);

    expect(screen.getByText('the table')).toBeVisible();
    expect(screen.queryByText('the cards')).not.toBeInTheDocument();
  });

  it('draws the cards below 600 px, and only the cards', () => {
    widthOf(390);
    render(<TableOrCards loading={false} {...LIST} />);

    expect(screen.getByText('the cards')).toBeVisible();
    expect(screen.queryByText('the table')).not.toBeInTheDocument();
  });

  // The table draws its own placeholder rows under its head.
  it('leaves the table drawn while its rows are read', () => {
    widthOf(1024);
    render(<TableOrCards loading {...LIST} />);

    expect(screen.getByText('the table')).toBeVisible();
  });

  // A quick answer never flashes them (#358).
  it('draws grey cards while the cards are read, once the wait passes 250 ms', () => {
    vi.useFakeTimers();
    widthOf(390);
    const { container } = render(<TableOrCards loading {...LIST} />);

    expect(screen.queryByText('the cards')).not.toBeInTheDocument();
    expect(container.querySelector('.MuiSkeleton-root')).toBeNull();

    act(() => vi.advanceTimersByTime(250));
    expect(container.querySelectorAll('.MuiSkeleton-root')).toHaveLength(2);
  });
});
