import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { Lot, StockPile } from '../api/types.gen';
import { ToastProvider } from '../components/toast-provider';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { MoveToLotDialog } from './move-to-lot-dialog';

/** Lot A at Shelf A2, made here, its supplier's lot known, expiring. */
const PILE: StockPile = {
  id: 'pile-a',
  variantId: 'variant-c',
  sku: 'VITC-100',
  productName: 'Vitamin C',
  variantName: null,
  unitOfMeasure: 'each',
  locationId: 'loc-a2',
  locationName: 'Shelf A2',
  locationCode: null,
  lotId: 'lot-a',
  lotCode: 'L-2026-11-20-1',
  lotExpiresAt: '2027-05-01',
  lotExpiry: 'date',
  lotIsAssigned: true,
  lotSupplierLot: 'SUP-88',
  quantity: '100.0000',
  emptiedOn: null,
  issuedToRun: null,
};

const LOTS: Lot[] = [
  {
    id: 'lot-b',
    code: 'VC-0310',
    expiresAt: null,
    expiry: 'unknown',
    isAssigned: false,
    supplierLot: null,
  },
  {
    id: 'lot-a',
    code: 'L-2026-11-20-1',
    expiresAt: '2027-05-01',
    expiry: 'date',
    isAssigned: true,
    supplierLot: 'SUP-88',
  },
];

function Landed() {
  const { pathname } = useLocation();
  return <p>{`At ${pathname}`}</p>;
}

/** The dialog as Stock opens it, gone once closed. */
function Opened({ onMoved }: { onMoved: () => void }) {
  const [open, setOpen] = useState(true);
  return open ? (
    <MoveToLotDialog
      row={PILE}
      onClose={() => setOpen(false)}
      onMoved={onMoved}
    />
  ) : null;
}

