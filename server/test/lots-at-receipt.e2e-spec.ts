import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Response } from 'supertest';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { lots, orderLines, stockMovements } from '../src/database/schema';
import {
  body,
  createE2eApp,
  createLocation,
  createPartner,
  createVariant,
  registerOrganization,
} from './utils/fixtures';
import { resetDatabase } from './utils/reset-db';
import { said } from './utils/said';
import { clearOfMidnight } from './utils/time-zones';

type Org = Awaited<ReturnType<typeof registerOrganization>>;

/** A tracked item, a shelf, a supplier, and a purchase still to receive. */
interface World {
  org: Org;
  variantId: string;
  shelf: string;
  supplier: string;
  order: { id: string; lineId: string };
}

/** What every write here answers: the movement, its lot's code, whether it waits. */
interface Written {
  movement: { id: string; lotId: string | null };
  lotCode: string | null;
  needsCost: boolean;
}

/**
 * The three places a new lot is made with stock arriving (ADR-094, R3):
 * Receive stock, an order's Receive and Count it in…, each sent as its
 * dialog sends it, with `extra` in its body.
 */
const ROUTES = {
  'Receive stock': (w: World, extra: Record<string, unknown>) =>
    w.org.agent.post('/v1/stock/movements').send({
      variantId: w.variantId,
      toLocationId: w.shelf,
      quantity: '10',
      reason: 'receipt',
      ...extra,
    }),
  'an order’s Receive': (w: World, extra: Record<string, unknown>) =>
    w.org.agent
      .post(`/v1/orders/${w.order.id}/lines/${w.order.lineId}/receipts`)
      .send({ toLocationId: w.shelf, quantity: '10', ...extra }),
  'Count it in…': (w: World, extra: Record<string, unknown>) =>
    w.org.agent.post('/v1/stock/movements').send({
      variantId: w.variantId,
      toLocationId: w.shelf,
      quantity: '10',
      reason: 'adjustment',
      reasonDetail: 'found',
      note: 'A box found behind the cartons at the count',
      ...extra,
    }),
} as const;

type RouteName = keyof typeof ROUTES;

const ROUTE_NAMES = Object.keys(ROUTES) as RouteName[];

/**
 * A new lot at receipt (ADR-094): a code typed as printed or made for us
 * by the lot series when the write is saved, the supplier's lot beside a
 * made one, an expiry of three kinds, a receipt with no order saying why
 * and from whom, and a tab opened before a code's lot tracking started
 * told to reload.
 */
