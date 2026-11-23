import { ThemeProvider } from '@mui/material/styles';
import {
  render as renderPlain,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { Delivery, Location, Partner } from '../api/types.gen';
import { ToastProvider } from '../components/toast-provider';
import { apiError, VARIANTS } from '../test/handlers';
import { server } from '../test/setup';
import { themeFor } from '../theme';
import { ReceiveStockDialog } from './receive-stock-dialog';

/** The message's Open the lot goes through the router. */
function render(ui: ReactElement) {
  return renderPlain(ui, { wrapper: MemoryRouter });
}

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

/** Why is there no order? (ADR-094, R11), asked of every receipt here. */
function why(option = 'Opening stock') {
  return choose('Why is there no order?', option);
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
    await why();
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
      screen.getByRole('combobox', { name: 'Why is there no order?' }),
    ).toHaveAccessibleDescription('Choose why there is no order.');
    expect(
      screen.getByRole('combobox', { name: 'Into' }),
    ).toHaveAccessibleDescription('Choose a location.');
    expect(quantityField()).toHaveAccessibleDescription('Type a quantity.');
  });

  it('says the lot number is missing for a lot-tracked item', async () => {
    const user = userEvent.setup();

    open();

    await choose('Item', /LOTTED-1/);
    await why();
    await user.type(quantityField(), '5');
    await user.click(screen.getByRole('button', { name: 'Receive' }));

    const lot = screen.getByRole('combobox', { name: 'Lot number' });
    expect(lot).toHaveFocus();
    expect(lot).toHaveAccessibleDescription(
      'Type the lot number as printed, or make a code for us.',
    );
    // A first lot: none chosen, so Expires asks too.
    expect(
      screen.getByRole('radiogroup', { name: /^Expires/ }),
    ).toHaveAccessibleDescription('Choose when the lot expires.');
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

  // Review 3: why no lot is asked, said under the item.
  it('says under an item not tracked that no lot is asked, offering no start to whoever may not', async () => {
    open();

    await choose('Item', /PLAIN-1/);

    expect(
      await screen.findByText(/doesn’t track lots, so no lot is asked\.$/),
    ).toHaveTextContent(/^PLAIN-1 doesn’t track lots, so no lot is asked\.$/);
    expect(
      screen.queryByRole('button', { name: /^Start tracking lots/ }),
    ).not.toBeInTheDocument();
  });

  // Review 3: Start tracking lots… over the dialog, as Found in a count
  // opens Count it in…; started, the lot fields show, what was typed kept.
  it('starts lot tracking from the line over the dialog, then asks the lot, the quantity kept; Cancel gives focus back to the line', async () => {
    const user = userEvent.setup();
    let started = false;
    const path =
      '/api/v1/products/product-plain/variants/variant-plain/lot-tracking';
    server.use(
      http.get(path, () =>
        HttpResponse.json({
          variantId: 'variant-plain',
          sku: 'PLAIN-1',
          onHand: '0.0000',
          places: [],
          runCount: 0,
          runs: [],
        }),
      ),
      http.post(path, () => {
        started = true;
        return HttpResponse.json({ lot: null }, { status: 201 });
      }),
      http.get('/api/v1/products/variants', () =>
        HttpResponse.json(
          VARIANTS.map((each) =>
            each.id === 'variant-plain' && started
              ? { ...each, tracksLots: true }
              : each,
          ),
        ),
      ),
    );
    // The app's theme gives a dialog's button focus back as it closes.
    render(
      <ThemeProvider theme={themeFor('en')}>
        <ToastProvider>
          <ReceiveStockDialog
            open
            locations={LOCATIONS}
            tree={LOCATIONS}
            defaultLocationId="location-a"
            canStartTracking
            onClose={vi.fn()}
            onReceived={vi.fn()}
          />
        </ToastProvider>
      </ThemeProvider>,
    );
    await choose('Item', /PLAIN-1/);
    await user.type(quantityField(), '12');

    const start = await screen.findByRole('button', {
      name: 'Start tracking lots for PLAIN-1…',
    });
    await user.click(start);
    const question = await screen.findByRole('dialog', {
      name: 'Start tracking lots for PLAIN-1',
    });
    await user.click(within(question).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(question).not.toBeInTheDocument());
    await waitFor(() => expect(start).toHaveFocus());
    await user.keyboard('{Enter}');
    const again = await screen.findByRole('dialog', {
      name: 'Start tracking lots for PLAIN-1',
    });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(again).not.toBeInTheDocument());
    await waitFor(() => expect(start).toHaveFocus());

    await user.click(start);
    await user.click(
      within(
        await screen.findByRole('dialog', {
          name: 'Start tracking lots for PLAIN-1',
        }),
      ).getByRole('button', { name: 'Start tracking lots' }),
    );

    expect(
      await screen.findByRole('combobox', { name: 'Lot number' }),
    ).toBeVisible();
    expect(quantityField()).toHaveValue('12');
    expect(screen.queryByText(/doesn’t track lots/)).not.toBeInTheDocument();
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
    await why();
    await user.type(quantityField(), '2.5000');
    await user.click(screen.getByRole('button', { name: 'Receive' }));

    /**
     * A string, not a number. numeric(18, 4) exists so a quantity never passes
     * through a JS double (ADR-025), and JSON.stringify would happily send 2.5
     * if anything on this path called Number().
     */
    await waitFor(() => {
      expect(body).toMatchObject({
        quantity: '2.5000',
        reason: 'receipt',
        reasonDetail: 'opening',
      });
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
    await why();
    await user.type(quantityField(), '3000');
    await user.click(screen.getByRole('button', { name: 'Receive' }));

    // The dialog stays open here, its parent owning it, so the toast
    // behind it is hidden from the tree.
    expect(
      await screen.findByRole('status', { hidden: true }),
    ).toHaveTextContent(/^Received 3,000 \S+ of PLAIN-1 with no order\.$/);
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
    await why();
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

  describe('why there is no order, and from whom (ADR-094, R11, R12)', () => {
    const NORTHSIDE: Partner = {
      id: 'partner-north',
      name: 'Northside Pharmacy',
      code: 'NP',
      taxId: null,
      salePriceListId: null,
      purchasePriceListId: null,
      documentLanguage: null,
      documentSecondLanguage: null,
      notes: null,
      isActive: true,
    };

    it('offers the four reasons, and sends Other’s note and whom it came from', async () => {
      const user = userEvent.setup();
      let body: unknown;
      server.use(
        http.get('/api/v1/partners', () => HttpResponse.json([NORTHSIDE])),
        http.post('/api/v1/stock/movements', async ({ request }) => {
          body = await request.json();
          return HttpResponse.json(
            {
              movement: { id: 'm', lotId: null },
              needsCost: true,
              lotCode: null,
            },
            { status: 201 },
          );
        }),
      );
      render(
        <ReceiveStockDialog
          open
          locations={LOCATIONS}
          tree={LOCATIONS}
          defaultLocationId="location-a"
          canSeePartners
          onClose={vi.fn()}
          onReceived={vi.fn()}
        />,
      );

      await choose('Item', /PLAIN-1/);
      await user.click(
        screen.getByRole('combobox', { name: 'Why is there no order?' }),
      );
      expect(
        screen.getAllByRole('option').map((option) => option.textContent),
      ).toEqual(['Opening stock', 'Returned', 'A sample', 'Other']);
      await user.click(screen.getByRole('option', { name: 'Other' }));
      await user.type(
        screen.getByRole('textbox', { name: 'Note' }),
        'Left by the courier',
      );
      await choose('From', /Northside Pharmacy/);
      await user.type(quantityField(), '5');
      await user.click(screen.getByRole('button', { name: 'Receive' }));

      await waitFor(() =>
        expect(body).toMatchObject({
          reason: 'receipt',
          reasonDetail: 'other',
          note: 'Left by the courier',
          recipientPartnerId: 'partner-north',
        }),
      );
    });

    it('asks no From of a reader who may not see partners', async () => {
      open();
      await choose('Item', /PLAIN-1/);

      expect(screen.queryByRole('combobox', { name: 'From' })).toBeNull();
    });

    // R12: Found in a count is no receipt; Count it in… opens instead.
    it('opens Count it in… for Found in a count with the item and place, then gives focus back to the question', async () => {
      const onFoundInCount = vi.fn();
      const dialog = (counting: boolean) => (
        <ReceiveStockDialog
          open
          locations={LOCATIONS}
          tree={LOCATIONS}
          defaultLocationId="location-a"
          counting={counting}
          onClose={vi.fn()}
          onReceived={vi.fn()}
          onFoundInCount={onFoundInCount}
        />
      );
      const { rerender } = render(dialog(false));

      await choose('Item', /LOTTED-1/);
      await why('Found in a count');

      expect(onFoundInCount).toHaveBeenCalledWith(
        {
          variantId: 'variant-lotted',
          sku: 'LOTTED-1',
          unitOfMeasure: 'each',
          tracksLots: true,
        },
        'location-a',
      );
      const question = screen.getByRole('combobox', {
        name: 'Why is there no order?',
      });
      // Nothing is received: the question stays to answer.
      expect(question).toHaveTextContent(/^\W*$/);

      rerender(dialog(true));
      (document.activeElement as HTMLElement | null)?.blur();
      rerender(dialog(false));
      expect(question).toHaveFocus();
    });

    it('offers no Found in a count to a reader who may not correct counts', async () => {
      const user = userEvent.setup();
      open();
      await choose('Item', /PLAIN-1/);
      await user.click(
        screen.getByRole('combobox', { name: 'Why is there no order?' }),
      );

      expect(
        screen.queryByRole('option', { name: 'Found in a count' }),
      ).toBeNull();
    });

    // Review 36: what it offers, said under it, and Found in a count's
    // way out for whoever has it.
    it('says under the question what it offers, and that Found in a count is no receipt', async () => {
      const { unmount } = render(
        <ReceiveStockDialog
          open
          locations={LOCATIONS}
          tree={LOCATIONS}
          defaultLocationId="location-a"
          onClose={vi.fn()}
          onReceived={vi.fn()}
        />,
      );
      expect(
        screen.getByRole('combobox', { name: 'Why is there no order?' }),
      ).toHaveAccessibleDescription(
        'Opening stock, Returned, A sample or Other.',
      );
      unmount();

      render(
        <ReceiveStockDialog
          open
          locations={LOCATIONS}
          tree={LOCATIONS}
          defaultLocationId="location-a"
          onClose={vi.fn()}
          onReceived={vi.fn()}
          onFoundInCount={vi.fn()}
        />,
      );
      expect(
        screen.getByRole('combobox', { name: 'Why is there no order?' }),
      ).toHaveAccessibleDescription(
        'Opening stock, Returned, A sample or Other. Found in a count is not a receipt: it opens Count it in…',
      );
    });
  });

  // ADR-094, R3 and E3: a code made for us, named after saving.
  it('makes a code for us, the message naming it with Copy code and Open the lot; the row opens at its place', async () => {
    const user = userEvent.setup();
    let body: unknown;
    server.use(
      http.post('/api/v1/stock/movements', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          {
            movement: { id: 'm', lotId: 'lot-made' },
            needsCost: true,
            lotCode: 'L-2026-10-17-1',
          },
          { status: 201 },
        );
      }),
    );
    const onReceived = vi.fn(() => Promise.resolve());
    function Landed() {
      return <p>{`At ${useLocation().pathname}`}</p>;
    }
    renderPlain(
      <ToastProvider>
        <MemoryRouter initialEntries={['/inventory']}>
          <Routes>
            <Route
              path="/inventory"
              element={
                <ReceiveStockDialog
                  open
                  locations={LOCATIONS}
                  tree={LOCATIONS}
                  defaultLocationId="location-a"
                  onClose={vi.fn()}
                  onReceived={onReceived}
                />
              }
            />
            <Route path="*" element={<Landed />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    );

    await choose('Item', /LOTTED-1/);
    await why();
    await user.type(quantityField(), '5');
    await user.click(
      screen.getByRole('button', { name: 'Make a code for us' }),
    );
    await user.click(screen.getByRole('button', { name: 'Receive' }));

    await waitFor(() =>
      expect(body).toMatchObject({
        lot: { makeCode: true, expiry: 'unknown' },
      }),
    );
    expect(
      await screen.findByRole('status', { hidden: true }),
    ).toHaveTextContent(
      'Received 5 each of LOTTED-1 with no order, new lot L-2026-10-17-1. Write this code on the delivery. It waits for a cost.',
    );
    expect(onReceived).toHaveBeenCalledWith({
      variantId: 'variant-lotted',
      locationId: 'location-a',
    });

    await user.click(
      screen.getByRole('button', { name: 'Copy code', hidden: true }),
    );
    // user-event's own clipboard, which setup() puts in the browser's place.
    expect(await navigator.clipboard.readText()).toBe('L-2026-10-17-1');
    await waitFor(() =>
      expect(screen.getByRole('status', { hidden: true })).toHaveTextContent(
        'Lot code L-2026-10-17-1 copied.',
      ),
    );

    await user.click(
      screen.getByRole('button', { name: 'Open the lot', hidden: true }),
    );
    expect(await screen.findByText('At /lots/lot-made')).toBeInTheDocument();
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
        productId: 'product-1',
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
      await why('A sample');
      await user.type(quantityField(), '5');
      await user.click(screen.getByRole('button', { name: 'Receive' }));

      await waitFor(() =>
        expect(posted).toMatchObject({
          variantId: 'variant-plain',
          quantity: '5',
          reason: 'receipt',
          reasonDetail: 'sample',
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