/** The dialog, the item's lots and the write answered, its body kept. */
function open({
  toLot = { id: 'lot-new', code: 'VC-0311' },
  needsCost = false,
  permissions = ['stock.view', 'stock.move', 'stock.adjust'],
}: {
  toLot?: { id: string; code: string };
  needsCost?: boolean;
  permissions?: string[];
} = {}) {
  const sent: Record<string, unknown>[] = [];
  const onMoved = vi.fn();
  server.use(
    http.get('/api/v1/stock/lots', () => HttpResponse.json(LOTS)),
    http.post('/api/v1/stock/lots/lot-a/lot-changes', async ({ request }) => {
      sent.push((await request.json()) as Record<string, unknown>);
      return HttpResponse.json(
        {
          movement: {
            id: 'movement-1',
            variantId: 'variant-c',
            sku: 'VITC-100',
            lotId: 'lot-a',
            fromLocationId: 'loc-a2',
            toLocationId: 'loc-a2',
            quantity: '30.0000',
            reason: 'lot_change',
            reasonDetail: 'between_lots',
            referenceType: null,
            referenceId: null,
            note: 'Two runs in one delivery',
            createdAt: '2026-11-22T12:00:00.000Z',
          },
          fromLot: { id: 'lot-a', code: 'L-2026-11-20-1' },
          toLot,
          needsCost,
        },
        { status: 201 },
      );
    }),
  );
  renderWithAuth(
    <ToastProvider>
      <MemoryRouter initialEntries={['/inventory']}>
        <Routes>
          <Route path="/inventory" element={<Opened onMoved={onMoved} />} />
          <Route path="*" element={<Landed />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
    { permissions },
  );
  return { user: userEvent.setup(), sent, onMoved };
}

async function fill(
  user: ReturnType<typeof userEvent.setup>,
  code: string | null,
) {
  await user.type(screen.getByRole('textbox', { name: /^Quantity/ }), '30');
  if (code !== null) {
    await user.type(
      screen.getByRole('combobox', { name: /^Lot number/ }),
      code,
    );
  }
  await user.type(
    screen.getByRole('textbox', { name: /^Note/ }),
    'Two runs in one delivery',
  );
}

describe('MoveToLotDialog (ADR-094, R20)', () => {
  it('names the lot and place it moves from, its Expires starting as the lot’s', async () => {
    const { user } = open();
    const dialog = screen.getByRole('dialog', { name: 'Move to another lot' });

    expect(dialog).toHaveTextContent(
      'VITC-100 · lot L-2026-11-20-1 at Shelf A2 — 100 each on hand',
    );
    await user.type(
      screen.getByRole('combobox', { name: /^Lot number/ }),
      'VC-0311',
    );
    expect(screen.getByRole('radio', { name: 'On a date' })).toBeChecked();
    expect(screen.getByLabelText(/^The day it expires/)).toHaveValue(
      '2027-05-01',
    );
  });

  // Review 6 and 27: what it is for, and that Expires is this lot's.
  it('says what it is for, and that Expires starts as the lot it leaves has it', async () => {
    const { user } = open();
    const dialog = screen.getByRole('dialog', { name: 'Move to another lot' });

    expect(dialog).toHaveTextContent(
      'Moves part of this lot into another lot of the item, one it has or a new one. The stock stays where it is.',
    );
    // And its cost (review 23).
    expect(dialog).toHaveTextContent(
      'Its cost moves with it, at this lot’s average. Stock value stays the same.',
    );
    await user.type(
      screen.getByRole('combobox', { name: /^Lot number/ }),
      'VC-0311',
    );
    expect(
      screen.getByRole('radiogroup', { name: /^Expires/ }),
    ).toHaveAccessibleDescription('Starts as the lot it leaves has it.');

    // Not known yet chosen: its own line follows.
    await user.click(screen.getByRole('radio', { name: 'Not known yet' }));
    expect(
      screen.getByRole('radiogroup', { name: /^Expires/ }),
    ).toHaveAccessibleDescription(
      'Starts as the lot it leaves has it. Marked “Expiry to add” until its date is added. The stock can still be used.',
    );
  });

  it('moves into a new lot typed as printed, with the first lot’s expiry, the message naming both lots; Open the lot opens the new one', async () => {
    const { user, sent, onMoved } = open();
    await fill(user, 'VC-0311');
    await user.click(screen.getByRole('button', { name: 'Move to lot' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Moved 30 each from lot L-2026-11-20-1 to lot VC-0311.',
    );
    expect(sent).toEqual([
      {
        locationId: 'loc-a2',
        quantity: '30',
        note: 'Two runs in one delivery',
        lot: { code: 'VC-0311', expiry: 'date', expiresAt: '2027-05-01' },
      },
    ]);
    expect(onMoved).toHaveBeenCalledWith({
      variantId: 'variant-c',
      locationId: 'loc-a2',
    });
    expect(
      screen.queryByRole('button', { name: 'Copy code' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open the lot' }));
    expect(await screen.findByText('At /lots/lot-new')).toBeVisible();
  });

  it('moves into one of the item’s lots by its code, asking no expiry, and says when it waits for a cost', async () => {
    const { user, sent } = open({
      toLot: { id: 'lot-b', code: 'VC-0310' },
      needsCost: true,
    });
    await fill(user, 'VC-0310');

    expect(
      screen.getByRole('combobox', { name: /^Lot number/ }),
    ).toHaveAccessibleDescription(/^An existing lot\. This adds to it\./);
    expect(
      screen.queryByRole('radiogroup', { name: /^Expires/ }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Move to lot' }));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(
      'Moved 30 each from lot L-2026-11-20-1 to lot VC-0310. It waits for a cost there, as some of lot L-2026-11-20-1 does.',
    );
    // No link for a reader who may not see costs.
    expect(
      within(status).queryByRole('button', { name: 'Waiting for a cost' }),
    ).not.toBeInTheDocument();
    expect(sent).toEqual([
      {
        locationId: 'loc-a2',
        quantity: '30',
        note: 'Two runs in one delivery',
        toLotId: 'lot-b',
      },
    ]);
  });

  // Review 26: waiting, linked to Waiting for a cost for whoever may see
  // costs, as Count it in's is.
  it('links stock that waits for a cost to Waiting for a cost, for whoever may see costs', async () => {
    const { user } = open({
      toLot: { id: 'lot-b', code: 'VC-0310' },
      needsCost: true,
      permissions: ['stock.view', 'stock.move', 'stock.adjust', 'costs.view'],
    });
    await fill(user, 'VC-0310');
    await user.click(screen.getByRole('button', { name: 'Move to lot' }));

    const status = await screen.findByRole('status');
    await user.click(
      within(status).getByRole('button', { name: 'Waiting for a cost' }),
    );
    expect(await screen.findByText('At /costs')).toBeVisible();
  });

  it('makes a code for us, starting with the first lot’s supplier’s lot, with Copy code', async () => {
    const { user, sent } = open({
      toLot: { id: 'lot-new', code: 'L-2026-11-22-1' },
    });
    await fill(user, null);
    await user.click(
      screen.getByRole('button', { name: 'Make a code for us' }),
    );
    expect(
      screen.getByRole('textbox', { name: /^Supplier’s lot/ }),
    ).toHaveValue('SUP-88');
    await user.click(screen.getByRole('button', { name: 'Move to lot' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Moved 30 each from lot L-2026-11-20-1 to lot L-2026-11-22-1.',
    );
    expect(sent[0]).toMatchObject({
      lot: {
        makeCode: true,
        supplierLot: 'SUP-88',
        expiry: 'date',
        expiresAt: '2027-05-01',
      },
    });
    expect(screen.getByRole('button', { name: 'Copy code' })).toBeVisible();
  });

  it('says at its field that the stock is in that lot already, and asks for the note, sending nothing', async () => {
    const { user, sent } = open();
    await user.type(screen.getByRole('textbox', { name: /^Quantity/ }), '30');
    await user.type(
      screen.getByRole('combobox', { name: /^Lot number/ }),
      'L-2026-11-20-1',
    );
    await user.click(screen.getByRole('button', { name: 'Move to lot' }));

    const code = screen.getByRole('combobox', { name: /^Lot number/ });
    expect(code).toHaveAccessibleDescription(
      'The stock is in lot L-2026-11-20-1 already. Choose another of its lots, or a new one.',
    );
    expect(code).toHaveFocus();
    expect(
      screen.getByRole('textbox', { name: /^Note/ }),
    ).toHaveAccessibleDescription(
      'Say in the note why this stock belongs in another lot.',
    );
    expect(sent).toEqual([]);
    expect(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Move to lot',
      }),
    ).toBeEnabled();
  });

  // Review 25: the most it may move, said under Quantity, and too much
  // refused there, not by the server above the form.
  it('says the most it may move, and refuses more at the field, sending nothing', async () => {
    const { user, sent } = open();
    const quantity = screen.getByRole('textbox', { name: /^Quantity/ });
    expect(quantity).toHaveAccessibleDescription('In each. At most 100.');

    await user.type(quantity, '120');
    await user.type(
      screen.getByRole('combobox', { name: /^Lot number/ }),
      'VC-0311',
    );
    await user.type(
      screen.getByRole('textbox', { name: /^Note/ }),
      'Two runs in one delivery',
    );
    await user.click(screen.getByRole('button', { name: 'Move to lot' }));

    expect(quantity).toHaveAccessibleDescription(
      'At most 100 each, what this lot holds here.',
    );
    expect(quantity).toHaveFocus();
    expect(sent).toEqual([]);
  });
});
