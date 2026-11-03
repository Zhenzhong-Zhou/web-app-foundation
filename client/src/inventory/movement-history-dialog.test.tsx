import { render, screen, waitFor } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import type { Movement, StockRow } from '../api/types.gen';
import { server } from '../test/setup';
import { MovementHistoryDialog } from './movement-history-dialog';

const ROW: StockRow = {
  id: 'stock-1',
  variantId: 'variant-1',
  sku: 'VITD-60',
  productName: '维生素 D',
  variantName: '60 粒',
  coverFileId: null,
  unitOfMeasure: 'each',
  locationId: 'loc-1',
  locationName: 'Shelf A',
  locationCode: 'A-01',
  lotId: 'lot-1',
  lotCode: 'NN-2410-07',
  lotExpiresAt: '2027-10-01',
  lotIsAssigned: false,
  quantity: '96.0000',
};

const MOVEMENT: Movement = {
  id: 'movement-1',
  sku: 'VITD-60',
  productName: '维生素 D',
  variantName: '60 粒',
  quantity: '24.0000',
  reason: 'shipment',
  reasonDetail: null,
  note: null,
  fromLocationName: 'Shelf A',
  toLocationName: null,
  lotCode: 'NN-2410-07',
  actorName: '王建国',
  actorEmail: 'wang@example.com',
  createdAt: '2026-10-30T17:00:00.000Z',
};

/** An inventory row's history reads as Movements does (#256). */
describe('MovementHistoryDialog', () => {
  function open(row: StockRow, movement: Movement = MOVEMENT) {
    server.use(
      http.get('/api/v1/stock/movements', () =>
        HttpResponse.json({ entries: [movement], nextCursor: null }),
      ),
    );
    render(<MovementHistoryDialog row={row} onClose={() => undefined} />);
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
    render(<MovementHistoryDialog row={ROW} onClose={() => undefined} />);

    expect(document.querySelector('.MuiSkeleton-root')).toBeNull();
    await waitFor(() =>
      expect(document.querySelector('.MuiSkeleton-root')).not.toBeNull(),
    );
  });
});
