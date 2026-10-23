import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ToastProvider } from './toast-provider';
import { useToast } from './use-toast';

function Save() {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast('Order raised')}>
      Save
    </button>
  );
}

/**
 * A confirmation and what stays at the foot of the screen until closed, a
 * language that would not load (ADR-081), stacked: neither covers the
 * other, the confirmation above.
 */
describe('ToastProvider', () => {
  it('shows a confirmation above the foot, in the same place, never over it', async () => {
    render(
      <ToastProvider foot={<div role="note">Couldn’t load 简体中文</div>}>
        <Save />
      </ToastProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    const confirmation = await screen.findByRole('status');
    const foot = screen.getByRole('note');
    expect(confirmation).toHaveTextContent('Order raised');
    expect(foot).toBeVisible();
    const stack = foot.parentElement!;
    expect(stack).toContainElement(confirmation);
    expect(getComputedStyle(stack).position).toBe('fixed');
    expect(
      confirmation.compareDocumentPosition(foot) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
