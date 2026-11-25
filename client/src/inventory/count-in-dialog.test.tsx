import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { Location, Lot } from '../api/types.gen';
import { ToastProvider } from '../components/toast-provider';
import { apiError } from '../test/handlers';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { CountInDialog, type CountInItem } from './count-in-dialog';

const SHELF: Location = {
  id: 'loc-c3',
  type: 'shelf',
  name: 'Shelf C3',
  code: 'C3',
  parentId: null,
  isActive: true,
  isAvailable: true,
} as Location;

const LOT: Lot = {
  id: 'lot-5',
  code: 'VC-0305',
  expiresAt: '2027-03-03',
  expiry: 'date',
  isAssigned: false,
  supplierLot: null,
  formerCodes: [],
};

const TRACKED: CountInItem = {
  variantId: 'variant-c',
  sku: 'VITC-100',
  unitOfMeasure: 'each',
  tracksLots: true,
};

/** Where the toast's button landed. */
function Landed() {
  const { pathname, search, hash } = useLocation();
  return <p>{`At ${pathname}${search}${hash}`}</p>;
}

/** The dialog as a page opens it, gone once closed. */
function Opened({
  item,
  canSeeCosts,
  onCounted,
}: {
  item: CountInItem;
  canSeeCosts: boolean;
  onCounted: (locationId: string) => void;
}) {
  const [open, setOpen] = useState(true);
  return open ? (
    <CountInDialog
      item={item}
      locations={[SHELF]}
      tree={[SHELF]}
      canSeeCosts={canSeeCosts}
      onClose={() => setOpen(false)}
      onCounted={onCounted}
    />
  ) : null;
}

/**
 * The dialog over a page, its lots and its write answered, the write's
 * body kept (ADR-093, R26).
 */
function open(
  item: CountInItem,
  {
    needsCost = false,
    refusal,
    canSeeCosts = true,
    lotCode = null,
    lots = [LOT],
  }: {
    needsCost?: boolean;
    refusal?: Response;
    canSeeCosts?: boolean;
    /** The lot the write names, as the server answers (ADR-094). */
    lotCode?: string | null;
    /** The item's lots, as the lot field reads them. */
    lots?: Lot[];
  } = {},
) {
  const sent: Record<string, unknown>[] = [];
  const onCounted = vi.fn();
  server.use(
    http.get('/api/v1/stock/lots', () => HttpResponse.json(lots)),
    http.post('/api/v1/stock/movements', async ({ request }) => {
      sent.push((await request.json()) as Record<string, unknown>);
      if (refusal) return refusal;
      return HttpResponse.json(
        {
          movement: {
            id: 'movement-1',
            variantId: item.variantId,
            sku: item.sku,
            lotId: 'lot-new',
            fromLocationId: null,
            toLocationId: SHELF.id,
            quantity: '12.0000',
            reason: 'adjustment',
            reasonDetail: 'found',
            referenceType: null,
            referenceId: null,
            note: 'Behind the cartons',
            createdAt: '2026-11-20T12:00:00.000Z',
          },
          needsCost,
          lotCode,
        },
        { status: 201 },
      );
    }),
  );
  renderWithAuth(
    <ToastProvider>
      <MemoryRouter initialEntries={['/inventory']}>
        <Routes>
          <Route
            path="/inventory"
            element={
              <Opened
                item={item}
                canSeeCosts={canSeeCosts}
                onCounted={onCounted}
              />
            }
          />
          <Route path="*" element={<Landed />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
    { permissions: ['stock.view', 'stock.move', 'stock.adjust'] },
  );
  return { user: userEvent.setup(), sent, onCounted };
}

/** The place, the quantity and the note, as every count in asks. */
async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('combobox', { name: /^Location/ }));
  await user.click(
    await screen.findByRole('option', { name: 'Shelf C3 (C3)' }),
  );
  await user.type(screen.getByRole('textbox', { name: /^Quantity/ }), '12');
  await user.type(
    screen.getByRole('textbox', { name: /^What happened/ }),
    'Behind the cartons',
  );
}

