import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { Role } from '../api/types.gen';
import { builtInRole } from '../test/factories';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { RolesPage } from './roles-page';

/** As the server lists them: the built-in three first, in its order. */
const ROLES: Role[] = [
  builtInRole('Owner', {
    description: 'Everything, including closing the organization.',
    holderCount: 2,
  }),
  builtInRole('Admin', { holderCount: 1 }),
  builtInRole('Viewer', { holderCount: 0 }),
  {
    id: 'role-lead',
    name: 'Warehouse lead',
    description: 'Receives and ships, and keeps the shelves straight.',
    builtIn: false,
    permissions: ['users.view', 'roles.view', 'organizations.view'],
    holderCount: 1,
    mayGive: true,
  },
];

function renderAs(permissions: string[], roles = ROLES) {
  server.use(http.get('/api/v1/roles', () => HttpResponse.json(roles)));
  renderWithAuth(
    <MemoryRouter>
      <RolesPage />
    </MemoryRouter>,
    { permissions },
  );
}

describe('Settings → Roles', () => {
  it('lists the built-in three first, then those made here, each with how many hold it', async () => {
    renderAs(['roles.view']);

    const builtIn = await screen.findByRole('table', { name: /Built in/ });
    const made = screen.getByRole('table', { name: /Made here/ });
    expect(
      builtIn.compareDocumentPosition(made) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const owner = within(builtIn).getByRole('row', { name: /Owner/ });
    expect(within(owner).getByText('2 members')).toBeInTheDocument();
    expect(
      within(owner).getByText(
        'Everything, including closing the organization.',
      ),
    ).toBeInTheDocument();
    expect(
      within(builtIn).getByRole('row', { name: /Viewer/ }),
    ).toHaveTextContent('Nobody');

    const lead = within(made).getByRole('row', { name: /Warehouse lead/ });
    expect(
      within(lead).getByRole('link', { name: 'Warehouse lead' }),
    ).toHaveAttribute('href', '/settings/roles/role-lead');
    expect(within(lead).getByText('1 member')).toBeInTheDocument();
  });

  it('offers Make a role only to whoever may make one', async () => {
    renderAs(['roles.view']);
    await screen.findByRole('table', { name: /Built in/ });
    expect(
      screen.queryByRole('link', { name: 'Make a role' }),
    ).not.toBeInTheDocument();
  });

  it('opens the editor from Make a role for an Owner', async () => {
    renderAs(['roles.view', 'roles.create']);
    expect(
      await screen.findByRole('link', { name: 'Make a role' }),
    ).toHaveAttribute('href', '/settings/roles/new');
  });

  it('says so when none has been made here yet', async () => {
    renderAs(['roles.view'], ROLES.slice(0, 3));
    expect(await screen.findByText(/None made here yet/)).toBeInTheDocument();
  });
});
