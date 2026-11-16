import type { INestApplication } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { todayIn } from '../src/common/today';
import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { codeFigures } from '../src/modules/stock/code-figures';
import { body, createE2eApp, registerOrganization } from './utils/fixtures';
import {
  item,
  order,
  partner,
  point,
  receive,
  recipe,
  run,
  site,
} from './utils/reorder-world';
import { resetDatabase } from './utils/reset-db';

type Org = Awaited<ReturnType<typeof registerOrganization>>;

/**
 * A day after the old lot expired and before the others do; the routes
 * read the organization's own today, which falls between them too.
 */
const TODAY = '2026-11-01';

/** A code's figures as the one read gives them, each quantity a string. */
type Figures = {
  variant_id: string;
  on_hand: string;
  usable: string;
  not_usable: string;
  expired: string;
  issued: string;
  unavailable: string;
  held: string;
  free: string;
  still_needed: string;
  short: string;
  coming: string;
  coming_on: string | null;
  position: string;
  expires_first: string | null;
  reorder_point: string | null;
  status: string | null;
};

interface AvailabilityRow {
  variantId: string;
  onHand: string;
  notUsable: string;
  expired: string;
  issued: string;
  unavailable: string;
  held: string;
  free: string;
  backordered: string;
}

interface ReorderRow {
  variantId: string;
  reorderPoint: string;
  usable: string;
  coming: string;
  stillNeeded: string;
  position: string;
  status: string;
}

interface ReorderDetail {
  usable: { usable: string }[];
  expired: string;
  issued: string;
  coming: { quantity: string }[];
  stillNeeded: { quantity: string }[];
}

/**
 * One read for a code's figures (ADR-093, R1 and R20): each figure worked
 * out from the movements a person recorded, each sum holding for every
 * code of an organization, and the screens' routes reading the same
 * figures. Inventory's by-code row (step 9) and Where it stands (step 10)
 * join the routes compared here as they are built.
 */
