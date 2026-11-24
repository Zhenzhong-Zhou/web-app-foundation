import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import type { NeedsCostEntry } from '../api/types.gen';
import { ToastProvider } from '../components/toast-provider';
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
  reasonDetail: null,
  sku: 'EXTRACT',
  variantId: 'variant-1',
  productId: 'product-1',
  productName: 'Extract',
  variantName: null,
  type: 'material',
  coverFileId: null,
  lotId: null,
  lotCode: null,
  fromLotId: null,
  fromLotCode: null,
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
    <ToastProvider>
      <SetCostDialog
        open
        entry={entry}
        baseCurrency="CAD"
        onClose={onClose}
        onSaved={onSaved}
      />
    </ToastProvider>,
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
          cost: {
            valuationId: 'valuation-1',
            value: '34.250000',
            held: '34.250000',
            issued: '0.000000',
            followed: [],
          },
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
          cost: {
            valuationId: 'valuation-1',
            value: '25.000000',
            held: '25.000000',
            issued: '0.000000',
            followed: [],
          },
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

  // From the write's own answer (ADR-094, D5): the part of the cost that
  // followed stock moved to another lot, each lot named where there are
  // several; else "Cost set".
  it.each([
    ['nothing followed', [], 'Cost set'],
    [
      'one lot',
      [{ lotId: 'lot-b', lotCode: 'LOT-B', value: '40.000000' }],
      'Cost set. CA$40.00 of it followed the stock moved to lot LOT-B.',
    ],
    [
      'two lots',
      [
        { lotId: 'lot-b', lotCode: 'LOT-B', value: '40.000000' },
        { lotId: 'lot-c', lotCode: 'LOT-C', value: '10.000000' },
      ],
      'Cost set. Part of it followed the stock moved to other lots: CA$40.00 to lot LOT-B and CA$10.00 to lot LOT-C.',
    ],
  ])(
    'says what followed the stock moved to other lots: %s',
    async (_case, followed, said) => {
      const user = userEvent.setup();
      server.use(
        http.put('/api/v1/costs/valuations/valuation-1', () =>
          HttpResponse.json({
            cost: {
              valuationId: 'valuation-1',
              value: '80.000000',
              held: '40.000000',
              issued: '0.000000',
              followed,
            },
          }),
        ),
      );
      open({ ...RECEIPT, lotId: 'lot-a', lotCode: 'LOT-A' });

      await user.type(field('Unit price'), '2');
      await user.click(screen.getByRole('button', { name: 'Set cost' }));

      // The toast draws each code apart, so read as one line.
      await waitFor(() => expect(document.body).toHaveTextContent(said));
    },
  );

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
