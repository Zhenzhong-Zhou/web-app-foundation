import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { renderWithAuth } from '../test/render-with-auth';
import { SideNav } from './side-nav';

function renderNav(permissions: string[]) {
  renderWithAuth(
    <MemoryRouter>
      <SideNav />
    </MemoryRouter>,
    { permissions },
  );
}

describe('the menu', () => {
  it('offers Members and Roles beside each other to every member', () => {
    // The three every role holds (ADR-080).
    renderNav(['users.view', 'roles.view', 'organizations.view']);

    const settings = screen.getByRole('navigation', { name: 'Settings' });
    const links = [...settings.querySelectorAll('a')].map(
      (link) => link.textContent,
    );
    expect(links).toEqual(['Organization', 'Members', 'Roles']);
    expect(screen.getByRole('link', { name: 'Roles' })).toHaveAttribute(
      'href',
      '/settings/roles',
    );
  });

  it('leaves Members and Roles out with no organization, which grants nothing (#169)', () => {
    renderNav([]);

    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Members' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Roles' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Settings' }),
    ).not.toBeInTheDocument();
  });
});
