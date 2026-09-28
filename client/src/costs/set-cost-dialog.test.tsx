import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import type { NeedsCostEntry } from '../lib/types';
import { apiError } from '../test/handlers';
import { server } from '../test/setup';
import { SetCostDialog } from './set-cost-dialog';

/**
 * The branches: a rate field that appears only for a foreign price, what is
 * sent, and a refusal rendered rather than swallowed. getByRole throughout,
 * as the other dialog specs explain.
 */

const RECEIPT: NeedsCostEntry = {
  id: 'valuation-1',
  kind: 'movement',
  reason: 'receipt',
  sku: 'EXTRACT',
  variantId: 'variant-1',
  lotId: null,
  lotCode: null,
  quantity: '100.0000',
  unitPrice: null,
  currency: null,
  referenceType: null,
  referenceId: null,
  createdAt: '2026-09-28T17:00:00.000Z',
};

function open(entry: NeedsCostEntry = RECEIPT, onSaved = vi.fn()) {
  render(
    <SetCostDialog
      open
      entry={entry}
      baseCurrency="CAD"
      onClose={vi.fn()}
      onSaved={onSaved}
    />,
  );

  return { onSaved };
}

const field = (name: string) => screen.getByRole('textbox', { name });
const maybeField = (name: string) => screen.queryByRole('textbox', { name });

describe('SetCostDialog', () => {
  it('asks for a rate only when the price is not in the base currency', async () => {
    const user = userEvent.setup();
    open();

    expect(field('Currency')).toHaveValue('CAD');
    expect(maybeField('Exchange rate')).not.toBeInTheDocument();

    await user.clear(field('Currency'));
    await user.type(field('Currency'), 'usd');

    expect(field('Currency')).toHaveValue('USD');
    expect(field('Exchange rate')).toBeInTheDocument();
  });

  it('prefills a foreign price that is only waiting for a rate', () => {
    open({ ...RECEIPT, unitPrice: '0.2500', currency: 'USD' });

    expect(field('Unit price')).toHaveValue('0.2500');
    expect(field('Currency')).toHaveValue('USD');
    expect(field('Exchange rate')).toBeInTheDocument();
  });

  it('sends the price and currency, and a rate only when given', async () => {
    const user = userEvent.setup();
    let body: unknown;

    server.use(
      http.put('/api/v1/costs/valuations/valuation-1', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          cost: { value: '34.250000', held: '34.250000', issued: '0.000000' },
        });
      }),
    );

    const { onSaved } = open({
      ...RECEIPT,
      unitPrice: '0.2500',
      currency: 'USD',
    });

    await user.type(field('Exchange rate'), '1.37');
    await user.click(screen.getByRole('button', { name: 'Set cost' }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
    expect(body).toEqual({
      unitPrice: '0.2500',
      currency: 'USD',
      exchangeRate: '1.37',
    });
  });

  it('renders a refusal from the server rather than swallowing it', async () => {
    const user = userEvent.setup();

    server.use(
      http.put('/api/v1/costs/valuations/valuation-1', () =>
        apiError(
          409,
          'No USD rate on or before 2026-09-28. Enter one, or give the rate with the cost.',
        ),
      ),
    );

    const { onSaved } = open({
      ...RECEIPT,
      unitPrice: '0.2500',
      currency: 'USD',
    });

    await user.click(screen.getByRole('button', { name: 'Set cost' }));

    expect(
      await screen.findByRole('alert', { name: 'Error' }),
    ).toHaveTextContent('No USD rate on or before 2026-09-28');
    expect(onSaved).not.toHaveBeenCalled();
  });
});
