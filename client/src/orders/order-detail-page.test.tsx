import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { OrderDetail, OrderLine } from '../lib/types';
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

function line(over: Partial<OrderLine> = {}): OrderLine {
  const id = over.id ?? 'line-1';

  return {
    id,
    variantId: 'variant-plain',
    // Derived, so two lines in one fixture cannot silently share a SKU and
    // make every row query ambiguous.
    sku: `WIDGET-${id.slice(-1)}`,
    description: `Widget ${id.slice(-1)}`,
    quantityOrdered: '40.0000',
    quantityFulfilled: '0.0000',
    quantityOutstanding: '40.0000',
    quantityReturned: '0.0000',
    unitPrice: null,
    currency: null,
    lineTotal: null,
    isComplete: false,
    isClosedShort: false,
    closedReason: null,
    ...over,
  };
}

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
    lines: [line()],
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

function renderPage(permissions = ALL) {
  return renderWithAuth(
    <MemoryRouter initialEntries={['/orders/order-1']}>
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

describe('OrderDetailPage lines', () => {
  /**
   * The SKU means something to whoever set up the catalogue; the name is
   * what a person packing or answering a customer reads. Both, side by side,
   * as the packing slip shows them.
   */
  it('names the item beside its SKU', async () => {
    serve(order({ lines: [line({ description: 'Focus (60ct)' })] }));
    renderPage();

    const row = within(await rowFor('WIDGET-1'));
    expect(row.getByText('Focus (60ct)')).toBeInTheDocument();
  });

  describe('on a draft', () => {
    it('offers add, edit and remove, but not receive or close', async () => {
      serve(
        order({ lines: [line(), line({ id: 'line-2', sku: 'WIDGET-2' })] }),
      );
      renderPage();

      expect(
        await screen.findByRole('button', { name: 'Add item' }),
      ).toBeInTheDocument();

      const row = within(await rowFor('WIDGET-1'));
      expect(row.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
      expect(
        row.getByRole('button', { name: 'Remove WIDGET-1' }),
      ).toBeInTheDocument();

      // Nothing can be received against a draft, and a draft has promised
      // nothing to close short (ADR-033).
      expect(
        row.queryByRole('button', { name: 'Receive' }),
      ).not.toBeInTheDocument();
      expect(
        row.queryByRole('button', { name: 'Close short' }),
      ).not.toBeInTheDocument();
    });

    /**
     * An order with no lines is a document that orders nothing (ADR-027), so
     * the control is absent rather than disabled — the server refuses it too.
     */
    it('hides remove when there is only one line', async () => {
      serve(order());
      renderPage();

      const row = within(await rowFor('WIDGET-1'));
      expect(
        row.queryByRole('button', { name: 'Remove WIDGET-1' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('on a confirmed order', () => {
    const confirmed = { status: 'confirmed' as const };

    it('offers receive, edit and close short', async () => {
      serve(order(confirmed));
      renderPage();

      const row = within(await rowFor('WIDGET-1'));
      expect(row.getByRole('button', { name: 'Receive' })).toBeInTheDocument();
      expect(row.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
      expect(
        row.getByRole('button', { name: 'Close short' }),
      ).toBeInTheDocument();
    });

    it('does not offer add or remove', async () => {
      serve(
        order({
          ...confirmed,
          lines: [line(), line({ id: 'line-2', sku: 'WIDGET-2' })],
        }),
      );
      renderPage();

      // Adding is a new agreement and removing is a partial cancellation —
      // neither is a correction (ADR-033).
      const row = within(await rowFor('WIDGET-1'));
      expect(
        row.getByRole('button', { name: 'Close short' }),
      ).toBeInTheDocument();

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
            line({
              quantityFulfilled: '40.0000',
              quantityOutstanding: '0.0000',
              quantityReturned: '0.0000',
              isComplete: true,
            }),
          ],
        }),
      );
      renderPage();

      const row = within(await rowFor('WIDGET-1'));
      expect(
        row.queryByRole('button', { name: 'Receive' }),
      ).not.toBeInTheDocument();
      expect(
        row.queryByRole('button', { name: 'Close short' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('a line closed short', () => {
    const closed = order({
      status: 'confirmed',
      fullyFulfilled: true,
      lines: [
        line({
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

      const row = within(await rowFor('WIDGET-1'));
      expect(row.getByText('40.0000')).toBeInTheDocument();
      expect(row.getByText('10.0000')).toBeInTheDocument();
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

      const row = within(await rowFor('WIDGET-1'));
      expect(row.getByRole('button', { name: 'Reopen' })).toBeInTheDocument();
      // The server refuses a receipt until it is reopened, so the reversal is
      // deliberate rather than implied by a delivery (ADR-034).
      expect(
        row.queryByRole('button', { name: 'Receive' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('permissions and refusals', () => {
    it('offers a viewer nothing but the figures', async () => {
      serve(
        order({
          status: 'confirmed',
          lines: [
            line({
              quantityFulfilled: '5.0000',
              quantityOutstanding: '35.0000',
              quantityReturned: '0.0000',
            }),
          ],
        }),
      );
      renderPage(['orders.view']);

      const row = within(await rowFor('WIDGET-1'));
      expect(row.getByText('35.0000')).toBeInTheDocument();

      for (const name of ['Receive', 'Edit', 'Close short']) {
        expect(row.queryByRole('button', { name })).not.toBeInTheDocument();
      }
    });

    it('can receive without being able to amend', async () => {
      serve(order({ status: 'confirmed' }));
      renderPage(['orders.view', 'orders.receive']);

      const row = within(await rowFor('WIDGET-1'));
      expect(row.getByRole('button', { name: 'Receive' })).toBeInTheDocument();
      expect(
        row.queryByRole('button', { name: 'Edit' }),
      ).not.toBeInTheDocument();
    });

    /**
     * Refusals the client cannot predict have to render. The page hides what
     * is always wrong; the server refuses what depends on state it owns.
     */
    it('surfaces a refusal from the server', async () => {
      serve(
        order({
          status: 'confirmed',
          lines: [line({ isClosedShort: true, closedReason: 'Discontinued' })],
        }),
      );
      server.use(
        http.post('/api/v1/orders/:id/lines/:lineId/reopen', () =>
          apiError(409, 'That line is not closed'),
        ),
      );

      renderPage();

      const row = within(await rowFor('WIDGET-1'));
      await userEvent.click(row.getByRole('button', { name: 'Reopen' }));

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
            line({
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
            line({
              unitPrice: '2.0000',
              currency: 'CAD',
              lineTotal: '20.00000000',
            }),
            line({ id: 'line-2' }),
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
      renderPage(SALE_PERMISSIONS);

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
      renderPage(SALE_PERMISSIONS);

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
      renderPage(SALE_PERMISSIONS);

      expect(
        await screen.findByRole('button', { name: 'Create invoice' }),
      ).toBeInTheDocument();
    });

    // Samples ship and trace like sales, but are never invoiced (ADR-042).
    it('offers no invoice on a sample', async () => {
      serveSale([], { isSample: true });
      renderPage(SALE_PERMISSIONS);

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
  });
});
