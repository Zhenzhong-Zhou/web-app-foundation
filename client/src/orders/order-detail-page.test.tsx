import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { OrderDetail } from '../lib/types';
import { orderLine } from '../test/factories';
import { apiError } from '../test/handlers';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { OrderDetailPage } from './order-detail-page';

/**
 * Which control a line offers, and when.
 *
 * Five statuses times five actions, each gated on the order's status, the
 * line's own state, and a permission. The server enforces all of it (ADR-033,
 * ADR-034) and refuses with a 409 — this covers the other half, which is not
 * offering a button that always fails.
 *
 * Reaching these in the browser suite would mean raising, confirming,
 * receiving against and closing a real order per case.
 */

const ALL = ['orders.view', 'orders.create', 'orders.update', 'orders.receive'];

function order(over: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: 'order-1',
    partnerId: 'partner-1',
    partnerName: 'Acme Supplies',
    direction: 'purchase',
    status: 'draft',
    reference: null,
    expectedAt: null,
    note: null,
    duplicatedFromId: null,
    fullyFulfilled: false,
    isSample: false,
    totals: [],
    totalsComplete: false,
    money: null,
    unsettledReturns: 0,
    counts: { shipments: 0, voidedShipments: 0, returns: 0, documents: 0 },
    quantities: null,
    documents: null,
    lines: [orderLine()],
    ...over,
  };
}

function serve(detail: OrderDetail) {
  server.use(
    http.get('/api/v1/orders/:id', () => HttpResponse.json(detail)),
    http.get('/api/v1/products/variants', () => HttpResponse.json([])),
    http.get('/api/v1/locations', () => HttpResponse.json([])),
  );
}

/** The order page, at its Shipments tab: where invoices and voids are. */
const SHIPMENTS_TAB = '/orders/order-1?tab=shipments';

function renderPage(permissions = ALL, entry = '/orders/order-1') {
  return renderWithAuth(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/orders/:id" element={<OrderDetailPage />} />
      </Routes>
    </MemoryRouter>,
    { permissions },
  );
}

/** The row for a SKU, so an assertion cannot match a control on another. */
async function rowFor(sku: string) {
  return (await screen.findByText(sku)).closest('tr')!;
}

/**
 * Everything a row offers (ADR-055): its own buttons, and the entries of its
 * ⋮ menu, opened and closed again. Names, so an assertion reads like the
 * screen rather than like the markup.
 */
async function actionsOf(sku: string): Promise<string[]> {
  const row = within(await rowFor(sku));
  const menu = row.queryByRole('button', { name: `Actions for ${sku}` });
  const buttons = row
    .queryAllByRole('button')
    .filter((button) => button !== menu)
    .map((button) => button.textContent ?? '');

  if (!menu) return buttons;

  await userEvent.click(menu);
  const entries = screen
    .getAllByRole('menuitem')
    .map((item) => item.textContent ?? '');
  await userEvent.keyboard('{Escape}');

  return [...buttons, ...entries];
}

/** Opens a row's ⋮ menu and chooses an entry. */
async function chooseFrom(sku: string, action: string) {
  const row = within(await rowFor(sku));
  await userEvent.click(
    row.getByRole('button', { name: `Actions for ${sku}` }),
  );
  await userEvent.click(screen.getByRole('menuitem', { name: action }));
}

