import type { INestApplication } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import {
  draftedOf,
  multiplesOf,
  type PositionFigures,
  positionsOf,
  statusOf,
  suggestionOf,
} from '../src/modules/stock/reorder-position';
import { body, createE2eApp, registerOrganization } from './utils/fixtures';
import {
  closeShort,
  item,
  order,
  output,
  partner,
  point,
  receive,
  receiveLine,
  recipe,
  run,
  ship,
  site,
} from './utils/reorder-world';
import { resetDatabase } from './utils/reset-db';

type Org = Awaited<ReturnType<typeof registerOrganization>>;

/** A day long before the lots below expire, unless a test says otherwise. */
const TODAY = '2026-11-01';

type Position = {
  usable: string;
  coming: string;
  still_needed: string;
  in_draft: string;
  position: string;
  status: string;
  suggestion: string;
  suggested_multiples: string | null;
};

/** One rule's figures, as literals. */
interface Literals {
  position: string;
  point: string;
  rule: 'just_enough' | 'fixed' | 'maximum';
  fixed?: string;
  maximum?: string;
  inDraft?: string;
  active?: boolean;
}

/**
 * An item's position (ADR-085), worked out by its one module, on its own:
 * usable, coming, still needed and in draft from the stock, orders and
 * runs a person made through the API; the status and the suggestion for
 * each rule from the figures alone.
 */
