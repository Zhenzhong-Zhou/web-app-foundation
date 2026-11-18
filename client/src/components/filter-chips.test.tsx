import { fireEvent, render, screen } from '@testing-library/react';
import { startTransition, useState } from 'react';
import { describe, expect, it } from 'vitest';

import { FilterChips } from './filter-chips';

/**
 * A list's chips as a page draws them: each off removed through the
 * address, which a router draws in a transition (useFocusAfterRemove).
 */
function List({ on }: { on: string[] }) {
  const [shown, setShown] = useState(on);
  const chip = (label: string) =>
    shown.includes(label) && {
      id: label,
      label,
      onRemove: () =>
        startTransition(() =>
          setShown((now) => now.filter((each) => each !== label)),
        ),
    };

  return (
    <main>
      <h1>Orders</h1>
      <FilterChips chips={[chip('Sales only'), chip('Late')]} />
      <p>on {shown.join(', ') || 'none'}</p>
    </main>
  );
}

/** A chip by its label, as its name says it: "Remove filter: Late". */
const chipOf = (label: string) =>
  screen.getByRole('button', { name: `Remove filter: ${label}` });

function press(label: string, key: 'Delete' | 'Enter' | ' ') {
  const chip = chipOf(label);
  chip.focus();
  if (key === 'Enter') fireEvent.keyDown(chip, { key });
  else fireEvent.keyUp(chip, { key });
}

describe('FilterChips', () => {
  it('draws the chips that are on, in their order, and nothing with none', () => {
    const { unmount } = render(<List on={['Late', 'Sales only']} />);

    expect(
      screen.getAllByRole('button').map((chip) => chip.textContent),
    ).toEqual(['Sales only', 'Late']);
    unmount();

    const { container } = render(<List on={[]} />);
    expect(container.querySelector('.MuiChip-root')).toBeNull();
  });

  it('undoes what a chip narrowed, focus on the chip left, then the heading', () => {
    render(<List on={['Sales only', 'Late']} />);

    press('Late', 'Delete');
    expect(screen.getByText('on Sales only')).toBeInTheDocument();
    expect(chipOf('Sales only')).toHaveFocus();

    press('Sales only', 'Delete');
    expect(screen.getByText('on none')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
  });

  // #578: a keyboard removes it as a button is pressed, and its name says
  // that it removes, not only what it narrows.
  it('is removed by Enter and by Space too, its name saying so', () => {
    render(<List on={['Sales only', 'Late']} />);

    press('Late', 'Enter');
    expect(screen.getByText('on Sales only')).toBeInTheDocument();
    expect(chipOf('Sales only')).toHaveFocus();

    press('Sales only', ' ');
    expect(screen.getByText('on none')).toBeInTheDocument();
  });
});
