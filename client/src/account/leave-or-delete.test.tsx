import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { DeletionBanner } from './deletion-banner';
import { LeaveOrDelete } from './leave-or-delete';

/**
 * What e2e cannot reach cheaply (ADR-069): the refusals with their way
 * out, the password the deletion is confirmed with, and the banner.
 */
describe('LeaveOrDelete', () => {
  it('sends the password, and refreshes the session to show the banner', async () => {
    const sent: unknown[] = [];
    server.use(
      http.post('/api/v1/account/deletion', async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json({ deletionScheduledAt: '2026-11-13' });
      }),
    );
    const refresh = vi.fn(() => Promise.resolve());
    renderWithAuth(
      <MemoryRouter>
        <LeaveOrDelete />
      </MemoryRouter>,
      { refresh },
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Delete my account' }),
    );
    await userEvent.type(screen.getByLabelText(/Your password/), 'secret');
    const dialog = screen.getByRole('dialog');
    await userEvent.click(
      Array.from(dialog.querySelectorAll('button')).find(
        (button) => button.textContent === 'Delete my account',
      )!,
    );

    expect(sent).toEqual([{ password: 'secret' }]);
    expect(refresh).toHaveBeenCalled();
  });

  it('shows the refusal with the way past it, on Members', async () => {
    server.use(
      http.delete('/api/v1/account/membership', () =>
        HttpResponse.json(
          {
            statusCode: 409,
            code: 'last_owner_with_members',
            message:
              'You are the only Owner of Alpha Co. Make another member an Owner first.',
          },
          { status: 409 },
        ),
      ),
    );
    renderWithAuth(
      <MemoryRouter>
        <LeaveOrDelete />
      </MemoryRouter>,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Leave Alpha Co' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }));

    expect(
      await screen.findByText(/You are the only Owner of Alpha Co/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Members' })).toHaveAttribute(
      'href',
      '/members',
    );
  });

  it('offers no second deletion while one is pending', () => {
    renderWithAuth(
      <MemoryRouter>
        <LeaveOrDelete />
      </MemoryRouter>,
      { user: { deletionScheduledAt: '2026-11-13' } },
    );

    expect(
      screen.queryByRole('button', { name: 'Delete my account' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/will be deleted after Nov 13, 2026/),
    ).toBeInTheDocument();
  });
});

describe('DeletionBanner', () => {
  it('says nothing when no deletion is pending', () => {
    const { container } = renderWithAuth(<DeletionBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  /**
   * The day as it was sent, as the email names it (ADR-052, ADR-069): read
   * in the browser's zone, 13 Nov showed as 12 Nov west of UTC.
   */
  it('names the deletion day as it was sent', () => {
    renderWithAuth(<DeletionBanner />, {
      user: { deletionScheduledAt: '2026-11-13' },
    });

    expect(
      screen.getByText(/will be deleted after Nov 13, 2026/),
    ).toBeInTheDocument();
  });

  it('keeps the account when asked', async () => {
    let cancelled = false;
    server.use(
      http.delete('/api/v1/account/deletion', () => {
        cancelled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const refresh = vi.fn(() => Promise.resolve());
    renderWithAuth(<DeletionBanner />, {
      user: { deletionScheduledAt: '2026-11-13' },
      refresh,
    });

    await userEvent.click(
      screen.getByRole('button', { name: 'Keep my account' }),
    );

    expect(cancelled).toBe(true);
    expect(refresh).toHaveBeenCalled();
  });

  it('says so when the account could not be kept', async () => {
    server.use(
      http.delete('/api/v1/account/deletion', () => HttpResponse.error()),
    );
    const refresh = vi.fn(() => Promise.resolve());
    renderWithAuth(<DeletionBanner />, {
      user: { deletionScheduledAt: '2026-11-13' },
      refresh,
    });

    await userEvent.click(
      screen.getByRole('button', { name: 'Keep my account' }),
    );

    expect(
      await screen.findByText('Could not reach the server.'),
    ).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Keep my account' }),
    ).toBeEnabled();
  });
});
