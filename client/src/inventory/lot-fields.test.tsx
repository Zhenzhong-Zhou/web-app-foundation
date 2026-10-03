import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import type { Lot } from '../lib/types';
import { server } from '../test/setup';
import { LotFields, type LotInput } from './lot-fields';

const KNOWN: Lot[] = [
  {
    id: 'lot-1',
    code: 'L2024-A',
    expiresAt: '2027-03-31',
    isAssigned: false,
  },
  { id: 'lot-2', code: 'L2024-B', expiresAt: null, isAssigned: true },
];

/** Holds the value the way a dialog's form does. */
function Harness({
  initial = { code: '', expiresAt: '' },
}: {
  initial?: LotInput;
}) {
  const [value, setValue] = useState(initial);
  return (
    <LotFields
      idPrefix="test"
      variantId="variant-lotted"
      value={value}
      onChange={setValue}
    />
  );
}

function knownLots() {
  let asked: string | null = null;
  server.use(
    http.get('/api/v1/stock/lots', ({ request }) => {
      asked = new URL(request.url).searchParams.get('variantId');
      return HttpResponse.json(KNOWN);
    }),
  );
  return () => asked;
}

const code = () => screen.getByRole('combobox', { name: 'Lot number' });
const expiry = () => screen.getByLabelText('Expires');

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

  /**
   * The server ignores a supplied expiry when the lot already exists, so the
   * field shows the stored one. Otherwise someone types a date that
   * silently does nothing.
   */
  it('fills the expiry from the lot that was picked', async () => {
    knownLots();
    const user = userEvent.setup();
    render(<Harness initial={{ code: '', expiresAt: '2030-01-01' }} />);

    await user.click(code());
    await user.click(await screen.findByRole('option', { name: /L2024-A/ }));

    expect(code()).toHaveValue('L2024-A');
    expect(expiry()).toHaveValue('2027-03-31');
  });

  it('clears the expiry for a picked lot that has none', async () => {
    knownLots();
    const user = userEvent.setup();
    render(<Harness initial={{ code: '', expiresAt: '2030-01-01' }} />);

    await user.click(code());
    await user.click(await screen.findByRole('option', { name: /L2024-B/ }));

    // Not the date that was there: this lot does not expire.
    expect(code()).toHaveValue('L2024-B');
    expect(expiry()).toHaveValue('');
  });

  it('takes a new code as typed, leaving the expiry to the person', async () => {
    knownLots();
    const user = userEvent.setup();
    render(<Harness initial={{ code: '', expiresAt: '2030-01-01' }} />);

    await user.type(code(), 'NEW-LOT');

    expect(code()).toHaveValue('NEW-LOT');
    expect(expiry()).toHaveValue('2030-01-01');
  });
});
