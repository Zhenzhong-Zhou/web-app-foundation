import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { LotSource, LotTrace } from '../api/types.gen';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { LotTracePage } from './lot-trace-page';

const SOURCE: LotSource = {
  kind: 'receipt',
  at: '2026-10-01T15:00:00Z',
  quantity: '10.0000',
  orderId: 'po-1',
  orderNumber: 'PO-000001',
  orderReference: null,
  supplierName: 'Acme Supplies',
  runId: null,
  runReference: null,
  licenceId: null,
  licenceNumber: null,
  licenceAuthority: null,
  licenceStatusAtRelease: null,
  licenceOverrideReason: null,
  licenceOverriddenByName: null,
};

/**
 * A lot received on a purchase, made into another in a run, and sold: a
 * partner, an order and a run each, in every section that names one.
 */
const TRACE: LotTrace = {
  lot: {
    id: 'lot-1',
    code: 'OIL-0425',
    expiresAt: null,
    sku: 'OIL',
    unitOfMeasure: 'kg',
    description: 'Fish oil',
  },
  balances: [],
  sources: [
    SOURCE,
    {
      ...SOURCE,
      kind: 'production',
      orderId: null,
      orderNumber: null,
      supplierName: null,
      runId: 'run-0',
      runReference: 'MO-000007',
    },
  ],
  madeFrom: [],
  wentInto: [
    {
      lotId: 'lot-2',
      code: 'CAPS-0425',
      sku: 'CAPS',
      depth: 1,
      runId: 'run-1',
      runReference: 'MO-000009',
    },
  ],
  recipients: [
    {
      partnerId: 'partner-1',
      partnerName: 'Northern Health',
      orderId: 'so-1',
      orderNumber: 'SO-000003',
      orderReference: null,
      isSampleOrder: false,
      lotId: 'lot-2',
      lotCode: 'CAPS-0425',
      sku: 'CAPS',
      shipped: '5.0000',
      sampled: '0.0000',
      returned: '0.0000',
    },
  ],
};

function renderTrace(permissions: string[]) {
  server.use(
    http.get('/api/v1/stock/lots/lot-1/trace', () => HttpResponse.json(TRACE)),
  );

  return renderWithAuth(
    <MemoryRouter initialEntries={['/lots/lot-1']}>
      <Routes>
        <Route path="/lots/:id" element={<LotTracePage />} />
      </Routes>
    </MemoryRouter>,
    { permissions },
  );
}

/** The partner, the two orders and the two runs the trace names. */
const ONWARD = [
  'Northern Health',
  'SO-000003',
  'PO-000001',
  'MO-000007',
  'MO-000009',
];

describe('LotTracePage', () => {
  it('links each partner, order and run for whoever may open it', async () => {
    renderTrace([
      'stock.view',
      'partners.view',
      'orders.view',
      'production.view',
    ]);

    expect(
      await screen.findByRole('link', { name: 'Northern Health' }),
    ).toHaveAttribute('href', '/partners/partner-1');
    expect(screen.getByRole('link', { name: 'SO-000003' })).toHaveAttribute(
      'href',
      '/orders/so-1',
    );
    expect(screen.getByRole('link', { name: 'PO-000001' })).toHaveAttribute(
      'href',
      '/orders/po-1',
    );
    expect(screen.getByRole('link', { name: 'MO-000007' })).toHaveAttribute(
      'href',
      '/production/run-0',
    );
    expect(screen.getByRole('link', { name: 'MO-000009' })).toHaveAttribute(
      'href',
      '/production/run-1',
    );
  });

  // Stock look-up's reader (ADR-080): stock, but none of the three.
  it('names them as text for whoever may not, the lots still linked', async () => {
    renderTrace(['stock.view']);

    expect(
      await screen.findAllByRole('link', { name: 'CAPS-0425' }),
    ).toHaveLength(2);
    for (const name of ONWARD) {
      expect(screen.queryByRole('link', { name })).not.toBeInTheDocument();
      expect(screen.getByText(name, { exact: false })).toBeInTheDocument();
    }
  });
});
