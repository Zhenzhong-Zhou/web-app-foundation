import type { INestApplication } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { body, createE2eApp, registerOrganization } from './utils/fixtures';
import { resetDatabase } from './utils/reset-db';

interface Lot {
  id: string;
  code: string;
  expiresAt: string | null;
}

interface Licence {
  id: string;
  issuedAt: string | null;
  expiresAt: string | null;
}

/**
 * Calendar days are `date` columns, sent and returned as YYYY-MM-DD
 * (ADR-052). Every route that writes one returns it exactly as it was sent,
 * through Drizzle and through the raw reads alike, whatever time zone the
 * server or the browser is in.
 *
 * How strictly a day is read is a deployment setting, CALENDAR_DAY_INPUT.
 * IsCalendarDay() reads it per request, so these tests switch it without
 * rebuilding the app; calendar-day.spec.ts covers the decorator on its own.
 */
describe('Calendar days (e2e)', () => {
  let app: INestApplication;
  let db: Database;
  const original = process.env.CALENDAR_DAY_INPUT;

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

  afterEach(() => {
    if (original === undefined) delete process.env.CALENDAR_DAY_INPUT;
    else process.env.CALENDAR_DAY_INPUT = original;
  });

  async function setup() {
    const org = await registerOrganization(app, 'alpha');

    const partnerId = body<{ partner: { id: string } }>(
      await org.agent
        .post('/v1/partners')
        .send({ name: 'Acme Supplies', code: 'ACME-01' })
        .expect(201),
    ).partner.id;

    const variantId = body<{ product: { variants: { id: string }[] } }>(
      await org.agent
        .post('/v1/products')
        .send({
          type: 'good',
          name: 'Widget',
          variant: { sku: 'WIDGET-1', tracksLots: true },
        })
        .expect(201),
    ).product.variants[0].id;

    const locationId = body<{ location: { id: string } }>(
      await org.agent
        .post('/v1/locations')
        .send({ type: 'site', name: 'Main' })
        .expect(201),
    ).location.id;

    return { ...org, partnerId, variantId, locationId };
  }

  type Ctx = Awaited<ReturnType<typeof setup>>;

  function receive(ctx: Ctx, expiresAt: string) {
    return ctx.agent.post('/v1/stock/movements').send({
      variantId: ctx.variantId,
      toLocationId: ctx.locationId,
      quantity: '10',
      reason: 'receipt',
      lot: { code: 'BF-2609', expiresAt },
    });
  }

  async function lotsOf(ctx: Ctx) {
    return body<Lot[]>(
      await ctx.agent
        .get(`/v1/stock/lots?variantId=${ctx.variantId}`)
        .expect(200),
    );
  }

  function messages(res: { body: unknown }): string[] {
    const { message } = res.body as { message: string | string[] };
    return Array.isArray(message) ? message : [message];
  }

  describe('a day round-trips exactly', () => {
    it("on a lot's expiry, through Drizzle and the raw reads", async () => {
      const ctx = await setup();

      await receive(ctx, '2026-10-10').expect(201);

      const [lot] = await lotsOf(ctx);
      expect(lot.expiresAt).toBe('2026-10-10');

      // Raw SQL, not Drizzle's column mapping: lot search and the trace
      // header must return the same text.
      const found = body<Lot[]>(
        await ctx.agent.get('/v1/stock/lots/search?code=BF').expect(200),
      );
      expect(found[0].expiresAt).toBe('2026-10-10');

      const trace = body<{ lot: Lot }>(
        await ctx.agent.get(`/v1/stock/lots/${lot.id}/trace`).expect(200),
      );
      expect(trace.lot.expiresAt).toBe('2026-10-10');

      await ctx.agent
        .patch(`/v1/stock/lots/${lot.id}`)
        .send({ expiresAt: '2027-06-30' })
        .expect(204);

      expect((await lotsOf(ctx))[0].expiresAt).toBe('2027-06-30');
    });

    it("on an order's expected date, created and edited", async () => {
      const ctx = await setup();

      const order = body<{ order: { id: string; expectedAt: string | null } }>(
        await ctx.agent
          .post('/v1/orders')
          .send({
            partnerId: ctx.partnerId,
            direction: 'purchase',
            expectedAt: '2026-10-10',
            lines: [{ variantId: ctx.variantId, quantityOrdered: '40' }],
          })
          .expect(201),
      ).order;

      expect(order.expectedAt).toBe('2026-10-10');

      await ctx.agent
        .patch(`/v1/orders/${order.id}`)
        .send({ expectedAt: '2026-12-31' })
        .expect(204);

      const detail = body<{ expectedAt: string | null }>(
        await ctx.agent.get(`/v1/orders/${order.id}`).expect(200),
      );
      expect(detail.expectedAt).toBe('2026-12-31');
    });

    it("on a licence's dates, set and cleared", async () => {
      const ctx = await setup();

      const licence = body<{ licence: Licence }>(
        await ctx.agent
          .post('/v1/product-licences')
          .send({
            number: 'EXP-2026-0412',
            authority: 'CFIA export certificate',
            issuedAt: '2026-01-01',
            expiresAt: '2026-12-31',
          })
          .expect(201),
      ).licence;

      expect(licence).toMatchObject({
        issuedAt: '2026-01-01',
        expiresAt: '2026-12-31',
      });

      await ctx.agent
        .patch(`/v1/product-licences/${licence.id}`)
        .send({ expiresAt: null })
        .expect(204);

      const [stored] = body<Licence[]>(
        await ctx.agent.get('/v1/product-licences').expect(200),
      );
      expect(stored).toMatchObject({ issuedAt: '2026-01-01', expiresAt: null });
    });
  });

  describe('under strict, the default', () => {
    it('refuses an instant, even at UTC midnight', async () => {
      delete process.env.CALENDAR_DAY_INPUT;
      const ctx = await setup();

      const res = await receive(ctx, '2026-10-10T00:00:00.000Z').expect(400);

      expect(messages(res)).toContain(
        'lot.expiresAt must be a calendar day, YYYY-MM-DD',
      );
    });

    it('refuses a day that does not exist', async () => {
      process.env.CALENDAR_DAY_INPUT = 'strict';
      const ctx = await setup();

      await ctx.agent
        .post('/v1/product-licences')
        .send({
          number: '80012345',
          authority: 'Health Canada',
          issuedAt: '2026-02-30',
        })
        .expect(400);
    });
  });

  describe('under lenient', () => {
    beforeEach(() => {
      process.env.CALENDAR_DAY_INPUT = 'lenient';
    });

    it('stores an instant at UTC midnight as its day', async () => {
      const ctx = await setup();

      await receive(ctx, '2026-10-10T00:00:00.000Z').expect(201);

      expect((await lotsOf(ctx))[0].expiresAt).toBe('2026-10-10');
    });

    // 07:00Z is midnight in Vancouver. Which day that is depends on a time
    // zone, so it is refused here too rather than guessed.
    it('still refuses any other instant', async () => {
      const ctx = await setup();

      await receive(ctx, '2026-10-10T07:00:00.000Z').expect(400);
    });
  });

  /**
   * Every calendar day in the schema, against its column type. A day stored
   * as timestamptz needs the UTC-midnight convention ADR-052 retired, and
   * nothing else would notice one coming back: it passes every test that
   * runs in UTC. Add a column here when one is added to the schema.
   */
  it('stores every calendar day as date', async () => {
    const days = [
      ['credit_notes', 'credit_date'],
      ['exchange_rates', 'rate_date'],
      ['invoices', 'due_date'],
      ['invoices', 'invoice_date'],
      ['lots', 'expires_at'],
      ['orders', 'expected_at'],
      ['product_licences', 'expires_at'],
      ['product_licences', 'issued_at'],
    ];

    const result = await db.execute(sql`
      select table_name, column_name, data_type
      from information_schema.columns
      where table_schema = 'public'
        and (table_name, column_name) in (${sql.join(
          days.map(([table, column]) => sql`(${table}, ${column})`),
          sql`, `,
        )})
      order by table_name, column_name
    `);

    expect(result.rows).toEqual(
      days.map(([table, column]) => ({
        table_name: table,
        column_name: column,
        data_type: 'date',
      })),
    );
  });
});
