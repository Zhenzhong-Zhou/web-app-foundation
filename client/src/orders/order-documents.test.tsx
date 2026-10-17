import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import type { OrderDetail } from '../api/types.gen';
import { setOrganizationTimeZone } from '../lib/time-zone';
import { orderLine } from '../test/factories';
import { OrderDocuments } from './order-documents';

const SOLD: OrderDetail = {
  id: 'order-1',
  number: 'SO-000001',
  partnerId: 'partner-1',
  partnerName: 'Northside Pharmacy',
  direction: 'sale',
  status: 'fulfilled',
  reference: null,
  expectedAt: null,
  note: null,
  duplicatedFromId: null,
  deliverTo: null,
  fullyFulfilled: true,
  isSample: false,
  totals: [],
  totalsComplete: true,
  money: {
    currency: 'CAD',
    invoiced: '0',
    credited: '0',
    netInvoiced: '0',
    notInvoiced: '0',
  },
  unsettledReturns: 0,
  counts: { shipments: 1, voidedShipments: 0, returns: 0, documents: 1 },
  quantities: null,
  documents: {
    invoices: [
      {
        id: 'inv-1',
        number: null,
        status: 'draft',
        date: null,
        total: null,
        currency: 'CAD',
        // 5:30 pm on 16 October in Vancouver, already the 17th in UTC.
        shippedAt: '2026-10-17T00:30:00.000Z',
        quantity: '6',
      },
    ],
    creditNotes: [],
  },
  lines: [orderLine()],
};

/** A sale's documents (ADR-055), each shipment named by its day. */
describe('OrderDocuments', () => {
  afterEach(() => setOrganizationTimeZone(null));

  it("names a shipment by the organization's day, as its packing slip does (ADR-072)", () => {
    setOrganizationTimeZone('America/Vancouver');
    render(
      <MemoryRouter>
        <OrderDocuments order={SOLD} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Shipment of Oct 16, 2026')).toBeInTheDocument();
  });
});
