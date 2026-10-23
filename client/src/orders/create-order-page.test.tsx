import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { Partner } from '../api/types.gen';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { deploy, outdatedRefusal } from '../test/version';
import { CreateOrderPage } from './create-order-page';

/**
 * Deliver to on a new purchase (ADR-071, amended). With one site it starts
 * at that site, as the server would choose it; Not chosen, picked, is sent
 * as none, so the server does not choose the site anyway.
 */

const PARTNER: Partner = {
  id: 'partner-1',
  name: 'Acme Supplies',
  code: null,
  taxId: null,
  salePriceListId: null,
  purchasePriceListId: null,
  documentLanguage: null,
  documentSecondLanguage: null,
  notes: null,
  isActive: true,
};

/** The default handlers' one site, Main Site; the order's body as sent. */
function serve() {
  const sent: { body?: Record<string, unknown> } = {};
  server.use(
    http.get('/api/v1/partners', () => HttpResponse.json([PARTNER])),
    http.post('/api/v1/orders', async ({ request }) => {
      sent.body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ order: { id: 'order-1' } }, { status: 201 });
    }),
  );
  return sent;
}

/** A data router, which the page's unsaved-changes guard needs. */
function renderPage() {
  const router = createMemoryRouter(
    [
      { path: '/orders/new', element: <CreateOrderPage /> },
      { path: '/orders/:id', element: <p>The order</p> },
    ],
    { initialEntries: ['/orders/new'] },
  );
  renderWithAuth(<RouterProvider router={router} />, {
    // Deliver to reads the sites, which only locations.view may (ADR-080).
    permissions: ['orders.create', 'locations.view'],
  });
}

async function raise(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('combobox', { name: 'Partner' }));
  await user.click(await screen.findByRole('option', { name: /Acme/ }));
  await user.click(screen.getByRole('combobox', { name: 'Item' }));
  await user.click(await screen.findByRole('option', { name: /PLAIN-1/ }));
  await user.type(screen.getByRole('textbox', { name: 'Quantity' }), '5');
  await user.click(screen.getByRole('button', { name: 'Raise as draft' }));
  await screen.findByText('The order');
}

describe('CreateOrderPage Deliver to', () => {
  it('starts at the one site there is, and sends it', async () => {
    const sent = serve();
    renderPage();
    const user = userEvent.setup();

    expect(
      await screen.findByRole('combobox', { name: 'Deliver to' }),
    ).toHaveTextContent('Main Site');
    await raise(user);

    expect(sent.body).toMatchObject({ deliverToId: 'location-a' });
  });

  it('sends Not chosen as none, even beside the one site', async () => {
    const sent = serve();
    renderPage();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('combobox', { name: 'Deliver to' }),
    );
    await user.click(await screen.findByRole('option', { name: 'Not chosen' }));
    await raise(user);

    expect(sent.body).toMatchObject({ deliverToId: null });
  });
});

/**
 * Its partners and products refused for this tab's API revision, as every
 * page's read is (ADR-081): why, in the form's place, never "Could not load
 * partners and products".
 */
describe('CreateOrderPage refused as outdated', () => {
  it('says a new version is ready once it is out, with Reload', async () => {
    server.use(http.get('/api/v1/partners', () => outdatedRefusal()));
    await deploy({ urgent: true });
    renderPage();

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'A new version is ready',
      }),
    ).toBeVisible();
    expect(
      screen.queryByText('Could not load partners and products.'),
    ).toBeNull();
  });
});
