import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { DeletionBanner } from './deletion-banner';

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
    renderWithAuth(<DeletionBanner />, {
      user: {
        deletionScheduledAt: '2026-11-20',
        deletionWithOrganization: null,
      },
    });

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
});
