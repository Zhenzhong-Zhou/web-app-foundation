import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import type { OrderDetail } from '../api/types.gen';
import { orderLine } from '../test/factories';
import { apiError } from '../test/handlers';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { ProFormaDialog } from './pro-forma-dialog';

/**
 * The pro forma's dialog (ADR-071) says the server's two refusals before
 * anyone presses Print, and offers no Print while either applies; and a
 * failure to read the tax codes is said, since without them only No tax
 * is offered. A reader who may not see tax codes is not sent to ask for
 * them, and the field says why it offers only No tax (ADR-080).
 */

function sale(over: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: 'order-1',
    number: 'SO-000001',
    partnerId: 'partner-1',
    partnerName: 'Northside Pharmacy',
    direction: 'sale',
    status: 'confirmed',
    reference: null,
    expectedAt: null,
    note: null,
    duplicatedFromId: null,
    deliverTo: null,
    fullyFulfilled: false,
    isSample: false,
    totals: [],
    totalsComplete: false,
    money: null,
    unsettledReturns: 0,
    counts: { shipments: 0, voidedShipments: 0, returns: 0, documents: 0 },
    quantities: null,
    documents: null,
    lines: [orderLine({ unitPrice: '12.5000', currency: 'CAD' })],
    ...over,
  };
}

function renderDialog(order: OrderDetail, canSeeTaxCodes = true) {
  renderWithAuth(
    <ProFormaDialog
      open
      order={order}
      canSeeTaxCodes={canSeeTaxCodes}
      onClose={() => undefined}
    />,
  );
}

function serveTaxCodes() {
  server.use(
    http.get('/api/v1/tax-codes', () => HttpResponse.json({ taxCodes: [] })),
  );
}

describe('ProFormaDialog', () => {
  it('offers Print and Download PDF for a sale priced in one currency', async () => {
    serveTaxCodes();
    renderDialog(sale());

    expect(await screen.findByRole('link', { name: 'Print' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Download PDF' })).toBeVisible();
  });

  it('says which items need a price first, and offers no Print', async () => {
    serveTaxCodes();
    renderDialog(
      sale({
        lines: [
          orderLine({ id: 'line-1' }),
          orderLine({ id: 'line-2', unitPrice: '3.0000', currency: 'CAD' }),
        ],
      }),
    );

    expect(
      await screen.findByText(/Every item needs a price first\./),
    ).toHaveTextContent(/Every item needs a price first\. WIDGET-1 has/);
    expect(screen.queryByRole('link', { name: 'Print' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Download PDF' })).toBeNull();
  });

  it('says when the items are in two currencies, and offers no Print', async () => {
    serveTaxCodes();
    renderDialog(
      sale({
        lines: [
          orderLine({ id: 'line-1', unitPrice: '3.0000', currency: 'CAD' }),
          orderLine({ id: 'line-2', unitPrice: '4.0000', currency: 'USD' }),
        ],
      }),
    );

    expect(
      await screen.findByText(
        /A pro forma is in one currency, and this order has CAD.*USD/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Print' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Download PDF' })).toBeNull();
  });

  it('says when the tax codes could not be read', async () => {
    server.use(
      http.get('/api/v1/tax-codes', () =>
        apiError(500, 'The tax codes could not be read'),
      ),
    );
    renderDialog(sale());

    expect(
      await screen.findByText('The tax codes could not be read'),
    ).toBeInTheDocument();
  });

  it('asks no reader for tax codes they may not see, and says why there is only No tax', async () => {
    let asked = false;
    server.use(
      http.get('/api/v1/tax-codes', () => {
        asked = true;
        return HttpResponse.json({ taxCodes: [] });
      }),
    );
    renderDialog(sale(), false);

    expect(
      await screen.findByText(
        'You can’t see tax codes, so this pro forma can only be made without tax.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Tax code' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('link', { name: 'Print' })).toBeVisible();
    expect(asked).toBe(false);
  });
});
