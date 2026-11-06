import { Chip, Stack } from '@mui/material';
import { fireEvent, render, screen } from '@testing-library/react';
import { startTransition, useState } from 'react';
import { describe, expect, it } from 'vitest';

import { useFocusAfterRemove } from './use-focus-after-remove';

/**
 * Chips removed as a list's are: the address that drops one is a router
 * update, drawn in a transition, and any other update is drawn before it,
 * here one made beside it, in the app the list's rows landing.
 */
function Chips({ labels }: { labels: string[] }) {
  const { row, removed } = useFocusAfterRemove();
  const [shown, setShown] = useState(labels);
  const [, setRows] = useState(0);

  return (
    <main>
      <h1>Orders</h1>
      {shown.length > 0 && (
        <Stack ref={row}>
          {shown.map((label) => (
            <Chip
              key={label}
              label={label}
              onDelete={(event) => {
                removed(event);
                startTransition(() =>
                  setShown((now) => now.filter((each) => each !== label)),
                );
                setRows((rows) => rows + 1);
              }}
            />
          ))}
        </Stack>
      )}
    </main>
  );
}

function pressDelete(name: string) {
  const chip = screen.getByRole('button', { name });
  chip.focus();
  fireEvent.keyUp(chip, { key: 'Delete' });
}

describe('useFocusAfterRemove', () => {
  it('waits for the chip to go, then focuses the one in its place', () => {
    render(<Chips labels={['Sales only', 'Still to ship', 'Late']} />);

    pressDelete('Late');

    expect(screen.queryByRole('button', { name: 'Late' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Still to ship' })).toHaveFocus();
  });

  it('waits for the last chip to go, then focuses the heading', () => {
    render(<Chips labels={['Sales only']} />);

    pressDelete('Sales only');

    expect(screen.queryByRole('button', { name: 'Sales only' })).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
  });
});
