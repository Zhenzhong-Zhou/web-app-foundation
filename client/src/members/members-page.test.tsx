import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { Member, Role } from '../api/types.gen';
import { builtInRole, roleRef } from '../test/factories';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { MembersPage } from './members-page';

/** Made here: sees stock. */
const STOCK: Role = {
  ...builtInRole('Viewer'),
  id: 'role-stock',
  name: 'Stock look-up',
  description: 'Finds stock.',
  builtIn: false,
  permissions: ['users.view', 'roles.view', 'organizations.view', 'stock.view'],
};

/** Made here, and beyond the reader: sees costs. */
const FINANCE: Role = {
  ...STOCK,
  id: 'role-finance',
  name: 'Finance',
  description: 'Costs and invoices.',
  permissions: ['users.view', 'roles.view', 'organizations.view', 'costs.view'],
  mayGive: false,
};

/** As an Admin reads them: Owner and Finance not theirs to give. */
const ROLES: Role[] = [
  builtInRole('Owner', { mayGive: false }),
  builtInRole('Viewer', {
    permissions: ['users.view', 'roles.view', 'organizations.view'],
  }),
  STOCK,
  FINANCE,
];

const SAM: Member = {
  id: 'user-2',
  email: 'sam@alpha.example.com',
  name: 'Sam',
  roles: [roleRef('Viewer')],
  active: 'today',
};

const MEI: Member = {
  id: 'user-3',
  email: 'mei@alpha.example.com',
  name: 'Mei Lin',
  roles: [{ id: 'role-finance', name: 'Finance', builtIn: false }],
  active: 'today',
};

const SELF: Member = {
  id: 'user-1',
  email: 'owner@alpha.example.com',
  name: 'Ana',
  roles: [roleRef('Viewer')],
  active: 'today',
};

