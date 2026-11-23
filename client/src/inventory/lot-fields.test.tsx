import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { createIntl } from 'react-intl';
import { describe, expect, it } from 'vitest';

import type { Lot, StockCodePlaces } from '../api/types.gen';
import { server } from '../test/setup';
import { LotFields } from './lot-fields';
import {
  lotErrors,
  type LotInput,
  lotRequest,
  NO_LOT,
  useItemLots,
} from './lot-input';

const KNOWN: Lot[] = [
  {
    id: 'lot-1',
    code: 'L2024-A',
    expiresAt: '2027-03-31',
    expiry: 'date',
    isAssigned: false,
    supplierLot: null,
  },
  {
    id: 'lot-2',
    code: 'L2024-B',
    expiresAt: null,
    expiry: 'none',
    isAssigned: true,
    supplierLot: null,
  },
];

const intl = createIntl({ locale: 'en' });

/** Holds the value the way a dialog's form does, its lots read. */
function Harness({
  initial = NO_LOT,
  mustBeNew = false,
  onValue,
}: {
  initial?: LotInput;
  mustBeNew?: boolean;
  onValue?: (value: LotInput) => void;
}) {
  const [value, setValue] = useState(initial);
  const { lots, known } = useItemLots('variant-lotted');
  onValue?.(value);
  return (
    <LotFields
      idPrefix="test"
      variantId="variant-lotted"
      unitOfMeasure="each"
      lots={lots}
      knowsLots={known}
      mustBeNew={mustBeNew}
      value={value}
      onChange={setValue}
    />
  );
}

function knownLots(lots: Lot[] = KNOWN) {
  let asked: string | null = null;
  server.use(
    http.get('/api/v1/stock/lots', ({ request }) => {
      asked = new URL(request.url).searchParams.get('variantId');
      return HttpResponse.json(lots);
    }),
  );
  return () => asked;
}

const code = () => screen.getByRole('combobox', { name: 'Lot number' });
const expires = () => screen.getByRole('radiogroup', { name: /^Expires/ });

