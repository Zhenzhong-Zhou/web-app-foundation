import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { Movement } from '../api/types.gen';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { MovementsPage } from './movements-page';

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

/**
 * What moved and who moved it, readable by someone who knows products and
 * people by name (#256).
 */
describe('MovementsPage', () => {
  async function rowFor(movement: Movement) {
    server.use(
      http.get('/api/v1/stock/movements', () =>
        HttpResponse.json({ entries: [movement], nextCursor: null }),
      ),
    );
    renderWithAuth(
      <MemoryRouter>
        <MovementsPage />
      </MemoryRouter>,
      { permissions: ['stock.view'] },
    );
    const sku = await screen.findByText('VITD-60');
    return sku.closest('tr') as HTMLElement;
  }

  it('names the item beside the SKU it kept, and reads the change without padding zeros', async () => {
    const row = await rowFor(MOVEMENT);

    expect(row).toHaveTextContent('VITD-60 维生素 D (60 粒)');
    expect(row).toHaveTextContent('NN-2410-07');
    expect(row).toHaveTextContent('−24');
    expect(row).not.toHaveTextContent('24.0000');
  });

  it('names who by name, their email beneath', async () => {
    const row = await rowFor(MOVEMENT);

    expect(within(row).getByText('王建国')).toBeVisible();
    expect(within(row).getByText('wang@example.com')).toBeVisible();
  });

  it('says Deleted user for an anonymised account, not its stored name', async () => {
    const row = await rowFor({
      ...MOVEMENT,
      actorName: 'Deleted User',
      actorEmail: null,
    });

    expect(within(row).getByText('Deleted user')).toBeVisible();
    expect(within(row).queryByText('Deleted User')).not.toBeInTheDocument();
  });
});