describe('MembersPage', () => {
  function renderAs(permissions: string[], members = [SELF, SAM, MEI]) {
    server.use(
      http.get('/api/v1/users', () => HttpResponse.json(members)),
      http.get('/api/v1/roles', () => HttpResponse.json(ROLES)),
      // Read for whoever may invite (users.create).
      http.get('/api/v1/invitations', () => HttpResponse.json([])),
    );
    renderWithAuth(
      <MemoryRouter>
        <MembersPage />
      </MemoryRouter>,
      { permissions },
    );
  }

  async function menuOf(name: string) {
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: `More for ${name}` }),
    );
    return {
      user,
      menu: screen.getByRole('menu', { name: `More for ${name}` }),
    };
  }

  it('shows each member’s roles side by side, with no menu for someone who may change nothing', async () => {
    renderAs(
      ['users.view', 'roles.view'],
      [{ ...SAM, roles: [roleRef('Viewer'), STOCK] }],
    );

    const row = await screen.findByRole('row', { name: /Sam/ });
    expect(within(row).getByText('Viewer')).toBeVisible();
    expect(within(row).getByText('Stock look-up')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /^More for/ }),
    ).not.toBeInTheDocument();
  });

  it('offers Remove on others’ rows only, to someone who may remove members', async () => {
    renderAs(['users.view', 'roles.view', 'users.delete']);

    const { menu } = await menuOf('Sam');
    expect(
      within(menu).getByRole('menuitem', {
        name: 'Remove from the organization',
      }),
    ).toBeVisible();
    expect(
      within(menu).queryByRole('menuitem', { name: 'Change roles' }),
    ).not.toBeInTheDocument();
    // Leaving is Account's.
    expect(
      screen.queryByRole('button', { name: 'More for Ana' }),
    ).not.toBeInTheDocument();
  });

  it('changes roles with Owner standing alone, a role not the reader’s to give off with its reason, and what they could do following each tick', async () => {
    let body: unknown;
    server.use(
      http.patch('/api/v1/users/user-2', async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderAs(['users.view', 'roles.view', 'roles.assign']);

    const { user, menu } = await menuOf('Sam');
    await user.click(
      within(menu).getByRole('menuitem', { name: 'Change roles' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Change Sam’s roles',
    });

    expect(
      within(dialog).getByRole('checkbox', { name: 'Viewer' }),
    ).toBeChecked();
    const finance = within(dialog).getByRole('checkbox', { name: 'Finance' });
    expect(finance).toBeDisabled();
    expect(finance).toHaveAccessibleDescription(
      'Costs and invoices. Your roles don’t include everything Finance can do, so you can’t give it. An Owner can.',
    );
    expect(
      within(dialog).getByRole('checkbox', { name: 'Owner' }),
    ).toHaveAccessibleDescription(
      'An Owner holds no other role. Only an Owner can make someone an Owner.',
    );

    const summary = within(dialog).getByRole('region', {
      name: 'With these roles, Sam can',
    });
    expect(summary).not.toHaveTextContent('Stock and locations');
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Stock look-up' }),
    );
    expect(summary).toHaveTextContent(
      'Stock and locationsSee what is on hand and each lot’s history.',
    );

    // None ticked: nothing to save.
    await user.click(within(dialog).getByRole('checkbox', { name: 'Viewer' }));
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Stock look-up' }),
    );
    expect(
      within(dialog).getByRole('group', { name: 'Roles' }),
    ).toHaveAccessibleDescription('Choose at least one role.');
    expect(
      within(dialog).getByRole('button', { name: 'Save roles' }),
    ).toBeDisabled();

    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Stock look-up' }),
    );
    await user.click(within(dialog).getByRole('checkbox', { name: 'Viewer' }));
    await user.click(
      within(dialog).getByRole('button', { name: 'Save roles' }),
    );
    await waitFor(() =>
      expect(body).toEqual({ roleIds: ['role-stock', 'role-viewer'] }),
    );
  });

  it('ticks Owner alone, and says it holds everything', async () => {
    renderAs(['users.view', 'roles.view', 'roles.assign']);
    server.use(
      http.get('/api/v1/roles', () =>
        HttpResponse.json(ROLES.map((role) => ({ ...role, mayGive: true }))),
      ),
    );

    const { user, menu } = await menuOf('Sam');
    await user.click(
      within(menu).getByRole('menuitem', { name: 'Change roles' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Change Sam’s roles',
    });
    await user.click(within(dialog).getByRole('checkbox', { name: 'Owner' }));

    expect(
      within(dialog).getByRole('checkbox', { name: 'Owner' }),
    ).toBeChecked();
    expect(
      within(dialog).getByRole('checkbox', { name: 'Viewer' }),
    ).not.toBeChecked();
    expect(dialog).toHaveTextContent(
      'Everything, including settings and closing the organization.',
    );
  });

  it('says why a member whose roles go beyond the reader’s cannot be removed, before sending anything', async () => {
    renderAs(['users.view', 'roles.view', 'users.delete']);

    const { user, menu } = await menuOf('Mei Lin');
    await user.click(
      within(menu).getByRole('menuitem', {
        name: 'Remove from the organization',
      }),
    );

    const dialog = await screen.findByRole('dialog', {
      name: 'You can’t remove Mei Lin',
    });
    expect(dialog).toHaveTextContent(
      'Your roles don’t include everything Mei Lin’s roles can do, so you can’t change their roles or remove them. An Owner can.',
    );
  });

  it('removes a member after asking, then puts focus on the page’s heading', async () => {
    let removed = false;
    server.use(
      http.delete('/api/v1/users/user-2', () => {
        removed = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderAs(['users.view', 'roles.view', 'users.delete']);
    server.use(
      http.get('/api/v1/users', () =>
        HttpResponse.json(removed ? [SELF, MEI] : [SELF, SAM, MEI]),
      ),
    );

    const { user, menu } = await menuOf('Sam');
    await user.click(
      within(menu).getByRole('menuitem', {
        name: 'Remove from the organization',
      }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Remove Sam from Alpha Co?',
    });
    expect(dialog).toHaveTextContent(
      'Sam’s account stays theirs, and their work here keeps their name.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { level: 1, name: 'Members' }),
      ).toHaveFocus(),
    );
    expect(screen.queryByRole('row', { name: /^Sam/ })).not.toBeInTheDocument();
  });
});