describe('A reorder point’s position (e2e)', () => {
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

  /** The status and the suggestion of one set of figures. */
  async function ruled(values: Literals) {
    const figures: PositionFigures = {
      position: sql`${values.position}::numeric`,
      reorderPoint: sql`${values.point}::numeric`,
      rule: sql`${values.rule}::text`,
      fixedQuantity: sql`${values.fixed ?? null}::numeric`,
      maximumQuantity: sql`${values.maximum ?? null}::numeric`,
      inDraft: sql`${values.inDraft ?? '0'}::numeric`,
      active: sql`${values.active ?? true}::boolean`,
    };
    const { rows } = await db.execute<{
      status: string;
      suggestion: string;
      multiples: string | null;
      drafted: boolean;
    }>(sql`
      select
        ${statusOf(figures)} as status,
        (${suggestionOf(figures)})::numeric(18, 4)::text as suggestion,
        (${multiplesOf(figures)})::text as multiples,
        ${draftedOf(figures)} as drafted
    `);
    return rows[0];
  }

  /** An item's position as positionsOf works it out. */
  async function positionOf(
    org: Org,
    variantId: string,
    today = TODAY,
  ): Promise<Position> {
    const { rows } = await db.execute<Position>(sql`
      select
        p.usable::numeric(18, 4)::text as usable,
        p.coming::numeric(18, 4)::text as coming,
        p.still_needed::numeric(18, 4)::text as still_needed,
        p.in_draft::numeric(18, 4)::text as in_draft,
        p.position::numeric(18, 4)::text as position,
        p.status,
        p.suggestion::numeric(18, 4)::text as suggestion,
        p.suggested_multiples::text as suggested_multiples
      from (${positionsOf(org.organizationId, today, variantId)}) p
    `);
    return rows[0];
  }

  describe('the status', () => {
    it('is out at zero or less, low below the point, and enough at or above it', async () => {
      const at = (position: string) =>
        ruled({ position, point: '100', rule: 'just_enough' });

      expect((await at('-5')).status).toBe('out');
      expect((await at('0')).status).toBe('out');
      expect((await at('99.9999')).status).toBe('low');
      expect((await at('100')).status).toBe('enough');
      expect((await at('250')).status).toBe('enough');
    });

    it('is discontinued, never low, for an item no longer sold or made', async () => {
      const gone = await ruled({
        position: '0',
        point: '100',
        rule: 'just_enough',
        active: false,
      });

      expect(gone).toMatchObject({
        status: 'discontinued',
        suggestion: '0.0000',
      });
    });
  });

  describe('the suggestion', () => {
    it('just enough: the shortfall, back to the point, less what is in draft', async () => {
      const rule = { point: '2000', rule: 'just_enough' } as const;

      expect((await ruled({ ...rule, position: '800' })).suggestion).toBe(
        '1200.0000',
      );
      expect(
        (await ruled({ ...rule, position: '800', inDraft: '500' })).suggestion,
      ).toBe('700.0000');
      // A backorder lowers the position below zero, and the suggestion
      // covers it.
      expect((await ruled({ ...rule, position: '-50' })).suggestion).toBe(
        '2050.0000',
      );
    });

    it('a fixed quantity: whole multiples of it, rounded up, after what is in draft', async () => {
      const rule = { point: '2000', rule: 'fixed', fixed: '1000' } as const;

      expect(await ruled({ ...rule, position: '0' })).toMatchObject({
        suggestion: '2000.0000',
        multiples: '2',
      });
      expect(await ruled({ ...rule, position: '1500' })).toMatchObject({
        suggestion: '1000.0000',
        multiples: '1',
      });
      // 1,500 short, 500 of it drafted: one case, not 1,000 less 500.
      expect(
        await ruled({ ...rule, position: '500', inDraft: '500' }),
      ).toMatchObject({ suggestion: '1000.0000', multiples: '1' });
      expect(
        await ruled({ ...rule, position: '1999.5', fixed: '0.25' }),
      ).toMatchObject({ suggestion: '0.5000', multiples: '2' });
    });

    it('up to a maximum: fills it to the maximum, less what is in draft', async () => {
      const rule = { point: '200', rule: 'maximum', maximum: '600' } as const;

      expect((await ruled({ ...rule, position: '150' })).suggestion).toBe(
        '450.0000',
      );
      expect(
        (await ruled({ ...rule, position: '150', inDraft: '100' })).suggestion,
      ).toBe('350.0000');
    });

    it('is never below zero: drafted, or not low at all', async () => {
      // Low, and its drafts already cover it: drafted, not ordered twice.
      expect(
        await ruled({
          position: '100',
          point: '2000',
          rule: 'fixed',
          fixed: '1000',
          inDraft: '3000',
        }),
      ).toMatchObject({ status: 'low', suggestion: '0.0000', multiples: '0' });
      expect(
        (
          await ruled({
            position: '100',
            point: '200',
            rule: 'maximum',
            maximum: '600',
            inDraft: '900',
          })
        ).suggestion,
      ).toBe('0.0000');
      // Above its point: nothing to order, a maximum not filled until it falls.
      expect(
        (
          await ruled({
            position: '300',
            point: '200',
            rule: 'maximum',
            maximum: '600',
          })
        ).suggestion,
      ).toBe('0.0000');
      expect(
        (await ruled({ position: '2000', point: '2000', rule: 'just_enough' }))
          .multiples,
      ).toBeNull();
    });
  });

  describe('drafted', () => {
    it('is low with nothing left to suggest once its drafts are taken off', async () => {
      const fixed = { point: '2000', rule: 'fixed', fixed: '1000' } as const;

      // Its drafts cover the shortfall: drafted, so not ordered twice.
      expect(
        (await ruled({ ...fixed, position: '100', inDraft: '3000' })).drafted,
      ).toBe(true);
      // A draft short of it still leaves an order to suggest.
      expect(
        (await ruled({ ...fixed, position: '100', inDraft: '500' })).drafted,
      ).toBe(false);
      // Out, a draft planned for all it needs: drafted too.
      expect(
        (
          await ruled({
            position: '0',
            point: '200',
            rule: 'just_enough',
            inDraft: '200',
          })
        ).drafted,
      ).toBe(true);
      // Not low, or discontinued: nothing to draft for, whatever is in draft.
      for (const figures of [
        { position: '2500', point: '2000' },
        { position: '100', point: '2000', active: false },
      ]) {
        expect(
          (await ruled({ ...figures, rule: 'just_enough', inDraft: '5000' }))
            .drafted,
        ).toBe(false);
      }
    });
  });

  describe('usable', () => {
    it('counts only the locations marked available', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const d3 = await item(alpha.agent, 'D3-1000');
      const shelf = await site(alpha.agent, 'SHELF');
      const quarantine = await site(alpha.agent, 'QUARANTINE', false);
      await receive(alpha.agent, d3, shelf, '100');
      await receive(alpha.agent, d3, quarantine, '50');
      await point(alpha.agent, d3, '200');

      expect(await positionOf(alpha, d3)).toMatchObject({
        usable: '100.0000',
        position: '100.0000',
        status: 'low',
        suggestion: '100.0000',
      });
    });

    it('leaves out the lots expired by the organization’s today', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const d3 = await item(alpha.agent, 'D3-1000', true);
      const shelf = await site(alpha.agent, 'SHELF');
      await receive(alpha.agent, d3, shelf, '30', {
        code: 'L-OLD',
        expiresAt: '2030-01-01',
      });
      await receive(alpha.agent, d3, shelf, '70', {
        code: 'L-NEW',
        expiresAt: '2031-01-01',
      });
      await point(alpha.agent, d3, '50');

      // On its day of expiry a lot is still good; the day after, it is not.
      expect((await positionOf(alpha, d3, '2030-01-01')).usable).toBe(
        '100.0000',
      );
      expect((await positionOf(alpha, d3, '2030-01-02')).usable).toBe(
        '70.0000',
      );
      expect((await positionOf(alpha, d3, '2031-01-02')).status).toBe('out');
    });

    it('leaves out what released runs were issued and have not consumed, where it sits at an available location', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const bottle = await item(alpha.agent, 'BOTTLE');
      const focus = await item(alpha.agent, 'FOCUS-60CT');
      const shelf = await site(alpha.agent, 'SHELF');
      const kitchen = await site(alpha.agent, 'KITCHEN');
      const wip = await site(alpha.agent, 'WIP', false);
      await receive(alpha.agent, bottle, shelf, '1000');
      await point(alpha.agent, bottle, '100');
      const bomId = await recipe(alpha.agent, focus, bottle, '2');

      // 200 issued to a run in an available kitchen, 100 to one in WIP,
      // which nobody counts anyway, and 100 issued where they already
      // were: a release from the run's own location moves nothing.
      await run(
        alpha.agent,
        { outputId: focus, bomId, locationId: kitchen, quantityPlanned: '100' },
        shelf,
      );
      await run(
        alpha.agent,
        { outputId: focus, bomId, locationId: wip, quantityPlanned: '50' },
        shelf,
      );
      await run(
        alpha.agent,
        { outputId: focus, bomId, locationId: shelf, quantityPlanned: '50' },
        shelf,
      );

      // The shelf holds 700, 100 of them the third run's; the kitchen 200,
      // all the first's.
      expect((await positionOf(alpha, bottle)).usable).toBe('600.0000');
    });
  });

  describe('coming', () => {
    it('counts confirmed purchases still to receive, but not a line closed short or a draft', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const d3 = await item(alpha.agent, 'D3-1000');
      const shelf = await site(alpha.agent, 'SHELF');
      const supplier = await partner(alpha.agent, 'Nordic Supply');
      await point(alpha.agent, d3, '500');

      const open = await order(alpha.agent, 'purchase', supplier, d3, '100');
      await receiveLine(alpha.agent, open, shelf, '30');
      const short = await order(alpha.agent, 'purchase', supplier, d3, '50');
      await receiveLine(alpha.agent, short, shelf, '10');
      await closeShort(alpha.agent, short);
      await order(alpha.agent, 'purchase', supplier, d3, '40', { draft: true });

      expect(await positionOf(alpha, d3)).toMatchObject({
        usable: '40.0000',
        coming: '70.0000',
        in_draft: '40.0000',
        position: '110.0000',
      });
    });

    it('counts released runs’ output still to come, never below zero', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const bottle = await item(alpha.agent, 'BOTTLE');
      const focus = await item(alpha.agent, 'FOCUS-60CT');
      const wip = await site(alpha.agent, 'WIP', false);
      const shelf = await site(alpha.agent, 'SHELF');
      await receive(alpha.agent, bottle, shelf, '1000');
      const bomId = await recipe(alpha.agent, focus, bottle, '1');
      await point(alpha.agent, focus, '500', undefined, 'made');

      const producing = await run(
        alpha.agent,
        { outputId: focus, bomId, locationId: wip, quantityPlanned: '100' },
        shelf,
      );
      await output(alpha.agent, producing, '30');
      // A batch yielding more than planned owes nothing more.
      const over = await run(
        alpha.agent,
        { outputId: focus, bomId, locationId: wip, quantityPlanned: '10' },
        shelf,
      );
      await output(alpha.agent, over, '15');
      await run(alpha.agent, {
        outputId: focus,
        bomId,
        locationId: wip,
        quantityPlanned: '20',
      });

      // What came out sits in WIP, marked unavailable, until moved.
      expect(await positionOf(alpha, focus)).toMatchObject({
        usable: '0.0000',
        coming: '70.0000',
        in_draft: '20.0000',
        position: '70.0000',
      });
    });
  });

  describe('still needed', () => {
    it('counts confirmed sales still to ship, but not a line closed short or a draft', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const d3 = await item(alpha.agent, 'D3-1000');
      const shelf = await site(alpha.agent, 'SHELF');
      const customer = await partner(alpha.agent, 'Northside Pharmacy');
      await receive(alpha.agent, d3, shelf, '100');
      await point(alpha.agent, d3, '80');

      const open = await order(alpha.agent, 'sale', customer, d3, '40');
      await ship(alpha.agent, open, shelf, '10');
      const short = await order(alpha.agent, 'sale', customer, d3, '20');
      await ship(alpha.agent, short, shelf, '5');
      await closeShort(alpha.agent, short);
      await order(alpha.agent, 'sale', customer, d3, '15', { draft: true });

      expect(await positionOf(alpha, d3)).toMatchObject({
        usable: '85.0000',
        still_needed: '30.0000',
        position: '55.0000',
        status: 'low',
        suggestion: '25.0000',
      });
    });
  });

  describe('in draft', () => {
    it('counts draft purchases and draft runs beside the position, never in it', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const bottle = await item(alpha.agent, 'BOTTLE');
      const focus = await item(alpha.agent, 'FOCUS-60CT');
      const shelf = await site(alpha.agent, 'SHELF');
      const supplier = await partner(alpha.agent, 'Nordic Supply');
      const bomId = await recipe(alpha.agent, focus, bottle, '1');
      await receive(alpha.agent, focus, shelf, '10');
      await point(alpha.agent, focus, '100', undefined, 'made');

      await order(alpha.agent, 'purchase', supplier, focus, '25', {
        draft: true,
      });
      await run(alpha.agent, {
        outputId: focus,
        bomId,
        locationId: shelf,
        quantityPlanned: '40',
      });

      expect(await positionOf(alpha, focus)).toMatchObject({
        usable: '10.0000',
        coming: '0.0000',
        in_draft: '65.0000',
        position: '10.0000',
        status: 'low',
        suggestion: '25.0000',
      });
    });
  });

  it('keeps a discontinued item, or one of a discontinued product, never low', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const created = body<{
      product: { id: string; variants: { id: string }[] };
    }>(
      await alpha.agent
        .post('/v1/products')
        .send({ type: 'good', name: 'Calm', variant: { sku: 'CALM-90' } })
        .expect(201),
    ).product;
    const calm = created.variants[0].id;
    await point(alpha.agent, calm, '100');
    expect((await positionOf(alpha, calm)).status).toBe('out');

    await alpha.agent
      .patch(`/v1/products/${created.id}`)
      .send({ isActive: false })
      .expect(204);

    expect(await positionOf(alpha, calm)).toMatchObject({
      status: 'discontinued',
      suggestion: '0.0000',
    });
  });

  it('reads only its own organization’s stock, orders and runs', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const beta = await registerOrganization(app, 'beta');
    const ours = await item(alpha.agent, 'D3-1000');
    await point(alpha.agent, ours, '10');
    const theirs = await item(beta.agent, 'D3-1000');
    await receive(beta.agent, theirs, await site(beta.agent, 'SHELF'), '500');
    await point(beta.agent, theirs, '10');

    expect((await positionOf(alpha, ours)).usable).toBe('0.0000');
    expect(await positionOf(alpha, theirs)).toBeUndefined();
  });
});
