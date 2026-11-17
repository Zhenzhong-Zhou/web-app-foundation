import type { INestApplication } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { todayIn } from '../src/common/today';
import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { holdsSql } from '../src/modules/stock/availability';
import { codeFigures } from '../src/modules/stock/code-figures';
import {
  addMember,
  body,
  createE2eApp,
  customRole,
  registerOrganization,
} from './utils/fixtures';
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

interface ReorderRow {
  variantId: string;
  reorderPoint: string;
  usable: string;
  coming: string;
  stillNeeded: string;
  position: string;
  status: string;
  source: string;
  suggestion: string;
}

interface Pile {
  lotCode: string | null;
  quantity: string;
}

interface Place {
  locationName: string | null;
  lots: Pile[];
}

/** A code of Where it stands, as GET /v1/products/:id/stock sends it. */
interface Standing {
  variantId: string;
  sku: string;
  onHand: string;
  usable: string;
  notUsable: string;
  expired: string;
  issued: string;
  unavailable: string;
  held: string;
  free: string;
  stillNeeded: string;
  short: string;
  coming: string;
  comingOn: string | null;
  position: string;
  expiresFirst: string | null;
  reorderPoint: string | null;
  status: string | null;
  source: string | null;
  suggestion: string | null;
  heldOrders: number;
  holds:
    | {
        number: string;
        partnerName: string;
        wanted: string;
        held: string;
        short: string;
      }[]
    | null;
  purchases:
    { number: string; quantity: string; expectedAt: string | null }[] | null;
  runs: { reference: string | null; quantity: string }[] | null;
  places: Place[] | null;
  lots:
    | {
        lotCode: string | null;
        expiresAt: string | null;
        quantity: string;
        places: number;
      }[]
    | null;
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
 * figures. Inventory's by-code row is among the routes compared here;
 * Where it stands (step 10) joins them as it is built.
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

  /** An item's id, by its code. */
  async function productOf(org: Org, sku: string): Promise<string> {
    return body<{ entries: { id: string }[] }>(
      await org.agent.get(`/v1/products?search=${sku}`).expect(200),
    ).entries[0].id;
  }

  /** Where it stands, as the agent's role reads it. */
  async function standing(
    agent: Org['agent'],
    productId: string,
  ): Promise<Standing[]> {
    return body<{ codes: Standing[] }>(
      await agent.get(`/v1/products/${productId}/stock`).expect(200),
    ).codes;
  }

