import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { AuditRecord } from '../audit/audit-format';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { AccountPage } from './account-page';

const EXPORTED: AuditRecord = {
  id: 'entry-1',
  action: 'organization.exported',
  actionName: 'Everything downloaded',
  resourceType: 'organization',
  resourceTypeName: 'Organization',
  resourceId: 'org-1',
  resourceLabel: null,
  payload: null,
  details: [],
  actorId: 'user-1',
  actorEmail: 'owner@alpha.example.com',
  actorName: 'Owner',
  actorPhotoFileId: null,
  ip: null,
  userAgent: null,
  createdAt: new Date().toISOString(),
};

describe('AccountPage', () => {
  it('reads the recent work again once closing the organization from it ends (#122)', async () => {
    let reads = 0;
    server.use(
      http.get('/api/v1/account/activity', () => {
        reads += 1;
        return HttpResponse.json({ entries: reads === 1 ? [] : [EXPORTED] });
      }),
      http.get('/api/v1/account/details', () => HttpResponse.json({})),
      // The only member, so Delete my account closes the organization too.
      http.get('/api/v1/users', () => HttpResponse.json([{ id: 'user-1' }])),
      http.get('/api/v1/organization', () =>
        HttpResponse.json({
          organization: { name: 'Alpha Co', lastExport: null },
        }),
      ),
    );

    renderWithAuth(
      <MemoryRouter>
        <AccountPage />
      </MemoryRouter>,
      { permissions: ['users.view'] },
    );

    expect(await screen.findByText('Nothing yet.')).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Delete my account' }),
    );
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );

    expect(
      await screen.findByText('Everything downloaded'),
    ).toBeInTheDocument();
    expect(reads).toBe(2);
  });
});
