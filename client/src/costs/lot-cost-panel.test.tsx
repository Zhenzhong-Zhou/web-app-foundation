import { render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { LotCost, LotCostEntry } from '../api/types.gen';
import { server } from '../test/setup';
import { LotCostPanel } from './lot-cost-panel';

const RECEIPT: LotCostEntry = {
  id: 'entry-1',
  kind: 'movement',
  reason: 'receipt',
  quantity: '48.0000',
  value: '276.192000',
  unitPrice: '4.2000',
  currency: 'USD',
  exchangeRate: '1.37000000',
  needsCost: false,
  referenceType: null,
  referenceId: null,
  otherLotId: null,
  otherLotCode: null,
  carried: null,
  atPoolAverage: false,
  takesCost: true,
  createdAt: '2026-10-01T15:00:00Z',
};

/** A lot bought in US dollars, valued in Canadian (ADR-048). */
const COST: LotCost = {
  currency: 'CAD',
  lotId: 'lot-1',
  lotCode: 'OIL-0425',
  sku: 'OIL',
  quantity: '48.0000',
  value: '276.192000',
  unitCost: '5.754000',
  provisional: false,
  entries: [
    RECEIPT,
    { ...RECEIPT, id: 'entry-2', unitPrice: '5.7540', currency: 'CAD' },
  ],
};

describe('LotCostPanel', () => {
  // The trace's numbers as the page writes them, and money that says its
  // currency (#472's 24).
  it('writes quantities as the page does, and a price in another currency with its code', async () => {
    server.use(
      http.get('/api/v1/costs/lots/lot-1', () =>
        HttpResponse.json({ lotCost: COST }),
      ),
    );
    render(<LotCostPanel lotId="lot-1" />, { wrapper: MemoryRouter });

    const history = await screen.findByRole('table', {
      name: 'How its value changed',
    });
    expect(screen.queryByText(/48\.0000/)).not.toBeInTheDocument();
    expect(screen.getAllByText('48')).toHaveLength(3);
    const [bought, inBase] = within(history).getAllByRole('row').slice(1);
    expect(bought).toHaveTextContent(/USD\s4\.20 at 1\.37/);
    expect(inBase).not.toHaveTextContent('USD');
    expect(inBase).toHaveTextContent(/5\.754/);
  });

  /** The history's rows, after its head, as the reader sees each. */
  async function historyOf(entries: LotCostEntry[]): Promise<HTMLElement[]> {
    server.use(
      http.get('/api/v1/costs/lots/lot-1', () =>
        HttpResponse.json({ lotCost: { ...COST, entries } }),
      ),
    );
    render(<LotCostPanel lotId="lot-1" />, { wrapper: MemoryRouter });
    const history = await screen.findByRole('table', {
      name: 'How its value changed',
    });
    return within(history).getAllByRole('row').slice(1);
  }

  const CHANGE: LotCostEntry = {
    ...RECEIPT,
    kind: 'lot_change',
    reason: 'lot_change',
    unitPrice: null,
    currency: null,
    exchangeRate: null,
  };

  // A lot change's two rows by the other lot, each with its quantity,
  // and stock back from before lot tracking (ADR-094, R20, Q3a).
  it('reads a lot change out as moved to its lot and in as moved in from it, with the quantity, and one with no first lot as back from before lot tracking', async () => {
    const [out, into, back] = await historyOf([
      {
        ...CHANGE,
        id: 'out',
        quantity: '-50.0000',
        value: '-100.000000',
        otherLotId: 'lot-b',
        otherLotCode: 'LOT-B',
      },
      {
        ...CHANGE,
        id: 'in',
        quantity: '20.0000',
        value: '40.000000',
        otherLotId: 'lot-a',
        otherLotCode: 'LOT-A',
      },
      { ...CHANGE, id: 'back', quantity: '5.0000', value: '10.000000' },
    ]);

    expect(out).toHaveTextContent('Moved to lot LOT-B');
    expect(within(out).getAllByRole('cell')[2]).toHaveTextContent('-50');
    expect(into).toHaveTextContent('Moved in from lot LOT-A');
    expect(within(into).getAllByRole('cell')[2]).toHaveTextContent('20');
    expect(back).toHaveTextContent('Back from before lot tracking');
  });

  // D5: a cost given late follows the stock moved, the first lot's row
  // naming where it went and the second's where it came from, by
  // `carried`, whichever its sign.
  it('names the lot a late cost was carried to, and the lot it came from', async () => {
    const carried = {
      ...RECEIPT,
      kind: 'correction',
      reason: 'receipt',
      unitPrice: null,
      currency: null,
      exchangeRate: null,
    } as const;
    const [to, from] = await historyOf([
      {
        ...carried,
        id: 'to',
        value: '-40.000000',
        otherLotId: 'lot-b',
        otherLotCode: 'LOT-B',
        carried: 'to',
      },
      {
        ...carried,
        id: 'from',
        value: '40.000000',
        otherLotId: 'lot-a',
        otherLotCode: 'LOT-A',
        carried: 'from',
      },
    ]);

    expect(to).toHaveTextContent('Cost carried to lot LOT-B');
    expect(from).toHaveTextContent('Cost from lot LOT-A');
    // Each other lot a link to its page, offering Back (review 34).
    const toB = within(to).getByRole('link', { name: 'LOT-B' });
    expect(toB).toHaveAttribute('href', '/lots/lot-b');
    expect(within(from).getByRole('link', { name: 'LOT-A' })).toHaveAttribute(
      'href',
      '/lots/lot-a',
    );
    // A cost moves no units.
    expect(within(to).getAllByRole('cell')[2]).toHaveTextContent('—');
  });

  // D4: a kind or a reason this tab does not know says only that it
  // changed, never its stored key.
  it('reads a kind or a reason it does not know as Other change', async () => {
    const [kind, reason] = await historyOf([
      {
        ...RECEIPT,
        id: 'kind',
        kind: 'split_in_two' as LotCostEntry['kind'],
      },
      { ...RECEIPT, id: 'reason', reason: 'teleported' },
    ]);

    for (const row of [kind, reason]) {
      expect(row).toHaveTextContent('Other change');
    }
    expect(kind).not.toHaveTextContent('split_in_two');
    expect(reason).not.toHaveTextContent('teleported');
  });

  // #661: a return with no cost it shipped at, valued at the lot's average
  // when it came back, says so; one that came back at its shipped cost
  // reads as before.
  it('says a return came back at the lot’s average where the server marks it so', async () => {
    const returned = {
      ...RECEIPT,
      reason: 'return',
      unitPrice: null,
      currency: null,
      exchangeRate: null,
    };
    const [average, shipped] = await historyOf([
      { ...returned, id: 'average', atPoolAverage: true },
      { ...returned, id: 'shipped' },
    ]);

    expect(average).toHaveTextContent('Returned, at the lot’s average');
    expect(shipped).toHaveTextContent('Returned');
    expect(shipped).not.toHaveTextContent('average');
  });
});