describe('LotFields', () => {
  it('offers the lots already on the variant, with their expiry', async () => {
    const askedFor = knownLots();
    const user = userEvent.setup();
    render(<Harness />);

    await waitFor(() => expect(askedFor()).toBe('variant-lotted'));
    await user.click(code());

    expect(
      await screen.findByRole('option', { name: /L2024-A.*Expires/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: /L2024-B.*No expiry.*assigned here/ }),
    ).toBeInTheDocument();
  });

  // R10: as a code is typed, the field says which lot it is.
  it('says a typed code is a lot the item has, which this adds to, with its expiry and what is where, and asks no expiry', async () => {
    knownLots();
    const places: StockCodePlaces = {
      places: [
        {
          locationId: 'location-a',
          locationName: 'Shelf A2',
          locationCode: 'A2',
          locationPath: ['Main Site'],
          isAvailable: true,
          onHand: '120.0000',
          lots: [
            {
              id: 'pile-1',
              variantId: 'variant-lotted',
              sku: 'LOTTED-1',
              productName: 'Tracked Supplement',
              variantName: null,
              unitOfMeasure: 'each',
              locationId: 'location-a',
              locationName: 'Shelf A2',
              locationCode: 'A2',
              lotId: 'lot-1',
              lotCode: 'L2024-A',
              lotExpiresAt: '2027-03-31',
              lotExpiry: 'date',
              lotIsAssigned: false,
              lotSupplierLot: null,
              quantity: '120.0000',
              emptiedOn: null,
            },
          ],
        },
      ],
    };
    server.use(
      http.get('/api/v1/stock/by-code/variant-lotted/places', () =>
        HttpResponse.json(places),
      ),
    );
    const user = userEvent.setup();
    render(<Harness />);
    await waitFor(() => expect(code()).toBeEnabled());

    // Typed in lower case: the server stores it in capitals.
    await user.type(code(), 'l2024-a');

    await waitFor(() =>
      expect(code()).toHaveAccessibleDescription(
        'An existing lot. This adds to it.Expires Mar 31, 2027 · 120 each at Main Site › Shelf A2 (A2)',
      ),
    );
    // Its expiry is the lot's own: a second delivery never rewrites it.
    expect(
      screen.queryByRole('radiogroup', { name: /^Expires/ }),
    ).not.toBeInTheDocument();
  });

  it('says a code it does not have is a new lot, asking when it expires', async () => {
    knownLots();
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByRole('radio', { name: 'On a date', checked: true });

    await user.type(code(), 'NEW-LOT');

    expect(code()).toHaveAccessibleDescription('A new lot.');
    expect(expires()).toBeVisible();
  });

  // R8, E6: Expires starts as the item's last lot had it.
  it('starts Expires as the item’s last lot had it, each of the three', async () => {
    for (const [expiry, words] of [
      ['date', 'On a date'],
      ['unknown', 'Not known yet'],
      ['none', 'Doesn’t expire'],
    ] as const) {
      knownLots([{ ...KNOWN[1], expiry, expiresAt: null }, KNOWN[0]]);
      const { unmount } = render(<Harness />);

      expect(
        await screen.findByRole('radio', { name: words, checked: true }),
      ).toBeChecked();
      unmount();
    }
  });

  it('has none chosen for a first lot', async () => {
    const askedFor = knownLots([]);
    render(<Harness />);
    await waitFor(() => expect(askedFor()).toBe('variant-lotted'));

    for (const radio of within(expires()).getAllByRole('radio')) {
      expect(radio).not.toBeChecked();
    }
  });

  it('asks the day for On a date', async () => {
    knownLots([]);
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.queryByLabelText(/The day it expires/)).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'On a date' }));

    expect(screen.getByLabelText(/The day it expires/)).toBeRequired();
  });

  // R3, R5, ADR-094's table: Make a code for us, then Type one instead.
  it('makes a code for us when saved, offering the supplier’s lot and starting Expires on Not known yet; Type one instead empties the field, focus in it', async () => {
    knownLots();
    const user = userEvent.setup();
    let value = NO_LOT;
    render(
      <Harness
        onValue={(next) => {
          value = next;
        }}
      />,
    );
    await screen.findByRole('radio', { name: 'On a date', checked: true });
    await user.type(code(), 'L2024-A');

    await user.click(
      screen.getByRole('button', { name: 'Make a code for us' }),
    );

    // Today's next code, from the organization's lot series.
    expect(screen.getByRole('textbox', { name: 'Lot number' })).toHaveValue(
      'Made when you save, like L-2026-10-17-1',
    );
    expect(
      screen.getByRole('textbox', { name: 'Supplier’s lot' }),
    ).toBeVisible();
    expect(screen.getByRole('radio', { name: 'Not known yet' })).toBeChecked();
    await user.type(
      screen.getByRole('textbox', { name: 'Supplier’s lot' }),
      'Hx-2609',
    );
    expect(lotRequest(value, KNOWN)).toEqual({
      makeCode: true,
      supplierLot: 'Hx-2609',
      expiry: 'unknown',
      expiresAt: undefined,
    });

    await user.click(screen.getByRole('button', { name: 'Type one instead' }));

    expect(code()).toHaveValue('');
    expect(code()).toHaveFocus();
    expect(
      screen.queryByRole('textbox', { name: 'Supplier’s lot' }),
    ).not.toBeInTheDocument();
    // Back to the last lot's start.
    expect(screen.getByRole('radio', { name: 'On a date' })).toBeChecked();
  });

  it('keeps a choice the person made whichever the code', async () => {
    knownLots();
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByRole('radio', { name: 'On a date', checked: true });

    await user.click(screen.getByRole('radio', { name: 'Doesn’t expire' }));
    await user.click(
      screen.getByRole('button', { name: 'Make a code for us' }),
    );

    expect(screen.getByRole('radio', { name: 'Doesn’t expire' })).toBeChecked();
  });

  // Count it in's new lot (ADR-093, 84a): a code the item has is refused.
  it('says, for a lot that must be new, that a code it has is one to choose among its lots', async () => {
    const askedFor = knownLots();
    const user = userEvent.setup();
    render(<Harness mustBeNew />);
    await waitFor(() => expect(askedFor()).toBe('variant-lotted'));
    const typed = screen.getByRole('textbox', { name: 'Lot number' });

    await user.type(typed, 'L2024-B');

    expect(typed).toHaveAccessibleDescription(
      'Already one of its lots. Choose One of its lots for it, or type another code.',
    );
    expect(expires()).toBeVisible();
  });
});

describe('lotErrors and lotRequest', () => {
  const typed = (next: Partial<LotInput>): LotInput => ({
    ...NO_LOT,
    ...next,
  });

  it('asks a code, then when a new lot expires, then its day', () => {
    expect(lotErrors(NO_LOT, [], intl)).toEqual({
      code: 'Type the lot number as printed, or make a code for us.',
      expiry: 'Choose when the lot expires.',
    });
    expect(lotErrors(typed({ code: 'NEW', expiry: 'date' }), [], intl)).toEqual(
      { day: 'Type the day the lot expires.' },
    );
    expect(lotErrors(typed({ code: 'NEW', expiry: 'none' }), [], intl)).toEqual(
      {},
    );
  });

  it('asks nothing more of a lot the item has, and sends its code alone', () => {
    const lot = typed({ code: 'l2024-a ' });
    expect(lotErrors(lot, KNOWN, intl)).toEqual({});
    expect(lotRequest(lot, KNOWN)).toEqual({ code: 'l2024-a ' });
  });

  it('sends a new code with its expiry, the day only for a date', () => {
    expect(
      lotRequest(
        typed({ code: 'NEW', expiry: 'date', expiresAt: '2028-01-31' }),
        KNOWN,
      ),
    ).toEqual({ code: 'NEW', expiry: 'date', expiresAt: '2028-01-31' });
    expect(
      lotRequest(typed({ code: 'NEW', expiresAt: '2028-01-31' }), [KNOWN[1]]),
    ).toEqual({ code: 'NEW', expiry: 'none', expiresAt: undefined });
    expect(
      lotRequest(typed({ code: 'L2024-A', expiry: 'unknown' }), KNOWN, true),
    ).toEqual({ code: 'L2024-A', mustBeNew: true, expiry: 'unknown' });
  });
});
