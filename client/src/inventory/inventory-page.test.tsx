import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { StockRow } from '../api/types.gen';
import { apiError } from '../test/handlers';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { InventoryPage } from './inventory-page';

const ROW: StockRow = {
  id: 'stock-1',
  variantId: 'variant-1',
  sku: 'VITD-60',
  productName: 'Vitamin D',
  variantName: '60ct',
  coverFileId: null,
  unitOfMeasure: 'each',
  locationId: 'loc-1',
  locationName: 'Shelf A',
  locationCode: 'A-01',
  lotId: 'lot-1',
  lotCode: 'NN-2410-07',
  lotExpiresAt: '2027-10-01',
  lotIsAssigned: false,
  quantity: '120.0000',
};

const CHANGES = ['Move', 'Ship out', 'Send sample', 'Edit lot details'];

describe('InventoryPage', () => {
  async function openActions(permissions: string[]) {
    server.use(
      http.get('/api/v1/stock', () =>
        HttpResponse.json({ entries: [ROW], nextCursor: null }),
      ),
      http.get('/api/v1/stock/counts', () =>
        HttpResponse.json({ expiring: 0, needsCost: 0 }),
      ),
      http.get('/api/v1/stock/availability', () => HttpResponse.json([])),
    );
    renderWithAuth(
      <MemoryRouter>
        <InventoryPage />
      </MemoryRouter>,
      { permissions },
    );
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Actions for VITD-60 at Shelf A',
      }),
    );
  }

  // A Viewer's first week asks them to look a lot up (ADR-079).
  it('gives someone who may only see stock the actions that read', async () => {
    await openActions(['stock.view']);

    expect(
      screen.getByRole('menuitem', { name: 'Trace lot' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'History' }),
    ).toBeInTheDocument();
    for (const name of [...CHANGES, 'Correct the count']) {
      expect(screen.queryByRole('menuitem', { name })).not.toBeInTheDocument();
    }
  });

  it('adds what changes stock for someone who may move it, and correcting for someone who may adjust', async () => {
    await openActions(['stock.view', 'stock.move']);

    for (const name of CHANGES) {
      expect(screen.getByRole('menuitem', { name })).toBeInTheDocument();
    }
    expect(
      screen.queryByRole('menuitem', { name: 'Correct the count' }),
    ).not.toBeInTheDocument();
  });

  it('offers Correct the count with both permissions', async () => {
    await openActions(['stock.view', 'stock.move', 'stock.adjust']);

    expect(
      screen.getByRole('menuitem', { name: 'Correct the count' }),
    ).toBeInTheDocument();
  });

  it('shows only why a first read failed, with Try again, never Nothing here yet. (#195)', async () => {
    let reads = 0;
    server.use(
      http.get('/api/v1/stock', () => {
        reads += 1;
        return reads === 1
          ? apiError(500, 'Internal server error')
          : HttpResponse.json({ entries: [], nextCursor: null });
      }),
      http.get('/api/v1/stock/counts', () =>
        HttpResponse.json({ expiring: 0, needsCost: 0 }),
      ),
      http.get('/api/v1/stock/availability', () => HttpResponse.json([])),
    );
    renderWithAuth(
      <MemoryRouter>
        <InventoryPage />
      </MemoryRouter>,
      { permissions: ['stock.view'] },
    );

    const failed = await screen.findByRole('alert');
    expect(failed).toHaveTextContent('Internal server error');
    expect(screen.queryByText('Nothing here yet.')).not.toBeInTheDocument();

    await userEvent.click(
      within(failed).getByRole('button', { name: 'Try again' }),
    );
    expect(await screen.findByText('Nothing here yet.')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
