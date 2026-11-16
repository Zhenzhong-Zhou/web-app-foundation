import { render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import type { LotCost, LotCostEntry } from '../api/types.gen';
import { server } from '../test/setup';
import { LotCostPanel } from './lot-cost-panel';

const RECEIPT: LotCostEntry = {
  id: 'entry-1',
  kind: 'movement',
  reason: 'receipt',
  quantity: '48.0000',
  value: '276.192000',
  unitPrice: '4.2000',
  currency: 'USD',
  exchangeRate: '1.37000000',
  needsCost: false,
  referenceType: null,
  referenceId: null,
  createdAt: '2026-10-01T15:00:00Z',
};

/** A lot bought in US dollars, valued in Canadian (ADR-048). */
const COST: LotCost = {
  currency: 'CAD',
  lotId: 'lot-1',
  lotCode: 'OIL-0425',
  sku: 'OIL',
  quantity: '48.0000',
  value: '276.192000',
  unitCost: '5.754000',
  provisional: false,
  entries: [
    RECEIPT,
    { ...RECEIPT, id: 'entry-2', unitPrice: '5.7540', currency: 'CAD' },
  ],
};

describe('LotCostPanel', () => {
  // The trace's numbers as the page writes them, and money that says its
  // currency (#472's 24).
  it('writes quantities as the page does, and a price in another currency with its code', async () => {
    server.use(
      http.get('/api/v1/costs/lots/lot-1', () =>
        HttpResponse.json({ lotCost: COST }),
      ),
    );
    render(<LotCostPanel lotId="lot-1" />);

    const history = await screen.findByRole('table', {
      name: 'How its value changed',
    });
    expect(screen.queryByText(/48\.0000/)).not.toBeInTheDocument();
    expect(screen.getAllByText('48')).toHaveLength(3);
    const [bought, inBase] = within(history).getAllByRole('row').slice(1);
    expect(bought).toHaveTextContent(/USD\s4\.20 at 1\.37/);
    expect(inBase).not.toHaveTextContent('USD');
    expect(inBase).toHaveTextContent(/5\.754/);
  });
});
