import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import type { Location, ReturnableLine } from '../lib/types';
import { server } from '../test/setup';
import { ReturnOrderDialog } from './return-order-dialog';

const RETURNABLE: ReturnableLine[] = [
  {
    lineId: 'l-focus',
    sku: 'FOCUS-60CT',
    unitOfMeasure: 'each',
    tracksLots: true,
    quantityFulfilled: '25.0000',
    quantityReturned: '0.0000',
    lots: [
      {
        lotId: 'lot-early',
        code: 'EARLY',
        expiresAt: null,
        shipped: '10.0000',
        returned: '0.0000',
      },
      {
        lotId: 'lot-late',
        code: 'LATE',
        expiresAt: null,
        shipped: '15.0000',
        returned: '0.0000',
      },
    ],
  },
  {
    lineId: 'l-scoop',
    sku: 'SCOOP',
    unitOfMeasure: 'each',
    tracksLots: false,
    quantityFulfilled: '10.0000',
    quantityReturned: '0.0000',
    lots: [],
  },
];

const BIN: Location = {
  id: 'loc-returns',
  type: 'bin',
  name: 'Returns',
  code: null,
  parentId: null,
  isAvailable: false,
  isActive: true,
};

describe('ReturnOrderDialog', () => {
  /**
   * Tracked lines go out as lots and untracked as a quantity, and a line
   * left empty is not sent at all. The dialog never sums the lots itself.
   */
  it('sends lots for tracked lines and a quantity for the rest', async () => {
    const user = userEvent.setup();
    const sent: { lines: unknown[] }[] = [];

    server.use(
      http.get('/api/v1/orders/order-1/returns/returnable', () =>
        HttpResponse.json(RETURNABLE),
      ),
      http.post('/api/v1/orders/order-1/returns', async ({ request }) => {
        sent.push((await request.json()) as (typeof sent)[number]);
        return HttpResponse.json(
          { orderReturn: { id: 'r1' } },
          { status: 201 },
        );
      }),
    );

    render(
      <ReturnOrderDialog
        open
        orderId="order-1"
        locations={[BIN]}
        onClose={() => undefined}
        onReturned={() => undefined}
      />,
    );

    await user.type(await screen.findByLabelText('Return from lot LATE'), '3');
    await user.type(screen.getByLabelText('Return SCOOP'), '2');

    await user.click(screen.getByLabelText(/Put it in/));
    await user.click(
      await screen.findByRole('option', { name: /Returns \(not available\)/ }),
    );

    await user.click(screen.getByRole('button', { name: 'Receive return' }));

    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0].lines).toEqual([
      { lineId: 'l-focus', lots: [{ lotId: 'lot-late', quantity: '3' }] },
      { lineId: 'l-scoop', quantity: '2' },
    ]);
  });
});
