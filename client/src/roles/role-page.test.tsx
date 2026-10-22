import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { Role, RoleDetail, RoleHolder } from '../api/types.gen';
import { builtInRole } from '../test/factories';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { RolePage } from './role-page';

const PAT: RoleHolder = {
  id: 'user-pat',
  name: 'Pat Kim',
  email: 'pat@alpha.example.com',
  photoFileId: null,
  roles: [{ id: 'role-dock', name: 'Dock crew', builtIn: false }],
};

/** A made role, by default just made: nobody holds it yet. */
function dock(over: Partial<RoleDetail> = {}): RoleDetail {
  return {
    id: 'role-dock',
    name: 'Dock crew',
    description: null,
    builtIn: false,
    permissions: ['users.view', 'roles.view', 'organizations.view'],
    holderCount: 0,
    mayGive: true,
    holders: [],
    updatedAt: '2026-10-21T18:00:00.000Z',
    ...over,
  };
}

/** As GET /roles lists them for the reader. */
const LISTED: Role[] = [
  builtInRole('Owner', { mayGive: false }),
  builtInRole('Viewer'),
  { ...dock(), permissions: [], holderCount: 0 },
];

function renderAs(
  permissions: string[],
  role: RoleDetail = dock(),
  roles: Role[] = LISTED,
) {
  server.use(
    http.get(`/api/v1/roles/${role.id}`, () => HttpResponse.json(role)),
    http.get('/api/v1/roles/catalogue', () =>
      HttpResponse.json({ permissions: [], templates: [] }),
    ),
    http.get('/api/v1/roles', () => HttpResponse.json(roles)),
  );
  renderWithAuth(
    <MemoryRouter initialEntries={[`/settings/roles/${role.id}`]}>
      <Routes>
        <Route path="/settings/roles/:id" element={<RolePage />} />
      </Routes>
    </MemoryRouter>,
    { permissions },
  );
}

describe('a role’s page', () => {
  it('held by nobody, says where to give it to whoever may', async () => {
    renderAs(['roles.view', 'roles.assign']);

    expect(await screen.findByText(/Nobody holds Dock crew\./)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Members' })).toHaveAttribute(
      'href',
      '/members',
    );
  });

  it('says only that to whoever may not give it', async () => {
    renderAs(['roles.view', 'roles.assign'], dock({ mayGive: false }));

    expect(await screen.findByText('Nobody holds Dock crew.')).toBeVisible();
    expect(
      screen.queryByRole('link', { name: 'Members' }),
    ).not.toBeInTheDocument();
  });

  it('says only that to whoever may not change roles', async () => {
    renderAs(['roles.view']);

    expect(await screen.findByText('Nobody holds Dock crew.')).toBeVisible();
    expect(
      screen.queryByRole('link', { name: 'Members' }),
    ).not.toBeInTheDocument();
  });

  it('offers Move everyone only on a role held, that the reader may give', async () => {
    const held = { holderCount: 1, holders: [PAT] };
    renderAs(['roles.view', 'roles.assign'], dock({ ...held, mayGive: false }));
    await screen.findByRole('heading', { level: 1, name: 'Dock crew' });
    expect(
      screen.queryByRole('button', { name: 'Move everyone to…' }),
    ).not.toBeInTheDocument();
  });

  it('moves to the roles the reader may give, and says the rest aren’t offered', async () => {
    const user = userEvent.setup();
    renderAs(
      ['roles.view', 'roles.assign'],
      dock({ holderCount: 1, holders: [PAT] }),
    );

    await user.click(
      await screen.findByRole('button', { name: 'Move everyone to…' }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Move everyone from Dock crew',
    });
    expect(
      within(dialog).getByText(/Roles that can do more than yours/),
    ).toBeVisible();
    await user.click(within(dialog).getByRole('combobox'));
    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual(['Viewer']);
  });

  it('keeps a built-in role as it is: no Edit or Delete, and a copy for whoever may make one', async () => {
    const viewer = dock({
      id: 'role-viewer',
      name: 'Viewer',
      builtIn: true,
    });
    renderAs(
      ['roles.view', 'roles.create', 'roles.update', 'roles.delete'],
      viewer,
    );

    await screen.findByRole('heading', { level: 1, name: 'Viewer' });
    expect(screen.getByRole('link', { name: 'Make a copy' })).toBeVisible();
    expect(
      screen.queryByRole('link', { name: 'Edit' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Delete' }),
    ).not.toBeInTheDocument();
  });

  it('reads a role again when it was given since the page was read, and offers Move everyone', async () => {
    const user = userEvent.setup();
    renderAs(['roles.view', 'roles.assign', 'roles.delete']);
    await screen.findByText(/Nobody holds Dock crew\./);

    // Pat was given it in another tab.
    server.use(
      http.get('/api/v1/roles/role-dock', () =>
        HttpResponse.json(dock({ holderCount: 1, holders: [PAT] })),
      ),
      http.delete('/api/v1/roles/role-dock', () =>
        HttpResponse.json(
          {
            statusCode: 409,
            code: 'role_held',
            message:
              '1 member holds Dock crew. Move them to another role first.',
          },
          { status: 409 },
        ),
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete Dock crew?' });
    await user.click(
      within(dialog).getByRole('button', { name: 'Delete role' }),
    );

    expect(
      await within(dialog).findByText(
        'Pat Kim holds Dock crew. Move them to another role first.',
      ),
    ).toBeVisible();
    expect(
      within(dialog).getByRole('button', { name: 'Move everyone to…' }),
    ).toBeVisible();
  });
});
