import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import type { Shipment } from '../lib/types';
import { server } from '../test/setup';
import { VoidShipmentDialog } from './void-shipment-dialog';

const SHIPMENT: Shipment = {
  id: 'ship-1',
  fromLocationId: 'loc-shelf',
  carrier: 'UPS',
  trackingNumber: '1Z999',
  note: null,
  createdAt: '2026-09-24T17:00:00.000Z',
  voidedAt: null,
  voidReason: null,
  items: [],
};

describe('VoidShipmentDialog', () => {
  it('sends the reason to the void route and reports back', async () => {
    const user = userEvent.setup();
    const sent: { reason: string }[] = [];
    const onVoided = vi.fn();

    server.use(
      http.post(
        '/api/v1/orders/order-1/shipments/ship-1/void',
        async ({ request }) => {
          sent.push((await request.json()) as { reason: string });
          return new HttpResponse(null, { status: 204 });
        },
      ),
    );

    render(
      <VoidShipmentDialog
        open
        orderId="order-1"
        shipment={SHIPMENT}
        onClose={() => undefined}
        onVoided={onVoided}
      />,
    );

    await user.type(screen.getByLabelText(/Why/), 'Customer cancelled');
    await user.click(screen.getByRole('button', { name: 'Void shipment' }));

    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0]).toEqual({ reason: 'Customer cancelled' });
    await expect.poll(() => onVoided.mock.calls.length).toBe(1);
  });
});
