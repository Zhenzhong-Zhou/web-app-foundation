import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { OrganizationProfile } from '../api/types.gen';
import { renderWithAuth } from '../test/render-with-auth';
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
});
