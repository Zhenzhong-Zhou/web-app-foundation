import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import type { Delivery, Location } from '../api/types.gen';
import { ToastProvider } from '../components/toast-provider';
import { apiError } from '../test/handlers';
import { server } from '../test/setup';
import { ReceiveStockDialog } from './receive-stock-dialog';

/**
 * What e2e cannot reach cheaply: the branches.
 *
 * The browser suite proves receiving works end to end once. Everything else
 * about this dialog — a field that appears only for some items, a server
 * refusal rendered rather than swallowed, an empty catalogue — costs a
 * registration and a browser there and a few milliseconds here.
 *
 * getByRole throughout, never getByLabelText. MUI renders a TextField's label
 * as a div linked by aria-labelledby rather than a real <label>, so the label
 * query finds nothing — for selects and plain text fields alike.
 */

const LOCATIONS: Location[] = [
  {
    id: 'location-a',
    type: 'site',
    name: 'Main Site',
    code: 'MAIN',
    parentId: null,
    isAvailable: true,
    isActive: true,
    address: null,
  },
];

function open(onReceived = vi.fn(), defaultLocationId = 'location-a') {
  render(
    <ReceiveStockDialog
      open
      locations={LOCATIONS}
      tree={LOCATIONS}
      defaultLocationId={defaultLocationId}
      onClose={vi.fn()}
      onReceived={onReceived}
    />,
  );

  return { onReceived };
}

/**
 * Two steps for both kinds of picker: the Item autocomplete and the Into
 * select each open a listbox from a combobox.
 */
async function choose(label: string, option: string | RegExp) {
  const user = userEvent.setup();

  await user.click(screen.getByRole('combobox', { name: label }));

  // findByRole, because the variant list arrives from the network after the
  // first render — a get here races the fetch.
  await user.click(await screen.findByRole('option', { name: option }));
}

function quantityField() {
  return screen.getByRole('textbox', { name: 'Quantity' });
}

