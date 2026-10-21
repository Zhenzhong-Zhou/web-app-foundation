import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type {
  CataloguePermission,
  Permission,
  Role,
  RoleCatalogue,
  RoleDetail,
} from '../api/types.gen';
import { builtInRole } from '../test/factories';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { EditRolePage, NewRolePage } from './role-editor-page';

function permission(
  key: Permission,
  line: string,
  needs: Permission[] = [],
  over: Partial<CataloguePermission> = {},
): CataloguePermission {
  return {
    key,
    line,
    note: null,
    needs,
    offered: true,
    locked: false,
    ...over,
  };
}

/** Part of the server's catalogue, its lines and needs as it sends them. */
const CATALOGUE: RoleCatalogue = {
  permissions: [
    permission('users.view', 'See who works here', [], { locked: true }),
    permission('roles.view', 'See the roles and what they grant', [], {
      locked: true,
    }),
    permission('roles.create', 'Make a role', ['roles.view'], {
      offered: false,
    }),
    permission('organizations.view', 'See the organization’s settings', [], {
      locked: true,
    }),
    permission('products.view', 'See the product catalogue'),
    permission('locations.view', 'See warehouses, zones and bins'),
    permission('stock.view', 'See what is on hand and where'),
    permission('orders.view', 'See purchase and sales orders'),
    permission('orders.view_prices', 'See prices on orders', ['orders.view']),
    permission(
      'orders.receive',
      'Receive stock against an order',
      ['orders.view', 'locations.view'],
      { note: null },
    ),
    permission(
      'orders.update',
      'Edit, confirm or cancel an order',
      ['orders.view_prices', 'products.view'],
      { note: 'Also told when an order line closes short.' },
    ),
  ],
  templates: [
    {
      key: 'warehouse',
      name: 'Warehouse',
      permissions: [
        'users.view',
        'roles.view',
        'organizations.view',
        'stock.view',
        'locations.view',
        'orders.view',
        'orders.receive',
      ],
    },
  ],
};

const ROLES: Role[] = [builtInRole('Owner'), builtInRole('Viewer')];

const LEAD: RoleDetail = {
  id: 'role-lead',
  name: 'Warehouse lead',
  description: null,
  builtIn: false,
  permissions: ['users.view', 'roles.view', 'organizations.view'],
  holderCount: 0,
  mayGive: true,
  holders: [],
  updatedAt: '2026-10-21T09:00:00.000Z',
};

function renderEditor(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/settings/roles/new', element: <NewRolePage /> },
      { path: '/settings/roles/:id/edit', element: <EditRolePage /> },
      { path: '/settings/roles/:id', element: <p>The role’s page</p> },
    ],
    { initialEntries: [path] },
  );
  server.use(
    http.get('/api/v1/roles/catalogue', () => HttpResponse.json(CATALOGUE)),
    http.get('/api/v1/roles', () => HttpResponse.json(ROLES)),
    http.get('/api/v1/roles/role-lead', () => HttpResponse.json(LEAD)),
  );
  renderWithAuth(<RouterProvider router={router} />, {
    permissions: ['roles.view', 'roles.create', 'roles.update'],
  });
}

const box = (name: string) => screen.getByRole('checkbox', { name });

describe('the role editor', () => {
  it('starts from a template: its boxes ticked, its name offered, and the summary following', async () => {
    const user = userEvent.setup();
    renderEditor('/settings/roles/new');

    await user.click(await screen.findByRole('radio', { name: /Warehouse/ }));

    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue(
      'Warehouse',
    );
    expect(box('Receive stock against an order')).toBeChecked();
    expect(box('See prices on orders')).not.toBeChecked();
    const summary = screen.getByRole('complementary', {
      name: 'What Warehouse can do',
    });
    expect(within(summary).getByText('Orders')).toBeInTheDocument();
    expect(
      within(summary).getByText(/receive what was ordered/),
    ).toBeInTheDocument();
  });

  it('ticks what a box needs with it, and says so', async () => {
    const user = userEvent.setup();
    renderEditor('/settings/roles/new');

    // Orders opens on its heading; nothing there is ticked yet.
    await user.click(await screen.findByRole('button', { name: /^Orders/ }));
    await user.click(box('Receive stock against an order'));

    expect(box('See purchase and sales orders')).toBeChecked();
    expect(box('See warehouses, zones and bins')).toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Also ticked “See warehouses, zones and bins” and “See purchase and sales orders”, which “Receive stock against an order” needs.',
    );

    await user.click(box('See purchase and sales orders'));
    expect(box('Receive stock against an order')).not.toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Also unticked “Receive stock against an order”, which needs “See purchase and sales orders”.',
    );
  });

  it('keeps the three every role holds ticked and locked, and offers nothing Owners keep', async () => {
    const user = userEvent.setup();
    renderEditor('/settings/roles/new');

    await user.click(
      await screen.findByRole('button', {
        name: /^People and the organization/,
      }),
    );
    expect(box('See who works here')).toBeChecked();
    expect(box('See who works here')).toBeDisabled();
    expect(
      screen.queryByRole('checkbox', { name: 'Make a role' }),
    ).not.toBeInTheDocument();
  });

  it('marks the name when it cannot be used', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('/api/v1/roles', () =>
        HttpResponse.json(
          {
            message: 'There’s already a role called Sales.',
            code: 'role_name_unavailable',
          },
          { status: 409 },
        ),
      ),
    );
    renderEditor('/settings/roles/new');

    await user.type(
      await screen.findByRole('textbox', { name: 'Name' }),
      'Sales',
    );
    await user.click(screen.getByRole('button', { name: 'Save role' }));

    const name = screen.getByRole('textbox', { name: 'Name' });
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription(
      'There’s already a role called Sales.',
    );
  });

  it('refuses a save made after someone else’s, naming them, with Reload', async () => {
    const user = userEvent.setup();
    server.use(
      http.patch('/api/v1/roles/role-lead', () =>
        HttpResponse.json(
          {
            message:
              'Mei Lin saved Warehouse lead while you were editing it. Your changes weren’t saved. Reload to see theirs, then make yours again.',
            code: 'role_changed',
          },
          { status: 409 },
        ),
      ),
    );
    renderEditor('/settings/roles/role-lead/edit');

    const line = await screen.findByRole('textbox', {
      name: 'What it is for (optional)',
    });
    await user.type(line, 'Receives and ships');
    await user.click(screen.getByRole('button', { name: 'Save role' }));

    const dialog = await screen.findByRole('dialog', {
      name: 'Warehouse lead was changed',
    });
    expect(dialog).toHaveTextContent(/Mei Lin saved Warehouse lead/);
    await user.click(within(dialog).getByRole('button', { name: 'Reload' }));
    expect(
      await screen.findByRole('textbox', { name: 'What it is for (optional)' }),
    ).toHaveValue('');
  });
});
