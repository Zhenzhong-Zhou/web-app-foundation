import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import type { Location, OrderDetail, OrderLine } from '../lib/types';
import { server } from '../test/setup';
import { ShipOrderDialog } from './ship-order-dialog';

function line(id: string, sku: string, outstanding: string): OrderLine {
  return {
    id,
    variantId: `variant-${id}`,
    sku,
    // Named after the SKU so each line in a fixture stays distinct.
    description: `Item ${sku}`,
    quantityOrdered: outstanding,
    quantityFulfilled: '0.0000',
    quantityOutstanding: outstanding,
    quantityReturned: '0.0000',
    unitPrice: null,
    currency: null,
    lineTotal: null,
    isComplete: false,
    isClosedShort: false,
    closedReason: null,
  };
}

const ORDER = {
  id: 'order-1',
  direction: 'sale',
  status: 'confirmed',
  lines: [line('l1', 'FOCUS-60CT', '25.0000'), line('l2', 'SCOOP', '10.0000')],
} as OrderDetail;

const SHELF: Location = {
  id: 'loc-shelf',
  type: 'bin',
  name: 'Shelf',
  code: null,
  parentId: null,
  isAvailable: true,
  isActive: true,
};

describe('ShipOrderDialog', () => {
  /**
   * Partial is the normal case: every outstanding line is offered, and one
   * set to 0 stays behind for a later shipment rather than being sent.
   */
  it('sends only the lines with something to ship', async () => {
    const user = userEvent.setup();
    const sent: { lines: { lineId: string; quantity: string }[] }[] = [];

    server.use(
      http.post('/api/v1/orders/order-1/shipments/preview', () =>
        HttpResponse.json({ lines: [] }),
      ),
      http.post('/api/v1/orders/order-1/shipments', async ({ request }) => {
        sent.push((await request.json()) as (typeof sent)[number]);
        return HttpResponse.json({ shipment: { id: 's1' } }, { status: 201 });
      }),
    );

    render(
      <ShipOrderDialog
        open
        order={ORDER}
        locations={[SHELF]}
        onClose={() => undefined}
        onShipped={() => undefined}
      />,
    );

    // Prefilled with what is outstanding.
    expect(screen.getByLabelText('Ship FOCUS-60CT')).toHaveValue('25.0000');

    await user.clear(screen.getByLabelText('Ship SCOOP'));
    await user.type(screen.getByLabelText('Ship SCOOP'), '0');

    await user.click(screen.getByLabelText(/Ship from/));
    await user.click(await screen.findByRole('option', { name: 'Shelf' }));

    await user.click(screen.getByRole('button', { name: 'Ship' }));

    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0].lines).toEqual([{ lineId: 'l1', quantity: '25.0000' }]);
  });
});