describe('ReceiveStockDialog', () => {
  // A keyboard user types the item at once, with no Tab first (#313).
  it('starts in its first field, the item', () => {
    open();

    expect(screen.getByRole('combobox', { name: 'Item' })).toHaveFocus();
  });

  // #631: Into lists each place by its path, its warehouse first, read
  // from the whole tree.
  it('lists each place by its path', async () => {
    const shelf: Location = {
      ...LOCATIONS[0],
      id: 'shelf-a2',
      type: 'shelf',
      name: 'Shelf A2',
      code: 'A2',
      parentId: 'location-a',
    };
    render(
      <ReceiveStockDialog
        open
        locations={[shelf]}
        tree={[...LOCATIONS, shelf]}
        defaultLocationId=""
        onClose={vi.fn()}
        onReceived={vi.fn()}
      />,
    );

    await userEvent
      .setup()
      .click(screen.getByRole('combobox', { name: 'Into' }));
    expect(
      await screen.findByRole('option', {
        name: 'Main Site › Shelf A2 (A2)',
      }),
    ).toBeVisible();
  });

  /**
   * The form checks itself (#310). The browser's own check focused the Into
   * select's hidden input, and a screen reader heard nothing it could place.
   */
  it('says Into is missing on Enter, with focus on its visible box', async () => {
    const user = userEvent.setup();
    let sent = false;
    server.use(
      http.post('/api/v1/stock/movements', () => {
        sent = true;
        return HttpResponse.json({ movement: { id: 'm' } }, { status: 201 });
      }),
    );

    open(vi.fn(), '');

    await choose('Item', /PLAIN-1/);
    await user.type(quantityField(), '5{Enter}');

    const into = screen.getByRole('combobox', { name: 'Into' });
    expect(into).toHaveFocus();
    expect(into).toHaveAccessibleDescription('Choose a location.');
    expect(sent).toBe(false);
  });

  it('says what each empty field needs, focusing the first', async () => {
    const user = userEvent.setup();

    open(vi.fn(), '');

    await user.click(screen.getByRole('button', { name: 'Receive' }));

    const item = screen.getByRole('combobox', { name: 'Item' });
    expect(item).toHaveFocus();
    expect(item).toHaveAccessibleDescription('Choose an item.');
    expect(
      screen.getByRole('combobox', { name: 'Into' }),
    ).toHaveAccessibleDescription('Choose a location.');
    expect(quantityField()).toHaveAccessibleDescription('Type a quantity.');
  });

  it('says the lot number is missing for a lot-tracked item', async () => {
    const user = userEvent.setup();

    open();

    await choose('Item', /LOTTED-1/);
    await user.type(quantityField(), '5');
    await user.click(screen.getByRole('button', { name: 'Receive' }));

    const lot = screen.getByRole('combobox', { name: 'Lot number' });
    expect(lot).toHaveFocus();
    expect(lot).toHaveAccessibleDescription('Type the lot number.');
  });

  it('hides the lot fields for an item that does not track lots', async () => {
    open();

    await choose('Item', /PLAIN-1/);

    /**
     * The server refuses a lot on a variant that does not track them, and
     * refuses a movement without one on a variant that does (ADR-023). The form
     * follows the same rule rather than offering a field that will be rejected.
     */
    expect(
      screen.queryByRole('textbox', { name: 'Lot number' }),
    ).not.toBeInTheDocument();
  });

  it('shows the lot field for a lot-tracked item', async () => {
    open();

    await choose('Item', /LOTTED-1/);

    /**
     * Expiry is not asserted here: it is a date input, whose role is not
     * textbox, and the lot number appearing is what proves the branch rendered.
     */
    expect(
      await screen.findByRole('combobox', { name: 'Lot number' }),
    ).toBeRequired();
  });

  it('sends the quantity as the string that was typed', async () => {
    const user = userEvent.setup();
    let body: unknown;

    server.use(
      http.post('/api/v1/stock/movements', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ movement: { id: 'm' } }, { status: 201 });
      }),
    );

    open();

    await choose('Item', /PLAIN-1/);
    await user.type(quantityField(), '2.5000');
    await user.click(screen.getByRole('button', { name: 'Receive' }));

    /**
     * A string, not a number. numeric(18, 4) exists so a quantity never passes
     * through a JS double (ADR-025), and JSON.stringify would happily send 2.5
     * if anything on this path called Number().
     */
    await waitFor(() => {
      expect(body).toMatchObject({ quantity: '2.5000', reason: 'receipt' });
    });
  });

  // 55a: the confirmation says what happened, and that no order was it.
  it('says what was received, with no order', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('/api/v1/stock/movements', () =>
        HttpResponse.json({ movement: { id: 'm' } }, { status: 201 }),
      ),
    );
    render(
      <ToastProvider>
        <ReceiveStockDialog
          open
          locations={LOCATIONS}
          tree={LOCATIONS}
          defaultLocationId="location-a"
          onClose={vi.fn()}
          onReceived={vi.fn()}
        />
      </ToastProvider>,
    );

    await choose('Item', /PLAIN-1/);
    await user.type(quantityField(), '3000');
    await user.click(screen.getByRole('button', { name: 'Receive' }));

    // The dialog stays open here, its parent owning it, so the toast
    // behind it is hidden from the tree.
    expect(
      await screen.findByRole('status', { hidden: true }),
    ).toHaveTextContent(/^Received 3,000 \S+ of PLAIN-1 with no order$/);
  });

  it('refuses a thousands separator on the field, sending nothing', async () => {
    const user = userEvent.setup();
    let sent = false;

    server.use(
      http.post('/api/v1/stock/movements', () => {
        sent = true;
        return HttpResponse.json({ movement: { id: 'm' } }, { status: 201 });
      }),
    );

    open();

    await choose('Item', /PLAIN-1/);
    await user.type(quantityField(), '1,234');
    await user.click(screen.getByRole('button', { name: 'Receive' }));

    /**
     * "1,234" is a thousand to an English reader and one and a bit to a
     * French one. Guessing wrong on a quantity is worse than asking, so the
     * field says how to write it and the request never leaves (ADR-054).
     */
    expect(
      await screen.findByText(/without separators between thousands/i),
    ).toBeInTheDocument();
    expect(quantityField()).toHaveAttribute('aria-invalid', 'true');
    expect(sent).toBe(false);
  });

  it('renders a refusal from the server rather than swallowing it', async () => {
    const user = userEvent.setup();
    const { onReceived } = open();

    server.use(
      http.post('/api/v1/stock/movements', () =>
        apiError(409, 'Not enough stock at that location for this movement'),
      ),
    );

    await choose('Item', /PLAIN-1/);
    await user.type(quantityField(), '5');
    await user.click(screen.getByRole('button', { name: 'Receive' }));

    expect(
      await screen.findByRole('alert', { name: 'Error' }),
    ).toHaveTextContent(/not enough stock/i);

    // The dialog stays open and the caller is not told it succeeded — closing
    // on a failure would look identical to succeeding.
    expect(onReceived).not.toHaveBeenCalled();
    expect(quantityField()).toHaveValue('5');
  });

  it('says so when the catalogue is empty, and only once it has answered', async () => {
    let answer: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => {
      answer = resolve;
    });
    let asked = false;
    server.use(
      http.get('/api/v1/products/variants', async () => {
        asked = true;
        await answered;
        return HttpResponse.json([]);
      }),
    );

    open();

    // While it loads, an empty list says nothing about the items (#250).
    await expect.poll(() => asked).toBe(true);
    expect(screen.queryByText(/no items yet/i)).not.toBeInTheDocument();

    answer();

    /**
     * An empty picker with no explanation looks like a broken dropdown, which
     * is exactly how it was first reported.
     */
    expect(await screen.findByText(/no items yet/i)).toBeInTheDocument();
  });

  describe('Which delivery is this? (ADR-093, v3)', () => {
    const DELIVERY: Delivery = {
      orderId: 'order-12',
      number: 'PO-000012',
      partnerName: 'Harbour Supply',
      expectedAt: '2026-11-20',
      late: false,
      line: {
        id: 'line-12',
        variantId: 'variant-plain',
        sku: 'PLAIN-1',
        tracksLots: false,
        unitOfMeasure: 'each',
        quantityOrdered: '48.0000',
        quantityFulfilled: '0.0000',
        quantityOutstanding: '48.0000',
      },
    };

    function asking(
      { defaultVariantId = '', deliveries = [DELIVERY] } = {},
      onDelivery = vi.fn(),
    ) {
      const asked: string[] = [];
      server.use(
        http.get('/api/v1/orders/deliveries', ({ request }) => {
          asked.push(new URL(request.url).searchParams.get('variantId')!);
          return HttpResponse.json(deliveries);
        }),
      );
      render(
        <ReceiveStockDialog
          open
          locations={LOCATIONS}
          tree={LOCATIONS}
          defaultLocationId="location-a"
          defaultVariantId={defaultVariantId}
          onClose={vi.fn()}
          onReceived={vi.fn()}
          onDelivery={onDelivery}
        />,
      );
      return { asked, onDelivery };
    }

    // The page's Receive stock: the question once such an item is chosen,
    // nothing chosen for the reader.
    it('asks which delivery it is once an item still to come is chosen, and hands the order on', async () => {
      const user = userEvent.setup();
      const { asked, onDelivery } = asking();

      await choose('Item', /PLAIN-1/);
      const question = await screen.findByRole('radiogroup', {
        name: 'Which delivery is this?',
      });
      expect(asked).toEqual(['variant-plain']);
      expect(question).toHaveTextContent('PO-000012 from Harbour Supply');
      expect(question).toHaveTextContent('48 each still to come, expected');
      // The fields wait for the answer.
      expect(screen.queryByRole('textbox', { name: 'Quantity' })).toBeNull();

      await user.click(screen.getByRole('button', { name: 'Continue' }));
      expect(
        await screen.findByText('Choose the delivery, or Not on an order.'),
      ).toBeVisible();

      await user.click(screen.getByRole('radio', { name: /PO-000012/ }));
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      expect(onDelivery).toHaveBeenCalledWith(DELIVERY);
    });

    // An item's own Receive stock…: its one order chosen already.
    it('has the one order chosen already from an item’s Receive stock…', async () => {
      asking({ defaultVariantId: 'variant-plain' });

      expect(
        await screen.findByRole('radio', { name: /PO-000012/ }),
      ).toBeChecked();
    });

    it('carries on in the free dialog for Not on an order, and still receives', async () => {
      const user = userEvent.setup();
      let posted: unknown = null;
      server.use(
        http.post('/api/v1/stock/movements', async ({ request }) => {
          posted = await request.json();
          return HttpResponse.json({}, { status: 201 });
        }),
      );
      const { onDelivery } = asking({ defaultVariantId: 'variant-plain' });

      await user.click(
        await screen.findByRole('radio', { name: 'Not on an order' }),
      );
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await user.type(quantityField(), '5');
      await user.click(screen.getByRole('button', { name: 'Receive' }));

      await waitFor(() =>
        expect(posted).toMatchObject({
          variantId: 'variant-plain',
          quantity: '5',
          reason: 'receipt',
        }),
      );
      expect(onDelivery).not.toHaveBeenCalled();
    });

    it('asks nothing of an item with no delivery', async () => {
      asking({ deliveries: [] });

      await choose('Item', /PLAIN-1/);
      expect(
        await screen.findByRole('textbox', { name: 'Quantity' }),
      ).toBeVisible();
      expect(screen.queryByRole('radiogroup')).toBeNull();
    });
  });
});
