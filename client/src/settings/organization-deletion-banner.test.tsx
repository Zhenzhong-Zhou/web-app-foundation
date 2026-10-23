import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { localToday } from '../lib/expiry';
import { setOrganizationTimeZone } from '../lib/time-zone';
import {
  renderWithAuth,
  renderWithChangingAuth,
} from '../test/render-with-auth';
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
    ).toHaveAttribute('href', '/api/v1/organization/export?locale=en');
    expect(
      screen.getByRole('button', { name: 'Cancel deletion' }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Hide for today' }),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/will be deleted/)).not.toBeInTheDocument();
  });

  it("counts down from the reader's own day, not the organization's (ADR-072)", () => {
    // 8:28 am on Saturday 17 October here in Tokyo; still Friday afternoon
    // in Vancouver, where the organization is.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-16T23:28:00.000Z'));
    setOrganizationTimeZone('America/Vancouver');
    try {
      renderWithAuth(<OrganizationDeletionBanner />, {
        permissions: OWNER,
        organization: { deletionScheduledAt: '2026-11-16' },
      });

      // 30 days from Tokyo's 17 October; Vancouver's 16th would say 31.
      expect(screen.getByText(/in 30 days/)).toBeInTheDocument();
    } finally {
      setOrganizationTimeZone(null);
      vi.useRealTimers();
    }
  });

  it('cannot be hidden in the last 7 days', () => {
    renderWithAuth(<OrganizationDeletionBanner />, {
      permissions: OWNER,
      // The server's word that the last week has begun, by its UTC day.
      organization: {
        deletionScheduledAt: inDays(7),
        deletionStage: 'lastWeek',
      },
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
      organization: {
        deletionScheduledAt: inDays(-1),
        deletionStage: 'underWay',
      },
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
    renderWithChangingAuth(
      <OrganizationDeletionBanner />,
      {
        permissions: OWNER,
        user: {
          deletionScheduledAt: day,
          deletionWithOrganization: { id: 'org-1', name: 'Alpha Co' },
        },
        organization: { deletionScheduledAt: day },
      },
      // As the server says once both are kept.
      { permissions: OWNER },
    );

    expect(
      screen.getByText(/Your account and Alpha Co will be deleted/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Keep both' }));
    await waitFor(() => expect(cancelled).toEqual(['account']));
    // It says what it kept, and takes the focus there.
    const kept = await screen.findByText('Your account and Alpha Co are kept.');
    expect(kept).toBeInTheDocument();
    // Given in an effect once the line is drawn (#210).
    await waitFor(() => expect(kept.closest('[role="status"]')).toHaveFocus());
  });

  it('cancels for an Owner, through the organization', async () => {
    const cancelled: string[] = [];
    server.use(
      http.delete('/api/v1/organization/deletion', () => {
        cancelled.push('organization');
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithAuth(<OrganizationDeletionBanner />, {
      permissions: OWNER,
      organization: { deletionScheduledAt: inDays(30) },
    });

    await userEvent.click(
      screen.getByRole('button', { name: 'Cancel deletion' }),
    );
    await waitFor(() => expect(cancelled).toEqual(['organization']));
  });

  it('gives way to a closing asked for again, after a cancel', async () => {
    server.use(
      http.delete(
        '/api/v1/organization/deletion',
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    const { change } = renderWithChangingAuth(
      <OrganizationDeletionBanner />,
      { permissions: OWNER, organization: { deletionScheduledAt: inDays(30) } },
      { permissions: OWNER },
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Cancel deletion' }),
    );
    expect(
      await screen.findByText('Alpha Co will not be deleted.'),
    ).toBeVisible();

    // Scheduled again from Profile, as MC-2404 does after MC-2403.
    change({
      permissions: OWNER,
      organization: { deletionScheduledAt: inDays(30) },
    });

    expect(
      screen.getByRole('button', { name: 'Cancel deletion' }),
    ).toBeVisible();
    expect(
      screen.queryByText('Alpha Co will not be deleted.'),
    ).not.toBeInTheDocument();
  });

  it('comes back the day after it was hidden', () => {
    const day = inDays(30);
    localStorage.setItem(
      'waf.hiddenDeletionBanner',
      JSON.stringify({ organizationId: 'org-1', day, on: inDays(-1) }),
    );
    renderWithAuth(<OrganizationDeletionBanner />, {
      organization: { deletionScheduledAt: day },
    });

    expect(screen.getByText(/as an Owner asked/)).toBeInTheDocument();
  });
});
