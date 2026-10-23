import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { renderWithChangingAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { DeletionBanner } from './deletion-banner';

/**
 * The banner over a session that changes as the server's does: a keep's
 * refresh clears the day, and deleting again from Account sets one.
 */
function renderBanner(day: string) {
  const due = (deletionScheduledAt: string | null) => ({
    user: { deletionScheduledAt, deletionWithOrganization: null },
  });
  const { change } = renderWithChangingAuth(
    <DeletionBanner />,
    due(day),
    due(null),
  );
  return { deleteAgain: (again: string) => change(due(again)) };
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

    await waitFor(() => expect(cancelled).toEqual(['account']));
    const kept = await screen.findByText('Your account will not be deleted.');
    // Given in an effect once the line is drawn (#210).
    await waitFor(() => expect(kept.closest('[role="status"]')).toHaveFocus());
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
    await waitFor(() => expect(kept.closest('[role="status"]')).toHaveFocus());
  });
});
