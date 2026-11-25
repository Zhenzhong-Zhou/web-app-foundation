import type { INestApplication } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { Response } from 'supertest';

import { dayIn } from '../src/common/today';
import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { isCheckViolation } from '../src/database/errors';
import {
  auditLog,
  lotFormerCodes,
  lots,
  orderLines,
  productionOrders,
  stockMovements,
} from '../src/database/schema';
import { calendarDay } from '../src/i18n/translate';
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

  // The amendment's R3: migration 0085 dropped 0084's temporary trigger,
  // which mended a day written alone, so the check alone holds a lot's
  // kind to its day, whatever writes the table.
  it('refuses a lot written straight to the table with a day and the kind none, on insert and on update (ADR-094 amended, R3)', async () => {
    const w = await world();
    const refusal = (write: PromiseLike<unknown>) =>
      Promise.resolve(write).then(
        () => null,
        (error: unknown) => error,
      );
    const lot = {
      organizationId: w.org.organizationId,
      variantId: w.variantId,
      code: 'VC-0310',
    };

    const inserted = await refusal(
      db
        .insert(lots)
        .values({ ...lot, expiry: 'none', expiresAt: '2027-01-31' }),
    );
    expect(isCheckViolation(inserted, 'lots_expiry_date_check')).toBe(true);

    // The day set alone, as the release before 0084 wrote it.
    const [none] = await db.insert(lots).values(lot).returning({ id: lots.id });
    const updated = await refusal(
      db
        .update(lots)
        .set({ expiresAt: '2027-01-31' })
        .where(eq(lots.id, none.id)),
    );
    expect(isCheckViolation(updated, 'lots_expiry_date_check')).toBe(true);
    expect(await lotOf(none.id)).toMatchObject({
      expiry: 'none',
      expiresAt: null,
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

  /**
   * A lot's former codes (ADR-094 amended, R8, R11): the code Edit lot
   * details corrects is kept, with when, who and why, and never given to
   * another lot of the item, whichever route types it.
   */
  describe('a lot’s former codes (ADR-094 amended, R8, R11)', () => {
    const WHY = 'The letter O was typed for a zero on the label.';

    /**
     * A lot of the item typed as printed, `from`, then marked made here
     * and corrected to `to`, as row v19's ASH-06O1 is: `from` is its
     * former code.
     */
    async function corrected(
      w: World,
      from: string,
      to: string,
      variantId = w.variantId,
    ): Promise<string> {
      const { movement } = written(
        await w.org.agent
          .post('/v1/stock/movements')
          .send({
            variantId,
            toLocationId: w.shelf,
            quantity: '10',
            reason: 'receipt',
            lot: { code: from },
          })
          .expect(201),
      );
      await w.org.agent
        .patch(`/v1/stock/lots/${movement.lotId}`)
        .send({ madeHere: true, code: to, reason: WHY })
        .expect(204);
      return movement.lotId!;
    }

    /** A lot's former codes as kept, newest first. */
    function formerCodesOf(lotId: string) {
      return db
        .select({
          code: lotFormerCodes.code,
          changedAt: lotFormerCodes.changedAt,
          changedBy: lotFormerCodes.changedBy,
          reason: lotFormerCodes.reason,
        })
        .from(lotFormerCodes)
        .where(eq(lotFormerCodes.lotId, lotId))
        .orderBy(desc(lotFormerCodes.changedAt), desc(lotFormerCodes.id));
    }

    /**
     * The refusal of `code`, another lot's former code, as the server says
     * it: naming that lot and until when, the organization's day (UTC
     * until it says otherwise), with the lot for Use {code}.
     */
    async function refusalOf(lotId: string, code: string) {
      const [lot] = await db
        .select({ code: lots.code })
        .from(lots)
        .where(eq(lots.id, lotId));
      const kept = (await formerCodesOf(lotId)).find(
        (row) => row.code === code,
      )!;
      return {
        message: said('en', 'stock.lotCodeFormer', {
          code,
          lot: lot.code,
          day: calendarDay(dayIn('UTC', kept.changedAt)),
        }),
        code: 'lot_code_former',
        details: { lotId, lotCode: lot.code },
      };
    }

    it('keeps each code a lot is corrected from, with when, who and why, the why never in the Activity log (R8)', async () => {
      const w = await world();
      const before = new Date();
      const lotId = await corrected(w, 'ASH-06O1', 'ASH-0601');
      await w.org.agent
        .patch(`/v1/stock/lots/${lotId}`)
        .send({
          code: 'ASH-0601-B',
          reason: '  Relabelled after the recount.  ',
        })
        .expect(204);

      const kept = await formerCodesOf(lotId);
      expect(kept).toEqual([
        {
          code: 'ASH-0601',
          changedAt: expect.any(Date) as Date,
          changedBy: w.org.userId,
          reason: 'Relabelled after the recount.',
        },
        {
          code: 'ASH-06O1',
          changedAt: expect.any(Date) as Date,
          changedBy: w.org.userId,
          reason: WHY,
        },
      ]);
      expect(kept[1].changedAt.getTime()).toBeGreaterThanOrEqual(
        before.getTime() - 1_000,
      );
      expect((await lotOf(lotId)).code).toBe('ASH-0601-B');

      // Free text stays out of a payload kept two years (ADR-018); the
      // codes are there, the old and the new (#687).
      const payloads = await db
        .select({ payload: auditLog.payload })
        .from(auditLog)
        .where(eq(auditLog.resourceId, lotId));
      const logged = JSON.stringify(payloads);
      expect(logged).toContain('ASH-06O1');
      expect(logged).not.toContain('zero on the label');
      expect(logged).not.toContain('recount');
    });

    // The receive dialogs' lots carry each lot's former codes, the codes
    // alone, so the lot field refuses one as it is typed (R11, F2).
    it('lists each lot of an item with its former codes, newest first, the codes alone (R9, F2)', async () => {
      const w = await world();
      const lotId = await corrected(w, 'ASH-06O1', 'ASH-0601');
      await w.org.agent
        .patch(`/v1/stock/lots/${lotId}`)
        .send({ code: 'ASH-0601-B', reason: 'Relabelled after the recount.' })
        .expect(204);
      await ROUTES['Receive stock'](w, { lot: { code: 'ASH-0700' } }).expect(
        201,
      );

      const listed = body<{ code: string; formerCodes: string[] }[]>(
        await w.org.agent
          .get(`/v1/stock/lots?variantId=${w.variantId}`)
          .expect(200),
      );
      expect(
        listed.map(({ code, formerCodes }) => [code, formerCodes]),
      ).toEqual(
        expect.arrayContaining([
          ['ASH-0601-B', ['ASH-0601', 'ASH-06O1']],
          ['ASH-0700', []],
        ]),
      );
    });

    it('refuses a changed code with no why, saying so, and changes nothing; a save that keeps the code asks none (R8, E2a)', async () => {
      const w = await world();
      const { movement } = written(
        await ROUTES['Receive stock'](w, {
          lot: { makeCode: true, expiry: 'none' },
        }).expect(201),
      );
      const lotId = movement.lotId!;
      const made = (await lotOf(lotId)).code;

      for (const why of [{}, { reason: '' }, { reason: '   ' }]) {
        const refused = await w.org.agent
          .patch(`/v1/stock/lots/${lotId}`)
          .send({ code: 'VC-0310', ...why })
          .expect(400);
        expect(body<{ message: string }>(refused).message).toBe(
          said('en', 'stock.lotCodeWhy'),
        );
      }
      expect((await lotOf(lotId)).code).toBe(made);

      // The code sent as it is, as the dialog sends it: no why asked, and
      // one given is not kept.
      await w.org.agent
        .patch(`/v1/stock/lots/${lotId}`)
        .send({ code: made, expiry: 'unknown', reason: 'Not a change' })
        .expect(204);
      expect((await lotOf(lotId)).expiry).toBe('unknown');
      expect(await formerCodesOf(lotId)).toEqual([]);
    });

    it('lets a lot take its own former code back, and refuses the code it leaves to any other lot (R11)', async () => {
      const w = await world();
      const lotId = await corrected(w, 'ASH-06O1', 'ASH-0601');

      await w.org.agent
        .patch(`/v1/stock/lots/${lotId}`)
        .send({ code: 'ASH-06O1', reason: 'Corrected the wrong way round.' })
        .expect(204);
      expect((await lotOf(lotId)).code).toBe('ASH-06O1');
      expect((await formerCodesOf(lotId)).map((row) => row.code)).toEqual([
        'ASH-0601',
        'ASH-06O1',
      ]);

      // Its code again: a receipt typed so adds to it, as to any lot's.
      const again = written(
        await ROUTES['Receive stock'](w, {
          lot: { code: 'ASH-06O1' },
        }).expect(201),
      );
      expect(again.movement.lotId).toBe(lotId);

      // The code it left now is a former code like any other.
      const refused = await ROUTES['Receive stock'](w, {
        lot: { code: 'ASH-0601' },
      }).expect(409);
      expect(body(refused)).toMatchObject(await refusalOf(lotId, 'ASH-0601'));
    });

    it('refuses another lot’s former code in Edit lot details, naming that lot, and changes nothing; another item takes the code (R11)', async () => {
      const w = await world();
      const had = await corrected(w, 'ASH-06O1', 'ASH-0601');
      const { movement } = written(
        await ROUTES['Receive stock'](w, {
          lot: { makeCode: true, expiry: 'none' },
        }).expect(201),
      );
      const other = movement.lotId!;
      const made = (await lotOf(other)).code;

      const refused = await w.org.agent
        .patch(`/v1/stock/lots/${other}`)
        .send({ code: 'ash-06o1', reason: 'Typed from the old label.' })
        .expect(409);
      expect(body(refused)).toMatchObject(await refusalOf(had, 'ASH-06O1'));
      expect((await lotOf(other)).code).toBe(made);
      expect(await formerCodesOf(other)).toEqual([]);

      // A code is unique within an item (ADR-023): another item's lot may
      // carry it, typed or corrected to it.
      const zinc = await createVariant(w.org.agent, {
        type: 'material',
        name: 'Zinc',
        variant: { sku: 'ZINC', tracksLots: true },
      });
      await corrected(w, 'ZN-1', 'ASH-06O1', zinc);
      await w.org.agent
        .post('/v1/stock/movements')
        .send({
          variantId: zinc,
          toLocationId: w.shelf,
          quantity: '1',
          reason: 'receipt',
          lot: { code: 'ASH-0601' },
        })
        .expect(201);
    });

    describe.each(ROUTE_NAMES)('%s', (route) => {
      const send = ROUTES[route];

      it('refuses another lot’s former code for a new lot or to add to, naming that lot, and writes nothing (R11)', async () => {
        const w = await world();
        const had = await corrected(w, 'ASH-06O1', 'ASH-0601');
        const refusal = await refusalOf(had, 'ASH-06O1');

        // Typed to add to a lot of that code, and typed as a lot that must
        // be new, as Count it in's A new lot sends it.
        for (const mustBeNew of [false, true]) {
          const refused = await send(w, {
            lot: { code: 'ash-06o1', mustBeNew },
          }).expect(409);
          expect(body(refused)).toMatchObject(refusal);
        }

        expect(await db.select().from(lots)).toHaveLength(1);
        expect(await db.select().from(stockMovements)).toHaveLength(1);
        const [line] = await db.select().from(orderLines);
        expect(line.quantityFulfilled).toBe('0.0000');
      });
    });

    // F7, answered 8a: a run's output takes a typed code too, and is
    // refused as the others are, its dialog with no Use button.
    it('refuses another lot’s former code for a run’s Record output, naming that lot, and records nothing (R11)', async () => {
      const w = await world();
      const focus = await createVariant(w.org.agent, {
        type: 'good',
        name: 'Focus',
        variant: { sku: 'FOCUS', tracksLots: true },
      });
      const bottle = await createVariant(w.org.agent, {
        type: 'material',
        name: 'Bottle',
        variant: { sku: 'BOTTLE' },
      });
      await w.org.agent
        .post('/v1/stock/movements')
        .send({
          variantId: bottle,
          toLocationId: w.shelf,
          quantity: '100',
          reason: 'receipt',
        })
        .expect(201);
      const { bom } = body<{ bom: { id: string } }>(
        await w.org.agent
          .post('/v1/boms')
          .send({
            outputVariantId: focus,
            outputQuantity: '10',
            lines: [{ componentVariantId: bottle, quantity: '1' }],
          })
          .expect(201),
      );
      await w.org.agent.post(`/v1/boms/${bom.id}/promote`).expect(204);
      const { productionOrder: run } = body<{
        productionOrder: { id: string };
      }>(
        await w.org.agent
          .post('/v1/production-orders')
          .send({
            outputVariantId: focus,
            bomId: bom.id,
            locationId: w.shelf,
            quantityPlanned: '10',
          })
          .expect(201),
      );
      await w.org.agent
        .post(`/v1/production-orders/${run.id}/release`)
        .send({ sourceLocationId: w.shelf })
        .expect(200);
      const had = await corrected(w, 'FOC-1O', 'FOC-10', focus);
      const lotsBefore = (await db.select().from(lots)).length;

      const refused = await w.org.agent
        .post(`/v1/production-orders/${run.id}/output`)
        .send({ quantity: '10', lot: { code: 'FOC-1O' } })
        .expect(409);
      expect(body(refused)).toMatchObject(await refusalOf(had, 'FOC-1O'));

      expect(await db.select().from(lots)).toHaveLength(lotsBefore);
      const [made] = await db
        .select({ produced: productionOrders.quantityProduced })
        .from(productionOrders)
        .where(
          and(
            eq(productionOrders.id, run.id),
            eq(productionOrders.organizationId, w.org.organizationId),
          ),
        );
      expect(made.produced).toBe('0.0000');
    });
  });
});
