import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { Location, Movement, MovementPage } from '../api/types.gen';
import { movement } from '../test/factories';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { MovementsPage } from './movements-page';

const MOVEMENT = movement();

/** Ids as the address keeps them: a filter's value is an id (95a). */
const ITEM = '11111111-1111-4111-8111-111111111111';
const SHELF = '22222222-2222-4222-8222-222222222222';
const LOT = '33333333-3333-4333-8333-333333333333';
const ORDER = '44444444-4444-4444-8444-444444444444';

const SHELF_A2: Location = {
  id: SHELF,
  type: 'shelf',
  name: 'Shelf A2',
  code: 'A2',
  parentId: 'site-main',
  isAvailable: true,
  isActive: true,
  address: null,
};
const MAIN: Location = {
  ...SHELF_A2,
  id: 'site-main',
  type: 'site',
  name: 'Main warehouse',
  code: null,
  parentId: null,
};

const EVERYONE = [
  'stock.view',
  'stock.move',
  'locations.view',
  'orders.view',
  'production.view',
];
/** The Sales template's: stock and orders, no places (ADR-080). */
const SALES = ['stock.view', 'orders.view'];

/** The list's answer, and every query it was asked with. */
function answer(
  entries: Movement[],
  period: MovementPage['period'] = null,
): URLSearchParams[] {
  const asked: URLSearchParams[] = [];
  server.use(
    http.get('/api/v1/stock/movements', ({ request }) => {
      asked.push(new URL(request.url).searchParams);
      return HttpResponse.json({ entries, nextCursor: null, period });
    }),
    http.get('/api/v1/locations', () => HttpResponse.json([MAIN, SHELF_A2])),
  );
  return asked;
}

function Address() {
  const { search } = useLocation();
  return <output aria-label="address">{search}</output>;
}

function renderAt(address: string, permissions = EVERYONE) {
  return renderWithAuth(
    <MemoryRouter initialEntries={[address]}>
      <MovementsPage />
      <Address />
    </MemoryRouter>,
    { permissions },
  );
}

async function rowFor(entry: Movement, permissions = EVERYONE) {
  answer([entry]);
  renderAt('/movements', permissions);
  const name = await screen.findByRole('link', { name: '维生素 D (60 粒)' });
  return name.closest('tr') as HTMLElement;
}

const addressOf = () => screen.getByRole('status', { name: 'address' });

/** Where a row's link lands, with Back. */
function Landed() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => void navigate(-1)}>
      Back
    </button>
  );
}

/**
 * What moved and who moved it, readable by someone who knows products and
 * people by name (#256), as one row (ADR-093, R9; 95a and 96a).
 */
