import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import type { OrganizationProfile } from '../api/types.gen';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { ClosingSections } from './closing-sections';

/** The organization as its read returns it, with only what the section reads. */
function organizationWith(
  lastExport: OrganizationProfile['lastExport'],
): OrganizationProfile {
  return { name: 'Alpha Co', lastExport } as OrganizationProfile;
}

/**
 * The Profile's Download everything (ADR-070): who took the last export,
 * as the dialog says it.
 */
describe('ClosingSections', () => {
  it('says you took the last export, by id', () => {
    renderWithAuth(
      <ClosingSections
        organization={organizationWith({
          exportedAt: '2026-10-15T14:02:00Z',
          exportedBy: 'Owner',
          exportedById: 'user-1',
          fresh: true,
        })}
        onChanged={() => undefined}
      />,
      { permissions: ['organizations.export'] },
    );
    expect(screen.getByText(/^Last downloaded .* by you$/)).toBeInTheDocument();
  });

  it('names a colleague of the same name, rather than you', () => {
    renderWithAuth(
      <ClosingSections
        organization={organizationWith({
          exportedAt: '2026-10-15T14:02:00Z',
          exportedBy: 'Owner',
          exportedById: 'user-2',
          fresh: true,
        })}
        onChanged={() => undefined}
      />,
      { permissions: ['organizations.export'] },
    );
    expect(
      screen.getByText(/^Last downloaded .* by Owner$/),
    ).toBeInTheDocument();
  });

  it('shows nothing to anyone but an Owner', () => {
    const { container } = renderWithAuth(
      <ClosingSections
        organization={organizationWith(null)}
        onChanged={() => undefined}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('offers Cancel deletion while scheduled, and nothing once under way', async () => {
    const cancelled: string[] = [];
    server.use(
      http.delete('/api/v1/organization/deletion', () => {
        cancelled.push('organization');
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { unmount } = renderWithAuth(
      <ClosingSections
        organization={organizationWith(null)}
        onChanged={() => undefined}
      />,
      {
        permissions: ['organizations.delete'],
        organization: { deletionScheduledAt: '2026-11-14' },
      },
    );
    expect(
      screen.getByText(/Scheduled to be deleted after/),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Cancel deletion' }),
    );
    expect(cancelled).toEqual(['organization']);
    unmount();

    renderWithAuth(
      <ClosingSections
        organization={organizationWith(null)}
        onChanged={() => undefined}
      />,
      {
        permissions: ['organizations.delete'],
        organization: {
          deletionScheduledAt: '2026-01-01',
          deletionStage: 'underWay',
        },
      },
    );
    expect(screen.getByText(/can no longer be cancelled/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Cancel deletion' }),
    ).not.toBeInTheDocument();
  });

  it('says it is downloading until the export is recorded', async () => {
    renderWithAuth(
      <ClosingSections
        organization={organizationWith(null)}
        onChanged={() => undefined}
      />,
      { permissions: ['organizations.export'] },
    );
    const link = screen.getByRole('link', {
      name: 'Download everything (ZIP)',
    });
    // A plain link to a file: jsdom would try to navigate.
    link.addEventListener('click', (event) => event.preventDefault());

    await userEvent.click(link);

    expect(screen.getByText(/^Downloading…/)).toBeInTheDocument();
    expect(screen.queryByText('Not downloaded yet')).not.toBeInTheDocument();
  });
});
