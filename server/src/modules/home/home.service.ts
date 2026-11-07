import { Injectable } from '@nestjs/common';
import { and, eq, type SQL, sql } from 'drizzle-orm';

import type { Locale } from '../../common/locales';
import { todayIn } from '../../common/today';
import type { RequestContext } from '../../core/auth/request-context';
import type { Permission } from '../../core/authorization/permissions';
import type { Transaction } from '../../database/database.module';
import {
  type HomeLayout,
  invoices,
  memberships,
  orders,
  organizations,
  productionOrders,
  productLicences,
  returnAuthorizations,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { openNeedsCost } from '../costs/open-needs-cost';
import { lateOrder, outstandingOrder } from '../orders/orders.service';
import {
  expiredLicence,
  expiringLicence,
} from '../product-licences/product-licences.service';
import { lowStockTotals } from '../stock/reorder-points-reads.service';
import { expiredLot, stockRowsOf } from '../stock/stock-reads.service';
import { arranged, type HomeKind, keptWith, kindsSeenWith } from './home-kinds';
import { WelcomeService } from './welcome.service';

/**
 * A tile's figures (ADR-091): every row its list shows, filtered as the
 * tile opens it, and how many of them are late: overdue orders, expired
 * lots and licences, low items that are out.
 */
export interface HomeCard {
  kind: HomeKind;
  /** Hidden in Customise Home, or by default: counted, not drawn. */
  hidden: boolean;
  count: number;
  late: number;
  /** Low stock's: whether any item has a reorder point (ADR-085). */
  anyPoint: boolean | null;
}

/** Getting started's steps, in the order they depend on each other. */
export const GETTING_STARTED_STEPS = [
  'organization',
  'location',
  'product',
  'partner',
  'receipt',
  'invoice',
  'team',
] as const;
export type GettingStartedStep = (typeof GETTING_STARTED_STEPS)[number];

export interface GettingStarted {
  steps: Record<GettingStartedStep, boolean>;
  teamSkipped: boolean;
  dismissed: boolean;
  /** Every step done, the team's or its skip. */
  complete: boolean;
}

/** A tile's count, and how many of those are late. */
type Totals = Pick<HomeCard, 'count' | 'late' | 'anyPoint'>;

/**
 * The three tiles of orders: the outstanding, a direction each, and the
 * drafts.
 */
type OrderKind = 'toShip' | 'toReceive' | 'drafts';

function isOrderKind(kind: HomeKind): kind is OrderKind {
  return kind === 'toShip' || kind === 'toReceive' || kind === 'drafts';
}

/**
 * Home (ADR-058; ADR-091): a tile per kind the member may see, each with
 * its count and how many are late, counted as the list the tile opens
 * filters it, and no rows: the list holds them. A tile the member may not
 * view is never counted. They come in the reader's order, each saying
 * whether they hid it, and Home says whether Recently opened shows and
 * what their default is (Customise Home, ADR-091's amendment of November
 * 2026).
 *
 * The reads every Home makes share one transaction (ADR-091): the
 * organization's days and zone with Getting started, the tiles' counts,
 * and the reader's membership for their welcome (ADR-079) and their
 * layout.
 * The welcome's own reads, while it shows, come after it.
 */
@Injectable()
export class HomeService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly welcome: WelcomeService,
  ) {}

  /**
   * Home's tiles, counted against the organization's today, in its own
   * time zone (ADR-058, ADR-072). The server decides it, as the lists the
   * tiles open do: a screen left open past midnight would send yesterday,
   * and a tile's count would then go by another day than its list. A tile
   * the reader hid is counted too, since its late items still show in the
   * panel of what is late (ADR-091).
   */
  async home(
    context: Pick<RequestContext, 'userId' | 'organizationId'>,
    held: ReadonlySet<Permission>,
    locale: Locale,
  ) {
    const kinds = kindsSeenWith(held);
    const { timeZone, whatWeDo, totals, gettingStarted, membership } =
      await this.tenantDb.transaction(async (tx, organizationId) => {
        // The organization's own warning days (ADR-060), for Expiring
        // soon, its today, its What we do (ADR-091) and Getting started.
        const organization = await organizationOf(tx, organizationId);
        return {
          timeZone: organization.timeZone,
          whatWeDo: organization.whatWeDo,
          totals: await totalsOf(
            tx,
            organizationId,
            kinds,
            todayIn(organization.timeZone),
            organization.days,
          ),
          gettingStarted: organization.gettingStarted,
          membership: await this.welcome.membership(
            tx,
            organizationId,
            context.userId,
          ),
        };
      });

    const layout = membership?.homeLayout ?? null;
    const cards: HomeCard[] = arranged(held, layout).map(
      ({ kind, hidden }) => ({
        kind,
        hidden,
        // A kind of order with none has no row.
        ...(totals.get(kind) ?? { count: 0, late: 0, anyPoint: null }),
      }),
    );
    const byDefault = arranged(held, null);
    const welcome = await this.welcome.of(context, held, membership, {
      timeZone,
      startShows: !gettingStarted.complete && !gettingStarted.dismissed,
      locale,
    });
    return {
      whatWeDo,
      gettingStarted,
      welcome,
      cards,
      recent: layout?.recent ?? true,
      defaultLayout: {
        order: byDefault.map(({ kind }) => kind),
        hidden: byDefault
          .filter(({ hidden }) => hidden)
          .map(({ kind }) => kind),
        recent: true,
      },
    };
  }

  /**
   * Customise Home's Done (ADR-091, amended November 2026): the reader's
   * own arrangement, on their membership here alone, keeping the kinds
   * stored that it does not name, after the rest. Null clears it, so they
   * follow the default, and any later change to it.
   */
  async setLayout(userId: string, layout: HomeLayout | null): Promise<void> {
    if (!layout) {
      await this.tenantDb.update(
        memberships,
        { homeLayout: null },
        eq(memberships.userId, userId),
      );
      return;
    }
    await this.tenantDb.transaction(async (tx, organizationId) => {
      const mine = and(
        eq(memberships.organizationId, organizationId),
        eq(memberships.userId, userId),
      );
      const [row] = await tx
        .select({ homeLayout: memberships.homeLayout })
        .from(memberships)
        .where(mine)
        .for('update');
      await tx
        .update(memberships)
        .set({ homeLayout: keptWith(layout, row?.homeLayout ?? null) })
        .where(mine);
    });
  }

  /** Dismiss the card for everyone, or bring it back (`at` null). */
  async setGettingStartedDismissed(dismissed: boolean): Promise<void> {
    await this.tenantDb.transaction(async (tx, organizationId) => {
      await tx
        .update(organizations)
        .set({ gettingStartedDismissedAt: dismissed ? new Date() : null })
        .where(eq(organizations.id, organizationId));
    });
  }

  /** Skip the team step, for an organization of one. */
  async skipTeamStep(): Promise<void> {
    await this.tenantDb.transaction(async (tx, organizationId) => {
      await tx
        .update(organizations)
        .set({ teamStepSkippedAt: new Date() })
        .where(eq(organizations.id, organizationId));
    });
  }
}

