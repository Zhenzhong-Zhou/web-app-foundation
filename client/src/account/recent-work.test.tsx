import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { AuditRecord } from '../audit/audit-format';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { RecentWork } from './recent-work';

const EXPORTED: AuditRecord = {
  id: 'entry-1',
  action: 'organization.exported',
  resourceType: 'organization',
  resourceId: 'org-1',
  resourceLabel: null,
  payload: null,
  actorId: 'user-1',
  actorEmail: 'owner@alpha.example.com',
  actorName: 'Owner',
  actorPhotoFileId: null,
  ip: null,
  userAgent: null,
  createdAt: new Date().toISOString(),
};

/** What the Account page does: a counter the section below bumps. */
function Page() {
  const [changes, setChanges] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setChanges((count) => count + 1)}>
        A dialog closed
      </button>
      <RecentWork readAgain={changes} />
    </>
  );
}

describe('RecentWork', () => {
  it('reads the list again when the page says something changed (#122)', async () => {
    let reads = 0;
    server.use(
      http.get('/api/v1/account/activity', () => {
        reads += 1;
        return HttpResponse.json({ entries: reads === 1 ? [] : [EXPORTED] });
      }),
    );

    renderWithAuth(
      <MemoryRouter>
        <Page />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Nothing yet.')).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'A dialog closed' }),
    );

    expect(
      await screen.findByText('Everything downloaded'),
    ).toBeInTheDocument();
    expect(reads).toBe(2);
  });
});
