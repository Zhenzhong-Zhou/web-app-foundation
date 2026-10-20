import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { Member, Role } from '../api/types.gen';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { MembersPage } from './members-page';

const ROLES: Role[] = [
  { id: 'role-owner', name: 'Owner' },
  { id: 'role-viewer', name: 'Viewer' },
];

const SAM: Member = {
  id: 'user-2',
  email: 'sam@alpha.example.com',
  name: 'Sam',
  roleId: 'role-viewer',
  active: 'today',
};

describe('MembersPage', () => {
  function renderAs(permissions: string[]) {
    server.use(
      http.get('/api/v1/users', () => HttpResponse.json([SAM])),
      http.get('/api/v1/roles', () => HttpResponse.json(ROLES)),
    );
    renderWithAuth(
      <MemoryRouter>
        <MembersPage />
      </MemoryRouter>,
      { permissions },
    );
  }

  // The server checks roles.assign (ADR-079), so editing members' details
  // alone does not offer a role.
  it('offers a role to choose only to someone who may change roles', async () => {
    renderAs(['users.view', 'roles.view', 'roles.assign']);

    expect(
      await screen.findByRole('combobox', { name: 'Role of Sam' }),
    ).toBeInTheDocument();
  });

  it('shows the role as words to someone who may only edit members', async () => {
    renderAs(['users.view', 'roles.view', 'users.update']);

    expect(await screen.findByText('Viewer')).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'Role of Sam' }),
    ).not.toBeInTheDocument();
  });
});