describe('A new lot at receipt (e2e)', () => {
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

  async function world(slugish = 'alpha'): Promise<World> {
    const org = await registerOrganization(app, slugish);
    const variantId = await createVariant(org.agent, {
      type: 'material',
      name: 'Vitamin C',
      variant: { sku: 'VITC', tracksLots: true },
    });
    const shelf = await createLocation(org.agent, {
      type: 'site',
      name: 'Shelf',
    });
    const supplier = await createPartner(org.agent, {
      name: 'Cascade Botanicals',
      code: 'CASC',
    });
    const { order } = body<{
      order: { id: string; lines: { id: string }[] };
    }>(
      await org.agent
        .post('/v1/orders')
        .send({
          partnerId: supplier,
          direction: 'purchase',
          lines: [{ variantId, quantityOrdered: '100' }],
        })
        .expect(201),
    );
    await org.agent
      .patch(`/v1/orders/${order.id}`)
      .send({ status: 'confirmed' })
      .expect(204);
    return {
      org,
      variantId,
      shelf,
      supplier,
      order: { id: order.id, lineId: order.lines[0].id },
    };
  }

  /** The organization's today, its lot series' day (ADR-072). */
  async function today(org: Org): Promise<string> {
    // The organization's zone is UTC until it says otherwise; a midnight
    // between this read and the write would give the next day's code.
    await clearOfMidnight(['UTC'], 5_000);
    return body<{ numbering: { today: string } }>(
      await org.agent.get('/v1/organization/numbering').expect(200),
    ).numbering.today;
  }

  function written(response: Response): Written {
    return body<Written>(response);
  }

  async function lotOf(id: string | null) {
    const [row] = await db
      .select()
      .from(lots)
      .where(eq(lots.id, id ?? ''));
    return row;
  }

  /** A refusal's message and code, and that nothing was written. */
  async function expectNothingWritten() {
    expect(await db.select().from(lots)).toEqual([]);
    expect(await db.select().from(stockMovements)).toEqual([]);
    const [line] = await db.select().from(orderLines);
    expect(line.quantityFulfilled).toBe('0.0000');
  }

  describe.each(ROUTE_NAMES)('%s', (route) => {
    const send = ROUTES[route];

    it('makes a code for us when saved, stored as made here with the supplier’s lot as printed, one after another', async () => {
      const w = await world();
      const day = await today(w.org);

      const first = written(
        await send(w, {
          lot: { makeCode: true, supplierLot: ' sup-24/a ', expiry: 'unknown' },
        }).expect(201),
      );
      const second = written(
        await send(w, { lot: { makeCode: true, expiry: 'none' } }).expect(201),
      );

      // The code the message names, which the receiver writes on the
      // delivery (R3), and whether it waits: nothing here gave a cost.
      expect(first).toMatchObject({
        lotCode: `L-${day}-1`,
        needsCost: true,
      });
      expect(second.lotCode).toBe(`L-${day}-2`);
      expect(await lotOf(first.movement.lotId)).toMatchObject({
        code: `L-${day}-1`,
        isAssigned: true,
        supplierLot: 'sup-24/a',
        expiry: 'unknown',
        expiresAt: null,
      });
      expect(await lotOf(second.movement.lotId)).toMatchObject({
        code: `L-${day}-2`,
        isAssigned: true,
        supplierLot: null,
        expiry: 'none',
      });
    });

    it('stores a typed code as printed, never as made here', async () => {
      const w = await world();

      const typed = written(
        await send(w, {
          lot: { code: 'vc-0310', expiry: 'date', expiresAt: '2027-06-30' },
        }).expect(201),
      );

      expect(typed.lotCode).toBe('VC-0310');
      expect(await lotOf(typed.movement.lotId)).toMatchObject({
        code: 'VC-0310',
        isAssigned: false,
        supplierLot: null,
        expiry: 'date',
        expiresAt: '2027-06-30',
      });
    });

    it('stores each of the three expiries, and a day alone or none as a tab opened before sends them', async () => {
      const w = await world();
      const expiries: [Record<string, unknown>, string, string | null][] = [
        [
          { makeCode: true, expiry: 'date', expiresAt: '2027-01-31' },
          'date',
          '2027-01-31',
        ],
        [{ makeCode: true, expiry: 'unknown' }, 'unknown', null],
        [{ makeCode: true, expiry: 'none' }, 'none', null],
        [{ code: 'OLD-TAB-1', expiresAt: '2027-02-28' }, 'date', '2027-02-28'],
        [{ code: 'OLD-TAB-2' }, 'none', null],
      ];

      for (const [lot, expiry, expiresAt] of expiries) {
        const { movement } = written(await send(w, { lot }).expect(201));
        expect(await lotOf(movement.lotId)).toMatchObject({
          expiry,
          expiresAt,
        });
      }
    });

    it('refuses a new lot it cannot read, saying what to do, and writes nothing', async () => {
      const w = await world();
      const refusals: [Record<string, unknown>, Parameters<typeof said>[1]][] =
        [
          [{}, 'stock.lotNumberMissing'],
          [{ code: 'VC-0310', makeCode: true }, 'stock.lotTypedOrMade'],
          [
            { code: 'VC-0310', supplierLot: 'SUP-24A' },
            'stock.supplierLotForMadeCode',
          ],
          [{ makeCode: true, expiry: 'date' }, 'stock.lotExpiryNeedsDay'],
          [
            { makeCode: true, expiry: 'unknown', expiresAt: '2027-01-31' },
            'stock.lotExpiryTakesNoDay',
          ],
          [
            { code: 'VC-0310', expiry: 'none', expiresAt: '2027-01-31' },
            'stock.lotExpiryTakesNoDay',
          ],
        ];

      for (const [lot, id] of refusals) {
        const refused = await send(w, { lot }).expect(400);
        expect(body<{ message: string }>(refused).message).toBe(said('en', id));
      }
      await expectNothingWritten();
    });

    // A tab opened before the code's lot tracking started sends no lot
    // (ADR-094, R13), and is told why and what to do (#574).
    it('says lot tracking has started, to reload, where a write sends no lot', async () => {
      const w = await world();

      const refused = await send(w, {}).expect(400);

      expect(body<{ message: string }>(refused).message).toBe(
        said('en', 'stock.lotTrackingStarted', { sku: 'VITC' }),
      );
      await expectNothingWritten();
    });
  });

  // R3: the counter's row lock lasts until each write commits.
  it('makes two codes at once without sharing one', async () => {
    const w = await world();
    const day = await today(w.org);

    const both = await Promise.all(
      [1, 2].map(() =>
        ROUTES['Receive stock'](w, { lot: { makeCode: true } }).expect(201),
      ),
    );

    expect(
      both.map((response) => body<Written>(response).lotCode).sort(),
    ).toEqual([`L-${day}-1`, `L-${day}-2`]);
    expect(await db.select().from(lots)).toHaveLength(2);
  });

  // #649's 46: Count it in says its lot must be new, and a receipt that
  // says so is held to it too; the movement's reason decides nothing.
  it('tells a new lot by what the write says, never by the movement’s reason', async () => {
    const w = await world();
    const { movement } = written(
      await ROUTES['Receive stock'](w, { lot: { code: 'VC-0305' } }).expect(
        201,
      ),
    );
    const inUse = said('en', 'stock.lotCodeInUse', {
      sku: 'VITC',
      lot: 'VC-0305',
    });

    for (const route of ['Receive stock', 'Count it in…'] as const) {
      const refused = await ROUTES[route](w, {
        lot: { code: 'vc-0305', mustBeNew: true },
      }).expect(409);
      expect(body<{ message: string; code: string }>(refused)).toMatchObject({
        message: inUse,
        code: 'lot_code_in_use',
      });
    }

    const counted = written(
      await ROUTES['Count it in…'](w, { lot: { code: 'vc-0305' } }).expect(201),
    );
    expect(counted.movement.lotId).toBe(movement.lotId);
    expect(await db.select().from(lots)).toHaveLength(1);
  });

  /** Movements' export, as a header and its rows. */
  async function exported(org: Org) {
    const text = (await org.agent.get('/v1/stock/movements/export').expect(200))
      .text;
    const [header, ...rows] = text
      .replace(/^\uFEFF/, '')
      .trimEnd()
      .split('\r\n')
      .map((line) => line.split(','));
    return (name: string) => rows.map((row) => row[header.indexOf(name)]);
  }

  describe('a receipt with no order (R11)', () => {
    // Each with the From end its export writes where no partner is
    // named, as Movements' From → to reads it (ADR-094, D3).
    const REASONS: [string, Record<string, unknown>, string, string][] = [
      [
        'opening stock',
        { reasonDetail: 'opening' },
        'stock.detail.opening',
        'stock.end.opening',
      ],
      [
        'returned',
        { reasonDetail: 'returned' },
        'stock.detail.returned',
        'stock.end.customer',
      ],
      [
        'a sample',
        { reasonDetail: 'sample' },
        'stock.detail.sample',
        'stock.end.supplier',
      ],
      [
        'other',
        { reasonDetail: 'other' },
        'stock.detail.other',
        'stock.end.other',
      ],
      [
        'other with a note',
        { reasonDetail: 'other', note: 'Left by the previous tenant' },
        'stock.detail.other',
        'stock.end.other',
      ],
    ];

    it.each(REASONS)(
      'records why as %s, on the movement and in its export, its From end by why',
      async (_why, why, words, end) => {
        const w = await world();

        const { movement } = written(
          await ROUTES['Receive stock'](w, {
            lot: { makeCode: true },
            ...why,
          }).expect(201),
        );

        const [row] = await db
          .select()
          .from(stockMovements)
          .where(eq(stockMovements.id, movement.id));
        expect(row).toMatchObject({
          reason: 'receipt',
          reasonDetail: why.reasonDetail,
          note: why.note ?? null,
        });
        const column = await exported(w.org);
        expect(column('Reason')).toEqual([
          said('en', 'stock.reasonDetail', {
            reason: said('en', 'stock.reason.receipt'),
            detail: said('en', words as Parameters<typeof said>[1]),
          }),
        ]);
        expect(column('Note')).toEqual([why.note ?? '']);
        expect(column('From')).toEqual([
          said('en', end as Parameters<typeof said>[1]),
        ]);
      },
    );

    it('refuses a why that is not one of them, saying the four, and writes nothing', async () => {
      const w = await world();

      const refused = await ROUTES['Receive stock'](w, {
        lot: { makeCode: true },
        reasonDetail: 'found',
      }).expect(400);

      expect(body<{ message: string }>(refused).message).toBe(
        said('en', 'stock.receiptWhyUnknown'),
      );
      await expectNothingWritten();
    });

    // E2: kept as a sample's recipient is, so a lot traces to its
    // supplier with or without an order; another organization's partner
    // is unknown, a 400 (#314).
    it('names who it came from, a partner of this organization alone, on the movement and as its export’s From, For staying the document’s (D3)', async () => {
      const w = await world();
      const beta = await world('beta');

      const { movement } = written(
        await ROUTES['Receive stock'](w, {
          lot: { makeCode: true },
          reasonDetail: 'returned',
          recipientPartnerId: w.supplier,
        }).expect(201),
      );

      const [row] = await db
        .select()
        .from(stockMovements)
        .where(eq(stockMovements.id, movement.id));
      expect(row).toMatchObject({
        referenceType: 'partner',
        referenceId: w.supplier,
      });
      const listed = body<{
        entries: { recipient: { id: string; name: string } | null }[];
      }>(await w.org.agent.get('/v1/stock/movements').expect(200));
      expect(listed.entries.map((entry) => entry.recipient)).toEqual([
        { id: w.supplier, name: 'Cascade Botanicals' },
      ]);
      const column = await exported(w.org);
      expect(column('From')).toEqual(['Cascade Botanicals']);
      expect(column('For')).toEqual(['']);

      const elsewhere = await ROUTES['Receive stock'](w, {
        lot: { makeCode: true },
        recipientPartnerId: beta.supplier,
      }).expect(400);
      expect(body<{ message: string }>(elsewhere).message).toBe(
        said('en', 'stock.unknownPartner'),
      );

      // A count names no partner, and nor does a receipt on an order,
      // whose order says who sent it.
      const counted = await ROUTES['Count it in…'](w, {
        lot: { makeCode: true },
        recipientPartnerId: w.supplier,
      }).expect(400);
      expect(body<{ message: string }>(counted).message).toBe(
        said('en', 'stock.partnerSampleOrReceipt'),
      );
      await ROUTES['an order’s Receive'](w, {
        lot: { makeCode: true },
        recipientPartnerId: w.supplier,
      }).expect(400);

      expect(
        await db
          .select()
          .from(stockMovements)
          .where(eq(stockMovements.organizationId, w.org.organizationId)),
      ).toHaveLength(1);
    });
  });
});