/**
 * The organization's row, read once for all of Home (#505's 68): when a
 * lot counts as expiring here (ADR-060), 90 days by default, its time
 * zone (ADR-072), its What we do (ADR-091), and Getting started.
 *
 * Getting started (ADR-058): each step ticked by what the organization
 * holds, read in one query, never stored; only Skip (the team step) and
 * Dismiss (the card) are, on the organization. `complete` once steps 1
 * to 6 are done and the team is added or skipped.
 *
 * The receipt, invoice, product and partner steps read the largest tables
 * it touches. As an EXISTS, the planner may price a sequential scan that
 * stops at the first match, which reads every tenant's rows when this
 * organization has none: the organization the step is there for. Each is
 * ordered as one of its table's indexes is and limited to one row, so the
 * only cheap plan is that index: this organization's rows, up to the
 * first match, and never another tenant's (ADR-058 amended, #187).
 */
async function organizationOf(
  tx: Transaction,
  organizationId: string,
): Promise<{
  days: number;
  timeZone: string;
  whatWeDo: string | null;
  gettingStarted: GettingStarted;
}> {
  const result = await tx.execute(sql`
    select
      o.expiry_warning_days as days,
      o.time_zone as "timeZone",
      o.what_we_do as "whatWeDo",
      (o.tax_registration_number is not null
        and o.base_currency is not null
        and exists (select 1 from addresses a
                    where a.owner_organization_id = o.id)) as organization,
      exists (select 1 from locations l
              where l.organization_id = o.id) as location,
      (select p.id from products p
       where p.organization_id = o.id
       order by p.name
       limit 1) is not null as product,
      (select p.id from partners p
       where p.organization_id = o.id
       order by p.name
       limit 1) is not null as partner,
      (select m.id from stock_movements m
       where m.organization_id = o.id
         and m.reason = 'receipt'
       order by m.created_at desc nulls last
       limit 1) is not null as receipt,
      (select i.id from invoices i
       where i.organization_id = o.id
         and i.status <> 'draft'
       order by i.invoice_date desc nulls last, i.id desc
       limit 1) is not null as invoice,
      (select count(*) from memberships m
       where m.organization_id = o.id) > 1 as team,
      o.team_step_skipped_at is not null as "teamSkipped",
      o.getting_started_dismissed_at is not null as dismissed
    from organizations o
    where o.id = ${organizationId}::uuid
  `);
  const row = result.rows[0] as Record<
    GettingStartedStep | 'teamSkipped' | 'dismissed',
    boolean
  > & { days: number; timeZone: string; whatWeDo: string | null };
  const steps = Object.fromEntries(
    GETTING_STARTED_STEPS.map((step) => [step, row[step]]),
  ) as Record<GettingStartedStep, boolean>;
  const complete =
    GETTING_STARTED_STEPS.every((step) => step === 'team' || steps[step]) &&
    (steps.team || row.teamSkipped);

  return {
    days: row.days,
    timeZone: row.timeZone,
    whatWeDo: row.whatWeDo,
    gettingStarted: {
      steps,
      teamSkipped: row.teamSkipped,
      dismissed: row.dismissed,
      complete,
    },
  };
}

