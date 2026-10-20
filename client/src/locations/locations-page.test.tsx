import { screen } from '@testing-library/react';
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
