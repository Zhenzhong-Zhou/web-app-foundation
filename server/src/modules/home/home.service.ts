import { Injectable } from '@nestjs/common';
import { and, asc, count, eq, gt, lt, lte, sql } from 'drizzle-orm';

import type { Permission } from '../../core/authorization/permissions';
import {
  invoices,
  lots,
  orders,
  productionOrders,
  productLicences,
  returnAuthorizations,
  stockLevels,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { InvoicesService } from '../invoices/invoices.service';
import { OrdersService } from '../orders/orders.service';
import { ProductionOrdersService } from '../production-orders/production-orders.service';
import { ReturnAuthorizationsService } from '../return-authorizations/return-authorizations.service';
import { StockReadsService } from '../stock/stock-reads.service';

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

/**
 * Home (ADR-058): what needs attention, a card per kind the member may see.
 *
 * Each card's rows come from its list's own service with the same filters
 * the card's "See all" link sets, so the five shown are that list's first
 * five; each count uses the same conditions, so "See all 12" opens twelve.
 * A card the member may not view is never queried.
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
    const cards: HomeCard[] = [];
    for (const { kind, permission } of CARDS) {
      if (held.has(permission)) cards.push(await this.card(kind, today));
    }
    return { cards };
  }

  private async card(kind: HomeKind, today: string): Promise<HomeCard> {
    switch (kind) {
      case 'toShip':
      case 'toReceive': {
        const direction = kind === 'toShip' ? 'sale' : 'purchase';
        const page = await this.orders.list({
          status: 'confirmed',
          direction,
          sort: 'expectedAt',
          order: 'asc',
          limit: HOME_ROWS,
        });
        const where = (organizationId: string) =>
          and(
            eq(orders.organizationId, organizationId),
            eq(orders.direction, direction),
            eq(orders.status, 'confirmed'),
          );
        return {
          kind,
          ...(await this.counted(orders, where, lt(orders.expectedAt, today))),
          rows: page.entries.map((row) => ({
            id: row.id,
            title: row.reference ?? row.partnerName,
            detail: row.partnerName,
            due: row.expectedAt,
            late: row.expectedAt !== null && row.expectedAt < today,
          })),
        };
      }

      case 'expiring': {
        const page = await this.stock.list({
          expiringWithin: EXPIRY_WARNING_DAYS,
          sort: 'expiry',
          order: 'asc',
          limit: HOME_ROWS,
        });
        const { expiring } = await this.stock.counts({
          expiringWithin: EXPIRY_WARNING_DAYS,
        });
        const late = await this.tenantDb.transaction(
          async (tx, organizationId) => {
            const [row] = await tx
              .select({ value: count() })
              .from(stockLevels)
              .innerJoin(lots, eq(lots.id, stockLevels.lotId))
              .where(
                and(
                  eq(stockLevels.organizationId, organizationId),
                  gt(stockLevels.quantity, '0'),
                  lt(lots.expiresAt, today),
                ),
              );
            return row.value;
          },
        );
        return {
          kind,
          count: expiring,
          late,
          rows: page.entries.map((row) => ({
            // A row opens its lot's trace.
            id: row.lotId ?? row.id,
            title: row.lotCode ?? row.sku,
            detail: `${row.sku} · ${row.locationName}`,
            due: row.lotExpiresAt,
            late: row.lotExpiresAt !== null && row.lotExpiresAt < today,
          })),
        };
      }

      case 'costsWaiting': {
        const page = await this.stock.list({
          needsCost: 'true',
          limit: HOME_ROWS,
        });
        const { needsCost } = await this.stock.counts({});
        return {
          kind,
          count: needsCost,
          late: 0,
          rows: page.entries.map((row) => ({
            id: row.variantId,
            title: row.sku,
            detail: row.lotCode ?? row.locationName,
            due: null,
            late: false,
          })),
        };
      }

      case 'invoicesToIssue': {
        const page = await this.invoices.list({
          status: 'draft',
          limit: HOME_ROWS,
        });
        return {
          kind,
          ...(await this.counted(invoices, (organizationId) =>
            and(
              eq(invoices.organizationId, organizationId),
              eq(invoices.status, 'draft'),
            ),
          )),
          rows: page.entries.map((row) => ({
            id: row.id,
            title: row.partnerName,
            detail: row.orderReference,
            due: null,
            late: false,
          })),
        };
      }

      case 'returnsOpen': {
        const page = await this.returns.list({
          status: 'open',
          limit: HOME_ROWS,
        });
        return {
          kind,
          ...(await this.counted(returnAuthorizations, (organizationId) =>
            and(
              eq(returnAuthorizations.organizationId, organizationId),
              eq(returnAuthorizations.status, 'open'),
            ),
          )),
          rows: page.entries.map((row) => ({
            id: row.id,
            title: row.number,
            detail: row.partnerName,
            due: null,
            late: false,
          })),
        };
      }

      case 'production': {
        const page = await this.runs.list({
          status: 'released',
          limit: HOME_ROWS,
        });
        return {
          kind,
          ...(await this.counted(productionOrders, (organizationId) =>
            and(
              eq(productionOrders.organizationId, organizationId),
              eq(productionOrders.status, 'released'),
            ),
          )),
          rows: page.entries.map((row) => ({
            id: row.id,
            title: row.reference ?? row.id,
            detail: null,
            due: null,
            late: false,
          })),
        };
      }

      case 'licences': {
        const until = addDays(today, LICENCE_WARNING_DAYS);
        return this.tenantDb.transaction(async (tx, organizationId) => {
          const where = and(
            eq(productLicences.organizationId, organizationId),
            eq(productLicences.isActive, true),
            lte(productLicences.expiresAt, until),
          );
          const [totals] = await tx
            .select({
              count: count(),
              late: sql<number>`count(*) filter (where ${productLicences.expiresAt} < ${today})::int`,
            })
            .from(productLicences)
            .where(where);
          const rows = await tx
            .select({
              id: productLicences.id,
              number: productLicences.number,
              authority: productLicences.authority,
              expiresAt: productLicences.expiresAt,
            })
            .from(productLicences)
            .where(where)
            .orderBy(asc(productLicences.expiresAt), asc(productLicences.id))
            .limit(HOME_ROWS);
          return {
            kind,
            count: totals.count,
            late: totals.late,
            rows: rows.map((row) => ({
              id: row.id,
              title: row.number,
              detail: row.authority,
              due: row.expiresAt,
              late: row.expiresAt !== null && row.expiresAt < today,
            })),
          };
        });
      }
    }
  }

  /** A card's count, and how many of those are late when lateness applies. */
  private counted(
    table:
      | typeof orders
      | typeof invoices
      | typeof returnAuthorizations
      | typeof productionOrders,
    where: (organizationId: string) => ReturnType<typeof and>,
    late?: ReturnType<typeof lt>,
  ): Promise<{ count: number; late: number }> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const [row] = await tx
        .select({
          count: count(),
          late: late
            ? sql<number>`count(*) filter (where ${late})::int`
            : sql<number>`0`,
        })
        .from(table)
        .where(where(organizationId));
      return { count: row.count, late: Number(row.late) };
    });
  }
}
