import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UndoSnackbar } from './undo-snackbar';

/** A removal's message with its Undo, and a button elsewhere on the page. */
function Removed({ onClose }: { onClose: (reason: string) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Remove
      </button>
      <UndoSnackbar
        open={open}
        autoHideDuration={5000}
        onClose={(_event, reason) => onClose(reason)}
        message="Image removed"
        action={
          <button type="button" onClick={() => setOpen(false)}>
            Undo
          </button>
        }
      />
    </>
  );
}

const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

/** Undo's message waits while it is being used (WCAG 2.2.1). */
describe('UndoSnackbar', () => {
  // Moving on its own as well, as user-event's own waits need.
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('waits while focus is on Undo, though the pointer comes and goes', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup({
      advanceTimers: (ms) => vi.advanceTimersByTime(ms),
    });
    render(<Removed onClose={onClose} />);
    const message = screen.getByText('Image removed');

    await user.tab();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveFocus();
    await user.hover(message);
    await user.unhover(message);
    await wait(20_000);
    expect(onClose).not.toHaveBeenCalled();

    // Focus leaves too: its time runs again.
    await user.tab();
    await wait(5000);
    expect(onClose).toHaveBeenCalledWith('timeout');
  });

  it('waits while the pointer is on it, though focus comes and goes', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup({
      advanceTimers: (ms) => vi.advanceTimersByTime(ms),
    });
    render(<Removed onClose={onClose} />);
    const message = screen.getByText('Image removed');

    await user.hover(message);
    await user.tab();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveFocus();
    await user.tab();
    await wait(20_000);
    expect(onClose).not.toHaveBeenCalled();

    await user.unhover(message);
    await wait(5000);
    expect(onClose).toHaveBeenCalledWith('timeout');
  });

  it('runs its time again when shown after an Undo pressed under the pointer', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup({
      advanceTimers: (ms) => vi.advanceTimersByTime(ms),
    });
    render(<Removed onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await wait(1000);
    expect(screen.queryByText('Image removed')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await wait(5000);
    expect(onClose).toHaveBeenCalledWith('timeout');
  });
});
