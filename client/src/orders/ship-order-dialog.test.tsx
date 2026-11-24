import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import type {
  Location,
  OrderDetail,
  OrderLine,
  ShipmentPlanLot,
} from '../api/types.gen';
import { orderLine } from '../test/factories';
import { server } from '../test/setup';
import { ShipOrderDialog } from './ship-order-dialog';

/** A line with only what shipping reads: its SKU and what is left to send. */
function line(id: string, sku: string, outstanding: string): OrderLine {
  return orderLine({
    id,
    variantId: `variant-${id}`,
    sku,
    description: `Item ${sku}`,
    quantityOrdered: outstanding,
    quantityOutstanding: outstanding,
  });
}

const ORDER = {
  id: 'order-1',
  direction: 'sale',
  status: 'confirmed',
  lines: [line('l1', 'FOCUS-60CT', '25.0000'), line('l2', 'SCOOP', '10.0000')],
} as OrderDetail;

const SHELF: Location = {
  id: 'loc-shelf',
  type: 'bin',
  name: 'Shelf',
  code: null,
  parentId: null,
  isAvailable: true,
  isActive: true,
  address: null,
};

describe('ShipOrderDialog', () => {
  /**
   * Partial is the normal case: every outstanding line is offered, and one
   * set to 0 stays behind for a later shipment rather than being sent.
   */
  it('sends only the lines with something to ship', async () => {
    const user = userEvent.setup();
    const sent: { lines: { lineId: string; quantity: string }[] }[] = [];

    server.use(
      http.post('/api/v1/orders/order-1/shipments/preview', () =>
        HttpResponse.json({ lines: [] }),
      ),
      http.post('/api/v1/orders/order-1/shipments', async ({ request }) => {
        sent.push((await request.json()) as (typeof sent)[number]);
        return HttpResponse.json({ shipment: { id: 's1' } }, { status: 201 });
      }),
    );

    render(
      <ShipOrderDialog
        open
        order={ORDER}
        locations={[SHELF]}
        onClose={() => undefined}
        onShipped={() => undefined}
      />,
    );

    // Prefilled with what is outstanding.
    expect(screen.getByLabelText('Ship FOCUS-60CT')).toHaveValue('25.0000');

    await user.clear(screen.getByLabelText('Ship SCOOP'));
    await user.type(screen.getByLabelText('Ship SCOOP'), '0');

    await user.click(screen.getByLabelText(/Ship from/));
    await user.click(await screen.findByRole('option', { name: 'Shelf' }));

    await user.click(screen.getByRole('button', { name: 'Ship' }));

    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0].lines).toEqual([{ lineId: 'l1', quantity: '25.0000' }]);
  });

  // ADR-094, D2: a lot whose expiry is not known yet reads "expiry to
  // add" among the lots the plan takes and "Expiry to add" once lots are
  // chosen, never "Does not expire"; Ship warns of it in amber, naming
  // it, and still ships.
  it('warns of a lot it will take whose expiry is still to add, naming it, and still ships', async () => {
    const user = userEvent.setup();
    const sent: { lines: { lineId: string }[] }[] = [];
    const lot = (
      code: string,
      expiry: ShipmentPlanLot['expiry'],
      take: string,
    ): ShipmentPlanLot => ({
      lotId: `lot-${code}`,
      code,
      expiresAt: expiry === 'date' ? '2027-03-01' : null,
      expiry,
      onHand: '10.0000',
      take,
      taken: take !== '0',
    });

    server.use(
      http.post('/api/v1/orders/order-1/shipments/preview', () =>
        HttpResponse.json({
          lines: [
            {
              lineId: 'l1',
              sku: 'FOCUS-60CT',
              quantity: '25.0000',
              tracksLots: true,
              lots: [
                lot('DATED', 'date', '10.0000'),
                lot('TO-ADD', 'unknown', '10.0000'),
                lot('NONE', 'none', '5.0000'),
                lot('LEFT', 'unknown', '0'),
              ],
              shortBy: null,
              exceedsOutstanding: false,
            },
          ],
        }),
      ),
      http.post('/api/v1/orders/order-1/shipments', async ({ request }) => {
        sent.push((await request.json()) as (typeof sent)[number]);
        return HttpResponse.json({ shipment: { id: 's1' } }, { status: 201 });
      }),
    );

    render(
      <ShipOrderDialog
        open
        order={{ ...ORDER, lines: [ORDER.lines[0]] }}
        locations={[SHELF]}
        onClose={() => undefined}
        onShipped={() => undefined}
      />,
    );
    await user.click(screen.getByLabelText(/Ship from/));
    await user.click(await screen.findByRole('option', { name: 'Shelf' }));

    // One amber line for the lot taken whose expiry is to add, none for
    // one it will not take.
    await expect
      .poll(() =>
        screen.queryAllByRole('alert').map((alert) => alert.textContent),
      )
      .toEqual([
        'Lot TO-ADD’s expiry has not been entered. The packing slip will show none until it is.',
      ]);
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'P' &&
          !!element.textContent?.startsWith('DATED'),
      ).textContent,
    ).toBe(
      'DATED (expires Mar 1, 2027): 10.0000 · TO-ADD (expiry to add): 10.0000 · NONE: 5.0000',
    );

    await user.click(screen.getByRole('button', { name: 'Choose lots' }));
    const cells = screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.querySelectorAll('td')[1].textContent);
    expect(cells).toEqual([
      'Mar 1, 2027',
      'Expiry to add',
      '—',
      'Expiry to add',
    ]);
    expect(screen.queryByText('Does not expire')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ship' }));
    await expect.poll(() => sent.length).toBe(1);
  });
});