describe('A code’s figures (e2e)', () => {
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

  /** The figures of the items given, or of every item of the organization. */
  async function figuresOf(
    org: Org,
    variantIds?: string[],
    today = TODAY,
  ): Promise<Figures[]> {
    const variants = variantIds
      ? sql`(select unnest(${sql.param(variantIds)}::uuid[]))`
      : sql`(select v.id from product_variants v
          where v.organization_id = ${org.organizationId}::uuid)`;
    const { rows } = await db.execute<Figures>(sql`
      select
        f.variant_id,
        f.on_hand::numeric(18, 4)::text as on_hand,
        f.usable::numeric(18, 4)::text as usable,
        f.not_usable::numeric(18, 4)::text as not_usable,
        f.expired::numeric(18, 4)::text as expired,
        f.issued::numeric(18, 4)::text as issued,
        f.unavailable::numeric(18, 4)::text as unavailable,
        f.held::numeric(18, 4)::text as held,
        f.free::numeric(18, 4)::text as free,
        f.still_needed::numeric(18, 4)::text as still_needed,
        f.short::numeric(18, 4)::text as short,
        f.coming::numeric(18, 4)::text as coming,
        f.coming_on::text as coming_on,
        f.position::numeric(18, 4)::text as position,
        f.expires_first::text as expires_first,
        f.reorder_point::numeric(18, 4)::text as reorder_point,
        f.status
      from (${codeFigures(org.organizationId, today, variants)}) f
      order by f.variant_id
    `);
    return rows;
  }

  /** Quantities added up in Postgres, never through a JavaScript number. */
  async function sumOf(quantities: string[]): Promise<string> {
    const { rows } = await db.execute<{ total: string }>(sql`
      select coalesce(sum(q), 0)::numeric(18, 4)::text as total
      from unnest(${sql.param(quantities)}::numeric[]) q
    `);
    return rows[0].total;
  }

  /**
   * One code, BOTTLE, in every state a figure tells apart, and FOCUS, a
   * run's output still to come. The movements, in order:
   *
   * - received on the shelf: 40 in L-OLD, expired in 2020, and 500 in
   *   L-NEW; 30 of L-NEW into quarantine, a place not available;
   * - a run of 100 FOCUS released at the kitchen from the shelf, earliest
   *   expiry first: the 40 expired and 60 of L-NEW move to the kitchen,
   *   issued to the run and not yet used;
   * - then 20 in L-SOON on the shelf, expiring 14 March 2027.
   *
   * On hand 590: the shelf's 460, the kitchen's 100 and quarantine's 30.
   * Usable 460, the shelf's; not usable 130: 40 expired, 60 issued (the
   * kitchen's 60 not expired, of the 100 the run still needs) and 30 at a
   * place not available. Two sales confirmed, 400 and then 100: the first
   * holds 400, the second the 60 left, 40 short. Coming 250: two
   * purchases, the sooner expected on 25 November. A reorder point of
   * 600: Left 460 + 250 − 500 = 210, low.
   */
  async function world(org: Org) {
    const { agent } = org;
    const bottle = await item(agent, 'BOTTLE', true);
    const focus = await item(agent, 'FOCUS');
    const shelf = await site(agent, 'SHELF');
    const kitchen = await site(agent, 'KITCHEN');
    const quarantine = await site(agent, 'QUARANTINE', false);

    await receive(agent, bottle, shelf, '40', {
      code: 'L-OLD',
      expiresAt: '2020-01-01',
    });
    await receive(agent, bottle, shelf, '500', {
      code: 'L-NEW',
      expiresAt: '2099-01-01',
    });
    await receive(agent, bottle, quarantine, '30', { code: 'L-NEW' });
    const bomId = await recipe(agent, focus, bottle, '1');
    await run(
      agent,
      { outputId: focus, bomId, locationId: kitchen, quantityPlanned: '100' },
      shelf,
    );
    await receive(agent, bottle, shelf, '20', {
      code: 'L-SOON',
      expiresAt: '2027-03-14',
    });

    const customer = await partner(agent, 'Northside Pharmacy');
    await order(agent, 'sale', customer, bottle, '400');
    await order(agent, 'sale', customer, bottle, '100');
    const supplier = await partner(agent, 'Harbour Supply');
    await order(agent, 'purchase', supplier, bottle, '200', {
      expectedAt: '2026-12-01',
    });
    await order(agent, 'purchase', supplier, bottle, '50', {
      expectedAt: '2026-11-25',
    });
    await point(agent, bottle, '600');

    return { bottle, focus };
  }

  it('works out each figure of a code from the movements recorded, each sum holding', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { bottle, focus } = await world(alpha);

    const [figures] = await figuresOf(alpha, [bottle]);
    expect(figures).toEqual({
      variant_id: bottle,
      on_hand: '590.0000',
      usable: '460.0000',
      not_usable: '130.0000',
      expired: '40.0000',
      issued: '60.0000',
      unavailable: '30.0000',
      held: '460.0000',
      free: '0.0000',
      still_needed: '500.0000',
      short: '40.0000',
      coming: '250.0000',
      coming_on: '2026-11-25',
      position: '210.0000',
      // The usable stock's soonest: not the expired lot, nor a lot at a
      // place not available.
      expires_first: '2027-03-14',
      reorder_point: '600.0000',
      status: 'low',
    });

    // A run's output still to come has no day; an item with no point no
    // status; an item with no lots nothing to expire.
    expect((await figuresOf(alpha, [focus]))[0]).toMatchObject({
      on_hand: '0.0000',
      coming: '100.0000',
      coming_on: null,
      position: '100.0000',
      expires_first: null,
      reorder_point: null,
      status: null,
    });
  });

  it('gives Inventory’s and Reorder’s routes the same figures for one code', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { bottle } = await world(alpha);
    // The routes read the organization's own today.
    const { rows: zones } = await db.execute<{ time_zone: string }>(sql`
      select time_zone from organizations
      where id = ${alpha.organizationId}::uuid
    `);
    const [figures] = await figuresOf(
      alpha,
      [bottle],
      todayIn(zones[0].time_zone),
    );

    // Inventory's figures until its by-code row (step 9): the
    // availability read.
    const productId = body<{ entries: { id: string }[] }>(
      await alpha.agent.get('/v1/products?search=BOTTLE').expect(200),
    ).entries[0].id;
    const [inventory] = body<AvailabilityRow[]>(
      await alpha.agent
        .get(`/v1/stock/availability?productId=${productId}`)
        .expect(200),
    );
    expect(inventory).toMatchObject({
      variantId: bottle,
      onHand: figures.on_hand,
      notUsable: figures.not_usable,
      expired: figures.expired,
      issued: figures.issued,
      unavailable: figures.unavailable,
      held: figures.held,
      free: figures.free,
      backordered: figures.short,
    });

    // Reorder's row, and its opened row's lines adding up to it.
    const reorder = body<{ entries: ReorderRow[] }>(
      await alpha.agent.get('/v1/stock/reorder-points').expect(200),
    ).entries.find((row) => row.variantId === bottle);
    expect(reorder).toMatchObject({
      reorderPoint: figures.reorder_point,
      usable: figures.usable,
      coming: figures.coming,
      stillNeeded: figures.still_needed,
      position: figures.position,
      status: figures.status,
    });

    const opened = body<ReorderDetail>(
      await alpha.agent.get(`/v1/stock/reorder-points/${bottle}`).expect(200),
    );
    expect(await sumOf(opened.usable.map((line) => line.usable))).toBe(
      figures.usable,
    );
    expect(opened.expired).toBe(figures.expired);
    expect(opened.issued).toBe(figures.issued);
    expect(await sumOf(opened.coming.map((line) => line.quantity))).toBe(
      figures.coming,
    );
    expect(await sumOf(opened.stillNeeded.map((line) => line.quantity))).toBe(
      figures.still_needed,
    );
  });

  it('walks every code of an organization: on hand is the ledger’s, and every sum holds', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await world(alpha);
    const { agent } = alpha;
    // Beside the world's two: one never stocked, one in quarantine alone,
    // one wanted with none on hand, and one emptied by a shipment.
    await item(agent, 'NEVER');
    const lonely = await item(agent, 'LONELY');
    const wanted = await item(agent, 'WANTED');
    const emptied = await item(agent, 'EMPTIED');
    const back = await site(agent, 'BACK');
    const hold = await site(agent, 'HOLD', false);
    await receive(agent, lonely, hold, '7');
    await receive(agent, emptied, back, '5');
    await agent
      .post('/v1/stock/movements')
      .send({
        variantId: emptied,
        fromLocationId: back,
        quantity: '5',
        reason: 'shipment',
      })
      .expect(201);
    const customer = await partner(agent, 'Lam Herbal');
    await order(agent, 'sale', customer, wanted, '12');

    // Another organization's stock is never in alpha's figures.
    const beta = await registerOrganization(app, 'beta');
    const theirs = await item(beta.agent, 'BOTTLE');
    await receive(beta.agent, theirs, await site(beta.agent, 'SHELF'), '9');

    const every = await figuresOf(alpha);
    expect(every).toHaveLength(6);
    expect(every.map((row) => row.variant_id)).not.toContain(theirs);

    const { rows: broken } = await db.execute<{ variant_id: string }>(sql`
      with f as (${codeFigures(
        alpha.organizationId,
        TODAY,
        sql`(select v.id from product_variants v
          where v.organization_id = ${alpha.organizationId}::uuid)`,
      )}),
      ledger as (
        select
          m.variant_id,
          sum(case when m.to_location_id is not null then m.quantity else 0 end)
            - sum(case when m.from_location_id is not null then m.quantity else 0 end)
            as on_hand
        from stock_movements m
        where m.organization_id = ${alpha.organizationId}::uuid
        group by m.variant_id
      )
      select f.variant_id
      from f
      left join ledger l on l.variant_id = f.variant_id
      where f.on_hand <> coalesce(l.on_hand, 0)
        or f.on_hand <> f.usable + f.not_usable
        or f.not_usable <> f.expired + f.issued + f.unavailable
        or f.usable < 0 or f.expired < 0 or f.issued < 0 or f.unavailable < 0
        or f.free <> greatest(0, f.usable - f.held)
        or f.held > f.usable
        or f.held > f.still_needed
        or f.short <> f.still_needed - f.held
        or f.position <> f.usable + f.coming - f.still_needed
    `);
    expect(broken).toEqual([]);

    const byId = new Map(every.map((row) => [row.variant_id, row]));
    expect(byId.get(lonely)).toMatchObject({
      on_hand: '7.0000',
      usable: '0.0000',
      unavailable: '7.0000',
    });
    expect(byId.get(wanted)).toMatchObject({
      on_hand: '0.0000',
      held: '0.0000',
      free: '0.0000',
      short: '12.0000',
    });
    expect(byId.get(emptied)).toMatchObject({ on_hand: '0.0000' });
  });
});
