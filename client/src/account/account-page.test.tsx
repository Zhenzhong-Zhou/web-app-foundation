import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { AuditRecord, MemberAccess } from '../api/types.gen';
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

  it('shows your access here: the role, its line, what you can do and whom to ask (ADR-079)', async () => {
    const access: MemberAccess = {
      roles: [{ name: 'Viewer', description: null }],
      holdsEverything: false,
      whomToAsk: [{ id: 'user-mei', name: 'Mei Lin' }],
    };
    server.use(
      http.get('/api/v1/account/activity', () =>
        HttpResponse.json({ entries: [] }),
      ),
      http.get('/api/v1/account/details', () => HttpResponse.json({})),
      http.get('/api/v1/account/membership', () => HttpResponse.json(access)),
    );

    renderWithAuth(
      <MemoryRouter>
        <AccountPage />
      </MemoryRouter>,
      { permissions: ['users.view', 'organizations.view', 'orders.view'] },
    );

    const heading = await screen.findByRole('heading', {
      name: 'Your access at Alpha Co',
    });
    const block = heading.parentElement as HTMLElement;
    expect(await within(block).findByText('Viewer')).toBeInTheDocument();
    expect(
      within(block).getByText(
        'Looks at orders, stock and invoices, and changes nothing.',
      ),
    ).toBeInTheDocument();
    expect(
      within(block).getByRole('heading', { name: 'What you can do here' }),
    ).toBeInTheDocument();
    expect(
      within(block).getByText('See purchase and sales orders.'),
    ).toBeInTheDocument();
    expect(
      within(block).getByRole('link', { name: 'Mei Lin' }),
    ).toHaveAttribute('href', '/people/user-mei');
  });

  it('names whom to ask without a link for a role that may not open People', async () => {
    const access: MemberAccess = {
      roles: [{ name: 'Packer', description: 'Packs orders' }],
      holdsEverything: false,
      whomToAsk: [{ id: 'user-mei', name: 'Mei Lin' }],
    };
    server.use(
      http.get('/api/v1/account/activity', () =>
        HttpResponse.json({ entries: [] }),
      ),
      http.get('/api/v1/account/details', () => HttpResponse.json({})),
      http.get('/api/v1/account/membership', () => HttpResponse.json(access)),
    );

    renderWithAuth(
      <MemoryRouter>
        <AccountPage />
      </MemoryRouter>,
      { permissions: ['orders.view'] },
    );

    const heading = await screen.findByRole('heading', {
      name: 'Your access at Alpha Co',
    });
    const block = heading.parentElement as HTMLElement;
    expect(await within(block).findByText('Mei Lin')).toBeInTheDocument();
    expect(within(block).getByText(/^To do more, ask/)).toHaveTextContent(
      'To do more, ask Mei Lin.',
    );
    expect(within(block).queryByRole('link', { name: 'Mei Lin' })).toBeNull();
  });
});
