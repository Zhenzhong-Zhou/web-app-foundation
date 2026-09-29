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
  const onClose = vi.fn();

  render(
    <SetCostDialog
      open
      entry={entry}
      baseCurrency="CAD"
      onClose={onClose}
      onSaved={onSaved}
    />,
  );

  return { onSaved, onClose };
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

  /**
   * A request cannot be recalled once sent, so nothing may close the dialog
   * while it is out: not Cancel, and not Escape or the backdrop either, which
   * until this was guarded would close it while the cost still landed.
   */
  it('cannot be closed while it is saving', async () => {
    const user = userEvent.setup();
    let answer: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => {
      answer = resolve;
    });

    server.use(
      http.put('/api/v1/costs/valuations/valuation-1', async () => {
        await answered;
        return HttpResponse.json({
          cost: { value: '25.000000', held: '25.000000', issued: '0.000000' },
        });
      }),
    );

    const { onClose, onSaved } = open({
      ...RECEIPT,
      unitPrice: '0.2500',
      currency: 'CAD',
    });

    await user.click(screen.getByRole('button', { name: 'Set cost' }));
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    // Focus back inside, where a browser's focus trap would keep it: the
    // disabled button dropped it to the body, which Escape would not reach.
    field('Unit price').focus();
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();

    answer();
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('closes on Escape when nothing is being saved', async () => {
    const user = userEvent.setup();
    const { onClose } = open();

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
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
