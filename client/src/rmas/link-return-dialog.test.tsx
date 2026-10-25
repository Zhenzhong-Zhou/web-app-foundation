import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import type { OrderReturn } from '../api/types.gen';
import { server } from '../test/setup';
import { LinkReturnDialog } from './link-return-dialog';

const RETURNS: OrderReturn[] = [
  {
    id: 'return-1',
    toLocationId: 'loc-shelf',
    returnAuthorizationId: null,
    reason: null,
    note: null,
    createdAt: '2026-10-20T10:00:00.000Z',
    items: [
      {
        sku: 'FOCUS-60CT',
        description: 'Focus 60ct',
        unitOfMeasure: 'each',
        lotCode: null,
        expiresAt: null,
        quantity: '2.0000',
      },
    ],
  },
];

describe('LinkReturnDialog', () => {
  /**
   * The select waits for the order's returns: drawn before them, it has
   * no options and MUI warns in the console (#126).
   */
  it('offers the returns once they arrive, without a warning', async () => {
    const user = userEvent.setup();
    const errors = vi.spyOn(console, 'error');

    server.use(
      http.get('/api/v1/orders/order-1/returns', () =>
        HttpResponse.json(RETURNS),
      ),
    );

    render(
      <LinkReturnDialog
        open
        rmaId="rma-1"
        rmaNumber="RMA-000001"
        orderId="order-1"
        onClose={() => undefined}
        onLinked={() => undefined}
      />,
    );

    await user.click(await screen.findByRole('combobox', { name: /Return/ }));
    expect(
      await screen.findByRole('option', { name: /FOCUS-60CT/ }),
    ).toBeInTheDocument();
    expect(
      errors.mock.calls.flat().filter((arg) => String(arg).startsWith('MUI')),
    ).toEqual([]);
  });
});
