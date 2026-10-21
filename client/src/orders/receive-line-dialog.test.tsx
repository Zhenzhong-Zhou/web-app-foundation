import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import type { Location, OrderLine } from '../api/types.gen';
import { orderLine } from '../test/factories';
import { server } from '../test/setup';
import { ReceiveLineDialog } from './receive-line-dialog';

const DOCK: Location = {
  id: 'loc-dock',
  type: 'bin',
  name: 'Dock',
  code: null,
  parentId: null,
  isAvailable: true,
  isActive: true,
  address: null,
};

/**
 * Receiving and what it sends, with every read of the catalogue and the
 * lots counted: the line says whether a lot is needed (ADR-080), so a
 * receiver who may see neither products nor stock still receives.
 */
async function receive(line: OrderLine, lotCode?: string) {
  const user = userEvent.setup();
  const sent: { lot?: { code: string } }[] = [];
  const reads: string[] = [];

  server.use(
    http.get('/api/v1/products/variants', ({ request }) => {
      reads.push(request.url);
      return new HttpResponse(null, { status: 403 });
    }),
    http.get('/api/v1/stock/lots', ({ request }) => {
      reads.push(request.url);
      return new HttpResponse(null, { status: 403 });
    }),
    http.post(
      `/api/v1/orders/order-1/lines/${line.id}/receipts`,
      async ({ request }) => {
        sent.push((await request.json()) as (typeof sent)[number]);
        return HttpResponse.json({ movement: { id: 'm1' } }, { status: 201 });
      },
    ),
  );

  render(
    <ReceiveLineDialog
      orderId="order-1"
      line={line}
      locations={[DOCK]}
      canSeeLots={false}
      onClose={() => undefined}
      onReceived={() => Promise.resolve()}
    />,
  );

  await user.click(screen.getByLabelText(/Into/));
  await user.click(await screen.findByRole('option', { name: 'Dock' }));
  await user.type(screen.getByLabelText(/Quantity/), '4');
  if (lotCode) await user.type(screen.getByLabelText(/Lot number/), lotCode);
  await user.click(screen.getByRole('button', { name: 'Receive' }));

  await expect.poll(() => sent.length).toBe(1);
  return { sent: sent[0], reads };
}

describe('ReceiveLineDialog', () => {
  it('asks for a lot, and counts in the unit, as the line says, reading nothing else', async () => {
    const { sent, reads } = await receive(
      orderLine({ tracksLots: true, unitOfMeasure: 'kg' }),
      'OIL-0425',
    );

    expect(sent.lot).toEqual({ code: 'OIL-0425' });
    expect(reads).toEqual([]);
  });

  it('shows the unit beside what is outstanding', () => {
    render(
      <ReceiveLineDialog
        orderId="order-1"
        line={orderLine({ unitOfMeasure: 'kg' })}
        locations={[DOCK]}
        canSeeLots={false}
        onClose={() => undefined}
        onReceived={() => Promise.resolve()}
      />,
    );

    expect(
      screen.getByText('Up to 40.0000 kg still outstanding.'),
    ).toBeInTheDocument();
  });

  it('sends no lot, and offers none, for a line that does not track them', async () => {
    const { sent } = await receive(orderLine({ tracksLots: false }));

    expect(sent).not.toHaveProperty('lot');
    expect(screen.queryByLabelText(/Lot number/)).not.toBeInTheDocument();
  });
});
