import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { PackingSlip } from '../lib/types';
import { server } from '../test/setup';
import { PackingSlipPage } from './packing-slip-page';

const SLIP: PackingSlip = {
  id: 'shipment-1',
  createdAt: '2026-09-20T15:00:00.000Z',
  carrier: null,
  trackingNumber: null,
  note: null,
  voidedAt: null,
  voidReason: null,
  fromLocationName: 'Main warehouse',
  organizationName: 'Acme Botanicals',
  language: 'en',
  secondLanguage: null,
  order: { id: 'order-1', reference: 'PO-1001', partnerName: 'Northwind' },
  shipTo: null,
  items: [
    {
      sku: 'EXTRACT',
      description: 'Echinacea extract',
      lotCode: 'L2026-A',
      expiresAt: '2027-03-31',
      quantity: '12.0000',
      unitOfMeasure: 'bottles',
    },
  ] as PackingSlip['items'],
};

function renderSlip(slip: PackingSlip) {
  server.use(
    http.get('/api/v1/orders/order-1/shipments/shipment-1', () =>
      HttpResponse.json(slip),
    ),
  );

  render(
    <MemoryRouter initialEntries={['/orders/order-1/shipments/shipment-1']}>
      <Routes>
        <Route
          path="/orders/:id/shipments/:shipmentId"
          element={<PackingSlipPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PackingSlipPage', () => {
  it('prints the lot as a code to read, with a line to sign', async () => {
    renderSlip(SLIP);

    expect(
      await screen.findByRole('heading', { name: 'Packing slip' }),
    ).toBeInTheDocument();
    expect(screen.getByText('L2026-A')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'L2026-A' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Received by:/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to the order' }),
    ).toHaveAttribute('href', '/orders/order-1');
  });

  /**
   * A voided slip must say so on paper. With no reason recorded, the banner
   * still says VOID and never the word null, and there is nothing to sign.
   */
  it('says VOID on a voided slip, even without a reason', async () => {
    renderSlip({ ...SLIP, voidedAt: '2026-09-21T10:00:00.000Z' });

    expect(
      await screen.findByText('VOID — nothing on this slip left'),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Voided /)).not.toHaveTextContent('null');
    expect(screen.queryByText(/Received by:/)).not.toBeInTheDocument();
  });

  it('prints in the customer languages, both at the same weight, whatever the reader reads', async () => {
    renderSlip({ ...SLIP, language: 'fr-CA', secondLanguage: 'en' });

    // The reader is in English here; the slip is the customer's.
    expect(
      await screen.findByRole('heading', {
        name: 'Bordereau d’expédition / Packing slip',
      }),
    ).toBeInTheDocument();
    // The figure once, the French way, and the unit by name in each.
    expect(screen.getByText(/^12,0000 /)).toBeInTheDocument();
    // The page around it stays the reader's.
    expect(screen.getByRole('button', { name: 'Print' })).toBeInTheDocument();
  });
});