describe('MovementsPage', () => {
  it('names the item first, its code and type grey under it, and reads the change with its unit', async () => {
    const row = await rowFor(MOVEMENT);

    expect(row).toHaveTextContent('VITD-60 · Product');
    expect(row).toHaveTextContent('−24 each');
    expect(row).not.toHaveTextContent('24.0000');
    expect(within(row).getByRole('link', { name: 'NN-2410-07' })).toBeVisible();
  });

  it('keeps a changed code’s old one under today’s', async () => {
    const row = await rowFor(
      movement({ sku: 'VITC-90', currentSku: 'VITD-60' }),
    );

    expect(row).toHaveTextContent('was VITC-90');
  });

  it('writes from → to by each place’s path, an end outside the warehouse in words', async () => {
    const row = await rowFor(MOVEMENT);

    expect(row).toHaveTextContent('Main warehouse › Shelf A (A)');
    expect(row).toHaveTextContent('customer');
  });

  // 100a; review 26: a reason in the boards' words, a correction's
  // detail after a colon, as the export writes it; the cell capitalizes
  // its first letter, "Corrected: found".
  it('says a reason in the boards’ words, a correction’s detail after it', async () => {
    const row = await rowFor(
      movement({
        reason: 'adjustment',
        reasonDetail: 'found',
        note: 'Behind the pallet',
      }),
    );

    expect(within(row).getByText('corrected: found')).toBeVisible();
  });

  it('offers each reason in the boards’ words', async () => {
    answer([MOVEMENT]);
    renderAt('/movements');

    await userEvent.click(
      await screen.findByRole('combobox', { name: 'Reason' }),
    );

    expect(
      within(screen.getByRole('listbox'))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      'Any reason',
      'received',
      'shipped',
      'moved',
      'corrected',
      'made',
      'used in a run',
      'sampled',
      'returned',
    ]);
  });

  it('links the document it was for', async () => {
    const row = await rowFor(
      movement({
        document: { kind: 'order', id: ORDER, number: 'SO-000013' },
      }),
    );

    expect(
      within(row).getByRole('link', { name: 'SO-000013' }),
    ).toHaveAttribute('href', `/orders/${ORDER}`);
  });

  it('names who by name, their email beneath', async () => {
    const row = await rowFor(MOVEMENT);

    expect(within(row).getByText('王建国')).toBeVisible();
    expect(within(row).getByText('wang@example.com')).toBeVisible();
  });

  it('says Deleted user for an anonymised account, not its stored name', async () => {
    const row = await rowFor({
      ...MOVEMENT,
      actorName: 'Deleted User',
      actorEmail: null,
    });

    expect(within(row).getByText('Deleted user')).toBeVisible();
    expect(within(row).queryByText('Deleted User')).not.toBeInTheDocument();
  });

  it('has no From → to for a reader without locations.view (96a)', async () => {
    await rowFor(
      movement({
        fromLocationName: null,
        fromLocationCode: null,
        fromLocationPath: [],
      }),
      SALES,
    );

    expect(
      screen.queryByRole('columnheader', { name: 'From → to' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Location')).not.toBeInTheDocument();
  });

  it('asks the list by the address’s keys, the lot and the order as chips', async () => {
    const asked = answer([
      movement({
        lotId: LOT,
        lotCode: 'VC-0302',
        document: { kind: 'order', id: ORDER, number: 'PO-000009' },
      }),
    ]);
    renderAt(
      `/movements?variantId=${ITEM}&locationId=${SHELF}&lotId=${LOT}&orderId=${ORDER}&reason=shipment&from=2026-10-01&until=2026-10-31`,
    );

    expect(
      await screen.findByRole('button', {
        name: 'Remove filter: Lot: VC-0302',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Remove filter: Order: PO-000009' }),
    ).toBeVisible();
    const query = asked.at(-1)!;
    expect(query.get('variantId')).toBe(ITEM);
    expect(query.get('locationId')).toBe(SHELF);
    expect(query.get('lotId')).toBe(LOT);
    expect(query.get('orderId')).toBe(ORDER);
    expect(query.get('reason')).toBe('shipment');
    // The days as instants in the organization's zone, the last day
    // included (ADR-072).
    const from = Date.parse(query.get('from')!);
    const until = Date.parse(query.get('until')!);
    expect((until - from) / 86_400_000).toBeCloseTo(31, 0);
  });

  it('reads a place a reader may not see as Everywhere, never asking it', async () => {
    const asked = answer([MOVEMENT]);
    renderAt(`/movements?locationId=${SHELF}`, SALES);

    await screen.findByRole('link', { name: '维生素 D (60 粒)' });
    expect(asked.at(-1)!.has('locationId')).toBe(false);
  });

  it('reads an order a reader may not see as every movement, with no chip', async () => {
    const asked = answer([MOVEMENT]);
    renderAt(`/movements?orderId=${ORDER}`, ['stock.view']);

    await screen.findByRole('link', { name: '维生素 D (60 粒)' });
    expect(asked.at(-1)!.has('orderId')).toBe(false);
    expect(
      screen.queryByRole('button', { name: /^Remove filter: Order/ }),
    ).not.toBeInTheDocument();
  });

  it('reads one code as a stock card: In, Out and Balance, no Item column', async () => {
    answer([
      movement({
        quantityIn: null,
        quantityOut: '4.0000',
        change: '-4.0000',
        balance: '24.0000',
      }),
    ]);
    renderAt(`/movements?variantId=${ITEM}`);

    // The balance's cell, once the rows are read.
    expect(await screen.findByRole('cell', { name: '24 each' })).toBeVisible();
    const table = screen.getByRole('table');
    const heads = within(table)
      .getAllByRole('columnheader')
      .map((head) => head.textContent);
    expect(heads).toEqual([
      'When',
      'In',
      'Out',
      'Balance',
      'Reason',
      'From → to',
      'Lot',
      'For',
      'By',
    ]);
  });

  it('drops Balance with a reason chosen, saying why, and Clear Reason brings it back', async () => {
    answer([
      movement({ quantityIn: null, quantityOut: '4.0000', change: '-4.0000' }),
    ]);
    renderAt(`/movements?variantId=${ITEM}&reason=shipment`);

    expect(
      await screen.findByText(
        'Balance counts every reason. Clear Reason to see it.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('columnheader', { name: 'Balance' }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Clear Reason' }));

    expect(addressOf()).toHaveTextContent(`?variantId=${ITEM}`);
  });

  // Review 24: the change the server signs, which the export writes too.
  // At a place chosen, a move off it is Out there, with its minus; across
  // every place, a move between two places is neither, its quantity
  // alone.
  const TRANSFER = movement({
    reason: 'transfer',
    quantity: '12.0000',
    fromLocationId: SHELF,
    fromLocationName: 'Shelf A2',
    fromLocationCode: 'A2',
    toLocationId: 'location-back',
    toLocationName: 'Back room',
    toLocationCode: 'B',
    toLocationPath: ['Main warehouse'],
    quantityIn: null,
    quantityOut: null,
    change: null,
  });

  it('signs a move off the place chosen with its minus, as its export does', async () => {
    answer([{ ...TRANSFER, quantityOut: '12.0000', change: '-12.0000' }]);
    renderAt(`/movements?locationId=${SHELF}`);

    expect(await screen.findByRole('cell', { name: '−12 each' })).toBeVisible();
  });

  it('leaves a move between two places unsigned across every place', async () => {
    const row = await rowFor(TRANSFER);

    expect(within(row).getByRole('cell', { name: '12 each' })).toBeVisible();
  });

  it('says to choose one item while every item is listed at a place', async () => {
    answer([MOVEMENT]);
    renderAt(`/movements?locationId=${SHELF}`);

    expect(
      await screen.findByText('Choose one item to see In, Out and Balance.'),
    ).toBeVisible();
  });

  it('opens a date range with the period’s Opening, In, Out and Closing', async () => {
    answer([movement({ balance: '24.0000' })], {
      opening: '30.0000',
      quantityIn: '72.0000',
      quantityOut: '78.0000',
      closing: '24.0000',
    });
    renderAt(`/movements?variantId=${ITEM}&from=2026-10-01&until=2026-11-18`);

    const period = await screen.findByText('Opening, Oct 1, 2026');
    const line = period.closest('dl') as HTMLElement;
    expect(line).toHaveTextContent('30 each');
    expect(line).toHaveTextContent('In72 each');
    expect(line).toHaveTextContent('Out78 each');
    expect(line).toHaveTextContent('Closing, Nov 18, 2026');
  });

  it('runs oldest first once When is pressed', async () => {
    const asked = answer([MOVEMENT]);
    renderAt('/movements');

    await userEvent.click(await screen.findByRole('button', { name: 'When' }));

    expect(addressOf()).toHaveTextContent('?sort=when&order=asc');
    expect(asked.at(-1)!.get('order')).toBe('asc');
  });

  it('clears every filter and chip in one write with Show all movements, the sort kept', async () => {
    answer([MOVEMENT]);
    renderAt(
      `/movements?variantId=${ITEM}&lotId=${LOT}&orderId=${ORDER}&reason=shipment&from=2026-10-01&sort=when&order=asc`,
    );

    await userEvent.click(
      await screen.findByRole('button', { name: 'Show all movements' }),
    );

    expect(addressOf()).toHaveTextContent(/^\?sort=when&order=asc$/);
  });

  it('names the filters on when nothing matches, with Show all movements', async () => {
    answer([]);
    renderAt('/movements?reason=sample&from=2026-10-01');

    expect(await screen.findByText(/^No movements match/)).toHaveTextContent(
      'No movements match: sampled and Oct 1, 2026–.',
    );
    expect(
      screen.getAllByRole('button', { name: 'Show all movements' }),
    ).toHaveLength(2);
  });

  // #473's last line (P2a): Back after Show 25 more reads the pages shown
  // again, focus on the link followed from its row.
  it('finds the rows shown and the link left by on Back after Show 25 more', async () => {
    const user = userEvent.setup();
    answer([]);
    const later = movement({
      id: 'movement-2',
      lotId: 'lot-2',
      lotCode: 'NN-2502-01',
    });
    server.use(
      http.get('/api/v1/stock/movements', ({ request }) =>
        HttpResponse.json(
          new URL(request.url).searchParams.has('before')
            ? { entries: [later], nextCursor: null, period: null }
            : { entries: [MOVEMENT], nextCursor: 'next', period: null },
        ),
      ),
    );
    renderWithAuth(
      <MemoryRouter initialEntries={['/movements']}>
        <Routes>
          <Route path="/movements" element={<MovementsPage />} />
          <Route path="*" element={<Landed />} />
        </Routes>
      </MemoryRouter>,
      { permissions: EVERYONE },
    );
    await user.click(
      await screen.findByRole('button', { name: 'Show 25 more' }),
    );
    await user.click(await screen.findByRole('link', { name: 'NN-2502-01' }));

    await user.click(await screen.findByRole('button', { name: 'Back' }));
    const left = await screen.findByRole('link', { name: 'NN-2502-01' });
    expect(screen.getByRole('link', { name: 'NN-2410-07' })).toBeVisible();
    await waitFor(() => expect(left).toHaveFocus());
  });

  it('offers Receive stock while nothing has moved', async () => {
    answer([]);
    renderAt('/movements');

    expect(
      await screen.findByText(
        'Nothing has moved yet. Receiving stock is what puts the first row here.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Receive stock' })).toBeVisible();
  });
});
