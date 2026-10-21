import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { AuthContext } from '../auth/auth-context';
import { server } from '../test/setup';
import { DeletionBanner } from './deletion-banner';

/**
 * The banner over a session the test changes as the server would: a keep's
 * refresh clears the day, and deleting again from Account sets one.
 */
function renderBanner(initial: string) {
  let setDue: (due: string | null) => void = () => undefined;

  function Session() {
    const [due, set] = useState<string | null>(initial);
    setDue = set;
    return (
      <AuthContext.Provider
        value={{
          session: {
            user: {
              id: 'user-1',
              email: 'owner@alpha.example.com',
              name: 'Owner',
              emailVerified: true,
              locale: null,
              deletionScheduledAt: due,
              deletionWithOrganization: null,
            },
            organization: null,
            permissions: [],
          },
          loading: false,
          error: null,
          refresh: () => {
            set(null);
            return Promise.resolve();
          },
        }}
      >
        <DeletionBanner />
      </AuthContext.Provider>
    );
  }

  render(<Session />);
  return { deleteAgain: (day: string) => act(() => setDue(day)) };
}

/** The account's own deletion (ADR-069), on every page until kept. */
describe('DeletionBanner', () => {
  it('says the account is kept, and takes the focus there', async () => {
    const cancelled: string[] = [];
    server.use(
      http.delete('/api/v1/account/deletion', () => {
        cancelled.push('account');
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderBanner('2026-11-20');

    expect(
      screen.getByText(/will be deleted after Nov 20, 2026/),
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole('button', { name: 'Keep my account' }),
    );

    expect(cancelled).toEqual(['account']);
    const kept = await screen.findByText('Your account will not be deleted.');
    expect(kept.closest('[role="status"]')).toHaveFocus();
  });

  it('gives way to a deletion asked for again, and says the next keep too', async () => {
    server.use(
      http.delete(
        '/api/v1/account/deletion',
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    const { deleteAgain } = renderBanner('2026-11-20');
    await userEvent.click(
      screen.getByRole('button', { name: 'Keep my account' }),
    );
    await screen.findByText('Your account will not be deleted.');

    deleteAgain('2026-11-21');

    expect(
      screen.getByText(/will be deleted after Nov 21, 2026/),
    ).toBeVisible();
    expect(
      screen.queryByText('Your account will not be deleted.'),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Keep my account' }),
    );
    const kept = await screen.findByText('Your account will not be deleted.');
    expect(kept.closest('[role="status"]')).toHaveFocus();
  });
});
