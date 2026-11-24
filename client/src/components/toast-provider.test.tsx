import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { themeFor } from '../theme';
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

  // 55a: a confirmation may carry one button, "Open the order", which
  // does what its caller says and closes it.
  it('carries a button after its message that does what its caller says', async () => {
    let opened = 0;
    function Receive() {
      const toast = useToast();
      return (
        <button
          type="button"
          onClick={() =>
            toast('Received 20 each of FOCUS on PO-000009', {
              label: 'Open the order',
              onClick: () => {
                opened += 1;
              },
            })
          }
        >
          Receive
        </button>
      );
    }
    render(
      <ToastProvider>
        <Receive />
      </ToastProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Receive' }));
    const confirmation = await screen.findByRole('status');
    expect(confirmation).toHaveTextContent(
      'Received 20 each of FOCUS on PO-000009',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Open the order' }),
    );
    expect(opened).toBe(1);
  });

  // The app's buttons are contained: on the filled message that read white
  // on grey, 1.3:1 (review 2). Its own are text, in the message's colour.
  it('draws its buttons as text, not the app’s contained grey', async () => {
    function Copy() {
      const toast = useToast();
      return (
        <button
          type="button"
          onClick={() =>
            toast('Received 5 each of K2-60CT, new lot L-2026-11-23-1', {
              label: 'Copy code',
              onClick: () => undefined,
            })
          }
        >
          Receive
        </button>
      );
    }
    render(
      <ThemeProvider theme={themeFor('en')}>
        <ToastProvider>
          <Copy />
        </ToastProvider>
      </ThemeProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Receive' }));
    const copy = await screen.findByRole('button', { name: 'Copy code' });
    expect(copy).toHaveClass('MuiButton-text');
    expect(copy).not.toHaveClass('MuiButton-contained');
  });

  // ADR-094, E3: a lot made at receipt offers Copy code and Open the lot.
  it('carries several buttons in the order given, each doing what its caller says', async () => {
    const pressed: string[] = [];
    function Receive() {
      const toast = useToast();
      return (
        <button
          type="button"
          onClick={() =>
            toast('Received 5 each of FOCUS, new lot L-2026-11-22-1.', [
              { label: 'Copy code', onClick: () => pressed.push('copy') },
              { label: 'Open the lot', onClick: () => pressed.push('open') },
            ])
          }
        >
          Receive
        </button>
      );
    }
    render(
      <ToastProvider>
        <Receive />
      </ToastProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Receive' }));
    const message = await screen.findByRole('status');
    const buttons = [
      screen.getByRole('button', { name: 'Copy code' }),
      screen.getByRole('button', { name: 'Open the lot' }),
    ];
    expect(message).toContainElement(buttons[0]);
    expect(
      buttons[0].compareDocumentPosition(buttons[1]) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await userEvent.click(buttons[1]);
    expect(pressed).toEqual(['open']);
  });
});