  /** A member of alpha holding exactly these permissions. */
  async function memberWith(org: Org, name: string, keys: string[]) {
    await customRole(app, org.organizationId, name, keys);
    return addMember(app, org, `${name.toLowerCase()}@example.com`, name);
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

    const productId = body<{ entries: { id: string }[] }>(
      await alpha.agent.get('/v1/products?search=BOTTLE').expect(200),
    ).entries[0].id;

    // Inventory's row per code (step 9) reads the same figures.
    const [byCode] = body<{ entries: Record<string, unknown>[] }>(
      await alpha.agent
        .get(`/v1/stock/by-code?productId=${productId}`)
        .expect(200),
    ).entries;
    expect(byCode).toMatchObject({
      variantId: bottle,
      onHand: figures.on_hand,
      usable: figures.usable,
      notUsable: figures.not_usable,
      expired: figures.expired,
      issued: figures.issued,
      unavailable: figures.unavailable,
      held: figures.held,
      free: figures.free,
      short: figures.short,
      coming: figures.coming,
      comingOn: figures.coming_on,
      position: figures.position,
      expiresFirst: figures.expires_first,
      reorderPoint: figures.reorder_point,
      status: figures.status,
    });

    // Where it stands, on the item's page (step 10), and its lines
    // adding up to its figures.
    const [stands] = await standing(alpha.agent, productId);
    expect(stands).toMatchObject({
      variantId: bottle,
      onHand: figures.on_hand,
      usable: figures.usable,
      notUsable: figures.not_usable,
      expired: figures.expired,
      issued: figures.issued,
      unavailable: figures.unavailable,
      held: figures.held,
      free: figures.free,
      stillNeeded: figures.still_needed,
      short: figures.short,
      coming: figures.coming,
      comingOn: figures.coming_on,
      position: figures.position,
      expiresFirst: figures.expires_first,
      reorderPoint: figures.reorder_point,
      status: figures.status,
    });
    expect(await sumOf(stands.holds!.map((line) => line.held))).toBe(
      figures.held,
    );
    expect(await sumOf(stands.holds!.map((line) => line.short))).toBe(
      figures.short,
    );
    expect(await sumOf(stands.purchases!.map((line) => line.quantity))).toBe(
      figures.coming,
    );
    expect(
      await sumOf(
        stands.places!.flatMap((place) =>
          place.lots.map((lot) => lot.quantity),
        ),
      ),
    ).toBe(figures.on_hand);

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

  it('walks every code of an organization: on hand is the ledger’s, held the holds’ total, and every sum holds', async () => {
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

    const codes = sql`(select v.id from product_variants v
      where v.organization_id = ${alpha.organizationId}::uuid)`;
    const { rows: broken } = await db.execute<{ variant_id: string }>(sql`
      with f as (${codeFigures(alpha.organizationId, TODAY, codes)}),
      -- Held, a code's total, is what its sales' lines hold one by one,
      -- the earliest confirmed first (34a): BOTTLE's first order keeps
      -- its hold and the last goes short, WANTED holds nothing.
      lines as (
        select h.variant_id, sum(h.held) as held
        from (${holdsSql(alpha.organizationId, TODAY, codes)}) h
        group by h.variant_id
      ),
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
      left join lines h on h.variant_id = f.variant_id
      where f.on_hand <> coalesce(l.on_hand, 0)
        or f.held <> coalesce(h.held, 0)
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

  it('stands an item’s codes the low first, each figure with the lines behind it', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { bottle, focus } = await world(alpha);
    const productId = await productOf(alpha, 'BOTTLE');
    // A second code of the item, watched and with nothing: out, so first.
    const small = body<{ variant: { id: string } }>(
      await alpha.agent
        .post(`/v1/products/${productId}/variants`)
        .send({ sku: 'BOTTLE-S', name: 'Small', unitOfMeasure: 'each' })
        .expect(201),
    ).variant.id;
    await point(alpha.agent, small, '5');

    const codes = await standing(alpha.agent, productId);
    expect(codes.map((code) => [code.sku, code.status])).toEqual([
      ['BOTTLE-S', 'out'],
      ['BOTTLE', 'low'],
    ]);
    const stands = codes[1];
    expect(stands.variantId).toBe(bottle);

    // Buy's quantity is Reorder's suggestion: back to the point, 600 less
    // Left's 210, and the empty code's 5.
    const reorder = body<{ entries: ReorderRow[] }>(
      await alpha.agent.get('/v1/stock/reorder-points').expect(200),
    ).entries;
    expect(
      codes.map((code) => [code.sku, code.source, code.suggestion]),
    ).toEqual([
      ['BOTTLE-S', 'bought', '5.0000'],
      ['BOTTLE', 'bought', '390.0000'],
    ]);
    for (const code of codes) {
      expect(
        reorder.find((row) => row.variantId === code.variantId)?.suggestion,
      ).toBe(code.suggestion);
    }
    // An item with no point has neither.
    const [making] = await standing(
      alpha.agent,
      await productOf(alpha, 'FOCUS'),
    );
    expect([making.source, making.suggestion]).toEqual([null, null]);

    // Held, oldest confirmed first: the first holds its 400, the last
    // holds the 60 left and is 40 short.
    expect(stands.heldOrders).toBe(2);
    expect(
      stands.holds!.map((line) => [
        line.partnerName,
        line.wanted,
        line.held,
        line.short,
      ]),
    ).toEqual([
      ['Northside Pharmacy', '400.0000', '400.0000', '0.0000'],
      ['Northside Pharmacy', '100.0000', '60.0000', '40.0000'],
    ]);
    // Coming, the sooner first.
    expect(
      stands.purchases!.map((line) => [line.quantity, line.expectedAt]),
    ).toEqual([
      ['50.0000', '2026-11-25'],
      ['200.0000', '2026-12-01'],
    ]);
    expect(stands.runs).toEqual([]);
    // By place and lot, each place's lots soonest first.
    expect(
      stands.places!.map((place) => [
        place.locationName,
        place.lots.map((lot) => `${lot.lotCode} ${lot.quantity}`),
      ]),
    ).toEqual([
      ['KITCHEN', ['L-OLD 40.0000', 'L-NEW 60.0000']],
      ['QUARANTINE', ['L-NEW 30.0000']],
      ['SHELF', ['L-SOON 20.0000', 'L-NEW 440.0000']],
    ]);
    expect(stands.lots).toBeNull();

    // A run's output coming, on the item it makes.
    expect(making.variantId).toBe(focus);
    expect(making.runs!.map((line) => line.quantity)).toEqual(['100.0000']);

    // Another organization's item is not here.
    const beta = await registerOrganization(app, 'beta');
    await beta.agent.get(`/v1/products/${productId}/stock`).expect(404);
  });

  it('sends Where it stands only to a reader with stock.view, refused in their words', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await world(alpha);
    const productId = await productOf(alpha, 'BOTTLE');
    const invoicer = await memberWith(alpha, 'Invoicer', [
      'products.view',
      'invoices.view',
    ]);

    const refused = await invoicer
      .get(`/v1/products/${productId}/stock`)
      .expect(403);
    expect(JSON.stringify(refused.body)).not.toContain('590');
    expect(body<{ message: string }>(refused).message).toMatch(/Invoicer/);
  });

  it('leaves out places without locations.view: the usable lots alone, adding up to usable', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await world(alpha);
    const productId = await productOf(alpha, 'BOTTLE');
    const counter = await memberWith(alpha, 'Counter', ['stock.view']);

    const response = await counter
      .get(`/v1/products/${productId}/stock`)
      .expect(200);
    const [stands] = body<{ codes: Standing[] }>(response).codes;
    expect(stands.places).toBeNull();
    for (const place of ['SHELF', 'KITCHEN', 'QUARANTINE']) {
      expect(response.text).not.toContain(place);
    }
    // The run's 60 issued at the kitchen are not a usable lot; the
    // expired and the quarantined are the one line, Not usable 130.
    expect(
      stands.lots!.map((lot) => [
        lot.lotCode,
        lot.expiresAt,
        lot.quantity,
        lot.places,
      ]),
    ).toEqual([
      ['L-SOON', '2027-03-14', '20.0000', 1],
      ['L-NEW', '2099-01-01', '440.0000', 1],
    ]);
    expect(await sumOf(stands.lots!.map((lot) => lot.quantity))).toBe(
      stands.usable,
    );
    expect(stands.notUsable).toBe('130.0000');
  });

  it('leaves out the sales and purchases without orders.view, the number of orders kept', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await world(alpha);
    const productId = await productOf(alpha, 'BOTTLE');
    const counter = await memberWith(alpha, 'Counter', [
      'stock.view',
      'locations.view',
    ]);

    const response = await counter
      .get(`/v1/products/${productId}/stock`)
      .expect(200);
    const [stands] = body<{ codes: Standing[] }>(response).codes;
    expect(stands).toMatchObject({
      held: '460.0000',
      heldOrders: 2,
      holds: null,
      coming: '250.0000',
      comingOn: '2026-11-25',
      purchases: null,
    });
    for (const name of ['Northside', 'Harbour', 'SO-', 'PO-']) {
      expect(response.text).not.toContain(name);
    }

    // With orders.view, the sales and purchases by number.
    const sales = await memberWith(alpha, 'Sales', [
      'stock.view',
      'orders.view',
    ]);
    const [theirs] = await standing(sales, productId);
    expect(theirs.holds).toHaveLength(2);
    expect(theirs.purchases).toHaveLength(2);
    expect(theirs.runs).toBeNull();
  });

  it('leaves out the runs without production.view', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await world(alpha);
    const productId = await productOf(alpha, 'FOCUS');
    const runId = body<{ entries: { id: string }[] }>(
      await alpha.agent
        .get('/v1/production-orders?status=released')
        .expect(200),
    ).entries[0].id;
    const sales = await memberWith(alpha, 'Sales', [
      'stock.view',
      'orders.view',
    ]);

    const response = await sales
      .get(`/v1/products/${productId}/stock`)
      .expect(200);
    const [stands] = body<{ codes: Standing[] }>(response).codes;
    expect(stands).toMatchObject({ coming: '100.0000', runs: null });
    expect(response.text).not.toContain(runId);

    const maker = await memberWith(alpha, 'Maker', [
      'stock.view',
      'production.view',
    ]);
    const [theirs] = await standing(maker, productId);
    expect(theirs.runs).toHaveLength(1);
    expect(theirs.purchases).toBeNull();
  });

  it('counts Low stock as items on Items and as codes on Reorder and Home, one number each', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { agent } = alpha;
    const shelf = await site(agent, 'SHELF');
    // Two items with a code low or out: one with both codes so, one with
    // one of two; and one item enough.
    const twice = await item(agent, 'TWICE-1');
    const twiceId = await productOf(alpha, 'TWICE-1');
    const twiceOut = body<{ variant: { id: string } }>(
      await agent
        .post(`/v1/products/${twiceId}/variants`)
        .send({ sku: 'TWICE-2', name: 'Two', unitOfMeasure: 'each' })
        .expect(201),
    ).variant.id;
    const once = await item(agent, 'ONCE-1');
    const onceId = await productOf(alpha, 'ONCE-1');
    const onceEnough = body<{ variant: { id: string } }>(
      await agent
        .post(`/v1/products/${onceId}/variants`)
        .send({ sku: 'ONCE-2', name: 'Two', unitOfMeasure: 'each' })
        .expect(201),
    ).variant.id;
    const enough = await item(agent, 'ENOUGH');
    await receive(agent, twice, shelf, '5');
    await receive(agent, once, shelf, '5');
    await receive(agent, onceEnough, shelf, '500');
    await receive(agent, enough, shelf, '500');
    for (const variant of [twice, twiceOut, once, onceEnough, enough]) {
      await point(agent, variant, '100');
    }
    const itemOf = new Map([
      [twice, twiceId],
      [twiceOut, twiceId],
      [once, onceId],
      [onceEnough, onceId],
    ]);

    const reorder = body<{ entries: ReorderRow[] }>(
      await agent.get('/v1/stock/reorder-points?status=low').expect(200),
    ).entries;
    const reorderCounts = body<{ low: number }>(
      await agent.get('/v1/stock/reorder-points/counts').expect(200),
    );
    const items = body<{
      entries: { id: string }[];
      counts: { low: number };
    }>(await agent.get('/v1/products?low=true').expect(200));
    const cards = body<{ cards: { kind: string; count: number }[] }>(
      await agent.get('/v1/home').expect(200),
    ).cards;

    expect(reorder).toHaveLength(3);
    expect(reorderCounts.low).toBe(3);
    // Home counts codes, as Reorder does.
    expect(cards.find((card) => card.kind === 'lowStock')?.count).toBe(
      reorderCounts.low,
    );
    // Items counts items: the distinct items among Reorder's codes.
    const distinct = new Set(reorder.map((row) => itemOf.get(row.variantId)));
    expect(items.counts.low).toBe(distinct.size);
    expect(items.entries.map((row) => row.id).sort()).toEqual(
      [...distinct].sort(),
    );
  });
});
