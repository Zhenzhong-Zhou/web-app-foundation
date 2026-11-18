import { render, screen, waitFor } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { Movement, StockPile } from '../api/types.gen';
import { movement } from '../test/factories';
import { server } from '../test/setup';
import { MovementHistoryDialog } from './movement-history-dialog';

const ROW: StockPile = {
  id: 'stock-1',
  variantId: 'variant-1',
  sku: 'VITD-60',
  productName: '维生素 D',
  variantName: '60 粒',
  unitOfMeasure: 'each',
  locationId: 'loc-1',
  locationName: 'Shelf A',
  locationCode: 'A-01',
  lotId: 'lot-1',
  lotCode: 'NN-2410-07',
  lotExpiresAt: '2027-10-01',
  lotIsAssigned: false,
  quantity: '96.0000',
  emptiedOn: null,
};

const MOVEMENT = movement();

/** An inventory row's history reads as Movements does (#256). */
describe('MovementHistoryDialog', () => {
  function open(row: StockPile, movement: Movement = MOVEMENT) {
    server.use(
      http.get('/api/v1/stock/movements', () =>
        HttpResponse.json({ entries: [movement], nextCursor: null }),
      ),
    );
    render(
      <MemoryRouter>
        <MovementHistoryDialog row={row} onClose={() => undefined} />
      </MemoryRouter>,
    );
  }

  it('names the item beside its SKU in the title', async () => {
    open(ROW);

    expect(
      await screen.findByRole('heading', {
        name: 'History for VITD-60 维生素 D (60 粒) · lot NN-2410-07',
      }),
    ).toBeVisible();
  });

  it('names it without a lot, too', async () => {
    open({ ...ROW, lotId: null, lotCode: null, lotExpiresAt: null });

    expect(
      await screen.findByRole('heading', {
        name: 'History for VITD-60 维生素 D (60 粒)',
      }),
    ).toBeVisible();
  });

  // 55a: Why names the document each movement was for, linked.
  it('names the order a movement was for, linked, after its reason', async () => {
    open(
      ROW,
      movement({
        document: { kind: 'order', id: 'order-11', number: 'SO-000011' },
      }),
    );

    const order = await screen.findByRole('link', { name: 'SO-000011' });
    expect(order).toHaveAttribute('href', '/orders/order-11');
    expect(order.closest('td')).toHaveTextContent('shipment · SO-000011');
  });

  it('names a run by its reference, or as a run', async () => {
    open(
      ROW,
      movement({
        reason: 'production',
        document: { kind: 'run', id: 'run-4', number: null },
      }),
    );

    expect(await screen.findByRole('link', { name: 'A run' })).toHaveAttribute(
      'href',
      '/production/run-4',
    );
  });

  it('reads the change without padding zeros, and who by name with their email', async () => {
    open(ROW);

    const who = await screen.findByText('王建国');
    const row = who.closest('tr') as HTMLElement;
    expect(row).toHaveTextContent('−24');
    expect(row).not.toHaveTextContent('24.0000');
    expect(row).toHaveTextContent('wang@example.com');
  });

  // A quick read shows no skeleton (conventions, Loading states; #358).
  it('draws no skeleton until the read takes a while', async () => {
    server.use(
      http.get('/api/v1/stock/movements', async () => {
        await delay(400);
        return HttpResponse.json({ entries: [MOVEMENT], nextCursor: null });
      }),
    );
    render(
      <MemoryRouter>
        <MovementHistoryDialog row={ROW} onClose={() => undefined} />
      </MemoryRouter>,
    );

    expect(document.querySelector('.MuiSkeleton-root')).toBeNull();
    await waitFor(() =>
      expect(document.querySelector('.MuiSkeleton-root')).not.toBeNull(),
    );
  });
});