/**
 * Every tile's count and late count (ADR-058 amended; ADR-091): one
 * statement for all but Low stock, and Low stock's beside it.
 *
 * They were a read per card, each in its own transaction, and the two
 * stock cards between them read the organization's stock seven times.
 * Now a `union all` with a branch per tile the member may see: Postgres
 * plans each branch on its own, as it planned each query before, and the
 * page pays for one round trip instead of eight. To ship and To receive
 * share one branch, outstandingTotals(), which reads the orders once for
 * both. A direction with nothing outstanding has no row.
 *
 * Low stock is a statement of its own, the list's counts over every
 * point's position: as a branch, it made the planner run the orders'
 * branch on parallel workers, and the statement took 225 ms at large on
 * the Mac where the two take 112 apart (ADR-091's build).
 */
async function totalsOf(
  tx: Transaction,
  organizationId: string,
  kinds: HomeKind[],
  today: string,
  expiringWithin: number,
): Promise<Map<HomeKind, Totals>> {
  const totals = new Map<HomeKind, Totals>();
  const counted = async (statement: SQL) => {
    const result = await tx.execute(statement);
    for (const { kind, count, late, anyPoint } of result.rows as ({
      kind: HomeKind;
    } & Pick<Totals, 'count' | 'late'> &
      Partial<Pick<Totals, 'anyPoint'>>)[]) {
      totals.set(kind, { count, late, anyPoint: anyPoint ?? null });
    }
  };

  const branches = [
    ...(kinds.some(isOrderKind) ? [orderTotals(organizationId, today)] : []),
    ...kinds.flatMap((kind) =>
      isOrderKind(kind) || kind === 'lowStock'
        ? []
        : [totalOf(kind, organizationId, today, expiringWithin)],
    ),
  ].map((branch) => sql`(${branch})`);
  if (branches.length > 0) await counted(sql.join(branches, sql` union all `));
  if (kinds.includes('lowStock')) {
    await counted(lowStockTotals(organizationId, today));
  }
  return totals;
}

