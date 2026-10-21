import { Dialog, DialogTitle } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import {
  render,
  screen,
  waitForElementToBeRemoved,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';

import { themeFor } from '../theme';
import { openDialog } from './open-dialog';

/** The app's theme, which puts the hand-back on every dialog. */
function Themed({ children }: { children: ReactNode }) {
  return <ThemeProvider theme={themeFor('en')}>{children}</ThemeProvider>;
}

/** A button that opens a dialog, which opens another from inside it. */
function Page() {
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);

  return (
    <>
      <button type="button" onClick={openDialog(() => setOpen(true))}>
        Edit
      </button>
      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogTitle>Edit</DialogTitle>
        <button type="button" onClick={openDialog(() => setMore(true))}>
          More
        </button>
        <button type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </Dialog>
      <Dialog open={more} onClose={() => setMore(false)}>
        <DialogTitle>More</DialogTitle>
        <button type="button" onClick={() => setMore(false)}>
          Back
        </button>
      </Dialog>
    </>
  );
}

/** A dialog whose action is followed by the page moving focus to its result. */
function Deleting() {
  const [open, setOpen] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const status = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (deleted) status.current?.focus();
  }, [deleted]);

  return (
    <>
      <button type="button" onClick={openDialog(() => setOpen(true))}>
        Delete
      </button>
      {deleted && (
        <div ref={status} tabIndex={-1} role="status">
          Deleted
        </div>
      )}
      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogTitle>Delete?</DialogTitle>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setDeleted(true);
          }}
        >
          Confirm
        </button>
      </Dialog>
    </>
  );
}

async function closed(name: string) {
  await waitForElementToBeRemoved(() => screen.queryByRole('dialog', { name }));
}

describe('openDialog', () => {
  it('gives focus back to its button once the dialog is cancelled', async () => {
    render(<Page />, { wrapper: Themed });
    const edit = screen.getByRole('button', { name: 'Edit' });

    await userEvent.click(edit);
    expect(screen.getByRole('dialog', { name: 'Edit' })).toHaveFocus();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await closed('Edit');
    expect(edit).toHaveFocus();
  });

  it('gives focus back once the dialog is closed by Escape', async () => {
    render(<Page />, { wrapper: Themed });
    const edit = screen.getByRole('button', { name: 'Edit' });

    await userEvent.click(edit);
    await userEvent.keyboard('{Escape}');
    await closed('Edit');
    expect(edit).toHaveFocus();
  });

  it('gives each dialog its own button back, one opened from another', async () => {
    render(<Page />, { wrapper: Themed });

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const more = screen.getByRole('button', { name: 'More' });
    await userEvent.click(more);
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await closed('More');
    expect(more).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    await closed('Edit');
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveFocus();
  });

  it('leaves focus where the page put it once the dialog had closed', async () => {
    render(<Deleting />, { wrapper: Themed });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await closed('Delete?');
    expect(screen.getByRole('status')).toHaveFocus();
  });
});