describe('OrderDetailPage lines', () => {
  /**
   * The SKU means something to whoever set up the catalogue; the name is
   * what a person packing or answering a customer reads. Both, side by side,
   * as the packing slip shows them.
   */
  it('names the item beside its SKU', async () => {
    serve(order({ lines: [orderLine({ description: 'Focus (60ct)' })] }));
    renderPage();

    const row = within(await rowFor('WIDGET-1'));
    expect(row.getByText('Focus (60ct)')).toBeInTheDocument();
  });

  describe('on a draft', () => {
    it('offers add, edit and remove, but not receive or close', async () => {
      serve(
        order({
          lines: [orderLine(), orderLine({ id: 'line-2', sku: 'WIDGET-2' })],
        }),
      );
      renderPage();

      expect(
        await screen.findByRole('button', { name: 'Add item' }),
      ).toBeInTheDocument();

      const actions = await actionsOf('WIDGET-1');
      expect(actions).toContain('Edit');
      expect(actions).toContain('Remove WIDGET-1');

      // Nothing can be received against a draft, and a draft has promised
      // nothing to close short (ADR-033).
      expect(actions).not.toContain('Receive');
      expect(actions).not.toContain('Close short');
    });

    /**
     * An order with no lines is a document that orders nothing (ADR-027), so
     * the control is absent rather than disabled — the server refuses it too.
     */
    it('hides remove when there is only one line', async () => {
      serve(order());
      renderPage();

      expect(await actionsOf('WIDGET-1')).not.toContain('Remove WIDGET-1');
    });
  });

  describe('on a confirmed order', () => {
    const confirmed = { status: 'confirmed' as const };

    it('offers receive, edit and close short', async () => {
      serve(order(confirmed));
      renderPage();

      // Receive on the row, the corrections in its menu.
      const row = within(await rowFor('WIDGET-1'));
      expect(row.getByRole('button', { name: 'Receive' })).toBeInTheDocument();
      expect(await actionsOf('WIDGET-1')).toEqual(
        expect.arrayContaining(['Receive', 'Edit', 'Close short']),
      );
    });

    it('does not offer add or remove', async () => {
      serve(
        order({
          ...confirmed,
          lines: [orderLine(), orderLine({ id: 'line-2', sku: 'WIDGET-2' })],
        }),
      );
      renderPage();

      // Adding is a new agreement and removing is a partial cancellation —
      // neither is a correction (ADR-033).
      expect(await actionsOf('WIDGET-1')).toContain('Close short');

      expect(
        screen.queryByRole('button', { name: 'Add item' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /^Remove/ }),
      ).not.toBeInTheDocument();
    });

    it('offers nothing on a line that is already complete', async () => {
      serve(
        order({
          ...confirmed,
          lines: [
            orderLine({
              quantityFulfilled: '40.0000',
              quantityOutstanding: '0.0000',
              quantityReturned: '0.0000',
              isComplete: true,
            }),
          ],
        }),
      );
      renderPage();

      const actions = await actionsOf('WIDGET-1');
      expect(actions).not.toContain('Receive');
      expect(actions).not.toContain('Close short');
    });
  });

  describe('a line closed short', () => {
    const closed = order({
      status: 'confirmed',
      fullyFulfilled: true,
      lines: [
        orderLine({
          quantityFulfilled: '10.0000',
          quantityOutstanding: '0.0000',
          quantityReturned: '0.0000',
          isComplete: true,
          isClosedShort: true,
          closedReason: 'Supplier discontinued the item',
        }),
      ],
    });

    /**
     * The quantities stay true: 40 was ordered and 10 came. Reducing the
     * ordered amount would make a short delivery indistinguishable from an
     * accurate one (ADR-034).
     */
    it('keeps the ordered and received quantities visible', async () => {
      serve(closed);
      renderPage();

      // Without padding zeros, as quantities read (ADR-055).
      const row = within(await rowFor('WIDGET-1'));
      expect(row.getByText('40')).toBeInTheDocument();
      expect(row.getByText('10')).toBeInTheDocument();
    });

    it('shows that it is closed instead of an outstanding quantity', async () => {
      serve(closed);
      renderPage();

      const row = within(await rowFor('WIDGET-1'));
      expect(row.getByText('Closed short')).toBeInTheDocument();
    });

    it('offers reopen, and no longer receive', async () => {
      serve(closed);
      renderPage();

      const actions = await actionsOf('WIDGET-1');
      expect(actions).toContain('Reopen');
      // The server refuses a receipt until it is reopened, so the reversal is
      // deliberate rather than implied by a delivery (ADR-034).
      expect(actions).not.toContain('Receive');
    });
  });

  describe('permissions and refusals', () => {
    it('offers a viewer nothing but the figures', async () => {
      serve(
        order({
          status: 'confirmed',
          lines: [
            orderLine({
              quantityFulfilled: '5.0000',
              quantityOutstanding: '35.0000',
              quantityReturned: '0.0000',
            }),
          ],
        }),
      );
      renderPage(['orders.view']);

      const row = within(await rowFor('WIDGET-1'));
      expect(row.getByText('35')).toBeInTheDocument();
      expect(await actionsOf('WIDGET-1')).toEqual([]);
    });

    it('can receive without being able to amend', async () => {
      serve(order({ status: 'confirmed' }));
      renderPage(['orders.view', 'orders.receive']);

      const actions = await actionsOf('WIDGET-1');
      expect(actions).toContain('Receive');
      expect(actions).not.toContain('Edit');
    });

    /**
     * Refusals the client cannot predict have to render. The page hides what
     * is always wrong; the server refuses what depends on state it owns.
     */
    it('surfaces a refusal from the server', async () => {
      serve(
        order({
          status: 'confirmed',
          lines: [
            orderLine({ isClosedShort: true, closedReason: 'Discontinued' }),
          ],
        }),
      );
      server.use(
        http.post('/api/v1/orders/:id/lines/:lineId/reopen', () =>
          apiError(409, 'That line is not closed'),
        ),
      );

      renderPage();

      await chooseFrom('WIDGET-1', 'Reopen');

      expect(
        await screen.findByText('That line is not closed'),
      ).toBeInTheDocument();
    });

    it('shows a price in its own currency and a total per currency', async () => {
      serve(
        order({
          totals: [{ currency: 'CAD', amount: '50.00000000' }],
          totalsComplete: true,
          lines: [
            orderLine({
              unitPrice: '1.2500',
              currency: 'CAD',
              lineTotal: '50.00000000',
            }),
          ],
        }),
      );
      renderPage();

      const row = within(await rowFor('WIDGET-1'));
      // Intl rounds at display and picks the symbol for the locale — CA$ here,
      // $ elsewhere. The assertion is about rounding, so it matches the digits
      // and leaves the prefix to Intl (ADR-035).
      expect(row.getByText(/1\.25$/)).toBeInTheDocument();
      expect(row.getByText(/50\.00$/)).toBeInTheDocument();
    });

    it('says so rather than showing a partial total', async () => {
      serve(
        order({
          totals: [{ currency: 'CAD', amount: '20.00000000' }],
          totalsComplete: false,
          lines: [
            orderLine({
              unitPrice: '2.0000',
              currency: 'CAD',
              lineTotal: '20.00000000',
            }),
            orderLine({ id: 'line-2' }),
          ],
        }),
      );
      renderPage();

      // A subtotal that quietly excludes a line is the number somebody
      // reconciles against (ADR-035).
      expect(await screen.findByText(/not the full total/)).toBeInTheDocument();
    });
  });

  describe('closing and invoicing', () => {
    const SALE_PERMISSIONS = [
      ...ALL,
      'orders.ship',
      'invoices.view',
      'invoices.create',
    ];

    const shipment = {
      id: 'shipment-1',
      fromLocationId: 'location-1',
      carrier: null,
      trackingNumber: null,
      note: null,
      voidedAt: null,
      voidReason: null,
      createdAt: '2026-09-25T17:00:00.000Z',
      items: [],
    };

    function invoice(over: Record<string, unknown> = {}) {
      return {
        id: 'invoice-1',
        number: 'INV-000001',
        status: 'issued',
        orderId: 'order-1',
        shipmentId: 'shipment-1',
        partnerId: 'partner-1',
        partnerName: 'Acme Supplies',
        currency: 'CAD',
        invoiceDate: '2026-09-25',
        dueDate: null,
        total: '78.7500',
        createdAt: '2026-09-25T17:05:00.000Z',
        ...over,
      };
    }

    /** A confirmed sale with one shipment, and whatever invoices it has. */
    function serveSale(
      invoices: ReturnType<typeof invoice>[] = [],
      over: Partial<OrderDetail> = {},
    ) {
      serve(order({ direction: 'sale', status: 'confirmed', ...over }));
      server.use(
        http.get('/api/v1/orders/:id/shipments', () =>
          HttpResponse.json([shipment]),
        ),
        http.get('/api/v1/orders/:id/returns', () => HttpResponse.json([])),
        http.get('/api/v1/invoices', () =>
          HttpResponse.json({ entries: invoices, nextCursor: null }),
        ),
      );
    }

    /**
     * "Mark received" and "Mark shipped" read as the act of receiving or
     * shipping, which have their own buttons (#24). Closing says only that
     * nothing more is coming, in either direction.
     */
    it('calls closing "Close order"', async () => {
      serve(order({ status: 'confirmed' }));
      renderPage();

      expect(
        await screen.findByRole('button', { name: 'Close order' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /^Mark/ }),
      ).not.toBeInTheDocument();
    });

    it('offers an invoice for a shipment that has none', async () => {
      serveSale();
      renderPage(SALE_PERMISSIONS, SHIPMENTS_TAB);

      expect(
        await screen.findByRole('button', { name: 'Create invoice' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Void' })).toBeInTheDocument();
    });

    /**
     * The server refuses to void a billed shipment (ADR-046), so the page
     * does not offer it: the link to the invoice is where the answer is.
     */
    it('links to the standing invoice, and offers no void', async () => {
      serveSale([invoice()]);
      renderPage(SALE_PERMISSIONS, SHIPMENTS_TAB);

      expect(
        await screen.findByRole('link', { name: 'Invoice INV-000001' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Void' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Create invoice' }),
      ).not.toBeInTheDocument();
    });

    // A voided invoice no longer bills the shipment; it can be billed again.
    it('ignores a voided invoice', async () => {
      serveSale([invoice({ status: 'voided' })]);
      renderPage(SALE_PERMISSIONS, SHIPMENTS_TAB);

      expect(
        await screen.findByRole('button', { name: 'Create invoice' }),
      ).toBeInTheDocument();
    });

    // Samples ship and trace like sales, but are never invoiced (ADR-042).
    it('offers no invoice on a sample', async () => {
      serveSale([], { isSample: true });
      renderPage(SALE_PERMISSIONS, SHIPMENTS_TAB);

      expect(
        await screen.findByRole('heading', { name: 'Shipments' }),
      ).toBeInTheDocument();
      expect(
        await screen.findByRole('button', { name: 'Void' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Create invoice' }),
      ).not.toBeInTheDocument();
    });

    /**
     * An RMA is customer service's (ADR-047): its own permission, offered
     * on a sale once anything has shipped.
     */
    it('offers Authorize a return on a sale that shipped', async () => {
      serveSale([], {
        lines: [
          orderLine({
            quantityFulfilled: '6.0000',
            quantityOutstanding: '34.0000',
          }),
        ],
      });
      renderPage([...SALE_PERMISSIONS, 'return_authorizations.create']);

      expect(
        await screen.findByRole('button', { name: 'Authorize a return' }),
      ).toBeInTheDocument();
    });

    it('offers it neither before anything shipped nor without the permission', async () => {
      // Nothing shipped yet: the fixture's line has fulfilled 0.
      serveSale();
      const { unmount } = renderPage([
        ...SALE_PERMISSIONS,
        'return_authorizations.create',
      ]);

      await screen.findByRole('tab', { name: /Shipments/ });
      expect(
        screen.queryByRole('button', { name: 'Authorize a return' }),
      ).not.toBeInTheDocument();
      unmount();

      // Shipped, but the member cannot raise RMAs.
      serveSale([], {
        lines: [
          orderLine({
            quantityFulfilled: '6.0000',
            quantityOutstanding: '34.0000',
          }),
        ],
      });
      renderPage(SALE_PERMISSIONS);

      await screen.findByRole('tab', { name: /Shipments/ });
      expect(
        screen.queryByRole('button', { name: 'Authorize a return' }),
      ).not.toBeInTheDocument();
    });
  });
});

describe('OrderDetailPage prices', () => {
  /** A list price is a default, and saying where it came from shows that. */
  it('says which list a price came from', async () => {
    serve(
      order({
        direction: 'sale',
        lines: [
          orderLine({
            unitPrice: '24.9900',
            currency: 'CAD',
            lineTotal: '999.6000',
            priceSource: 'list',
            priceListId: 'list-1',
            priceListName: 'Wholesale CAD',
          }),
        ],
      }),
    );
    renderPage();

    const row = within(await rowFor('WIDGET-1'));
    expect(row.getByText('from Wholesale CAD')).toBeInTheDocument();
  });

  it('says nothing about a typed price', async () => {
    serve(
      order({
        direction: 'sale',
        lines: [
          orderLine({
            unitPrice: '17.0000',
            currency: 'CAD',
            lineTotal: '680.0000',
            priceSource: 'manual',
          }),
        ],
      }),
    );
    renderPage();

    const row = within(await rowFor('WIDGET-1'));
    expect(row.queryByText(/^from /)).not.toBeInTheDocument();
  });

  /** The server decides whether a list applies, and says why when not. */
  it('prices a line from its list on request, and shows a refusal', async () => {
    const user = userEvent.setup();
    serve(order({ direction: 'sale' }));
    server.use(
      http.post('/api/v1/orders/order-1/lines/line-1/list-price', () =>
        apiError(409, 'No price list applies to this order'),
      ),
    );
    renderPage();

    const row = within(await rowFor('WIDGET-1'));
    await user.click(row.getByRole('button', { name: 'Actions for WIDGET-1' }));
    await user.click(screen.getByRole('menuitem', { name: 'Use list price' }));

    expect(
      await screen.findByText('No price list applies to this order'),
    ).toBeInTheDocument();
  });

  it('never offers the list price on a sample', async () => {
    serve(order({ direction: 'sale', isSample: true }));
    renderPage();

    expect(await actionsOf('WIDGET-1')).not.toContain('Use list price');
  });
});