/**
 * The orders' branch of totalsOf(): To ship and To receive, the outstanding
 * orders as their list filters them (outstandingOrder()), by direction,
 * the late among them as the list's Late has them (lateOrder()); and
 * Drafts, every draft as Orders lists them with Draft chosen, never late
 * (ADR-091, amended November 2026). A kind with none has no row.
 *
 * One read of the outstanding orders for both directions. As a branch
 * each, they read the organization's orders and open lines twice, and the
 * planner, pricing the two, ran the whole statement on parallel workers,
 * which took longer to start than the counts took to read. The drafts are
 * a read of their own beside it, on the orders' status index: as one
 * condition with the outstanding (`draft or outstanding`), the open lines
 * were looked up once an order, ten times slower at large.
 */
function orderTotals(organizationId: string, today: string): SQL {
  const outstanding = and(
    eq(orders.organizationId, organizationId),
    outstandingOrder(),
  );
  const drafts = and(
    eq(orders.organizationId, organizationId),
    eq(orders.status, 'draft'),
  );
  return sql`
    select kind, count(*)::int as count, count(*) filter (where late)::int as late
    from (
      select
        case ${orders.direction}
          when 'sale' then 'toShip'
          when 'purchase' then 'toReceive'
        end as kind,
        ${lateOrder(today)} as late
      from ${orders}
      where ${outstanding}
      union all
      select 'drafts' as kind, false as late
      from ${orders}
      where ${drafts}
    ) counted
    group by kind
  `;
}

/**
 * One tile's branch of totalsOf(): its count, and its late count where
 * lateness applies, under the same conditions as its list's filter.
 */
function totalOf(
  kind: Exclude<HomeKind, OrderKind | 'lowStock'>,
  organizationId: string,
  today: string,
  expiringWithin: number,
): SQL {
  const counted = (rows: SQL, late?: SQL) => {
    const lateCount = late ? sql`count(*) filter (where ${late})::int` : sql`0`;
    return sql`
      select ${kind}::text as kind, count(*)::int as count, ${lateCount} as late
      from ${rows}
    `;
  };

  switch (kind) {
    // The stock list's own rows (stockRowsOf), so the counts are the
    // list's. The expired are counted among the expiring, as its Expired
    // lists them (ADR-091).
    case 'expiring':
      return counted(
        stockRowsOf({ expiringWithin }, organizationId, today),
        expiredLot(today),
      );

    // Stock value's Waiting for a cost (ADR-048; ADR-091): a row for each
    // receipt or run output still waiting, as that list shows them.
    case 'costsWaiting':
      return counted(sql`(${openNeedsCost(organizationId)}) waiting`);

    case 'invoicesToIssue': {
      const where = and(
        eq(invoices.organizationId, organizationId),
        eq(invoices.status, 'draft'),
      );
      return counted(sql`${invoices} where ${where}`);
    }

    case 'returnsOpen': {
      const where = and(
        eq(returnAuthorizations.organizationId, organizationId),
        eq(returnAuthorizations.status, 'open'),
      );
      return counted(sql`${returnAuthorizations} where ${where}`);
    }

    case 'production': {
      const where = and(
        eq(productionOrders.organizationId, organizationId),
        eq(productionOrders.status, 'released'),
      );
      return counted(sql`${productionOrders} where ${where}`);
    }

    // The licences list's Expiring (ADR-091), the expired late, as its
    // Expired lists them.
    case 'licences': {
      const where = and(
        eq(productLicences.organizationId, organizationId),
        expiringLicence(today),
      );
      return counted(
        sql`${productLicences} where ${where}`,
        expiredLicence(today),
      );
    }
  }
}
