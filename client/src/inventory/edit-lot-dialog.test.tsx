import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { StockPile } from '../api/types.gen';
import { ToastProvider } from '../components/toast-provider';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { EditLotDialog } from './edit-lot-dialog';

/** A lot whose code was typed from the box, which does not expire. */
const TYPED: StockPile = {
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
  lotCode: 'VC-0301',
  lotExpiresAt: null,
  lotExpiry: 'none',
  lotIsAssigned: false,
  lotSupplierLot: null,
  lotFormerCode: null,
  quantity: '100.0000',
  emptiedOn: null,
  issuedToRun: null,
};

/** One made here, its expiry and supplier's lot still to add. */
const MADE: StockPile = {
  ...TYPED,
  lotCode: 'L-2026-11-20-1',
  lotExpiry: 'unknown',
  lotIsAssigned: true,
};

/** The dialog as a page opens it, gone once closed. */
function Opened({
  row,
  onSaved,
  onItsPage,
}: {
  row: StockPile;
  onSaved: () => Promise<void>;
  onItsPage?: boolean;
}) {
  const [shown, setShown] = useState<StockPile | null>(row);
  return (
    <EditLotDialog
      row={shown}
      onClose={() => setShown(null)}
      onSaved={onSaved}
      onItsPage={onItsPage}
    />
  );
}

function open(
  row: StockPile,
  permissions: string[] = ['stock.move'],
  {
    onItsPage = false,
    answer = () => new HttpResponse(null, { status: 204 }),
  }: { onItsPage?: boolean; answer?: () => Response } = {},
) {
  const sent: Record<string, unknown>[] = [];
  const onSaved = vi.fn(() => Promise.resolve());
  server.use(
    http.patch('/api/v1/stock/lots/lot-a', async ({ request }) => {
      sent.push((await request.json()) as Record<string, unknown>);
      return answer();
    }),
  );
  renderWithAuth(
    <MemoryRouter>
      <ToastProvider>
        <Opened row={row} onSaved={onSaved} onItsPage={onItsPage} />
      </ToastProvider>
    </MemoryRouter>,
    { permissions: ['stock.view', ...permissions] },
  );
  return { user: userEvent.setup(), sent, onSaved };
}

const why = () =>
  screen.getByRole('textbox', { name: /^Why is the code changing\?/ });

