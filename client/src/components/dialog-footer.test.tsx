import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DialogFooter } from './dialog-footer';

/** Inside a form, as 45 of the 46 dialogs render it. */
function renderInForm(props: Partial<Parameters<typeof DialogFooter>[0]> = {}) {
  const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
  const onCancel = vi.fn();

  render(
    <form onSubmit={onSubmit}>
      <DialogFooter
        submitting={false}
        onCancel={onCancel}
        label="Add location"
        pendingLabel="Adding…"
        {...props}
      />
    </form>,
  );

  return { onSubmit, onCancel };
}

describe('DialogFooter', () => {
  it('submits the form, and cancels without submitting', async () => {
    const { onSubmit, onCancel } = renderInForm();

    await userEvent.click(screen.getByRole('button', { name: 'Add location' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  /**
   * The request cannot be recalled once sent, so a Cancel that stayed live
   * would close the dialog while the save still landed. Nine of the footers
   * this replaced allowed exactly that.
   */
  it('says what it is doing and disables both buttons while it runs', () => {
    renderInForm({ submitting: true });

    expect(screen.getByRole('button', { name: 'Adding…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('holds the action back for the dialog’s own reason, not Cancel', () => {
    renderInForm({ disabled: true });

    expect(screen.getByRole('button', { name: 'Add location' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });

  it('confirms by click when there is no form behind it', async () => {
    const onConfirm = vi.fn();
    const { onSubmit } = renderInForm({
      label: 'Delete draft',
      pendingLabel: 'Deleting…',
      onConfirm,
    });

    await userEvent.click(screen.getByRole('button', { name: 'Delete draft' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    // A button inside a form defaults to submit; this one must not.
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('can name its Cancel for dialogs where Cancel is the action', () => {
    renderInForm({ label: 'Cancel run', cancelLabel: 'Keep it' });

    expect(screen.getByRole('button', { name: 'Keep it' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cancel run' })).toBeEnabled();
  });
});
