import { render as renderPlain, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { Delivery, Location, OrderLine } from '../api/types.gen';
import { ToastProvider } from '../components/toast-provider';
import { orderLine } from '../test/factories';
import { server } from '../test/setup';
import { ReceiveLineDialog } from './receive-line-dialog';

/** The message's Open the lot goes through the router. */
function render(ui: ReactElement) {
  return renderPlain(ui, { wrapper: MemoryRouter });
}

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
      orderNumber="PO-000001"
      line={line}
      locations={[DOCK]}
      tree={[DOCK]}
      canSeeLots={false}
      onClose={() => undefined}
      onReceived={() => Promise.resolve()}
    />,
  );

  await user.click(screen.getByLabelText(/Into/));
  await user.click(await screen.findByRole('option', { name: 'Dock' }));
  await user.type(screen.getByLabelText(/Quantity/), '4');
  if (lotCode) {
    await user.type(screen.getByLabelText(/Lot number/), lotCode);
    // A lot the dialog cannot read is asked when it expires (ADR-094, R8).
    await user.click(screen.getByRole('radio', { name: 'Doesn’t expire' }));
  }
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

    expect(sent.lot).toEqual({ code: 'OIL-0425', expiry: 'none' });
    expect(reads).toEqual([]);
  });

  // #160: the text beside the field reads a quantity as the page does.
  it('shows what is outstanding and received so far as the page reads them, with the unit', () => {
    render(
      <ReceiveLineDialog
        orderId="order-1"
        orderNumber="PO-000001"
        line={orderLine({
          unitOfMeasure: 'kg',
          quantityOrdered: '100.0000',
          quantityFulfilled: '60.0000',
          quantityOutstanding: '40.0000',
        })}
        locations={[DOCK]}
        tree={[DOCK]}
        canSeeLots={false}
        onClose={() => undefined}
        onReceived={() => Promise.resolve()}
      />,
    );

    expect(
      screen.getByText('Up to 40 kg still outstanding.'),
    ).toBeInTheDocument();
    expect(screen.getByText('60 of 100 received so far.')).toBeInTheDocument();
  });

  it('sends no lot, and offers none, for a line that does not track them', async () => {
    const { sent } = await receive(orderLine({ tracksLots: false }));

    expect(sent).not.toHaveProperty('lot');
    expect(screen.queryByLabelText(/Lot number/)).not.toBeInTheDocument();
  });

  // Review 3: why no lot is asked, and Start tracking lots… for whoever
  // may start it; started, the lot fields show, the quantity kept.
  it('says under a line not tracked that no lot is asked, and asks the lot once tracking starts from it', async () => {
    const user = userEvent.setup();
    const path =
      '/api/v1/products/product-plain/variants/variant-plain/lot-tracking';
    server.use(
      http.get(path, () =>
        HttpResponse.json({
          variantId: 'variant-plain',
          sku: 'WIDGET-1',
          onHand: '0.0000',
          places: [],
          runCount: 0,
          runs: [],
        }),
      ),
      http.post(path, () => HttpResponse.json({ lot: null }, { status: 201 })),
    );
    render(
      <ToastProvider>
        <ReceiveLineDialog
          orderId="order-1"
          orderNumber="PO-000001"
          line={orderLine({ tracksLots: false })}
          locations={[DOCK]}
          tree={[DOCK]}
          canSeeLots={false}
          canStartTracking
          onClose={() => undefined}
          onReceived={() => Promise.resolve()}
        />
      </ToastProvider>,
    );
    await user.type(screen.getByLabelText(/Quantity/), '4');

    expect(
      screen.getByText(/doesn’t track lots, so no lot is asked\./),
    ).toHaveTextContent(
      /^WIDGET-1 doesn’t track lots, so no lot is asked\. Start tracking lots…$/,
    );
    await user.click(
      screen.getByRole('button', { name: 'Start tracking lots for WIDGET-1…' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Start tracking lots' }),
    );

    expect(await screen.findByLabelText(/Lot number/)).toBeVisible();
    expect(screen.getByLabelText(/Quantity/)).toHaveValue('4');
  });

  // ADR-094, R3, R5 and E3: a code made for us on an order's Receive.
  it('makes a code for us with the supplier’s lot, the message naming it with Copy code, Open the lot and Open the order', async () => {
    const user = userEvent.setup();
    const line = orderLine({ tracksLots: true });
    const sent: unknown[] = [];
    server.use(
      http.post(
        `/api/v1/orders/order-1/lines/${line.id}/receipts`,
        async ({ request }) => {
          sent.push(await request.json());
          return HttpResponse.json(
            {
              movement: { id: 'm1', lotId: 'lot-made' },
              needsCost: false,
              lotCode: 'L-2026-10-17-1',
            },
            { status: 201 },
          );
        },
      ),
    );
    let received: unknown = null;
    render(
      <ToastProvider>
        <ReceiveLineDialog
          orderId="order-1"
          orderNumber="PO-000001"
          line={line}
          locations={[DOCK]}
          tree={[DOCK]}
          canSeeLots
          onClose={() => undefined}
          onReceived={(at) => {
            received = at;
            return Promise.resolve();
          }}
          onOpenOrder={() => undefined}
        />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('combobox', { name: 'Into' }));
    await user.click(await screen.findByRole('option', { name: 'Dock' }));
    await user.type(screen.getByRole('textbox', { name: 'Quantity' }), '4');
    await user.click(
      screen.getByRole('button', { name: 'Make a code for us' }),
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Supplier’s lot' }),
      'Hx-2609',
    );
    await user.click(screen.getByRole('button', { name: 'Receive' }));

    await expect
      .poll(() => sent)
      .toEqual([
        expect.objectContaining({
          lot: { makeCode: true, supplierLot: 'Hx-2609', expiry: 'unknown' },
        }),
      ]);
    const message = await screen.findByRole('status', { hidden: true });
    expect(message).toHaveTextContent(
      `Received 4 each of ${line.sku} on PO-000001, new lot L-2026-10-17-1. Write this code on the delivery.`,
    );
    // Its buttons in their order, the close button aside.
    expect(
      Array.from(message.querySelectorAll('button'))
        .map((button) => button.textContent)
        .filter(Boolean),
    ).toEqual(['Copy code', 'Open the lot', 'Open the order']);
    expect(received).toEqual({
      variantId: line.variantId,
      locationId: 'loc-dock',
    });
  });

  // ADR-093, v3: opened over Stock for a delivery chosen there.
  it('is titled for the delivery’s order, names the supplier and what is still to come, and fills it in', async () => {
    const user = userEvent.setup();
    const delivery: Delivery = {
      orderId: 'order-12',
      number: 'PO-000012',
      partnerName: 'Harbour Supply',
      expectedAt: null,
      late: false,
      line: {
        id: 'line-12',
        variantId: 'variant-1',
        productId: 'product-1',
        sku: 'VITC-100',
        tracksLots: false,
        unitOfMeasure: 'each',
        quantityOrdered: '48.0000',
        quantityFulfilled: '0.0000',
        quantityOutstanding: '48.0000',
      },
    };
    const sent: { quantity: string; toLocationId: string }[] = [];
    server.use(
      http.post(
        '/api/v1/orders/order-12/lines/line-12/receipts',
        async ({ request }) => {
          sent.push((await request.json()) as (typeof sent)[number]);
          return HttpResponse.json({ movement: { id: 'm1' } }, { status: 201 });
        },
      ),
    );
    let opened = 0;
    render(
      <ToastProvider>
        <ReceiveLineDialog
          orderId={delivery.orderId}
          orderNumber={delivery.number}
          line={delivery.line}
          delivery={delivery}
          locations={[DOCK]}
          tree={[DOCK]}
          canSeeLots
          onClose={() => undefined}
          onReceived={() => Promise.resolve()}
          onOpenOrder={() => {
            opened += 1;
          }}
        />
      </ToastProvider>,
    );

    const dialog = screen.getByRole('dialog', {
      name: 'Receive VITC-100 on PO-000012',
    });
    expect(dialog).toHaveTextContent(
      'From Harbour Supply: 48 each still to come, no day set.',
    );
    expect(screen.getByRole('textbox', { name: 'Quantity' })).toHaveValue(
      '48.0000',
    );

    await user.click(screen.getByRole('combobox', { name: 'Into' }));
    await user.click(await screen.findByRole('option', { name: 'Dock' }));
    await user.click(screen.getByRole('button', { name: 'Receive' }));
    await expect
      .poll(() => sent)
      .toEqual([
        expect.objectContaining({
          quantity: '48.0000',
          toLocationId: 'loc-dock',
        }),
      ]);
    // What happened, with Open the order (55a).
    // The dialog stays open here, its parent owning it, so the toast
    // behind it is hidden from the tree.
    expect(
      await screen.findByRole('status', { hidden: true }),
    ).toHaveTextContent('Received 48 each of VITC-100 on PO-000012');
    await user.click(
      screen.getByRole('button', { name: 'Open the order', hidden: true }),
    );
    expect(opened).toBe(1);
  });
});
