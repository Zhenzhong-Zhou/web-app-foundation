import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import type { Location } from '../lib/types';
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
  },
];

function open(onReceived = vi.fn()) {
  render(
    <ReceiveStockDialog
      open
      locations={LOCATIONS}
      defaultLocationId="location-a"
      onClose={vi.fn()}
      onReceived={onReceived}
    />,
  );

  return { onReceived };
}

/** MUI renders a select as a button opening a listbox, so choosing is two steps. */
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

  it('says so when the catalogue is empty', async () => {
    server.use(
      http.get('/api/v1/products/variants', () => HttpResponse.json([])),
    );

    open();

    /**
     * An empty picker with no explanation looks like a broken dropdown, which
     * is exactly how it was first reported.
     */
    expect(await screen.findByText(/no products yet/i)).toBeInTheDocument();
  });
});
