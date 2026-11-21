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
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  Location,
  LookupGroup,
  LookupResult,
  Movement,
  MovementPage,
} from '../api/types.gen';
import { setOrganizationTimeZone } from '../lib/time-zone';
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
const PARTNER = '55555555-5555-4555-8555-555555555555';

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
const PLACES_HIDDEN =
  'Warehouses, zones and bins are hidden: your role can’t see them. An Owner or Admin can change that.';

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

/** A row's cell under the column headed `head`. */
function cellUnder(row: HTMLElement, head: string) {
  const heads = screen
    .getAllByRole('columnheader')
    .map((cell) => cell.textContent);
  return (row as HTMLTableRowElement).cells[heads.indexOf(head)];
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

  // 125: a sample reads like a shipment, "→ sample" in grey words and
  // For the recipient Send sample recorded, which the server sends only
  // to a reader with partners.view.
  it('ends a sample at “sample” and links the recipient it was for (125)', async () => {
    const row = await rowFor(
      movement({
        reason: 'sample',
        recipient: { id: PARTNER, name: 'Northside Pharmacy' },
      }),
    );

    expect(cellUnder(row, 'From → to')).toHaveTextContent(
      'Main warehouse › Shelf A (A)→sample',
    );
    expect(
      within(cellUnder(row, 'For')).getByRole('link', {
        name: 'Northside Pharmacy',
      }),
    ).toHaveAttribute('href', `/partners/${PARTNER}`);
  });

  it('says — for a sample whose recipient was not recorded, or is not the reader’s to see (125)', async () => {
    const row = await rowFor(movement({ reason: 'sample' }));

    expect(cellUnder(row, 'From → to')).toHaveTextContent('→sample');
    expect(cellUnder(row, 'For')).toHaveTextContent(/^—$/);
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

  // Review 3, 115: where From → to would be, why it is not, once.
  it('says once why places are hidden for a reader without locations.view, never for one with it', async () => {
    answer([MOVEMENT]);
    const { unmount } = renderAt('/movements', SALES);
    await screen.findByRole('link', { name: '维生素 D (60 粒)' });
    expect(screen.getAllByText(PLACES_HIDDEN)).toHaveLength(1);
    unmount();

    await rowFor(MOVEMENT);
    expect(screen.queryByText(PLACES_HIDDEN)).not.toBeInTheDocument();
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

  // Review 4: a chip for every filter that is set, each × clearing its
  // own key alone.
  it('shows a chip for every filter set, each × clearing its own key', async () => {
    const user = userEvent.setup();
    answer([
      movement({
        variantId: ITEM,
        lotId: LOT,
        lotCode: 'VC-0302',
        document: { kind: 'order', id: ORDER, number: 'PO-000009' },
      }),
    ]);
    renderAt(
      `/movements?variantId=${ITEM}&locationId=${SHELF}&lotId=${LOT}&orderId=${ORDER}&reason=shipment&from=2026-10-01&until=2026-10-31`,
    );

    const chip = (name: RegExp) => screen.getByRole('button', { name });
    await screen.findByRole('button', { name: 'Remove filter: Lot: VC-0302' });
    await waitFor(() =>
      expect(chip(/^Remove filter: Location: Shelf A2/)).toBeVisible(),
    );
    expect(chip(/^Remove filter: Item: 维生素 D/)).toBeVisible();
    expect(chip(/^Remove filter: Reason: shipped$/)).toBeVisible();

    const keys = () => [
      ...new URLSearchParams(addressOf().textContent ?? '').keys(),
    ];
    await user.click(chip(/^Remove filter: Item:/));
    expect(keys()).not.toContain('variantId');
    expect(keys()).toContain('lotId');
    await user.click(chip(/^Remove filter: Location:/));
    expect(keys()).not.toContain('locationId');
    await user.click(chip(/^Remove filter: Reason:/));
    expect(keys().sort()).toEqual(['from', 'lotId', 'orderId', 'until']);
  });

  // 126: the Item field is one find box for an item, a lot or an order,
  // by the top bar's lookup; each choice a filter and its chip.
  describe('Find an item, lot or order', () => {
    const VITAMIN = {
      id: ITEM,
      sku: 'VITC-500',
      productName: 'Vitamin C 500 mg',
      variantName: null,
      type: 'good' as const,
      unitOfMeasure: 'each',
      tracksLots: true,
    };
    const NONE = {
      status: null,
      direction: null,
      fulfillment: null,
      expiresAt: null,
      productId: null,
      coverFileId: null,
      type: null,
      close: false,
    };

    /**
     * The lookup's answer, a return and a run among it, or the groups
     * given; every question.
     */
    function found(groups?: LookupGroup[]): string[] {
      const asked: string[] = [];
      server.use(
        http.get('/api/v1/products/variants', () =>
          HttpResponse.json([VITAMIN]),
        ),
        http.get('/api/v1/lookup', ({ request }) => {
          asked.push(new URL(request.url).searchParams.get('q') ?? '');
          return HttpResponse.json({
            groups: groups ?? [
              {
                kind: 'lot',
                results: [
                  {
                    ...NONE,
                    id: LOT,
                    title: 'VC-0302',
                    detail: 'VITC-500',
                    expiresAt: '2026-11-22',
                  },
                ],
              },
              {
                kind: 'order',
                results: [
                  {
                    ...NONE,
                    id: ORDER,
                    title: 'PO-000009',
                    detail: 'Lakeshore Packaging',
                    status: 'confirmed',
                    direction: 'purchase',
                    fulfillment: 'part',
                  },
                ],
              },
              {
                kind: 'item',
                results: [
                  {
                    ...NONE,
                    id: ITEM,
                    title: 'Vitamin C 500 mg',
                    detail: 'VITC-500',
                  },
                ],
              },
              {
                kind: 'returnAuthorization',
                results: [{ ...NONE, id: PARTNER, title: 'RA-000001' }],
              },
              {
                kind: 'productionRun',
                results: [{ ...NONE, id: PARTNER, title: 'RUN-000001' }],
              },
            ],
          });
        }),
      );
      return asked;
    }

    const FIND = 'Find an item, lot or order';
    const box = () => screen.getByRole('combobox', { name: FIND });

    it('offers items, lots and orders in words, grouped, never a run or a return', async () => {
      const user = userEvent.setup();
      answer([MOVEMENT]);
      found();
      renderAt('/movements');

      await user.type(
        await screen.findByRole('combobox', {
          name: 'Find an item, lot or order',
        }),
        'VC',
      );

      const list = await screen.findByRole('listbox');
      await within(list).findByRole('option', { name: /^Lot VC-0302/ });
      expect(
        within(list)
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual([
        'Lot VC-0302 · Vitamin C 500 mg · expires Nov 22, 2026',
        'PO-000009 · Lakeshore Packaging · Partly received',
        'Vitamin C 500 mg · VITC-500',
      ]);
      expect(within(list).getByText('Lots')).toBeVisible();
      expect(within(list).getByText('Orders')).toBeVisible();
      expect(within(list).getByText('Items')).toBeVisible();
      // Typed text alone never filters.
      expect(addressOf().textContent).toBe('');
    });

    it('sets a lot’s item and the lot by the keyboard, each a chip, the box emptied', async () => {
      const user = userEvent.setup();
      answer([movement({ variantId: ITEM, lotId: LOT, lotCode: 'VC-0302' })]);
      found();
      renderAt('/movements');

      await user.type(
        await screen.findByRole('combobox', {
          name: 'Find an item, lot or order',
        }),
        'VC',
      );
      await screen.findByRole('option', { name: /^Lot VC-0302/ });
      await user.keyboard('{Enter}');

      const address = new URLSearchParams(addressOf().textContent ?? '');
      expect(address.get('variantId')).toBe(ITEM);
      expect(address.get('lotId')).toBe(LOT);
      expect(box()).toHaveValue('');
      expect(
        await screen.findByRole('button', {
          name: 'Remove filter: Item: Vitamin C 500 mg · VITC-500',
        }),
      ).toBeVisible();
      expect(
        screen.getByRole('button', { name: 'Remove filter: Lot: VC-0302' }),
      ).toBeVisible();
    });

    /** A lookup result, exact unless `close`. */
    const result = (over: Partial<LookupResult>): LookupResult => ({
      ...NONE,
      id: LOT,
      title: 'VC-0302',
      detail: 'VITC-500',
      ...over,
    });

    /** The options offered, in words, and the headings over them. */
    const offered = async () => {
      const list = await screen.findByRole('listbox');
      await within(list).findAllByRole('option');
      return {
        options: within(list)
          .getAllByRole('option')
          .map((option) => option.textContent),
        // MUI's group headings, each over its options.
        headings: [...list.querySelectorAll('.MuiAutocomplete-groupLabel')].map(
          (heading) => heading.textContent,
        ),
      };
    };

    // 126's polish: an exact match leaves the close ones out, a typo's.
    it('offers only the exact matches while any match exactly', async () => {
      const user = userEvent.setup();
      answer([MOVEMENT]);
      found([
        { kind: 'lot', results: [result({ expiresAt: '2026-11-22' })] },
        {
          kind: 'order',
          results: [result({ id: ORDER, title: 'PO-000009', close: true })],
        },
        {
          kind: 'item',
          results: [
            result({ id: ITEM, title: 'Vitamin C 500 mg', close: true }),
          ],
        },
      ]);
      renderAt('/movements');

      await user.type(
        await screen.findByRole('combobox', { name: FIND }),
        'VC',
      );

      expect(await offered()).toEqual({
        options: ['Lot VC-0302 · Vitamin C 500 mg · expires Nov 22, 2026'],
        headings: ['Lots'],
      });
    });

    it('offers the close matches under Close matches only when nothing matches exactly', async () => {
      const user = userEvent.setup();
      answer([MOVEMENT]);
      found([
        { kind: 'lot', results: [result({ close: true })] },
        {
          kind: 'item',
          results: [
            result({ id: ITEM, title: 'Vitamin C 500 mg', close: true }),
          ],
        },
      ]);
      renderAt('/movements');

      await user.type(
        await screen.findByRole('combobox', { name: FIND }),
        'VC-0320',
      );

      expect(await offered()).toEqual({
        options: [
          'Lot VC-0302 · Vitamin C 500 mg',
          'Vitamin C 500 mg · VITC-500',
        ],
        headings: ['Close matches'],
      });
    });

    // A whole lot code typed is that lot, though others start with it.
    it('offers a whole lot code alone; chosen, the box empties and the lot stays as its chip', async () => {
      const user = userEvent.setup();
      answer([movement({ variantId: ITEM, lotId: LOT, lotCode: 'MCS-001' })]);
      found([
        {
          kind: 'lot',
          results: [
            result({ title: 'MCS-001' }),
            result({ id: PARTNER, title: 'MCS-0010' }),
          ],
        },
        {
          kind: 'item',
          results: [result({ id: ITEM, title: 'MCS-001 sample bags' })],
        },
      ]);
      renderAt('/movements');

      await user.type(
        await screen.findByRole('combobox', { name: FIND }),
        'mcs-001',
      );
      expect(await offered()).toEqual({
        options: ['Lot MCS-001 · Vitamin C 500 mg'],
        headings: ['Lots'],
      });

      await user.click(screen.getByRole('option', { name: /^Lot MCS-001/ }));

      expect(box()).toHaveValue('');
      expect(box()).toHaveAccessibleName(FIND);
      expect(
        await screen.findByRole('button', {
          name: 'Remove filter: Lot: MCS-001',
        }),
      ).toBeVisible();
    });

    it('sets an order by its option, its chip under the row; Escape closes the list', async () => {
      const user = userEvent.setup();
      answer([
        movement({
          document: { kind: 'order', id: ORDER, number: 'PO-000009' },
        }),
      ]);
      found();
      renderAt('/movements');

      await user.type(
        await screen.findByRole('combobox', {
          name: 'Find an item, lot or order',
        }),
        'PO',
      );
      await screen.findByRole('listbox');
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

      await user.keyboard('{ArrowDown}');
      await user.click(
        await screen.findByRole('option', { name: /^PO-000009/ }),
      );

      const address = new URLSearchParams(addressOf().textContent ?? '');
      expect([...address.keys()]).toEqual(['orderId']);
      expect(address.get('orderId')).toBe(ORDER);
      expect(
        await screen.findByRole('button', {
          name: 'Remove filter: Order: PO-000009',
        }),
      ).toBeVisible();
    });
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

  // 118a: a move across every place says how many moved, in words,
  // never a bare number, which reads as stock added.
  it('says how many a move between two places moved across every place, never a bare number', async () => {
    const row = await rowFor(TRANSFER);

    expect(
      within(row).getByRole('cell', { name: 'moved 12 each' }),
    ).toBeVisible();
    expect(
      within(row).queryByRole('cell', { name: '12 each' }),
    ).not.toBeInTheDocument();
  });

  it('says a move counted in neither once across In and Out, Balance as it was', async () => {
    answer([{ ...TRANSFER, balance: '24.0000' }]);
    renderAt(`/movements?variantId=${ITEM}`);

    const moved = await screen.findByRole('cell', {
      name: 'moved 12 each, counted in neither',
    });
    expect(moved).toHaveAttribute('colspan', '2');
    const row = moved.closest('tr') as HTMLElement;
    expect(cellUnder(row, 'In')).toBe(moved);
    // Spanning In and Out, so Balance is the cell after it.
    expect(moved.nextElementSibling).toHaveTextContent('24 each');
  });

  it('says to choose one item while every item is listed at a place', async () => {
    answer([MOVEMENT]);
    renderAt(`/movements?locationId=${SHELF}`);

    expect(
      await screen.findByText('Choose one item to see In, Out and Balance.'),
    ).toBeVisible();
  });

  // Review 30 by 101a: an order keeps In and Out alone, with no Balance
  // to see (R24), so the hint is for a place alone.
  it('says nothing of Balance with an order chosen, at a place or not', async () => {
    answer([MOVEMENT]);
    for (const filters of [
      `orderId=${ORDER}`,
      `orderId=${ORDER}&locationId=${SHELF}`,
    ]) {
      const { unmount } = renderAt(`/movements?${filters}`);

      await screen.findByRole('link', { name: '维生素 D (60 粒)' });
      expect(
        screen.queryByText('Choose one item to see In, Out and Balance.'),
      ).not.toBeInTheDocument();
      unmount();
    }
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

  // Review 11: a range that runs past today closes at today's on hand,
  // so Closing is dated today, never the range's end, as a forecast.
  it('dates Closing today while the range runs past it, Opening as it was', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-20T21:00:00.000Z'));
    setOrganizationTimeZone('America/Vancouver');
    try {
      answer([movement({ balance: '70.0000' })], {
        opening: '30.0000',
        quantityIn: '72.0000',
        quantityOut: '32.0000',
        closing: '70.0000',
      });
      renderAt(`/movements?variantId=${ITEM}&from=2026-11-01&until=2026-11-30`);

      const opening = await screen.findByText('Opening, Nov 1, 2026');
      const line = opening.closest('dl') as HTMLElement;
      expect(line).toHaveTextContent('Closing, Nov 20, 2026');
      expect(line).not.toHaveTextContent('Nov 30');
    } finally {
      setOrganizationTimeZone(null);
      vi.useRealTimers();
    }
  });

  // Review 1: the days When chose, in its field and on a chip, whose ×
  // clears them.
  it('shows the days chosen in When and on a chip, whose × clears them', async () => {
    answer([MOVEMENT]);
    renderAt('/movements?from=2026-10-01&until=2026-10-31');

    expect(
      await screen.findByRole('combobox', { name: /^When/ }),
    ).toHaveTextContent('Oct 1 – 31, 2026');
    await userEvent.click(
      screen.getByRole('button', {
        // Intl's thin spaces around the dash.
        name: /^Remove filter: When: Oct 1\s–\s31, 2026$/,
      }),
    );

    expect(addressOf().textContent).toBe('');
    expect(screen.getByRole('combobox', { name: /^When/ })).toHaveTextContent(
      'Any time',
    );
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
      'No movements match: sampled and from Oct 1, 2026.',
    );
    expect(
      screen.getAllByRole('button', { name: 'Show all movements' }),
    ).toHaveLength(2);
  });

  // Review 49: the days in words from the catalogue, never a typed
  // dash, an open range by its one end.
  it.each([
    ['until=2026-10-31', 'until Oct 31, 2026'],
    ['from=2026-10-01&until=2026-10-31', 'Oct 1 – 31, 2026'],
  ])('names the days on when nothing matches, as %s', async (days, said) => {
    answer([]);
    renderAt(`/movements?reason=sample&${days}`);

    expect(await screen.findByText(/^No movements match/)).toHaveTextContent(
      `No movements match: sampled and ${said}.`,
    );
  });

  // Review 31: a lot with no movements in range keeps its code, read
  // from its trace, as an order's number is read from the order.
  it('names a lot no row carries, on its chip and in what no result names', async () => {
    answer([]);
    server.use(
      http.get(`/api/v1/stock/lots/${LOT}/trace`, () =>
        HttpResponse.json({ lot: { id: LOT, code: 'VC-0302' } }),
      ),
    );
    renderAt(`/movements?lotId=${LOT}&from=2026-10-01`);

    expect(
      await screen.findByRole('button', {
        name: 'Remove filter: Lot: VC-0302',
      }),
    ).toBeVisible();
    expect(screen.getByText(/^No movements match/)).toHaveTextContent(
      'No movements match: VC-0302 and from Oct 1, 2026.',
    );
  });

  // Review 50: an order with no movements in range keeps its number,
  // read from the order, as a lot's code is read from its trace.
  it('names an order no row carries, on its chip and in what no result names', async () => {
    answer([]);
    server.use(
      http.get(`/api/v1/orders/${ORDER}`, () =>
        HttpResponse.json({ id: ORDER, number: 'PO-000009' }),
      ),
    );
    renderAt(`/movements?orderId=${ORDER}&from=2026-10-01`);

    expect(
      await screen.findByRole('button', {
        name: 'Remove filter: Order: PO-000009',
      }),
    ).toBeVisible();
    expect(screen.getByText(/^No movements match/)).toHaveTextContent(
      'No movements match: PO-000009 and from Oct 1, 2026.',
    );
  });

  // Review 32: an archived code, which the picker does not list, opened
  // from Where it stands: named in the Item field from its rows, and in
  // what no result names once a reason leaves none.
  it('names a code the picker does not list from its rows, and keeps it when none match', async () => {
    const archived = movement({
      variantId: ITEM,
      productName: 'Vitamin C',
      variantName: null,
      sku: 'VITC-90',
      currentSku: 'VITC-90',
    });
    server.use(
      http.get('/api/v1/stock/movements', ({ request }) =>
        HttpResponse.json({
          entries: new URL(request.url).searchParams.get('reason')
            ? []
            : [archived],
          nextCursor: null,
          period: null,
        }),
      ),
      http.get('/api/v1/locations', () => HttpResponse.json([MAIN, SHELF_A2])),
    );
    renderAt(`/movements?variantId=${ITEM}`);

    expect(
      await screen.findByRole('button', {
        name: 'Remove filter: Item: Vitamin C · VITC-90',
      }),
    ).toBeVisible();

    await userEvent.click(screen.getByRole('combobox', { name: 'Reason' }));
    await userEvent.click(screen.getByRole('option', { name: 'sampled' }));

    expect(await screen.findByText(/^No movements match/)).toHaveTextContent(
      'No movements match: Vitamin C and sampled.',
    );
    expect(
      screen.getByRole('button', {
        name: 'Remove filter: Item: Vitamin C · VITC-90',
      }),
    ).toBeVisible();
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

  // 106a: Show 25 more puts focus on the first new row, its first link,
  // as Items does, so the keyboard goes on where the new rows begin.
  it('puts focus on the first new row after Show 25 more', async () => {
    const user = userEvent.setup();
    answer([]);
    const later = movement({
      id: 'movement-2',
      productId: 'product-vitc',
      productName: 'Vitamin C',
      variantName: null,
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
    renderAt('/movements');

    await user.click(
      await screen.findByRole('button', { name: 'Show 25 more' }),
    );

    const added = await screen.findByRole('link', { name: 'Vitamin C' });
    await waitFor(() => expect(added).toHaveFocus());
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

  describe('on a phone', () => {
    beforeEach(() => {
      vi.stubGlobal('matchMedia', (query: string) => {
        const min = /min-width:\s*([\d.]+)px/.exec(query);
        const max = /max-width:\s*([\d.]+)px/.exec(query);
        return {
          matches:
            (!min || 390 >= Number(min[1])) && (!max || 390 <= Number(max[1])),
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        };
      });
      return () => vi.unstubAllGlobals();
    });

    // 118a: a card says a move counted in neither in its row's words.
    it('says a move counted in neither on its card in its row’s words', async () => {
      answer([{ ...TRANSFER, balance: '24.0000' }]);
      renderAt(`/movements?variantId=${ITEM}`);

      const card = (
        await screen.findByText('moved 12 each, counted in neither')
      ).closest('li') as HTMLElement;
      expect(within(card).queryByText('In')).not.toBeInTheDocument();
      expect(within(card).queryByText('Out')).not.toBeInTheDocument();
      expect(within(card).getByText('Balance')).toBeVisible();
    });

    // Review 48: the sheet's Clear clears the sheet's own fields; the
    // lot's and the order's chips, outside it, keep theirs, as the sort
    // does.
    it('clears the sheet’s own fields with its Clear, the lot and order chips kept', async () => {
      const user = userEvent.setup();
      answer([
        movement({
          lotId: LOT,
          lotCode: 'VC-0302',
          document: { kind: 'order', id: ORDER, number: 'PO-000009' },
        }),
      ]);
      renderAt(
        `/movements?variantId=${ITEM}&locationId=${SHELF}&lotId=${LOT}&orderId=${ORDER}&reason=shipment&from=2026-10-01&until=2026-10-31&sort=when&order=asc`,
      );

      await user.click(await screen.findByRole('button', { name: /^Filters/ }));
      const sheet = await screen.findByRole('dialog', {
        name: 'Filters and sort',
      });
      await user.click(within(sheet).getByRole('button', { name: 'Clear' }));
      await user.click(within(sheet).getByRole('button', { name: 'Done' }));

      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Filters and sort' }),
        ).not.toBeInTheDocument(),
      );
      const address = new URLSearchParams(addressOf().textContent ?? '');
      expect([...address.keys()].sort()).toEqual([
        'lotId',
        'order',
        'orderId',
        'sort',
      ]);
      expect(address.get('lotId')).toBe(LOT);
      expect(address.get('orderId')).toBe(ORDER);
      expect(
        screen.getByRole('button', { name: 'Remove filter: Lot: VC-0302' }),
      ).toBeVisible();
      expect(
        screen.getByRole('button', { name: 'Remove filter: Order: PO-000009' }),
      ).toBeVisible();
    });
  });
});