describe('EditLotDialog (ADR-094)', () => {
  it('starts Expires on the lot’s own, and moves it between the three, a day taken away (R8)', async () => {
    const { user, sent, onSaved } = open({
      ...TYPED,
      lotExpiresAt: '2027-05-01',
      lotExpiry: 'date',
    });

    expect(screen.getByRole('radio', { name: 'On a date' })).toBeChecked();
    expect(screen.getByLabelText(/^The day it expires/)).toHaveValue(
      '2027-05-01',
    );
    await user.click(screen.getByRole('radio', { name: 'Not known yet' }));
    expect(
      screen.queryByLabelText(/^The day it expires/),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Lot saved');
    expect(sent).toEqual([{ expiry: 'unknown' }]);
    expect(onSaved).toHaveBeenCalled();
  });

  it('asks the day for On a date, at its field, sending nothing', async () => {
    const { user, sent } = open(TYPED);

    expect(screen.getByRole('radio', { name: 'Doesn’t expire' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'On a date' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const day = screen.getByLabelText(/^The day it expires/);
    expect(day).toHaveAccessibleDescription('Type the day the lot expires.');
    expect(day).toHaveFocus();
    expect(sent).toEqual([]);
  });

  it('adds the supplier’s lot to a lot made here, and corrects its code (R5)', async () => {
    const { user, sent } = open(MADE);

    const code = screen.getByRole('textbox', { name: /^Lot number/ });
    expect(code).toBeEnabled();
    await user.clear(code);
    await user.type(code, 'L-2026-11-20-2');
    await user.type(why(), 'Typed the wrong day.');
    await user.type(
      screen.getByRole('textbox', { name: /^Supplier’s lot/ }),
      'Sup-77',
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByRole('status');
    expect(sent).toEqual([
      {
        code: 'L-2026-11-20-2',
        reason: 'Typed the wrong day.',
        supplierLot: 'Sup-77',
        expiry: 'unknown',
      },
    ]);
  });

  // ADR-094 amended, R8, E2a: why, asked when the code changes and only
  // then; the message names both codes.
  it('asks why only when the code changes, the question gone when it is put back; required, at its field', async () => {
    const { user, sent } = open(MADE);
    const code = screen.getByRole('textbox', { name: /^Lot number/ });

    expect(
      screen.queryByRole('textbox', { name: /^Why is the code changing/ }),
    ).not.toBeInTheDocument();
    await user.clear(code);
    await user.type(code, 'l-2026-11-20-2');
    expect(why()).toBeRequired();
    expect(why()).toHaveAccessibleDescription(
      'Kept with the old code, L-2026-11-20-1, on the lot’s page.',
    );

    // Back as it was, in lower case as the server reads it: no question.
    await user.clear(code);
    await user.type(code, 'l-2026-11-20-1');
    expect(
      screen.queryByRole('textbox', { name: /^Why is the code changing/ }),
    ).not.toBeInTheDocument();

    await user.type(code, '0');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(why()).toHaveAccessibleDescription('Say why the code is changing.');
    expect(why()).toHaveFocus();
    expect(sent).toEqual([]);
  });

  it('sends why with a changed code, and says both codes after Save, with Open the lot', async () => {
    const { user, sent, onSaved } = open(MADE);
    const code = screen.getByRole('textbox', { name: /^Lot number/ });
    await user.clear(code);
    await user.type(code, 'L-2026-11-20-9');
    await user.type(why(), '  The day was misread.  ');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Lot L-2026-11-20-9 saved. It was L-2026-11-20-1.',
    );
    expect(
      screen.getByRole('button', { name: 'Open the lot' }),
    ).toBeInTheDocument();
    expect(sent).toEqual([
      {
        code: 'L-2026-11-20-9',
        reason: 'The day was misread.',
        supplierLot: '',
        expiry: 'unknown',
      },
    ]);
    expect(onSaved).toHaveBeenCalled();
  });

  it('offers no Open the lot on the lot’s own page', async () => {
    const { user } = open(MADE, ['stock.move'], { onItsPage: true });
    const code = screen.getByRole('textbox', { name: /^Lot number/ });
    await user.clear(code);
    await user.type(code, 'L-2026-11-20-9');
    await user.type(why(), 'The day was misread.');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Lot L-2026-11-20-9 saved. It was L-2026-11-20-1.',
    );
    expect(
      screen.queryByRole('button', { name: 'Open the lot' }),
    ).not.toBeInTheDocument();
  });

  // R11: renaming this lot to another lot's former code; no Use {code},
  // since this is another lot being renamed.
  it('says the server’s refusal of another lot’s former code at the code, with no button, focus there', async () => {
    const refusal =
      'L-2026-11-19-1 was the code of lot L-2026-11-19-1A until Nov 24, 2026. A code is never given to a second lot.';
    const { user } = open(MADE, ['stock.move'], {
      answer: () =>
        HttpResponse.json(
          {
            statusCode: 409,
            error: 'Conflict',
            message: refusal,
            code: 'lot_code_former',
            details: { lotId: 'lot-b', lotCode: 'L-2026-11-19-1A' },
            path: '/api/v1/stock/lots/lot-a',
            timestamp: '2026-11-25T08:00:00.000Z',
          },
          { status: 409 },
        ),
    });
    const code = screen.getByRole('textbox', { name: /^Lot number/ });
    await user.clear(code);
    await user.type(code, 'L-2026-11-19-1');
    await user.type(why(), 'Two labels swapped.');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(code).toHaveAccessibleDescription(refusal));
    expect(code).toHaveFocus();
    expect(code).toBeInvalid();
    // At the field alone, not above the form too.
    expect(screen.getAllByText(refusal)).toHaveLength(1);
    expect(
      screen.queryByRole('button', { name: /^Use / }),
    ).not.toBeInTheDocument();

    // Typed again: the refusal was of the code sent.
    await user.type(code, 'B');
    expect(code).toBeValid();
  });

  it('offers no supplier’s lot, no rename and no mark for a typed code, without the permission', () => {
    open(TYPED);

    expect(screen.getByRole('textbox', { name: /^Lot number/ })).toBeDisabled();
    expect(
      screen.getByRole('textbox', { name: /^Lot number/ }),
    ).toHaveAccessibleDescription(
      'Printed on the boxes, so it cannot be renamed. Move the stock to the correct lot instead.',
    );
    expect(
      screen.queryByRole('textbox', { name: /^Supplier’s lot/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: /^We made this code up/ }),
    ).not.toBeInTheDocument();
  });

  it('points whoever may mark it to the check box, which lets the code be corrected and its supplier’s lot added in one save (R7)', async () => {
    const { user, sent } = open(TYPED, ['stock.move', 'stock.lot_made_here']);

    const code = screen.getByRole('textbox', { name: /^Lot number/ });
    expect(code).toHaveAccessibleDescription(
      'Printed on the boxes, so it cannot be renamed. If nothing printed it, tick “We made this code up” below; otherwise move the stock to the correct lot.',
    );
    const mark = screen.getByRole('checkbox', {
      name: 'We made this code up; nothing printed it',
    });
    expect(mark).toHaveAccessibleDescription(
      'Its code can then be corrected and its supplier’s lot added. Once saved, it stays marked, in the Activity log.',
    );
    await user.click(mark);
    expect(code).toBeEnabled();
    await user.clear(code);
    await user.type(code, 'VC-0302');
    await user.type(why(), 'Typed up wrong.');
    await user.type(
      screen.getByRole('textbox', { name: /^Supplier’s lot/ }),
      'SUP-9',
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByRole('status');
    expect(sent).toEqual([
      {
        code: 'VC-0302',
        reason: 'Typed up wrong.',
        supplierLot: 'SUP-9',
        expiry: 'none',
        madeHere: true,
      },
    ]);
  });

  it('offers no mark for a lot made here already', () => {
    open(MADE, ['stock.move', 'stock.lot_made_here']);

    expect(
      screen.queryByRole('checkbox', { name: /^We made this code up/ }),
    ).not.toBeInTheDocument();
  });
});
