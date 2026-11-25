import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { NeedsCostEntry, StockValuation } from '../api/types.gen';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { StockValuePage } from './stock-value-page';

/** A delivery with no price, the row Set cost is for (ADR-048). */
const RECEIPT: NeedsCostEntry = {
  id: 'valuation-1',
  kind: 'movement',
  reason: 'receipt',
  reasonDetail: null,
  sku: 'EXTRACT',
  variantId: 'variant-1',
  productId: 'product-1',
  productName: 'Extract',
  variantName: null,
  type: 'material',
  coverFileId: null,
  lotId: 'lot-a',
  lotCode: 'LOT-A',
  fromLotId: null,
  fromLotCode: null,
  quantity: '40.0000',
  unitPrice: null,
  currency: null,
  referenceType: null,
  referenceId: null,
  takesCost: true,
  createdAt: '2026-11-20T17:00:00.000Z',
};

const VALUATION: StockValuation = {
  currency: 'CAD',
  total: '120.000000',
  provisional: true,
  pools: [],
};

/** The page with these rows waiting, for a reader who may set costs. */
async function waitingRows(entries: NeedsCostEntry[]) {
  server.use(
    http.get('/api/v1/costs/valuation', () =>
      HttpResponse.json({ valuation: VALUATION }),
    ),
    http.get('/api/v1/costs/needs-cost', () =>
      HttpResponse.json({ entries, nextCursor: null }),
    ),
  );
  renderWithAuth(
    <MemoryRouter>
      <StockValuePage />
    </MemoryRouter>,
    { permissions: ['costs.view', 'costs.update'] },
  );
  const table = await screen.findByRole('table', {
    name: 'Waiting for a cost',
  });
  return within(table).getAllByRole('row').slice(1);
}

describe('StockValuePage, what waits', () => {
  // ADR-094, D5: stock moved in from another lot takes that lot's cost,
  // which follows it, so it names the lot, a link, and offers no Set cost.
  it('reads stock moved in from another lot as following that lot’s cost, the lot a link, and offers no Set cost', async () => {
    const [received, moved] = await waitingRows([
      RECEIPT,
      {
        ...RECEIPT,
        id: 'valuation-2',
        kind: 'lot_change',
        reason: 'lot_change',
        reasonDetail: 'between_lots',
        lotId: 'lot-b',
        lotCode: 'LOT-B',
        fromLotId: 'lot-a',
        fromLotCode: 'LOT-A',
        quantity: '20.0000',
        takesCost: false,
      },
    ]);

    expect(received).toHaveTextContent('Received with no price');
    expect(
      within(received).getByRole('button', { name: 'Set cost' }),
    ).toBeVisible();

    expect(moved).toHaveTextContent(
      'Moved in from lot LOT-A. Its cost follows that lot’s.',
    );
    expect(within(moved).getByRole('link', { name: 'LOT-A' })).toHaveAttribute(
      'href',
      '/lots/lot-a',
    );
    expect(
      within(moved).queryByRole('button', { name: 'Set cost' }),
    ).not.toBeInTheDocument();
  });

  // D4: a kind or a reason this tab does not know says only that it
  // waits, never "Received with no price", and is offered nothing.
  it('reads a kind or a reason it does not know as waiting for a cost, offering no Set cost', async () => {
    const rows = await waitingRows([
      {
        ...RECEIPT,
        id: 'valuation-3',
        kind: 'split_in_two' as NeedsCostEntry['kind'],
        takesCost: false,
      },
      {
        ...RECEIPT,
        id: 'valuation-4',
        reason: 'teleported',
        takesCost: false,
      },
    ]);

    for (const row of rows) {
      expect(row).toHaveTextContent('Waiting for a cost');
      expect(row).not.toHaveTextContent('Received with no price');
      expect(
        within(row).queryByRole('button', { name: 'Set cost' }),
      ).not.toBeInTheDocument();
    }
  });

  // #661 and #669's 58: which rows take a cost is the server's to say. A
  // return with no cost it shipped at takes one on its own row, which the
  // page's own copy of the rule refused; a batch's output does not.
  it('offers Set cost on the rows the server says take one, and on no other', async () => {
    const [returned, made] = await waitingRows([
      { ...RECEIPT, id: 'valuation-5', reason: 'return' },
      {
        ...RECEIPT,
        id: 'valuation-6',
        reason: 'adjustment',
        takesCost: false,
      },
    ]);

    expect(
      within(returned).getByRole('button', { name: 'Set cost' }),
    ).toBeVisible();
    expect(
      within(made).queryByRole('button', { name: 'Set cost' }),
    ).not.toBeInTheDocument();
  });
});