describe('CountInDialog, found stock', () => {
  it('asks Which lot with neither chosen, and says so at its field on Save', async () => {
    const { user, sent } = open(TRACKED);
    await fill(user);

    const which = screen.getByRole('radiogroup', { name: /^Which lot/ });
    for (const radio of within(which).getAllByRole('radio')) {
      expect(radio).not.toBeChecked();
    }
    await user.click(screen.getByRole('button', { name: 'Save correction' }));

    expect(which).toHaveAccessibleDescription(
      'Choose one of its lots, or a new lot.',
    );
    expect(
      screen.getByRole('radio', { name: 'One of its lots' }),
    ).toHaveFocus();
    expect(sent).toEqual([]);
  });

  it('makes a new lot with the count, saying it waits for a cost, linked to Waiting for a cost', async () => {
    const { user, sent, onCounted } = open(TRACKED, {
      needsCost: true,
      lotCode: 'VC-0310',
    });
    await fill(user);
    await user.click(screen.getByRole('radio', { name: 'A new lot' }));
    await user.type(
      screen.getByRole('textbox', { name: /^Lot number/ }),
      'vc-0310',
    );
    await user.click(screen.getByRole('radio', { name: 'Not known yet' }));
    await user.click(screen.getByRole('button', { name: 'Save correction' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Counted in 12 each of VITC-100 at Shelf C3, new lot VC-0310. It waits for a cost.',
    );
    expect(sent).toEqual([
      {
        variantId: 'variant-c',
        toLocationId: 'loc-c3',
        lot: { code: 'vc-0310', mustBeNew: true, expiry: 'unknown' },
        quantity: '12',
        reason: 'adjustment',
        reasonDetail: 'found',
        note: 'Behind the cartons',
      },
    ]);
    expect(onCounted).toHaveBeenCalledWith('loc-c3');

    await user.click(
      screen.getByRole('button', { name: 'Waiting for a cost' }),
    );
    expect(await screen.findByText('At /costs#costs')).toBeVisible();
  });

  it('counts into one of its lots by its id, linked to its Movements there', async () => {
    const { user, sent } = open(TRACKED, { lotCode: 'VC-0305' });
    await fill(user);
    await user.click(screen.getByRole('radio', { name: 'One of its lots' }));
    await user.click(screen.getByRole('combobox', { name: /^Lot/ }));
    await user.click(
      await screen.findByRole('option', {
        name: 'VC-0305 · Expires Mar 3, 2027',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Save correction' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Counted in 12 each of VITC-100 at Shelf C3, lot VC-0305.',
    );
    expect(sent[0]).toMatchObject({ lotId: 'lot-5' });
    expect(sent[0]).not.toHaveProperty('lot');

    await user.click(screen.getByRole('button', { name: 'Movements' }));
    expect(
      await screen.findByText(
        'At /movements?variantId=variant-c&locationId=loc-c3',
      ),
    ).toBeVisible();
  });

  it('asks only the place for an item not tracked by lot, and its Movements without a cost to set', async () => {
    const { user, sent } = open(
      { ...TRACKED, sku: 'GLOVES-100', tracksLots: false },
      { needsCost: true, canSeeCosts: false },
    );
    await fill(user);

    expect(
      screen.queryByRole('radiogroup', { name: /^Which lot/ }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save correction' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Counted in 12 each of GLOVES-100 at Shelf C3. It waits for a cost.',
    );
    expect(screen.getByRole('button', { name: 'Movements' })).toBeVisible();
    expect(sent[0]).not.toHaveProperty('lot');
    expect(sent[0]).not.toHaveProperty('lotId');
  });

  it('says a code the item has at the lot number, focused there', async () => {
    const refused =
      'VITC-100 already has lot VC-0305. Choose it among its lots, or give the new lot another code.';
    const { user } = open(TRACKED, {
      refusal: apiError(409, refused, 'lot_code_in_use'),
    });
    await fill(user);
    await user.click(screen.getByRole('radio', { name: 'A new lot' }));
    const code = screen.getByRole('textbox', { name: /^Lot number/ });
    await user.type(code, 'VC-0305');
    await user.click(screen.getByRole('radio', { name: 'Doesn’t expire' }));
    await user.click(screen.getByRole('button', { name: 'Save correction' }));

    expect(await screen.findByText(refused)).toBeVisible();
    expect(code).toHaveAccessibleDescription(refused);
    expect(code).toHaveFocus();
    expect(
      screen.queryByRole('alert', { name: 'Error' }),
    ).not.toBeInTheDocument();
  });

  // ADR-094 amended, R11: another lot's former code for the new lot; Use
  // {code} takes that lot as One of its lots, what else was typed kept.
  it('refuses another lot’s former code for the new lot as it is typed; Use {code} chooses that lot among its lots, the rest kept', async () => {
    const { user, sent } = open(TRACKED, {
      lotCode: 'VC-0305',
      lots: [{ ...LOT, formerCodes: ['VC-03O5'] }],
    });
    await fill(user);
    await user.click(screen.getByRole('radio', { name: 'A new lot' }));
    const code = screen.getByRole('textbox', { name: /^Lot number/ });

    await user.type(code, 'VC-03O5');

    expect(code).toHaveAccessibleDescription(
      'VC-03O5 was the code of lot VC-0305. A code is never given to a second lot.',
    );
    await user.click(screen.getByRole('button', { name: 'Use VC-0305' }));

    expect(
      screen.getByRole('radio', { name: 'One of its lots' }),
    ).toBeChecked();
    expect(
      screen.getByRole('radio', { name: 'One of its lots' }),
    ).toHaveFocus();
    expect(screen.getByRole('combobox', { name: /^Lot/ })).toHaveTextContent(
      'VC-0305 · Expires Mar 3, 2027',
    );
    expect(screen.getByRole('textbox', { name: /^Quantity/ })).toHaveValue(
      '12',
    );
    await user.click(screen.getByRole('button', { name: 'Save correction' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Counted in 12 each of VITC-100 at Shelf C3, lot VC-0305.',
    );
    expect(sent[0]).toMatchObject({
      lotId: 'lot-5',
      note: 'Behind the cartons',
    });
  });

  // ADR-094 amended, R11; review 80: the server's refusal of another lot's
  // former code, which the lots read before did not hold, at the new lot's
  // code alone, with Use {code}.
  it('says the server’s refusal of another lot’s former code at the new lot’s code, focus there; Use {code} chooses that lot', async () => {
    const refused =
      'VC-03O5 was the code of lot VC-0305 until Nov 24, 2026. A code is never given to a second lot.';
    const { user } = open(TRACKED, {
      refusal: HttpResponse.json(
        {
          statusCode: 409,
          message: refused,
          code: 'lot_code_former',
          details: { lotId: 'lot-5', lotCode: 'VC-0305' },
        },
        { status: 409 },
      ),
    });
    await fill(user);
    await user.click(screen.getByRole('radio', { name: 'A new lot' }));
    const code = screen.getByRole('textbox', { name: /^Lot number/ });
    await user.type(code, 'VC-03O5');
    await user.click(screen.getByRole('radio', { name: 'Doesn’t expire' }));
    await user.click(screen.getByRole('button', { name: 'Save correction' }));

    await waitFor(() => expect(code).toHaveAccessibleDescription(refused));
    expect(code).toHaveFocus();
    expect(screen.getAllByText(refused)).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Use VC-0305' }));

    expect(
      screen.getByRole('radio', { name: 'One of its lots' }),
    ).toBeChecked();
    expect(screen.getByRole('combobox', { name: /^Lot/ })).toHaveTextContent(
      'VC-0305 · Expires Mar 3, 2027',
    );
  });

  // ADR-094, R3: Make a code for us here too, the message naming it.
  it('makes a code for us for the new lot, the message saying to write it on the stock, with Copy code and Open the lot', async () => {
    const { user, sent } = open(TRACKED, { lotCode: 'L-2026-10-17-1' });
    await fill(user);
    await user.click(screen.getByRole('radio', { name: 'A new lot' }));
    await user.click(
      screen.getByRole('button', { name: 'Make a code for us' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save correction' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Counted in 12 each of VITC-100 at Shelf C3, new lot L-2026-10-17-1. Write this code on the stock.',
    );
    expect(sent[0]).toMatchObject({
      lot: { makeCode: true, expiry: 'unknown' },
    });
    expect(screen.getByRole('button', { name: 'Copy code' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Open the lot' }));
    expect(await screen.findByText('At /lots/lot-new')).toBeVisible();
  });

  it('asks the day of a new lot starting On a date, as its last lot did, sending nothing', async () => {
    const { user, sent } = open(TRACKED);
    await fill(user);
    await user.click(screen.getByRole('radio', { name: 'A new lot' }));
    await user.type(
      screen.getByRole('textbox', { name: /^Lot number/ }),
      'VC-0310',
    );
    expect(
      await screen.findByRole('radio', { name: 'On a date', checked: true }),
    ).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Save correction' }));

    // The browser's own check holds the empty day, as it does the code.
    expect(screen.getByLabelText(/^The day it expires/)).toBeInvalid();
    expect(sent).toEqual([]);
  });

  // R12: from Receive stock's Found in a count, its place kept.
  it('starts at the place it is given', () => {
    renderWithAuth(
      <MemoryRouter>
        <CountInDialog
          item={TRACKED}
          locations={[SHELF]}
          tree={[SHELF]}
          defaultLocationId={SHELF.id}
          canSeeCosts
          onClose={vi.fn()}
          onCounted={vi.fn()}
        />
      </MemoryRouter>,
      { permissions: ['stock.view', 'stock.move', 'stock.adjust'] },
    );

    expect(
      screen.getByRole('combobox', { name: /^Location/ }),
    ).toHaveTextContent('Shelf C3 (C3)');
  });
});
