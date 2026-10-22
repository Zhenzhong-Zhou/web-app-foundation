import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { RoleDetail } from '../api/types.gen';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { RolePage } from './role-page';

/** A role just made: nobody holds it yet. */
function dock(mayGive: boolean): RoleDetail {
  return {
    id: 'role-dock',
    name: 'Dock crew',
    description: null,
    builtIn: false,
    permissions: ['users.view', 'roles.view', 'organizations.view'],
    holderCount: 0,
    mayGive,
    holders: [],
    updatedAt: '2026-10-21T18:00:00.000Z',
  };
}

function renderAs(permissions: string[], mayGive = true) {
  server.use(
    http.get('/api/v1/roles/role-dock', () => HttpResponse.json(dock(mayGive))),
    http.get('/api/v1/roles/catalogue', () =>
      HttpResponse.json({ permissions: [], templates: [] }),
    ),
    http.get('/api/v1/roles', () => HttpResponse.json([])),
  );
  renderWithAuth(
    <MemoryRouter initialEntries={['/settings/roles/role-dock']}>
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
    renderAs(['roles.view', 'roles.assign'], false);

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
});
