import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { localToday } from '../lib/expiry';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { OrganizationDeletionBanner } from './organization-deletion-banner';

/** A calendar day so many days from today, YYYY-MM-DD, by this clock. */
function inDays(days: number): string {
  const day = new Date();
  day.setDate(day.getDate() + days);
  return localToday(day);
}

const OWNER = ['organizations.delete', 'organizations.export'];

/**
 * The banner every member sees (ADR-070, amended): an Owner's with the
 * export and the cancel, hidden for today but not in the last 7 days nor
 * once under way, and one banner for the only member's two deletions.
 */
describe('OrganizationDeletionBanner', () => {
  beforeEach(() => localStorage.clear());

  it('shows nothing while no deletion is pending', () => {
    const { container } = renderWithAuth(<OrganizationDeletionBanner />, {
      permissions: OWNER,
    });
    expect(container).toBeEmptyDOMElement();
  });

  it('gives an Owner the export and the cancel, and hides for today', async () => {
    renderWithAuth(<OrganizationDeletionBanner />, {
      permissions: OWNER,
      organization: { deletionScheduledAt: inDays(30) },
    });

    expect(screen.getByText(/in 30 days/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Download everything' }),
    ).toHaveAttribute('href', '/api/v1/organization/export');
    expect(
      screen.getByRole('button', { name: 'Cancel deletion' }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Hide for today' }),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/will be deleted/)).not.toBeInTheDocument();
  });

  it('cannot be hidden in the last 7 days', () => {
    renderWithAuth(<OrganizationDeletionBanner />, {
      permissions: OWNER,
      // The server's word that the last week has begun, by its UTC day.
      organization: { deletionScheduledAt: inDays(7), deletionLastWeek: true },
    });

    expect(screen.getByText(/in 7 days/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Hide for today' }),
    ).not.toBeInTheDocument();
  });

  it('offers a member nothing to press but hiding it', () => {
    renderWithAuth(<OrganizationDeletionBanner />, {
      organization: { deletionScheduledAt: inDays(20) },
    });

    expect(screen.getByText(/as an Owner asked/)).toBeInTheDocument();
    expect(
      screen.getAllByRole('button').map((each) => each.textContent),
    ).toEqual(['']);
    expect(
      screen.getByRole('button', { name: 'Hide for today' }),
    ).toBeInTheDocument();
  });

  it('says it is under way, with nothing to press', () => {
    renderWithAuth(<OrganizationDeletionBanner />, {
      permissions: OWNER,
      organization: { deletionScheduledAt: inDays(-1), deletionUnderWay: true },
    });

    expect(screen.getByText(/is being deleted/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('is not the only member’s banner for a member deleting their own account the same day', () => {
    const day = inDays(30);
    renderWithAuth(<OrganizationDeletionBanner />, {
      user: { deletionScheduledAt: day },
      organization: { deletionScheduledAt: day },
    });

    expect(screen.getByText(/as an Owner asked/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Keep both' }),
    ).not.toBeInTheDocument();
  });

  it('keeps both for the only member, through the account', async () => {
    const day = inDays(30);
    const cancelled: string[] = [];
    server.use(
      http.delete('/api/v1/account/deletion', () => {
        cancelled.push('account');
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithAuth(<OrganizationDeletionBanner />, {
      permissions: OWNER,
      user: { deletionScheduledAt: day },
      organization: { deletionScheduledAt: day, deletionWithAccount: true },
    });

    expect(
      screen.getByText(/Your account and Alpha Co will be deleted/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Keep both' }));
    expect(cancelled).toEqual(['account']);
  });
});
