import { Injectable } from '@nestjs/common';
import { and, asc, eq, lt, lte, type SQL, sql } from 'drizzle-orm';

import type { Permission } from '../../core/authorization/permissions';
import {
  invoices,
  lots,
  orders,
  organizations,
  productionOrders,
  productLicences,
  returnAuthorizations,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { InvoicesService } from '../invoices/invoices.service';
import { OrdersService } from '../orders/orders.service';
import { ProductionOrdersService } from '../production-orders/production-orders.service';
import { ReturnAuthorizationsService } from '../return-authorizations/return-authorizations.service';
import { StockReadsService, stockRowsOf } from '../stock/stock-reads.service';

/** The most urgent rows each card shows (ADR-058). */
export const HOME_ROWS = 5;
/** Expiring soon: the screens' warning days (ADR-055). */
export const EXPIRY_WARNING_DAYS = 90;
/** Licences: issue #17's notice. */
export const LICENCE_WARNING_DAYS = 60;

export type HomeKind =
  | 'toShip'
  | 'toReceive'
  | 'expiring'
  | 'costsWaiting'
  | 'invoicesToIssue'
  | 'returnsOpen'
  | 'production'
  | 'licences';

/** One row: what to open, its name, a second line, and why it is here. */
export interface HomeRow {
  id: string;
  title: string;
  detail: string | null;
  /** The day it is due or expires, for its chip. */
  due: string | null;
  late: boolean;
}

export interface HomeCard {
  kind: HomeKind;
  /** Every row this card stands for: its list, filtered the same way. */
  count: number;
  /** How many of them are overdue or expired. */
  late: number;
  rows: HomeRow[];
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

/** The cards in the order of a working day, and who may see each. */
const CARDS: { kind: HomeKind; permission: Permission }[] = [
  { kind: 'toShip', permission: 'orders.view' },
  { kind: 'toReceive', permission: 'orders.view' },
  { kind: 'expiring', permission: 'stock.view' },
  { kind: 'costsWaiting', permission: 'costs.view' },
  { kind: 'invoicesToIssue', permission: 'invoices.view' },
  { kind: 'returnsOpen', permission: 'return_authorizations.view' },
  { kind: 'production', permission: 'production.view' },
  { kind: 'licences', permission: 'product_licences.view' },
];

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** A card's count, and how many of those are overdue or expired. */
type Totals = Pick<HomeCard, 'count' | 'late'>;

/** To ship is the sales, to receive the purchases. */
function directionOf(kind: 'toShip' | 'toReceive') {
  return kind === 'toShip' ? 'sale' : 'purchase';
}

/** Licences: the active ones expiring within the notice, or already. */
function licencesDue(organizationId: string, today: string) {
  return and(
    eq(productLicences.organizationId, organizationId),
    eq(productLicences.isActive, true),
    lte(productLicences.expiresAt, addDays(today, LICENCE_WARNING_DAYS)),
  );
}

/**
 * Home (ADR-058): what needs attention, a card per kind the member may see.
 *
 * Each card's rows come from its list's own service with the same filters
 * the card's "See all" link sets, so the five shown are that list's first
 * five; each count uses the same conditions, so "See all 12" opens twelve.
 * The counts are one statement for every card (totals()), the rows a read
 * per card. A card the member may not view is never queried.
 */
@Injectable()
export class HomeService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly orders: OrdersService,
    private readonly stock: StockReadsService,
    private readonly invoices: InvoicesService,
    private readonly returns: ReturnAuthorizationsService,
    private readonly runs: ProductionOrdersService,
  ) {}

  async home(held: ReadonlySet<Permission>, today: string) {
    const kinds = CARDS.flatMap(({ kind, permission }) =>
      held.has(permission) ? [kind] : [],
    );
    const totals = await this.totals(kinds, today);

    const cards: HomeCard[] = [];
    for (const kind of kinds) {
      cards.push({
        kind,
        ...totals.get(kind)!,
        rows: await this.rows(kind, today),
      });
    }
    return { gettingStarted: await this.gettingStarted(), cards };
  }

  /**
   * Getting started (ADR-058): each step ticked by what the organization
   * holds, read in one query, never stored; only Skip (the team step) and
   * Dismiss (the card) are, on the organization. `complete` once steps 1
   * to 6 are done and the team is added or skipped.
   *
   * The receipt and invoice steps read the two largest tables it touches.
   * As an EXISTS, the planner may price a sequential scan that stops at the
   * first match, and Home's perf runs flagged one on stock_movements, then
   * on invoices (ADR-058 amended). Each is ordered as one of its table's
   * indexes is and limited to one row, so the only cheap plan is that
   * index: this organization's rows, newest first, up to the first match,
   * and never another tenant's.
   */
  gettingStarted(): Promise<GettingStarted> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const result = await tx.execute(sql`
        select
          (o.tax_registration_number is not null
            and o.base_currency is not null
            and exists (select 1 from addresses a
                        where a.owner_organization_id = o.id)) as organization,
          exists (select 1 from locations l
                  where l.organization_id = o.id) as location,
          exists (select 1 from products p
                  where p.organization_id = o.id) as product,
          exists (select 1 from partners p
                  where p.organization_id = o.id) as partner,
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
      >;
      const steps = Object.fromEntries(
        GETTING_STARTED_STEPS.map((step) => [step, row[step]]),
      ) as Record<GettingStartedStep, boolean>;
      const complete =
        GETTING_STARTED_STEPS.every((step) => step === 'team' || steps[step]) &&
        (steps.team || row.teamSkipped);

      return {
        steps,
        teamSkipped: row.teamSkipped,
        dismissed: row.dismissed,
        complete,
      };
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

  /**
   * Every card's count and late count, in one statement (ADR-058 amended).
   *
   * They were a read per card, each in its own transaction, and the two
   * stock cards between them read the organization's stock seven times.
   * Now a `union all` with a branch per card the member may see: Postgres
   * plans each branch on its own, as it planned each query before, and the
   * page pays for one round trip instead of eight.
   */
  private totals(
    kinds: HomeKind[],
    today: string,
  ): Promise<Map<HomeKind, Totals>> {
    if (kinds.length === 0) {
      return Promise.resolve(new Map<HomeKind, Totals>());
    }

    return this.tenantDb.transaction(async (tx, organizationId) => {
      const branches = kinds.map(
        (kind) => sql`(${totalOf(kind, organizationId, today)})`,
      );
      const result = await tx.execute(sql.join(branches, sql` union all `));
      const rows = result.rows as ({ kind: HomeKind } & Totals)[];
      return new Map<HomeKind, Totals>(
        rows.map(({ kind, count, late }) => [kind, { count, late }]),
      );
    });
  }

  /** A card's five most urgent rows, from its list's own read. */
  private async rows(kind: HomeKind, today: string): Promise<HomeRow[]> {
    switch (kind) {
      case 'toShip':
      case 'toReceive': {
        const page = await this.orders.list({
          status: 'confirmed',
          direction: directionOf(kind),
          sort: 'expectedAt',
          order: 'asc',
          limit: HOME_ROWS,
        });
        return page.entries.map((row) => ({
          id: row.id,
          title: row.reference ?? row.partnerName,
          detail: row.partnerName,
          due: row.expectedAt,
          late: row.expectedAt !== null && row.expectedAt < today,
        }));
      }

      case 'expiring': {
        const page = await this.stock.list({
          expiringWithin: EXPIRY_WARNING_DAYS,
          sort: 'expiry',
          order: 'asc',
          limit: HOME_ROWS,
        });
        return page.entries.map((row) => ({
          // A row opens its lot's trace.
          id: row.lotId ?? row.id,
          title: row.lotCode ?? row.sku,
          detail: `${row.sku} · ${row.locationName}`,
          due: row.lotExpiresAt,
          late: row.lotExpiresAt !== null && row.lotExpiresAt < today,
        }));
      }

      case 'costsWaiting': {
        const page = await this.stock.list({
          needsCost: 'true',
          limit: HOME_ROWS,
        });
        return page.entries.map((row) => ({
          id: row.variantId,
          title: row.sku,
          detail: row.lotCode ?? row.locationName,
          due: null,
          late: false,
        }));
      }

      case 'invoicesToIssue': {
        const page = await this.invoices.list({
          status: 'draft',
          limit: HOME_ROWS,
        });
        return page.entries.map((row) => ({
          id: row.id,
          title: row.partnerName,
          detail: row.orderReference,
          due: null,
          late: false,
        }));
      }

      case 'returnsOpen': {
        const page = await this.returns.list({
          status: 'open',
          limit: HOME_ROWS,
        });
        return page.entries.map((row) => ({
          id: row.id,
          title: row.number,
          detail: row.partnerName,
          due: null,
          late: false,
        }));
      }

      case 'production': {
        const page = await this.runs.list({
          status: 'released',
          limit: HOME_ROWS,
        });
        return page.entries.map((row) => ({
          id: row.id,
          title: row.reference ?? row.id,
          detail: null,
          due: null,
          late: false,
        }));
      }

      case 'licences':
        return this.tenantDb.transaction(async (tx, organizationId) => {
          const rows = await tx
            .select({
              id: productLicences.id,
              number: productLicences.number,
              authority: productLicences.authority,
              expiresAt: productLicences.expiresAt,
            })
            .from(productLicences)
            .where(licencesDue(organizationId, today))
            .orderBy(asc(productLicences.expiresAt), asc(productLicences.id))
            .limit(HOME_ROWS);
          return rows.map((row) => ({
            id: row.id,
            title: row.number,
            detail: row.authority,
            due: row.expiresAt,
            late: row.expiresAt !== null && row.expiresAt < today,
          }));
        });
    }
  }
}

/**
 * One card's branch of totals(): its count, and its late count where
 * lateness applies, under the same conditions as its list's filter.
 */
function totalOf(kind: HomeKind, organizationId: string, today: string): SQL {
  const counted = (rows: SQL, late?: SQL) => {
    const lateCount = late ? sql`count(*) filter (where ${late})::int` : sql`0`;
    return sql`
      select ${kind}::text as kind, count(*)::int as count, ${lateCount} as late
      from ${rows}
    `;
  };

  switch (kind) {
    case 'toShip':
    case 'toReceive': {
      const where = and(
        eq(orders.organizationId, organizationId),
        eq(orders.direction, directionOf(kind)),
        eq(orders.status, 'confirmed'),
      );
      return counted(
        sql`${orders} where ${where}`,
        lt(orders.expectedAt, today),
      );
    }

    // The stock list's own rows (stockRowsOf), so the counts are the
    // list's. The expired are counted among the expiring.
    case 'expiring':
      return counted(
        stockRowsOf({ expiringWithin: EXPIRY_WARNING_DAYS }, organizationId),
        lt(lots.expiresAt, today),
      );

    case 'costsWaiting':
      return counted(stockRowsOf({ needsCost: 'true' }, organizationId));

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

    case 'licences':
      return counted(
        sql`${productLicences} where ${licencesDue(organizationId, today)}`,
        lt(productLicences.expiresAt, today),
      );
  }
}
