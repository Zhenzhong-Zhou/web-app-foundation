import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { Location } from '../api/types.gen';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { LocationsPage } from './locations-page';

const SITE: Location = {
  id: 'loc-site',
  type: 'site',
  name: 'Richmond',
  code: 'RICH',
  parentId: null,
  isAvailable: true,
  isActive: true,
  address: null,
};

describe('LocationsPage', () => {
  function renderAs(permissions: string[]) {
    server.use(http.get('/api/v1/locations', () => HttpResponse.json([SITE])));
    renderWithAuth(
      <MemoryRouter>
        <LocationsPage />
      </MemoryRouter>,
      { permissions },
    );
  }

  // Add inside makes a location, which the server allows on
  // locations.create alone.
  it('offers Add inside to someone who may add locations, not only change them', async () => {
    renderAs(['locations.view', 'locations.create']);

    expect(
      await screen.findByRole('button', { name: 'Add inside' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Edit' }),
    ).not.toBeInTheDocument();
  });

  // Its stock moves to another location: none can be added inside one
  // that holds stock (#148).
  it('says, adding inside a location, that its stock moves elsewhere first', async () => {
    renderAs(['locations.view', 'locations.create']);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Add inside' }));

    expect(
      await screen.findByRole('dialog', { name: 'Add inside Richmond' }),
    ).toHaveTextContent(
      'Richmond will stop holding stock directly. Anything already there has to move to another location first.',
    );
  });

  it('keeps Add inside from someone who may only change locations', async () => {
    renderAs(['locations.view', 'locations.update']);

    expect(
      await screen.findByRole('button', { name: 'Edit' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add inside' }),
    ).not.toBeInTheDocument();
  });
});
