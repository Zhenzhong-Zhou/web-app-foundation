import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import {
  Link,
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { OFFER_BACK } from '../lib/offer-back';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { ProductionOrdersPage } from './production-orders-page';

describe('ProductionOrdersPage', () => {
  // Home's Plan a run opens the dialog, not only the list (#502).
  it('opens Plan a run from ?plan; closing keeps the list, Back returns Home', async () => {
    server.use(
      http.get('/api/v1/production-orders', () =>
        HttpResponse.json({ entries: [], nextCursor: null }),
      ),
    );
    function Address() {
      const { search } = useLocation();
      return <output aria-label="address">{search}</output>;
    }
    renderWithAuth(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={
              <Link to="/production?plan" state={OFFER_BACK}>
                Plan
              </Link>
            }
          />
          <Route
            path="/production"
            element={
              <>
                <ProductionOrdersPage />
                <Address />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
      { permissions: ['production.view', 'production.create'] },
    );

    await userEvent.click(screen.getByRole('link', { name: 'Plan' }));
    const dialog = await screen.findByRole('dialog', { name: 'Plan a run' });
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    );

    await expect
      .poll(() => screen.queryByRole('dialog', { name: 'Plan a run' }))
      .toBeNull();
    expect(screen.getByRole('heading', { name: 'Production' })).toBeVisible();
    expect(
      screen.getByRole('status', { name: 'address' }),
    ).toBeEmptyDOMElement();

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('link', { name: 'Plan' })).toBeVisible();
  });
});
