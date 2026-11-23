import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import type { StockPile } from '../api/types.gen';
import { apiError } from '../test/handlers';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { MoveStockDialog } from './move-stock-dialog';

const ROW: StockPile = {
  id: 'row-1',
  variantId: 'variant-plain',
  sku: 'MAGCAP-120',
  productName: 'Magnesium',
  variantName: null,
  unitOfMeasure: 'each',
  locationId: 'location-a',
  locationName: 'Main Site',
  locationCode: 'MAIN',
  lotId: null,
  lotCode: null,
  lotExpiresAt: null,
  lotExpiry: null,
  lotIsAssigned: null,
  lotSupplierLot: null,
  quantity: '12',
  emptiedOn: null,
  issuedToRun: null,
};

// stock.takeableSkuTakenHeld, as the server words it, with the demo's codes.
const REFUSAL = 'Only 2 MAGCAP-120 can be taken: 10 is held for SO-DEMO-7.';

/**
 * A move's refusal says what every refusal's line says (FormError): its
 * references kept whole (ADR-081).
 */
describe('MoveStockDialog, refused', () => {
  it('keeps the references in the server’s refusal whole', async () => {
    server.use(
      http.post('/api/v1/stock/movements', () => apiError(409, REFUSAL)),
    );
    const user = userEvent.setup();
    renderWithAuth(
      <MoveStockDialog
        mode="ship"
        row={ROW}
        locations={[]}
        tree={[]}
        canSeePartners
        onClose={vi.fn()}
        onMoved={vi.fn()}
      />,
    );

    await user.type(screen.getByRole('textbox', { name: 'Quantity' }), '12');
    await user.click(screen.getByRole('button', { name: 'Ship' }));

    expect(
      await screen.findByRole('alert', { name: 'Error' }),
    ).toHaveTextContent(REFUSAL);
    const alert = screen.getByRole('alert', { name: 'Error' });
    for (const code of [/^MAGCAP-120$/, /^SO-DEMO-7/]) {
      expect(getComputedStyle(within(alert).getByText(code)).whiteSpace).toBe(
        'nowrap',
      );
    }
  });
});

/**
 * Correct the count's Why: each detail stands alone in its menu, so it
 * starts with a capital, as the reason does (136a).
 */
describe('MoveStockDialog, correcting the count', () => {
  it('offers each Why with its capital', async () => {
    const user = userEvent.setup();
    renderWithAuth(
      <MoveStockDialog
        mode="adjust"
        row={ROW}
        locations={[]}
        tree={[]}
        canSeePartners
        onClose={vi.fn()}
        onMoved={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: /^Why/ }));
    expect(
      within(screen.getByRole('listbox'))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Miscount', 'Damaged', 'Expired', 'Lost', 'Found']);
  });
});
