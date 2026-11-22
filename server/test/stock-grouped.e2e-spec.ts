import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { readableQuantity } from '../src/common/readable-quantity';
import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { productVariants } from '../src/database/schema';
import {
  addMember,
  body,
  createE2eApp,
  createLocation,
  customRole,
  registerOrganization,
} from './utils/fixtures';
import {
  item,
  order,
  partner,
  point,
  receive,
  site,
} from './utils/reorder-world';
import { resetDatabase } from './utils/reset-db';

type Org = Awaited<ReturnType<typeof registerOrganization>>;

interface CodeRow {
  variantId: string;
  sku: string;
  [figure: string]: unknown;
}

interface Pile {
  id: string;
  lotCode: string | null;
  locationName: string | null;
  quantity: string;
  places?: number;
}

/** A day this many days from now, as a lot's expiry. */
function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

const SOON = inDays(10);

/**
 * Inventory's grouped read (ADR-093, R1 to R4 and R16): a row per code
 * with its figures, the counts beside its quick filters, its sorts and
 * paging, a code's places and lots, and the Lot view.
 */
describe('Inventory, grouped (e2e)', () => {
  let app: INestApplication;
  let db: Database;

  beforeAll(async () => {
    app = await createE2eApp();
    db = app.get<Database>(UNSAFE_GLOBAL_DB);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  /**
   * Five codes, each named by its code:
   *
   * - VITC, by lot: VC-SOON, expiring in 10 days, 30 on SHELF and 5 on
   *   BACK; VC-FAR, 20 on SHELF; VC-OLD, expired, 12 in quarantine. Its
   *   point of 100 makes it low: 55 usable.
   * - MAG: a point of 50 and nothing at all, so out.
   * - FOCUS: 70 on SHELF, and 20 coming on a purchase.
   * - ELDER: 10 on SHELF, a sale of 30 holding them, 20 short.
   * - NEVER: nothing, listed only with Include empty.
   *
   * Every receipt is without a price, so it waits for a cost.
   */
  async function world(org: Org) {
    const { agent } = org;
    const shelf = await site(agent, 'SHELF');
    const back = await site(agent, 'BACK');
    const quarantine = await site(agent, 'QUAR', false);
    const vitc = await item(agent, 'VITC', true);
    const mag = await item(agent, 'MAG');
    const focus = await item(agent, 'FOCUS');
    const elder = await item(agent, 'ELDER');
    const never = await item(agent, 'NEVER');

    await receive(agent, vitc, shelf, '30', {
      code: 'VC-SOON',
      expiresAt: SOON,
    });
    await receive(agent, vitc, back, '5', { code: 'VC-SOON' });
    await receive(agent, vitc, shelf, '20', {
      code: 'VC-FAR',
      expiresAt: '2099-01-01',
    });
    await receive(agent, vitc, quarantine, '12', {
      code: 'VC-OLD',
      expiresAt: '2020-01-01',
    });
    await point(agent, vitc, '100');
    await point(agent, mag, '50');
    await receive(agent, focus, shelf, '70');
    await order(
      agent,
      'purchase',
      await partner(agent, 'Harbour Supply'),
      focus,
      '20',
    );
    await receive(agent, elder, shelf, '10');
    await order(agent, 'sale', await partner(agent, 'Lam Herbal'), elder, '30');

    return { shelf, back, quarantine, vitc, mag, focus, elder, never };
  }

  async function codes(org: Org, filters = ''): Promise<CodeRow[]> {
    const page = body<{ entries: CodeRow[]; nextCursor: string | null }>(
      await org.agent.get(`/v1/stock/by-code${filters}`).expect(200),
    );
    expect(page.nextCursor).toBeNull();
    return page.entries;
  }

  const skus = (rows: { sku: string }[]) => rows.map((row) => row.sku);

  it('lists a row per code with its figures, and Include empty the rest', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { vitc, elder } = await world(alpha);

    const rows = await codes(alpha);
    expect(skus(rows)).toEqual(['ELDER', 'FOCUS', 'MAG', 'VITC']);
    expect(rows.find((row) => row.variantId === vitc)).toMatchObject({
      type: 'good',
      places: 3,
      lots: 3,
      onHand: '67.0000',
      usable: '55.0000',
      notUsable: '12.0000',
      unavailable: '12.0000',
      held: '0.0000',
      free: '55.0000',
      short: '0.0000',
      expiresFirst: SOON,
      reorderPoint: '100.0000',
      status: 'low',
      needsCost: true,
      here: null,
    });
    expect(rows.find((row) => row.variantId === elder)).toMatchObject({
      onHand: '10.0000',
      held: '10.0000',
      free: '0.0000',
      short: '20.0000',
      status: null,
    });
    expect(rows.find((row) => row.sku === 'MAG')).toMatchObject({
      places: 0,
      onHand: '0.0000',
      status: 'out',
      needsCost: false,
    });

    expect(skus(await codes(alpha, '?includeEmpty=true'))).toEqual([
      'ELDER',
      'FOCUS',
      'MAG',
      'NEVER',
      'VITC',
    ]);

    // Another organization's codes are never listed, nor its item asked for.
    const beta = await registerOrganization(app, 'beta');
    const theirs = await item(beta.agent, 'THEIRS');
    await receive(beta.agent, theirs, await site(beta.agent, 'SHELF'), '9');
    expect(skus(await codes(alpha))).not.toContain('THEIRS');
    const productId = body<{ entries: { id: string }[] }>(
      await beta.agent.get('/v1/products').expect(200),
    ).entries[0].id;
    await alpha.agent
      .get(`/v1/stock/by-code?productId=${productId}`)
      .expect(400);
  });

  it('counts each quick filter as the rows it shows, with the other filters on', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { back } = await world(alpha);
    const filters: Record<string, string> = {
      low: 'low=true',
      out: 'out=true',
      expiring: 'expiringWithin=90',
      expired: 'expired=true',
      needsCost: 'needsCost=true',
    };
    const countsOf = async (query: string) =>
      body<Record<string, number>>(
        await alpha.agent.get(`/v1/stock/by-code/counts?${query}`).expect(200),
      );

    expect(await countsOf('')).toEqual({
      low: 2,
      out: 1,
      expiring: 1,
      expired: 1,
      needsCost: 3,
      total: 4,
    });

    // With nothing else, with Low stock on, a search, a type and a place
    // (Expiring soon and Expired read from the lots there, review 39): each
    // count is the rows its filter shows beside the others.
    for (const others of [
      '',
      'low=true',
      'search=FOCUS',
      'type=good',
      `locationId=${back}`,
    ]) {
      const counts = await countsOf(others);
      for (const [name, filter] of Object.entries(filters)) {
        const query = [...new Set([others, filter])].filter(Boolean).join('&');
        expect({
          name,
          others,
          count: (await codes(alpha, `?${query}`)).length,
        }).toEqual({
          name,
          others,
          count: counts[name],
        });
      }
      // And the total, "Showing 50 of …", the rows the list shows.
      expect({
        others,
        total: (await codes(alpha, others ? `?${others}` : '')).length,
      }).toEqual({ others, total: counts.total });
    }
    expect(await countsOf('low=true')).toMatchObject({ needsCost: 1, out: 1 });
    expect(skus(await codes(alpha, '?low=true&needsCost=true'))).toEqual([
      'VITC',
    ]);
  });

  it('sorts by name, On hand and Expires first, and pages without skipping or repeating', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await world(alpha);

    const sorted: Record<string, string[]> = {
      '': ['ELDER', 'FOCUS', 'MAG', 'VITC'],
      '?order=desc': ['VITC', 'MAG', 'FOCUS', 'ELDER'],
      '?sort=onHand': ['MAG', 'ELDER', 'VITC', 'FOCUS'],
      '?sort=onHand&order=desc': ['FOCUS', 'VITC', 'ELDER', 'MAG'],
      // Nothing to expire last, either way.
      '?sort=expires': ['VITC', 'ELDER', 'FOCUS', 'MAG'],
      '?sort=expires&order=desc': ['VITC', 'ELDER', 'FOCUS', 'MAG'],
    };

    for (const [query, expected] of Object.entries(sorted)) {
      expect({ query, skus: skus(await codes(alpha, query)) }).toEqual({
        query,
        skus: expected,
      });

      // A page of one at a time, each cursor the last's.
      const paged: string[] = [];
      let before: string | null = null;
      do {
        const joined = [query.slice(1), 'limit=1', before && `before=${before}`]
          .filter(Boolean)
          .join('&');
        const page: { entries: CodeRow[]; nextCursor: string | null } = body(
          await alpha.agent.get(`/v1/stock/by-code?${joined}`).expect(200),
        );
        paged.push(...skus(page.entries));
        before = page.nextCursor;
      } while (before);
      expect({ query, paged }).toEqual({ query, paged: expected });
    }

    // A cursor made for one sort is no place in another.
    const { nextCursor } = body<{ nextCursor: string }>(
      await alpha.agent.get('/v1/stock/by-code?limit=1').expect(200),
    );
    await alpha.agent
      .get(`/v1/stock/by-code?sort=onHand&before=${nextCursor}`)
      .expect(400);
    await alpha.agent.get('/v1/stock/by-code?sort=quantity').expect(400);
    // Free is no sort: worked out for every code, past the budget (35a).
    await alpha.agent.get('/v1/stock/by-code?sort=free').expect(400);
  });

  // Bob's third message (7): the Lot view's headers sort it, each way,
  // keyset paged without skipping or repeating.
  it('sorts the Lot view by Expires, the item, the place or the quantity, either way, and pages without skipping or repeating', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await world(alpha);
    type LotRow = Pile & {
      productName: string;
      lotExpiresAt: string | null;
    };
    const read = async (query: string) =>
      body<{ entries: LotRow[]; nextCursor: string | null }>(
        await alpha.agent.get(`/v1/stock/by-lot?${query}`).expect(200),
      );
    /** What each sort orders by, as the row shows it. */
    const keyOf: Record<string, (row: LotRow) => string> = {
      item: (row) => row.productName,
      location: (row) => row.locationName ?? '',
      quantity: (row) => row.quantity.padStart(20, '0'),
      expires: (row) => row.lotExpiresAt ?? '9999-12-31',
    };

    for (const sort of ['expires', 'item', 'location', 'quantity']) {
      for (const order of ['asc', 'desc']) {
        const query = `sort=${sort}&order=${order}`;
        const whole = (await read(`${query}&limit=100`)).entries;
        const keys = whole.map(keyOf[sort]);
        const expected = [...keys].sort();
        if (order === 'desc') {
          expected.reverse();
          // No expiry last either way.
          if (sort === 'expires') {
            const none = expected.filter((key) => key === '9999-12-31');
            expected.splice(0, none.length);
            expected.push(...none);
          }
        }
        expect({ query, keys }).toEqual({ query, keys: expected });

        // A page of one at a time, each cursor the last pile's.
        const paged: string[] = [];
        let before: string | null = null;
        do {
          const page = await read(
            [query, 'limit=1', before && `before=${before}`]
              .filter(Boolean)
              .join('&'),
          );
          paged.push(...page.entries.map((row) => row.id));
          before = page.nextCursor;
        } while (before);
        expect({ query, paged }).toEqual({
          query,
          paged: whole.map((row) => row.id),
        });
      }
    }

    await alpha.agent.get('/v1/stock/by-lot?sort=free').expect(400);
  });

  it('reads each figure sort’s pages in the order of the figures they show, either way', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { shelf } = await world(alpha);

    type Figures = {
      onHand: string;
      expiresFirst: string | null;
      here: { onHand: string; expiresFirst: string | null } | null;
    };
    const of = (row: CodeRow) => row as unknown as Figures;
    /** The figure a row shows for the sort: at the place chosen, its own. */
    const shown: Record<string, (row: CodeRow) => string | null> = {
      onHand: (row) => of(row).here?.onHand ?? of(row).onHand,
      expires: (row) => {
        const { here, expiresFirst } = of(row);
        return here ? here.expiresFirst : expiresFirst;
      },
    };
    /** -1, 0 or 1 as a comes before, with or after b; no expiry last. */
    const compare = (sort: string, a: string | null, b: string | null) => {
      if (sort === 'expires') {
        if (a === b) return 0;
        if (a === null) return 1;
        if (b === null) return -1;
        return a < b ? -1 : 1;
      }
      return Math.sign(Number(a) - Number(b));
    };

    for (const sort of Object.keys(shown)) {
      for (const order of ['asc', 'desc']) {
        for (const place of ['', `&locationId=${shelf}`]) {
          const query = `sort=${sort}&order=${order}${place}`;
          const rows: CodeRow[] = [];
          let before: string | null = null;
          do {
            const page: { entries: CodeRow[]; nextCursor: string | null } =
              body(
                await alpha.agent
                  .get(
                    `/v1/stock/by-code?${query}&limit=2${before ? `&before=${before}` : ''}`,
                  )
                  .expect(200),
              );
            rows.push(...page.entries);
            before = page.nextCursor;
          } while (before);

          // Every code once, as the whole list has them.
          expect({ query, skus: skus(rows).sort() }).toEqual({
            query,
            skus: skus(await codes(alpha, `?${query}`)).sort(),
          });
          // Each next to the one before, as its figure says; no expiry
          // last either way.
          for (let i = 1; i < rows.length; i++) {
            const [a, b] = [shown[sort](rows[i - 1]), shown[sort](rows[i])];
            const way =
              sort === 'expires' && (a === null || b === null)
                ? compare(sort, a, b)
                : compare(sort, a, b) * (order === 'desc' ? -1 : 1);
            expect({ query, a, b, inOrder: way <= 0 }).toEqual({
              query,
              a,
              b,
              inOrder: true,
            });
          }
        }
      }
    }
  });

  it('keeps what is at one place, its figures there, Free and Held the whole item’s', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { shelf } = await world(alpha);

    const rows = await codes(alpha, `?locationId=${shelf}&sort=onHand`);
    expect(skus(rows)).toEqual(['ELDER', 'VITC', 'FOCUS']);
    expect(rows.find((row) => row.sku === 'VITC')).toMatchObject({
      onHand: '67.0000',
      free: '55.0000',
      here: { onHand: '50.0000', lots: 2, expiresFirst: SOON },
    });
  });

  it('finds a lot by its code at the place chosen alone, never one held elsewhere', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { shelf, back } = await world(alpha);
    const lotsAt = async (query: string) =>
      body<{ entries: Pile[] }>(
        await alpha.agent.get(`/v1/stock/by-lot?${query}`).expect(200),
      ).entries.map((row) => `${row.lotCode} ${row.locationName}`);

    // VC-FAR is on SHELF alone; VITC is on BACK too, in VC-SOON.
    expect(
      skus(await codes(alpha, `?search=VC-FAR&locationId=${shelf}`)),
    ).toEqual(['VITC']);
    expect(
      skus(await codes(alpha, `?search=VC-FAR&locationId=${back}`)),
    ).toEqual([]);
    expect(
      await alpha.agent
        .get(`/v1/stock/by-code/counts?search=VC-FAR&locationId=${back}`)
        .expect(200)
        .then((res) => body<Record<string, number>>(res).low),
    ).toBe(0);
    expect(await lotsAt(`search=VC-FAR&locationId=${shelf}`)).toEqual([
      'VC-FAR SHELF',
    ]);
    expect(await lotsAt(`search=VC-FAR&locationId=${back}`)).toEqual([]);
  });

  it('opens a code to its places and their lots, soonest first, a place’s name only for a reader who may see places', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { vitc, shelf } = await world(alpha);

    type Places = {
      places: {
        locationName: string | null;
        isAvailable: boolean;
        onHand: string;
        lots: Pile[];
      }[];
    };
    const { places } = body<Places>(
      await alpha.agent.get(`/v1/stock/by-code/${vitc}/places`).expect(200),
    );
    expect(
      places.map((place) => ({
        name: place.locationName,
        available: place.isAvailable,
        onHand: place.onHand,
        lots: place.lots.map((lot) => [lot.lotCode, lot.quantity]),
      })),
    ).toEqual([
      {
        name: 'BACK',
        available: true,
        onHand: '5.0000',
        lots: [['VC-SOON', '5.0000']],
      },
      {
        name: 'QUAR',
        available: false,
        onHand: '12.0000',
        lots: [['VC-OLD', '12.0000']],
      },
      {
        name: 'SHELF',
        available: true,
        onHand: '50.0000',
        lots: [
          ['VC-SOON', '30.0000'],
          ['VC-FAR', '20.0000'],
        ],
      },
    ]);

    // The place chosen alone.
    const one = body<Places>(
      await alpha.agent
        .get(`/v1/stock/by-code/${vitc}/places?locationId=${shelf}`)
        .expect(200),
    );
    expect(one.places.map((place) => place.locationName)).toEqual(['SHELF']);

    // A reader without locations.view: the lots and their figures, never a
    // place's name.
    await customRole(app, alpha.organizationId, 'Counter', ['stock.view']);
    const counter = await addMember(
      app,
      alpha,
      'counter@example.com',
      'Counter',
    );
    const theirs = body<Places>(
      await counter.get(`/v1/stock/by-code/${vitc}/places`).expect(200),
    );
    expect(theirs.places).toHaveLength(3);
    for (const place of theirs.places) {
      expect(place.locationName).toBeNull();
      expect(place.lots.every((lot) => lot.locationName === null)).toBe(true);
    }
    const lots = body<{ entries: Pile[] }>(
      await counter.get('/v1/stock/by-lot').expect(200),
    ).entries;
    expect(lots.every((lot) => lot.locationName === null)).toBe(true);

    // Another organization's code is not here.
    const beta = await registerOrganization(app, 'beta');
    await beta.agent.get(`/v1/stock/by-code/${vitc}/places`).expect(404);
  });

  // A place written as its path, the warehouse first (57a): the names
  // above it come with the page's rows, for a reader who may see places.
  it('sends the places above each place, its warehouse first, on Stock and Where it stands', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const main = await createLocation(alpha.agent, {
      type: 'site',
      name: 'Main warehouse',
    });
    const zone = await createLocation(alpha.agent, {
      type: 'zone',
      name: 'Zone A',
      parentId: main,
    });
    const shelf = await createLocation(alpha.agent, {
      type: 'shelf',
      name: 'Shelf A2',
      code: 'A2',
      parentId: zone,
    });
    const back = await site(alpha.agent, 'BACK');
    const vitc = await item(alpha.agent, 'VITC', true);
    await receive(alpha.agent, vitc, shelf, '30', { code: 'VC-1' });
    await receive(alpha.agent, vitc, back, '5', { code: 'VC-1' });

    type Placed = {
      locationName: string | null;
      locationPath: string[];
    };
    const pathsOf = (places: Placed[]) =>
      places.map((place) => [...place.locationPath, place.locationName]);

    const { places } = body<{ places: Placed[] }>(
      await alpha.agent.get(`/v1/stock/by-code/${vitc}/places`).expect(200),
    );
    expect(pathsOf(places)).toEqual([
      ['BACK'],
      ['Main warehouse', 'Zone A', 'Shelf A2'],
    ]);

    const lots = body<{ entries: (Placed & { productId: string })[] }>(
      await alpha.agent.get('/v1/stock/by-lot?sort=location').expect(200),
    ).entries;
    expect(pathsOf(lots)).toEqual([
      ['BACK'],
      ['Main warehouse', 'Zone A', 'Shelf A2'],
    ]);

    const standing = body<{ codes: { places: Placed[] | null }[] }>(
      await alpha.agent
        .get(`/v1/products/${lots[0].productId}/stock`)
        .expect(200),
    );
    expect(pathsOf(standing.codes[0].places!)).toEqual([
      ['BACK'],
      ['Main warehouse', 'Zone A', 'Shelf A2'],
    ]);

    // A reader without locations.view: no names above, as none of its own.
    await customRole(app, alpha.organizationId, 'Counter', ['stock.view']);
    const counter = await addMember(
      app,
      alpha,
      'counter@example.com',
      'Counter',
    );
    const theirs = body<{ places: Placed[] }>(
      await counter.get(`/v1/stock/by-code/${vitc}/places`).expect(200),
    );
    expect(theirs.places.map((place) => place.locationPath)).toEqual([[], []]);
    const theirLots = body<{ entries: Placed[] }>(
      await counter.get('/v1/stock/by-lot').expect(200),
    ).entries;
    expect(theirLots.map((lot) => lot.locationPath)).toEqual([[], []]);
  });

  // The history dialog's Why names the document each movement was for
  // (55a): an order by its number, for a reader who may see orders.
  it('names the order each movement was received or shipped on, for a reader who may see orders', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { agent } = alpha;
    const shelf = await site(agent, 'SHELF');
    const focus = await item(agent, 'FOCUS');
    const bought = await order(
      agent,
      'purchase',
      await partner(agent, 'Harbour Supply'),
      focus,
      '20',
    );
    await agent
      .post(`/v1/orders/${bought.id}/lines/${bought.lineId}/receipts`)
      .send({ toLocationId: shelf, quantity: '20' })
      .expect(201);
    await receive(agent, focus, shelf, '3');
    const sold = await order(
      agent,
      'sale',
      await partner(agent, 'Lam Herbal'),
      focus,
      '4',
    );
    await agent
      .post(`/v1/orders/${sold.id}/shipments`)
      .send({
        fromLocationId: shelf,
        lines: [{ lineId: sold.lineId, quantity: '4' }],
      })
      .expect(201);

    type Moved = {
      reason: string;
      quantity: string;
      document: { kind: string; id: string; number: string | null } | null;
    };
    const read = async (as: typeof agent) =>
      body<{ entries: Moved[] }>(
        await as.get(`/v1/stock/movements?variantId=${focus}`).expect(200),
      ).entries.map((row) => [row.reason, row.quantity, row.document]);

    expect(await read(agent)).toEqual([
      [
        'shipment',
        '4.0000',
        { kind: 'order', id: sold.id, number: sold.number },
      ],
      ['receipt', '3.0000', null],
      [
        'receipt',
        '20.0000',
        { kind: 'order', id: bought.id, number: bought.number },
      ],
    ]);

    // A reader who may not see orders: the movements, never the order.
    await customRole(app, alpha.organizationId, 'Counter', ['stock.view']);
    const counter = await addMember(
      app,
      alpha,
      'counter@example.com',
      'Counter',
    );
    expect((await read(counter)).map((row) => row[2])).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('lists a row per lot at each place, soonest first, the expired on top, a lot’s places together', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await world(alpha);

    const rows = body<{ entries: Pile[]; nextCursor: null }>(
      await alpha.agent.get('/v1/stock/by-lot').expect(200),
    ).entries;
    expect(
      rows.map((row) => [row.lotCode, row.locationName, row.places]),
    ).toEqual([
      ['VC-OLD', 'QUAR', 1],
      ['VC-SOON', 'BACK', 2],
      ['VC-SOON', 'SHELF', 2],
      ['VC-FAR', 'SHELF', 1],
    ]);

    // Paged by a pile's id, one at a time.
    const paged: string[] = [];
    let before: string | null = null;
    do {
      const page: { entries: Pile[]; nextCursor: string | null } = body(
        await alpha.agent
          .get(`/v1/stock/by-lot?limit=1${before ? `&before=${before}` : ''}`)
          .expect(200),
      );
      paged.push(...page.entries.map((row) => row.id));
      before = page.nextCursor;
    } while (before);
    expect(paged).toEqual(rows.map((row) => row.id));
    // A cursor that is no pile's id is refused, not a fault (review 55).
    await alpha.agent.get('/v1/stock/by-lot?before=nope').expect(400);

    // The filters as a row per code's: Expiring soon the expired among it,
    // Low stock by the code's status.
    const lotCodes = async (query: string) =>
      body<{ entries: Pile[] }>(
        await alpha.agent.get(`/v1/stock/by-lot?${query}`).expect(200),
      ).entries.map((row) => `${row.lotCode} ${row.locationName}`);
    expect(await lotCodes('expiringWithin=90')).toEqual([
      'VC-OLD QUAR',
      'VC-SOON BACK',
      'VC-SOON SHELF',
    ]);
    expect(await lotCodes('expired=true')).toEqual(['VC-OLD QUAR']);
    expect(await lotCodes('out=true')).toEqual([]);
    expect(await lotCodes('low=true&search=VC-FAR')).toEqual(['VC-FAR SHELF']);
  });

  // Whether an item was ever stocked where the row stands, and the day a
  // pile was emptied: what its Actions grey and say (ADR-093 v3).
  it('says whether a code was ever stocked here, and the day each emptied pile was emptied', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { shelf, back, elder, focus } = await world(alpha);
    // ELDER's 10 on the shelf, counted away: an emptied pile.
    await alpha.agent
      .post('/v1/stock/movements')
      .send({
        variantId: elder,
        fromLocationId: shelf,
        quantity: '10',
        reason: 'adjustment',
        reasonDetail: 'damaged',
        note: 'Broken in the move',
      })
      .expect(201);

    const stocked = async (filters: string) =>
      Object.fromEntries(
        (await codes(alpha, filters)).map((row) => [row.sku, row.stocked]),
      );
    // MAG has a point and was never received: never stocked.
    expect(await stocked('?includeEmpty=true')).toMatchObject({
      MAG: false,
      ELDER: true,
      FOCUS: true,
    });
    // At the back, the list holds only what was stocked there.
    expect(await stocked(`?includeEmpty=true&locationId=${back}`)).toEqual({
      VITC: true,
    });

    const { places } = body<{
      places: { lots: { quantity: string; emptiedOn: string | null }[] }[];
    }>(
      await alpha.agent
        .get(`/v1/stock/by-code/${elder}/places?includeEmpty=true`)
        .expect(200),
    );
    expect(places[0].lots[0].quantity).toBe('0.0000');
    expect(places[0].lots[0].emptiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const held = body<{
      places: { lots: { emptiedOn: string | null }[] }[];
    }>(await alpha.agent.get(`/v1/stock/by-code/${focus}/places`).expect(200));
    expect(held.places[0].lots[0].emptiedOn).toBeNull();
  });

  it('counts each of the Lot view’s quick filters as the lots it shows, with the other filters on, and exports those rows', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { shelf } = await world(alpha);
    const filters: Record<string, string> = {
      low: 'low=true',
      expiring: 'expiringWithin=90',
      expired: 'expired=true',
      needsCost: 'needsCost=true',
      detailsToAdd: 'detailsToAdd=true',
    };
    const lotsOf = async (query: string) => {
      const page = body<{ entries: Pile[]; nextCursor: string | null }>(
        await alpha.agent.get(`/v1/stock/by-lot?${query}`).expect(200),
      );
      expect(page.nextCursor).toBeNull();
      return page.entries;
    };
    const countsOf = async (query: string) =>
      body<Record<string, number>>(
        await alpha.agent.get(`/v1/stock/by-lot/counts?${query}`).expect(200),
      );

    // Lots at each place, not codes: VITC's four rows are low, as VITC is;
    // MAG, out, keeps none.
    expect(await countsOf('')).toEqual({
      low: 4,
      expiring: 3,
      expired: 1,
      needsCost: 4,
      detailsToAdd: 0,
      total: 4,
    });

    for (const others of [
      '',
      'low=true',
      'search=VC-SOON',
      `locationId=${shelf}`,
    ]) {
      const counts = await countsOf(others);
      for (const [name, filter] of Object.entries(filters)) {
        const query = [...new Set([others, filter])].filter(Boolean).join('&');
        expect({ name, others, count: (await lotsOf(query)).length }).toEqual({
          name,
          others,
          count: counts[name],
        });
      }
      // And the total, "Showing 50 of … lots", the rows the list shows.
      expect({ others, total: (await lotsOf(others)).length }).toEqual({
        others,
        total: counts.total,
      });
    }

    // The export is the rows, filters and all.
    for (const query of [
      'low=true',
      'expiringWithin=90',
      `locationId=${shelf}`,
    ]) {
      const lines = (
        await alpha.agent.get(`/v1/stock/by-lot/export?${query}`).expect(200)
      ).text
        .replace(/^\uFEFF/, '')
        .trimEnd()
        .split('\r\n')
        .map((line) => line.split(','));
      const lot = lines[0].indexOf('Lot');
      expect({ query, lots: lines.slice(1).map((line) => line[lot]) }).toEqual({
        query,
        lots: (await lotsOf(query)).map((row) => row.lotCode),
      });
    }
  });

  it('exports the rows the screen lists, with its filters, in the screen’s words and the reader’s language', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { shelf } = await world(alpha);

    /** A CSV line's cells, a quoted one's commas and quotes its own. */
    const cellsOf = (line: string) => {
      const cells: string[] = [];
      let cell = '';
      let quoted = false;
      for (let at = 0; at < line.length; at += 1) {
        const char = line[at];
        if (quoted && char === '"' && line[at + 1] === '"') {
          cell += '"';
          at += 1;
        } else if (char === '"') {
          quoted = !quoted;
        } else if (char === ',' && !quoted) {
          cells.push(cell);
          cell = '';
        } else {
          cell += char;
        }
      }
      return [...cells, cell];
    };

    /** The CSV's lines, without its BOM, each split into its cells. */
    const csv = async (path: string, language: string) =>
      (
        await alpha.agent.get(path).set('Accept-Language', language).expect(200)
      ).text
        .replace(/^\uFEFF/, '')
        .trimEnd()
        .split('\r\n')
        .map(cellsOf);

    // Low stock holds the out: VITC low, MAG out, each its word and unit.
    const byCode = await csv('/v1/stock/by-code/export?low=true', 'zh-Hans');
    const head = byCode[0];
    expect(head).toEqual(
      expect.arrayContaining([
        '编码',
        '物品',
        '现有',
        '可分配',
        '已预留',
        '状态',
        '单位',
      ]),
    );
    const cell = (row: string[], name: string) => row[head.indexOf(name)];
    expect(byCode.slice(1).map((row) => cell(row, '编码'))).toEqual([
      'MAG',
      'VITC',
    ]);
    expect(byCode.slice(1).map((row) => cell(row, '状态'))).toEqual([
      '缺货',
      '不足',
    ]);
    expect(byCode.slice(1).map((row) => cell(row, '单位'))).toEqual([
      '个',
      '个',
    ]);

    const english = await csv('/v1/stock/by-code/export', 'en');
    const status = english[0].indexOf('Status');
    expect(english.slice(1).map((row) => row[status])).toEqual([
      '',
      '',
      'Out',
      'Low',
    ]);

    // At one place chosen, that place's On hand and Expires first, as
    // the list's own rows say them, the quantity without its padding
    // zeros (R30), and no Not usable (review 56).
    const atShelf = await csv(
      `/v1/stock/by-code/export?locationId=${shelf}`,
      'en',
    );
    const column = (name: string) => atShelf[0].indexOf(name);
    expect(column('On hand here')).toBeGreaterThan(-1);
    expect(column('Expires first here')).toBeGreaterThan(-1);
    expect(column('Free, every place')).toBeGreaterThan(-1);
    expect(column('Not usable')).toBe(-1);
    const listed = await codes(alpha, `?locationId=${shelf}`);
    const here = (row: CodeRow) =>
      row.here as { onHand: string; expiresFirst: string | null };
    expect(
      atShelf
        .slice(1)
        .map((row) => [
          row[column('Code')],
          row[column('On hand here')],
          row[column('Expires first here')],
        ]),
    ).toEqual(
      listed.map((row) => [
        row.sku,
        readableQuantity(here(row).onHand),
        here(row).expiresFirst ?? '',
      ]),
    );
    // VITC is in three places: the shelf's is not the item's.
    const vitcRow = listed.find((row) => row.sku === 'VITC')!;
    expect(here(vitcRow).onHand).not.toBe(vitcRow.onHand);
    // The Lot view's, its filters kept: the expired lot alone.
    const byLot = await csv('/v1/stock/by-lot/export?expired=true', 'fr-CA');
    expect(byLot).toHaveLength(2);
    expect(byLot[1][byLot[0].indexOf('Lot')]).toBe('VC-OLD');
    expect(byLot[1][byLot[0].indexOf('Unité')]).toBe('unité');
  });

  // ADR-094, R9 (E5): Details to add, the lots with an expiry or a
  // supplier's lot still to add, each pile a row, counted as the rows it
  // shows; every read of a pile, a lot and a movement sends each lot's
  // expiry and supplier's lot, and every stock export writes both.
  it('lists and counts Details to add as the lots it shows, each read and export with the lot’s expiry and supplier’s lot (ADR-094, R9)', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { agent } = alpha;
    const shelf = await site(agent, 'SHELF');
    const back = await site(agent, 'BACK');
    const oil = await item(agent, 'OIL', true);
    // Made for us, its supplier's lot still to add.
    await receive(agent, oil, shelf, '10', { makeCode: true });
    // Made with the supplier's lot as printed, its expiry not known yet.
    await receive(agent, oil, shelf, '5', {
      makeCode: true,
      supplierLot: 'Sup-77',
      expiry: 'unknown',
    });
    // Made with both: nothing to add.
    await receive(agent, oil, shelf, '7', {
      makeCode: true,
      supplierLot: 'SUP-88',
      expiry: 'date',
      expiresAt: '2099-01-01',
    });
    // Typed from the box, the supplier's own: one not known yet, one dated.
    await receive(agent, oil, shelf, '4', {
      code: 'TYPED-1',
      expiry: 'unknown',
    });
    await receive(agent, oil, shelf, '6', { code: 'TYPED-2', expiresAt: SOON });

    // The receive dialogs' lots, each with its expiry and supplier's lot.
    type Known = {
      id: string;
      code: string;
      expiresAt: string | null;
      expiry: string;
      isAssigned: boolean;
      supplierLot: string | null;
    };
    const known = body<Known[]>(
      await agent.get(`/v1/stock/lots?variantId=${oil}`).expect(200),
    );
    const lot = (supplierLot: string | null) =>
      known.find((one) => one.isAssigned && one.supplierLot === supplierLot)!;
    const [toAdd, later] = [lot(null).code, lot('Sup-77').code];
    expect(lot('Sup-77')).toMatchObject({ expiry: 'unknown', expiresAt: null });
    expect(known.find((one) => one.code === 'TYPED-2')).toMatchObject({
      expiry: 'date',
      expiresAt: SOON,
      isAssigned: false,
      supplierLot: null,
    });
    // The second at the back too, by its code.
    await receive(agent, oil, back, '3', { code: later });

    type Row = Pile & {
      productId: string;
      lotExpiresAt: string | null;
      lotExpiry: string | null;
      lotIsAssigned: boolean | null;
      lotSupplierLot: string | null;
    };
    const rowsOf = async (query: string) => {
      const page = body<{ entries: Row[]; nextCursor: string | null }>(
        await agent.get(`/v1/stock/by-lot?${query}`).expect(200),
      );
      expect(page.nextCursor).toBeNull();
      return page.entries;
    };
    const named = (rows: Row[]) =>
      rows.map((row) => `${row.lotCode} ${row.locationName}`);
    const countsOf = async (query: string) =>
      body<Record<string, number>>(
        await agent.get(`/v1/stock/by-lot/counts?${query}`).expect(200),
      );

    // A lot at each place, soonest first, those with no day by code.
    expect(named(await rowsOf('detailsToAdd=true'))).toEqual([
      `${toAdd} SHELF`,
      `${later} BACK`,
      `${later} SHELF`,
      'TYPED-1 SHELF',
    ]);
    expect(await countsOf('')).toMatchObject({ detailsToAdd: 4, total: 6 });
    // Its count is the rows it shows with the other filters on, and theirs
    // the rows they show beside it.
    for (const others of [
      '',
      `locationId=${back}`,
      'search=TYPED',
      'expiringWithin=90',
      'needsCost=true',
    ]) {
      const query = [others, 'detailsToAdd=true'].filter(Boolean).join('&');
      expect({ others, count: (await rowsOf(query)).length }).toEqual({
        others,
        count: (await countsOf(others)).detailsToAdd,
      });
    }
    const asked = await countsOf('detailsToAdd=true');
    expect(asked.total).toBe(4);
    for (const [name, filter] of [
      ['expiring', 'expiringWithin=90'],
      ['expired', 'expired=true'],
      ['needsCost', 'needsCost=true'],
    ]) {
      expect({
        name,
        count: (await rowsOf(`detailsToAdd=true&${filter}`)).length,
      }).toEqual({ name, count: asked[name] });
    }

    // Each pile sends its lot's expiry and supplier's lot: the Lot view's,
    // and Stock's opened row.
    const all = await rowsOf('');
    const pile = (code: string, at: string) =>
      all.find((row) => row.lotCode === code && row.locationName === at);
    expect(pile(later, 'BACK')).toMatchObject({
      lotExpiresAt: null,
      lotExpiry: 'unknown',
      lotIsAssigned: true,
      lotSupplierLot: 'Sup-77',
    });
    expect(pile(toAdd, 'SHELF')).toMatchObject({
      lotExpiry: 'none',
      lotIsAssigned: true,
      lotSupplierLot: null,
    });
    expect(pile('TYPED-2', 'SHELF')).toMatchObject({
      lotExpiresAt: SOON,
      lotExpiry: 'date',
      lotIsAssigned: false,
      lotSupplierLot: null,
    });
    const { places } = body<{ places: { lots: Row[] }[] }>(
      await agent.get(`/v1/stock/by-code/${oil}/places`).expect(200),
    );
    expect(
      places
        .flatMap((place) => place.lots)
        .find((row) => row.lotCode === 'TYPED-1'),
    ).toMatchObject({ lotExpiry: 'unknown', lotSupplierLot: null });

    // A movement, the lot's page, and Where it stands without places.
    const movements = body<{ entries: Row[] }>(
      await agent.get(`/v1/stock/movements?variantId=${oil}`).expect(200),
    ).entries;
    expect(movements.find((row) => row.lotCode === 'TYPED-1')).toMatchObject({
      lotExpiry: 'unknown',
      lotIsAssigned: false,
      lotSupplierLot: null,
    });
    expect(movements.find((row) => row.lotCode === later)).toMatchObject({
      lotExpiry: 'unknown',
      lotIsAssigned: true,
      lotSupplierLot: 'Sup-77',
    });
    const traced = body<{ lot: Record<string, unknown> }>(
      await agent.get(`/v1/stock/lots/${lot('Sup-77').id}/trace`).expect(200),
    );
    expect(traced.lot).toMatchObject({
      code: later,
      expiresAt: null,
      expiry: 'unknown',
      isAssigned: true,
      supplierLot: 'Sup-77',
    });
    await customRole(app, alpha.organizationId, 'Counter', ['stock.view']);
    const counter = await addMember(
      app,
      alpha,
      'counter@example.com',
      'Counter',
    );
    const [standing] = body<{
      codes: { lots: Record<string, unknown>[] | null }[];
    }>(
      await counter.get(`/v1/products/${all[0].productId}/stock`).expect(200),
    ).codes;
    expect(standing.lots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lotCode: later,
          expiry: 'unknown',
          isAssigned: true,
          supplierLot: 'Sup-77',
        }),
        expect.objectContaining({
          lotCode: toAdd,
          expiry: 'none',
          isAssigned: true,
          supplierLot: null,
        }),
      ]),
    );

    // Every stock export writes both beside the lot, each marked where it
    // is still to add, in the reader's language.
    const csv = async (path: string, language: string) =>
      (await agent.get(path).set('Accept-Language', language).expect(200)).text
        .replace(/^\uFEFF/, '')
        .trimEnd()
        .split('\r\n')
        .map((line) => line.split(','));
    const cells = (lines: string[][], names: string[]) =>
      lines
        .slice(1)
        .map((line) => names.map((name) => line[lines[0].indexOf(name)]));
    const english = await csv(
      '/v1/stock/by-lot/export?detailsToAdd=true',
      'en',
    );
    const lotAt = english[0].indexOf('Lot');
    expect(english[0].slice(lotAt, lotAt + 3)).toEqual([
      'Lot',
      'Supplier’s lot',
      'Expiry',
    ]);
    expect(
      cells(english, ['Lot', 'Location', 'Supplier’s lot', 'Expiry']),
    ).toEqual([
      [toAdd, 'SHELF', 'Supplier’s lot to add', ''],
      [later, 'BACK', 'Sup-77', 'Expiry to add'],
      [later, 'SHELF', 'Sup-77', 'Expiry to add'],
      ['TYPED-1', 'SHELF', '', 'Expiry to add'],
    ]);
    const finished = cells(await csv('/v1/stock/by-lot/export', 'en'), [
      'Lot',
      'Supplier’s lot',
      'Expiry',
    ]);
    expect(finished).toEqual(
      expect.arrayContaining([
        [lot('SUP-88').code, 'SUP-88', '2099-01-01'],
        ['TYPED-2', '', SOON],
      ]),
    );
    expect(
      cells(await csv('/v1/stock/by-lot/export?detailsToAdd=true', 'zh-Hans'), [
        '批次',
        '供应商批号',
        '有效期至',
      ]),
    ).toEqual([
      [toAdd, '待补供应商批号', ''],
      [later, 'Sup-77', '待补有效期'],
      [later, 'Sup-77', '待补有效期'],
      ['TYPED-1', '', '待补有效期'],
    ]);
    // Movements' export, oldest first, the same three beside each other.
    const moved = await csv(
      `/v1/stock/movements/export?variantId=${oil}`,
      'en',
    );
    const movedLot = moved[0].indexOf('Lot');
    expect(moved[0].slice(movedLot, movedLot + 3)).toEqual([
      'Lot',
      'Supplier’s lot',
      'Expiry',
    ]);
    expect(cells(moved, ['Lot', 'Supplier’s lot', 'Expiry'])).toEqual([
      [toAdd, 'Supplier’s lot to add', ''],
      [later, 'Sup-77', 'Expiry to add'],
      [lot('SUP-88').code, 'SUP-88', '2099-01-01'],
      ['TYPED-1', '', 'Expiry to add'],
      ['TYPED-2', '', SOON],
      [later, 'Sup-77', 'Expiry to add'],
    ]);
  });

  // ADR-094: once a code tracks lots, its stock from before
  // is in a lot, and its emptied pile with no lot is history alone.
  it('leaves out, with Include empty, the emptied pile with no lot of a code that now tracks lots (ADR-094)', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { agent } = alpha;
    const shelf = await site(agent, 'SHELF');
    const back = await site(agent, 'BACK');
    const bottle = await item(agent, 'BOTTLE');
    const countedOut = (fields: Record<string, string>) =>
      agent
        .post('/v1/stock/movements')
        .send({
          variantId: bottle,
          reason: 'adjustment',
          reasonDetail: 'damaged',
          note: 'Broken in the move',
          ...fields,
        })
        .expect(201);
    // Received with no lot and counted away, before tracking started.
    await receive(agent, bottle, shelf, '10');
    await countedOut({ fromLocationId: shelf, quantity: '10' });
    // Its lot tracking started, as Start tracking lots leaves a code.
    await db
      .update(productVariants)
      .set({ tracksLots: true })
      .where(eq(productVariants.id, bottle));
    await receive(agent, bottle, shelf, '4', { code: 'B-1' });
    await receive(agent, bottle, back, '2', { code: 'B-2' });
    const [second] = body<{ id: string; code: string }[]>(
      await agent.get(`/v1/stock/lots?variantId=${bottle}`).expect(200),
    ).filter((one) => one.code === 'B-2');
    await countedOut({ fromLocationId: back, quantity: '2', lotId: second.id });

    const placesOf = async (query: string) =>
      body<{ places: { locationName: string; lots: Pile[] }[] }>(
        await agent
          .get(`/v1/stock/by-code/${bottle}/places${query}`)
          .expect(200),
      ).places.map((place) => [
        place.locationName,
        place.lots.map((one) => [one.lotCode, one.quantity]),
      ]);
    // A lot's emptied pile stays with Include empty; the no-lot one does not.
    expect(await placesOf('?includeEmpty=true')).toEqual([
      ['BACK', [['B-2', '0.0000']]],
      ['SHELF', [['B-1', '4.0000']]],
    ]);
    expect(await placesOf('')).toEqual([['SHELF', [['B-1', '4.0000']]]]);
  });
});
