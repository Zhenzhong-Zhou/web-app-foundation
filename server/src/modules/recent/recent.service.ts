import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, notInArray, sql } from 'drizzle-orm';

import type { Permission } from '../../core/authorization/permissions';
import type { Transaction } from '../../database/database.module';
import {
  invoices,
  lots,
  orders,
  partners,
  priceLists,
  productionOrders,
  products,
  productVariants,
  RECENT_KINDS,
  type RecentKind,
  recentRecords,
  returnAuthorizations,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';

/** A person's history is kept to this many (ADR-058). */
export const RECENT_KEPT = 30;

/** Who may see each kind: the same view permission as its page. */
export const RECENT_PERMISSION: Record<RecentKind, Permission> = {
  order: 'orders.view',
  invoice: 'invoices.view',
  lot: 'stock.view',
  product: 'products.view',
  partner: 'partners.view',
  run: 'production.view',
  return: 'return_authorizations.view',
  priceList: 'price_lists.view',
};

export interface RecentEntry {
  kind: RecentKind;
  id: string;
  /** The record's name now; null where it has none yet (a draft invoice). */
  title: string | null;
  detail: string | null;
  openedAt: Date;
}

interface Named {
  id: string;
  title: string | null;
  detail: string | null;
}

/**
 * Recently opened (ADR-058): what a person opened, newest first, named as
 * each record is now. Deleted records drop out because nothing names
 * them; kinds the member may no longer view are never read.
 */
@Injectable()
export class RecentService {
  constructor(private readonly tenantDb: TenantDb) {}

  /** Remember an opening: one row per record, its time moved on. */
  async record(userId: string, kind: RecentKind, recordId: string) {
    await this.tenantDb.transaction(async (tx, organizationId) => {
      await tx
        .insert(recentRecords)
        .values({ organizationId, userId, kind, recordId })
        .onConflictDoUpdate({
          target: [
            recentRecords.organizationId,
            recentRecords.userId,
            recentRecords.kind,
            recentRecords.recordId,
          ],
          set: { openedAt: sql`now()` },
        });

      // Past RECENT_KEPT, the oldest go.
      const kept = tx
        .select({ id: recentRecords.id })
        .from(recentRecords)
        .where(
          and(
            eq(recentRecords.organizationId, organizationId),
            eq(recentRecords.userId, userId),
          ),
        )
        .orderBy(desc(recentRecords.openedAt))
        .limit(RECENT_KEPT);
      await tx
        .delete(recentRecords)
        .where(
          and(
            eq(recentRecords.organizationId, organizationId),
            eq(recentRecords.userId, userId),
            notInArray(recentRecords.id, kept),
          ),
        );
    });
  }

  async list(
    userId: string,
    held: ReadonlySet<Permission>,
    limit: number,
  ): Promise<RecentEntry[]> {
    const visible = RECENT_KINDS.filter((kind) =>
      held.has(RECENT_PERMISSION[kind]),
    );
    if (visible.length === 0) return [];

    return this.tenantDb.transaction(async (tx, organizationId) => {
      // Read a few more than asked, since deleted records drop out.
      const rows = await tx
        .select({
          kind: recentRecords.kind,
          recordId: recentRecords.recordId,
          openedAt: recentRecords.openedAt,
        })
        .from(recentRecords)
        .where(
          and(
            eq(recentRecords.organizationId, organizationId),
            eq(recentRecords.userId, userId),
            inArray(recentRecords.kind, visible),
          ),
        )
        .orderBy(desc(recentRecords.openedAt))
        .limit(Math.min(limit * 2, RECENT_KEPT));

      const byKind = new Map<RecentKind, string[]>();
      for (const row of rows) {
        const kind = row.kind as RecentKind;
        byKind.set(kind, [...(byKind.get(kind) ?? []), row.recordId]);
      }

      const names = new Map<string, Named>();
      for (const [kind, ids] of byKind) {
        for (const named of await this.named(tx, organizationId, kind, ids)) {
          names.set(`${kind}:${named.id}`, named);
        }
      }

      const entries: RecentEntry[] = [];
      for (const row of rows) {
        const named = names.get(`${row.kind}:${row.recordId}`);
        if (!named) continue;
        entries.push({
          kind: row.kind as RecentKind,
          id: row.recordId,
          title: named.title,
          detail: named.detail,
          openedAt: row.openedAt,
        });
        if (entries.length === limit) break;
      }
      return entries;
    });
  }

  async clear(userId: string) {
    await this.tenantDb.transaction(async (tx, organizationId) => {
      await tx
        .delete(recentRecords)
        .where(
          and(
            eq(recentRecords.organizationId, organizationId),
            eq(recentRecords.userId, userId),
          ),
        );
    });
  }

  /** Each kind's records as they are named now, in this organization. */
  private named(
    tx: Transaction,
    organizationId: string,
    kind: RecentKind,
    ids: string[],
  ): Promise<Named[]> {
    switch (kind) {
      case 'order':
        return tx
          .select({
            id: orders.id,
            title: orders.reference,
            detail: partners.name,
          })
          .from(orders)
          .innerJoin(partners, eq(partners.id, orders.partnerId))
          .where(
            and(
              eq(orders.organizationId, organizationId),
              inArray(orders.id, ids),
            ),
          );
      case 'invoice':
        return tx
          .select({
            id: invoices.id,
            title: invoices.number,
            detail: partners.name,
          })
          .from(invoices)
          .innerJoin(partners, eq(partners.id, invoices.partnerId))
          .where(
            and(
              eq(invoices.organizationId, organizationId),
              inArray(invoices.id, ids),
            ),
          );
      case 'lot':
        return tx
          .select({
            id: lots.id,
            title: lots.code,
            detail: productVariants.sku,
          })
          .from(lots)
          .innerJoin(productVariants, eq(productVariants.id, lots.variantId))
          .where(
            and(eq(lots.organizationId, organizationId), inArray(lots.id, ids)),
          );
      case 'product':
        return tx
          .select({
            id: products.id,
            title: products.name,
            detail: sql<string | null>`null`,
          })
          .from(products)
          .where(
            and(
              eq(products.organizationId, organizationId),
              inArray(products.id, ids),
            ),
          );
      case 'partner':
        return tx
          .select({
            id: partners.id,
            title: partners.name,
            detail: partners.code,
          })
          .from(partners)
          .where(
            and(
              eq(partners.organizationId, organizationId),
              inArray(partners.id, ids),
            ),
          );
      case 'run':
        return tx
          .select({
            id: productionOrders.id,
            title: productionOrders.reference,
            detail: sql<string | null>`null`,
          })
          .from(productionOrders)
          .where(
            and(
              eq(productionOrders.organizationId, organizationId),
              inArray(productionOrders.id, ids),
            ),
          );
      case 'return':
        return tx
          .select({
            id: returnAuthorizations.id,
            title: returnAuthorizations.number,
            detail: partners.name,
          })
          .from(returnAuthorizations)
          .innerJoin(partners, eq(partners.id, returnAuthorizations.partnerId))
          .where(
            and(
              eq(returnAuthorizations.organizationId, organizationId),
              inArray(returnAuthorizations.id, ids),
            ),
          );
      case 'priceList':
        return tx
          .select({
            id: priceLists.id,
            title: priceLists.name,
            detail: sql<string | null>`${priceLists.currency}`,
          })
          .from(priceLists)
          .where(
            and(
              eq(priceLists.organizationId, organizationId),
              inArray(priceLists.id, ids),
            ),
          );
    }
  }
}
