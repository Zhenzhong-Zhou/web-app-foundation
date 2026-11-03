import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { Partner } from '../api/types.gen';
import { VARIANTS } from '../test/handlers';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { deploy, outdatedRefusal } from '../test/version';
import { CreateOrderPage } from './create-order-page';
import { fillState } from './order-fill';

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

/**
 * A data router, which the page's unsaved-changes guard needs; `from`, the
 * page that opened New order, one step back.
 */
function renderPage(state?: unknown, from?: string) {
  const router = createMemoryRouter(
    [
      { path: '/orders/new', element: <CreateOrderPage /> },
      { path: '/orders/:id', element: <p>The order</p> },
      { path: '/inventory', element: <p>Reorder points</p> },
    ],
    {
      initialEntries: [
        ...(from ? [from] : []),
        { pathname: '/orders/new', state },
      ],
    },
  );
  renderWithAuth(<RouterProvider router={router} />, {
    // Deliver to reads the sites, which only locations.view may (ADR-080).
    permissions: ['orders.create', 'locations.view'],
  });
  return router;
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

/**
 * The partner searched on the server (ADR-056, amended), as Partners is:
 * by pinyin and without accents, which the browser could not match, the
 * answer listed as it comes.
 */
describe('CreateOrderPage Partner', () => {
  const MINGDE: Partner = {
    ...PARTNER,
    id: 'partner-mingde',
    name: '明德药房',
  };
  const COOP: Partner = {
    ...PARTNER,
    id: 'partner-coop',
    name: 'Coopérative des pharmacies indépendantes du Bas-Saint-Laurent',
  };

  /** Every partner without a search; with one, what `found` names. */
  function servePartners(found: Record<string, Partner[]>) {
    const asked: string[] = [];
    server.use(
      http.get('/api/v1/partners', ({ request }) => {
        const search = new URL(request.url).searchParams.get('search');
        if (search === null) {
          return HttpResponse.json([PARTNER, MINGDE, COOP]);
        }
        asked.push(search);
        return HttpResponse.json(found[search] ?? []);
      }),
    );
    return asked;
  }

  async function pick(typed: string, name: string) {
    const user = userEvent.setup();
    const box = await screen.findByRole('combobox', { name: 'Partner' });
    await user.type(box, typed);
    await user.click(await screen.findByRole('option', { name }));
    return box;
  }

  it('finds a partner by its pinyin', async () => {
    const asked = servePartners({ mdyf: [MINGDE] });
    renderPage();

    const box = await pick('mdyf', '明德药房');

    expect(asked).toEqual(['mdyf']);
    expect(box).toHaveValue('明德药房');
  });

  it('finds a partner by its name without accents', async () => {
    const asked = servePartners({ cooperative: [COOP] });
    renderPage();

    const box = await pick('cooperative', COOP.name);

    expect(asked).toEqual(['cooperative']);
    expect(box).toHaveValue(COOP.name);
  });
});

/**
 * Raise a purchase order on Reorder points (ADR-085): New order opens as a
 * purchase with a line per chosen item at its suggestion, a note saying
 * so, and the supplier left to choose; nothing is saved until it is raised.
 */
describe('CreateOrderPage filled from Reorder points', () => {
  it('opens with a line per item at its suggestion, and raises them as typed', async () => {
    const sent = serve();
    renderPage(
      fillState({
        lines: [
          { variantId: 'variant-plain', quantity: '2000.0000' },
          { variantId: 'variant-lotted', quantity: '12.5000' },
        ],
      }),
    );
    const user = userEvent.setup();

    expect(
      await screen.findByText(
        'Filled from Reorder points: 2 lines at their suggested quantities. Choose the supplier under Partner, check the quantities and prices, then raise it as a draft.',
      ),
    ).toBeInTheDocument();
    await expect
      .poll(() =>
        screen
          .getAllByRole('textbox', { name: 'Quantity' })
          .map((box) => (box as HTMLInputElement).value),
      )
      .toEqual(['2000', '12.5']);
    expect(
      screen.getByRole('combobox', { name: 'Direction' }),
    ).toHaveTextContent('Buying from them');
    expect(screen.getByRole('combobox', { name: 'Partner' })).toHaveValue('');
    expect(sent.body).toBeUndefined();

    await user.click(screen.getByRole('combobox', { name: 'Partner' }));
    await user.click(await screen.findByRole('option', { name: /Acme/ }));
    await user.click(screen.getByRole('button', { name: 'Raise as draft' }));
    await screen.findByText('The order');

    expect(sent.body).toMatchObject({
      partnerId: PARTNER.id,
      direction: 'purchase',
      lines: [
        { variantId: 'variant-plain', quantityOrdered: '2000' },
        { variantId: 'variant-lotted', quantityOrdered: '12.5' },
      ],
    });
  });

  it('fills its lines once the catalogue answers on Retry, the note counting those filled (#357)', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    serve();
    // Refused while a new version is installed (ADR-081), then answered.
    let installed = false;
    server.use(
      http.get('/api/v1/partners', () =>
        installed ? HttpResponse.json([PARTNER]) : outdatedRefusal(),
      ),
      http.get('/api/v1/products/variants', () =>
        installed ? HttpResponse.json(VARIANTS) : outdatedRefusal(),
      ),
    );
    renderPage(
      fillState({
        lines: [
          { variantId: 'variant-plain', quantity: '2000.0000' },
          { variantId: 'variant-lotted', quantity: '12.5000' },
          // No longer in the catalogue, so not filled.
          { variantId: 'variant-gone', quantity: '5.0000' },
        ],
      }),
    );

    await screen.findByRole('heading', {
      level: 1,
      name: 'A new version is being installed',
    });
    installed = true;
    act(() => vi.advanceTimersByTime(60_000));

    expect(
      await screen.findByText(
        'Filled from Reorder points: 2 lines at their suggested quantities. Choose the supplier under Partner, check the quantities and prices, then raise it as a draft.',
      ),
    ).toBeInTheDocument();
    await expect
      .poll(() =>
        screen
          .getAllByRole('textbox', { name: 'Quantity' })
          .map((box) => (box as HTMLInputElement).value),
      )
      .toEqual(['2000', '12.5']);
  });

  it('leaves Back to Reorder points once raised, not the lines filled again', async () => {
    serve();
    const router = renderPage(
      fillState({
        lines: [{ variantId: 'variant-plain', quantity: '2000.0000' }],
      }),
      '/inventory?tab=reorder-points',
    );
    const user = userEvent.setup();

    await screen.findByText(/Filled from Reorder points/);
    await user.click(screen.getByRole('combobox', { name: 'Partner' }));
    await user.click(await screen.findByRole('option', { name: /Acme/ }));
    await user.click(screen.getByRole('button', { name: 'Raise as draft' }));
    await screen.findByText('The order');

    await router.navigate(-1);

    expect(await screen.findByText('Reorder points')).toBeInTheDocument();
    expect(
      screen.queryByText(/Filled from Reorder points/),
    ).not.toBeInTheDocument();
  });

  it('goes back to Reorder points on Cancel, not to Orders', async () => {
    serve();
    renderPage(
      fillState({
        lines: [{ variantId: 'variant-plain', quantity: '2000.0000' }],
      }),
      '/inventory?tab=reorder-points',
    );

    await screen.findByText(/Filled from Reorder points/);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(await screen.findByText('Reorder points')).toBeInTheDocument();
  });

  it('opens empty, with no note, from a link that fills nothing', async () => {
    serve();
    renderPage();

    expect(
      await screen.findByRole('textbox', { name: 'Quantity' }),
    ).toHaveValue('');
    expect(
      screen.queryByText(/Filled from Reorder points/),
    ).not.toBeInTheDocument();
  });
});
