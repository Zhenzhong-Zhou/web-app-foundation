import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import type { Location, ReturnableLine } from '../api/types.gen';
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
        expiry: 'none',
        shipped: '10.0000',
        returned: '0.0000',
      },
      {
        lotId: 'lot-late',
        code: 'LATE',
        expiresAt: null,
        expiry: 'none',
        shipped: '15.0000',
        returned: '0.0000',
      },
    ],
    fromBefore: null,
  },
  {
    lineId: 'l-scoop',
    sku: 'SCOOP',
    unitOfMeasure: 'each',
    tracksLots: false,
    quantityFulfilled: '10.0000',
    quantityReturned: '0.0000',
    lots: [],
    fromBefore: null,
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
  address: null,
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
        canSeeRmas={false}
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

  /** What shipped and came back is read, not typed: no padding zeros (#213). */
  it('reads what shipped without padding zeros', async () => {
    server.use(
      http.get('/api/v1/orders/order-1/returns/returnable', () =>
        HttpResponse.json(RETURNABLE),
      ),
    );

    render(
      <ReturnOrderDialog
        open
        orderId="order-1"
        locations={[BIN]}
        canSeeRmas={false}
        onClose={() => undefined}
        onReturned={() => undefined}
      />,
    );

    expect(
      await screen.findByText('— 25 shipped, 0 already back'),
    ).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '10' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '15' })).toBeInTheDocument();
    expect(screen.getAllByRole('cell', { name: '0' })).toHaveLength(2);
  });

  // ADR-094, Q3a: what shipped with no lot before the code's lot tracking
  // started comes back by quantity, into the lot named on its row.
  it('takes back by quantity what shipped before lot tracking, saying which lot it goes into', async () => {
    const user = userEvent.setup();
    const sent: { lines: unknown[] }[] = [];
    const before = (lotCode: string | null): ReturnableLine[] => [
      {
        ...RETURNABLE[0]!,
        fromBefore: {
          shipped: '40.0000',
          returned: '5.0000',
          lotId: lotCode ? 'lot-start' : null,
          lotCode,
        },
      },
    ];
    server.use(
      http.get('/api/v1/orders/order-1/returns/returnable', () =>
        HttpResponse.json(before('L-2026-11-22-1')),
      ),
      http.post('/api/v1/orders/order-1/returns', async ({ request }) => {
        sent.push((await request.json()) as (typeof sent)[number]);
        return HttpResponse.json(
          { orderReturn: { id: 'r1' } },
          { status: 201 },
        );
      }),
    );
    const dialog = (
      <ReturnOrderDialog
        open
        orderId="order-1"
        locations={[BIN]}
        canSeeRmas={false}
        onClose={() => undefined}
        onReturned={() => undefined}
      />
    );
    const { unmount } = render(dialog);

    const row = (
      await screen.findByText('Shipped before lot tracking')
    ).closest('tr')!;
    expect(row).toHaveTextContent(
      'Shipped before lot trackingGoes into lot L-2026-11-22-1—405',
    );
    await user.type(
      screen.getByLabelText('Return FOCUS-60CT shipped before lot tracking'),
      '4',
    );
    await user.type(screen.getByLabelText('Return from lot LATE'), '3');
    await user.click(screen.getByLabelText(/Put it in/));
    await user.click(
      await screen.findByRole('option', { name: /Returns \(not available\)/ }),
    );
    await user.click(screen.getByRole('button', { name: 'Receive return' }));

    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0].lines).toEqual([
      {
        lineId: 'l-focus',
        lots: [{ lotId: 'lot-late', quantity: '3' }],
        quantity: '4',
      },
    ]);
    unmount();

    // Started with nothing on hand: the lot is made as it comes back.
    server.use(
      http.get('/api/v1/orders/order-1/returns/returnable', () =>
        HttpResponse.json(before(null)),
      ),
    );
    render(dialog);
    expect(
      await screen.findByText('Goes into a lot made for us as it comes back'),
    ).toBeVisible();
  });
});
