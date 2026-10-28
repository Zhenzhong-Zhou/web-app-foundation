import { Injectable } from '@nestjs/common';
import { and, desc, eq, notInArray, or, sql } from 'drizzle-orm';

import type { Locale } from '../../common/locales';
import {
  closeMatches,
  closeMatchSetting,
  closeness,
  codeMatches,
  matchRank,
  type SearchTerms,
  searchTerms,
} from '../../common/search';
import type { Permission } from '../../core/authorization/permissions';
import {
  creditNotes,
  documentNumbering,
  type DocumentType,
  invoices,
  lots,
  orders,
  partners,
  productionOrders,
  products,
  productVariants,
  returnAuthorizations,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { literalStart } from '../numbering/numbering-format';
import {
  partnerMatches,
  partnerRank,
  partnerRecordMatches,
} from '../partners/partner-search';
import { itemMatches, itemRank } from '../products/item-search';
import { coverOf } from '../products/product-images';
import { itemName, namesIn } from '../stock/item-name';

/** At most this many of each kind (ADR-056). */
export const LOOKUP_LIMIT = 5;

export type LookupKind =
  | 'order'
  | 'invoice'
  | 'creditNote'
  | 'lot'
  | 'item'
  | 'partner'
  | 'productionRun'
  | 'returnAuthorization';

/** One record found. The client builds its address from kind and id. */
export interface LookupResult {
  id: string;
  /** The number, reference, code or name the person would recognise. */
  title: string;
  /** A short second line: a partner, a SKU. */
  detail: string | null;
  status: string | null;
  /** A lot's, for its expiry chip. */
  expiresAt: string | null;
  /** An item's product, which is the page it opens. */
  productId: string | null;
  /** An item's product's cover (ADR-066); null for every other kind. */
  coverFileId: string | null;
  /** Found by similarity, after the exact matches (a typo). */
  close: boolean;
}

export interface LookupGroup {
  kind: LookupKind;
  results: LookupResult[];
}

/** Each kind, and the permission that lets a member see it at all. */
const KINDS: { kind: LookupKind; permission: Permission }[] = [
  { kind: 'order', permission: 'orders.view' },
  { kind: 'invoice', permission: 'invoices.view' },
  { kind: 'creditNote', permission: 'invoices.view' },
  { kind: 'lot', permission: 'stock.view' },
  { kind: 'item', permission: 'products.view' },
  { kind: 'partner', permission: 'partners.view' },
  { kind: 'productionRun', permission: 'production.view' },
  { kind: 'returnAuthorization', permission: 'return_authorizations.view' },
];

/**
 * Which kind a series' numbers open (ADR-073): a query starting with a
 * series' prefix, as the organization set it, puts that kind first.
 */
const KIND_OF_SERIES: Record<DocumentType, LookupKind> = {
  invoice: 'invoice',
  credit_note: 'creditNote',
  return_authorization: 'returnAuthorization',
  sale_order: 'order',
  purchase_order: 'order',
};

/** A prefix's text before its date, and the kind it names. */
type Shaped = { start: string; kind: LookupKind };

type Row = Omit<LookupResult, 'close'>;
type Tx = Parameters<Parameters<TenantDb['transaction']>[0]>[0];

const NONE = {
  status: sql<string | null>`null`,
  expiresAt: sql<string | null>`null`,
  productId: sql<string | null>`null`,
  coverFileId: sql<string | null>`null`,
};

/**
 * The top bar's lookup (ADR-056): every kind of record a member may see,
 * found by what they have in hand, in one request.
 *
 * For each kind, the exact matches first, ranked exact, then at the start,
 * then anywhere, most recent first among equals. Then, only when the
 * whole lookup found fewer than LOOKUP_LIMIT records, close matches for a
 * typo in each kind, best first, after its exact ones and marked as such: a
 * typo is a search that finds (almost) nothing, and a lot code that finds
 * five lots is not one. Skipping the close pass then is what keeps a code's
 * lookup inside its budget (ADR-051): word similarity across every kind's
 * numbers is the costliest query here, and was all noise. A kind the member may not view is never queried, so nothing says
 * a record exists that its list would hide. Every query is scoped to the
 * organization in context, and so is every table it joins: without that,
 * Postgres joins this organization's orders and items to every
 * organization's partners and products, a cost that grows with the whole
 * database rather than with one customer's data (ADR-051's plan check, #186).
 */
@Injectable()
export class LookupService {
  constructor(private readonly tenantDb: TenantDb) {}

  lookup(query: string, held: ReadonlySet<Permission>, locale: Locale) {
    const terms = searchTerms(query);
    const visible = KINDS.filter(({ permission }) => held.has(permission));

    return this.tenantDb.transaction(async (tx, organizationId) => {
      await tx.execute(closeMatchSetting);

      const queries = visible.map(({ kind }) => ({
        kind,
        query: this.find(tx, kind, terms, organizationId, locale),
      }));

      // Exact matches first, every kind.
      const exact = new Map<LookupKind, Row[]>();
      for (const { kind, query } of queries) {
        exact.set(kind, await query([], false, LOOKUP_LIMIT));
      }

      // Close matches only when the lookup as a whole found next to nothing.
      const found = [...exact.values()].reduce(
        (sum, rows) => sum + rows.length,
        0,
      );
      const near = new Map<LookupKind, Row[]>();
      if (found < LOOKUP_LIMIT) {
        for (const { kind, query } of queries) {
          const rows = exact.get(kind) ?? [];
          if (rows.length >= LOOKUP_LIMIT) continue;
          near.set(
            kind,
            await query(
              rows.map((row) => row.id),
              true,
              LOOKUP_LIMIT - rows.length,
            ),
          );
        }
      }

      const groups: LookupGroup[] = [];
      for (const { kind } of queries) {
        const results = [
          ...(exact.get(kind) ?? []).map((row) => ({ ...row, close: false })),
          ...(near.get(kind) ?? []).map((row) => ({ ...row, close: true })),
        ];
        if (results.length > 0) groups.push({ kind, results });
      }

      // With one kind found or none, there is no order to choose.
      if (groups.length < 2) return { groups };

      const prefixes = await tx
        .select({
          documentType: documentNumbering.documentType,
          prefix: documentNumbering.prefix,
        })
        .from(documentNumbering)
        .where(eq(documentNumbering.organizationId, organizationId));
      const shaped = prefixes
        .map(({ documentType, prefix }) => ({
          start: literalStart(prefix).toLowerCase(),
          kind: KIND_OF_SERIES[documentType],
        }))
        .filter(({ start }) => start.length > 0);

      return { groups: ordered(groups, terms, shaped) };
    });
  }

  private find(
    tx: Tx,
    kind: LookupKind,
    terms: SearchTerms,
    organizationId: string,
    locale: Locale,
  ): KindQuery {
    switch (kind) {
      case 'order':
        return pass((exclude, close, limit) =>
          tx
            .select({
              id: orders.id,
              // Ours, which every order has (ADR-071).
              title: orders.number,
              detail: partners.name,
              status: orders.status,
              expiresAt: NONE.expiresAt,
              productId: NONE.productId,
              coverFileId: NONE.coverFileId,
            })
            .from(orders)
            .innerJoin(
              partners,
              and(
                eq(partners.id, orders.partnerId),
                eq(partners.organizationId, organizationId),
              ),
            )
            .where(
              and(
                eq(orders.organizationId, organizationId),
                excluding(orders.id, exclude),
                // The partner through a subquery on orders.partner_id, so
                // both halves stay on orders and indexed (partner-search).
                close
                  ? or(
                      closeMatches(orders.number, terms),
                      closeMatches(orders.reference, terms),
                      partnerMatches(
                        orders.partnerId,
                        terms,
                        organizationId,
                        'close',
                      ),
                    )
                  : or(
                      codeMatches(orders.number, terms),
                      codeMatches(orders.reference, terms),
                      partnerMatches(orders.partnerId, terms, organizationId),
                    ),
              ),
            )
            .orderBy(
              ...(close
                ? [
                    desc(
                      sql`greatest(${closeness(orders.number, terms)}, ${closeness(orders.reference, terms)}, ${closeness(partners.name, terms, 'name')})`,
                    ),
                  ]
                : [
                    sql`least(${matchRank(orders.number, terms)}, ${matchRank(orders.reference, terms)}, ${matchRank(partners.name, terms, 'name')})`,
                  ]),
              desc(orders.id),
            )
            .limit(limit),
        );

      case 'invoice':
        return pass((exclude, close, limit) =>
          tx
            .select({
              id: invoices.id,
              title: sql<string>`${invoices.number}`,
              detail: partners.name,
              status: invoices.status,
              expiresAt: NONE.expiresAt,
              productId: NONE.productId,
              coverFileId: NONE.coverFileId,
            })
            .from(invoices)
            .innerJoin(
              partners,
              and(
                eq(partners.id, invoices.partnerId),
                eq(partners.organizationId, organizationId),
              ),
            )
            .where(
              and(
                eq(invoices.organizationId, organizationId),
                excluding(invoices.id, exclude),
                // A draft has no number yet; the lookup finds by number.
                close
                  ? closeMatches(invoices.number, terms)
                  : codeMatches(invoices.number, terms),
              ),
            )
            .orderBy(
              close
                ? desc(closeness(invoices.number, terms))
                : matchRank(invoices.number, terms),
              desc(invoices.id),
            )
            .limit(limit),
        );

      case 'creditNote':
        return pass((exclude, close, limit) =>
          tx
            .select({
              id: creditNotes.id,
              title: creditNotes.number,
              detail: partners.name,
              status: NONE.status,
              expiresAt: NONE.expiresAt,
              productId: NONE.productId,
              coverFileId: NONE.coverFileId,
            })
            .from(creditNotes)
            .innerJoin(
              partners,
              and(
                eq(partners.id, creditNotes.partnerId),
                eq(partners.organizationId, organizationId),
              ),
            )
            .where(
              and(
                eq(creditNotes.organizationId, organizationId),
                excluding(creditNotes.id, exclude),
                close
                  ? closeMatches(creditNotes.number, terms)
                  : codeMatches(creditNotes.number, terms),
              ),
            )
            .orderBy(
              close
                ? desc(closeness(creditNotes.number, terms))
                : matchRank(creditNotes.number, terms),
              desc(creditNotes.id),
            )
            .limit(limit),
        );

      case 'lot':
        return pass((exclude, close, limit) =>
          tx
            .select({
              id: lots.id,
              title: lots.code,
              detail: productVariants.sku,
              status: NONE.status,
              expiresAt: sql<string | null>`${lots.expiresAt}::text`,
              productId: NONE.productId,
              coverFileId: NONE.coverFileId,
            })
            .from(lots)
            .innerJoin(
              productVariants,
              and(
                eq(productVariants.id, lots.variantId),
                eq(productVariants.organizationId, organizationId),
              ),
            )
            .where(
              and(
                eq(lots.organizationId, organizationId),
                excluding(lots.id, exclude),
                close
                  ? closeMatches(lots.code, terms)
                  : codeMatches(lots.code, terms),
              ),
            )
            .orderBy(
              close
                ? desc(closeness(lots.code, terms))
                : matchRank(lots.code, terms),
              desc(lots.id),
            )
            .limit(limit),
        );

      case 'item': {
        const shown = namesIn(locale, organizationId);
        return pass((exclude, close, limit) =>
          tx
            .select({
              id: productVariants.id,
              // In the reader's language, as every screen names it (ADR-056).
              productName: shown.productName,
              variantName: shown.variantName,
              detail: productVariants.sku,
              status: NONE.status,
              expiresAt: NONE.expiresAt,
              productId: products.id,
              // Its product's cover, as Products shows it (ADR-066).
              coverFileId: coverOf(),
            })
            .from(productVariants)
            .innerJoin(
              products,
              and(
                eq(products.id, productVariants.productId),
                eq(products.organizationId, organizationId),
              ),
            )
            .where(
              and(
                eq(productVariants.organizationId, organizationId),
                excluding(productVariants.id, exclude),
                close
                  ? or(
                      closeMatches(productVariants.sku, terms),
                      closeMatches(products.name, terms, 'name'),
                    )
                  : itemMatches(terms),
              ),
            )
            .orderBy(
              close
                ? desc(
                    sql`greatest(${closeness(productVariants.sku, terms)}, ${closeness(products.name, terms, 'name')})`,
                  )
                : itemRank(terms, locale, organizationId),
              desc(productVariants.id),
            )
            .limit(limit)
            .then((rows) =>
              rows.map(({ productName, variantName, ...row }) => ({
                ...row,
                title: itemName(productName, variantName),
              })),
            ),
        );
      }

      case 'partner':
        return pass((exclude, close, limit) =>
          tx
            .select({
              id: partners.id,
              title: partners.name,
              detail: partners.code,
              status: NONE.status,
              expiresAt: NONE.expiresAt,
              productId: NONE.productId,
              coverFileId: NONE.coverFileId,
            })
            .from(partners)
            .where(
              and(
                eq(partners.organizationId, organizationId),
                excluding(partners.id, exclude),
                close
                  ? closeMatches(partners.name, terms, 'name')
                  : partnerRecordMatches(terms),
              ),
            )
            .orderBy(
              close
                ? desc(closeness(partners.name, terms, 'name'))
                : partnerRank(terms),
              desc(partners.id),
            )
            .limit(limit),
        );

      case 'productionRun':
        return pass((exclude, close, limit) =>
          tx
            .select({
              id: productionOrders.id,
              title: sql<string>`${productionOrders.reference}`,
              detail: productVariants.sku,
              status: productionOrders.status,
              expiresAt: NONE.expiresAt,
              productId: NONE.productId,
              coverFileId: NONE.coverFileId,
            })
            .from(productionOrders)
            .innerJoin(
              productVariants,
              and(
                eq(productVariants.id, productionOrders.outputVariantId),
                eq(productVariants.organizationId, organizationId),
              ),
            )
            .where(
              and(
                eq(productionOrders.organizationId, organizationId),
                excluding(productionOrders.id, exclude),
                close
                  ? closeMatches(productionOrders.reference, terms)
                  : codeMatches(productionOrders.reference, terms),
              ),
            )
            .orderBy(
              close
                ? desc(closeness(productionOrders.reference, terms))
                : matchRank(productionOrders.reference, terms),
              desc(productionOrders.id),
            )
            .limit(limit),
        );

      case 'returnAuthorization':
        return pass((exclude, close, limit) =>
          tx
            .select({
              id: returnAuthorizations.id,
              title: returnAuthorizations.number,
              detail: partners.name,
              status: returnAuthorizations.status,
              expiresAt: NONE.expiresAt,
              productId: NONE.productId,
              coverFileId: NONE.coverFileId,
            })
            .from(returnAuthorizations)
            .innerJoin(
              partners,
              and(
                eq(partners.id, returnAuthorizations.partnerId),
                eq(partners.organizationId, organizationId),
              ),
            )
            .where(
              and(
                eq(returnAuthorizations.organizationId, organizationId),
                excluding(returnAuthorizations.id, exclude),
                close
                  ? closeMatches(returnAuthorizations.number, terms)
                  : codeMatches(returnAuthorizations.number, terms),
              ),
            )
            .orderBy(
              close
                ? desc(closeness(returnAuthorizations.number, terms))
                : matchRank(returnAuthorizations.number, terms),
              desc(returnAuthorizations.id),
            )
            .limit(limit),
        );
    }
  }
}

/** Leaves out the rows the exact pass already found. */
function excluding(column: Parameters<typeof notInArray>[0], ids: string[]) {
  return ids.length > 0 ? notInArray(column, ids) : undefined;
}

/**
 * One kind's query, run exact (close false) or for close matches, leaving
 * out the ids already found, so a typo's results never repeat a real match.
 */
type KindQuery = (
  exclude: string[],
  close: boolean,
  limit: number,
) => Promise<Row[]>;

/** A kind's query builder, typed as a KindQuery. */
function pass(
  query: (
    exclude: string[],
    close: boolean,
    limit: number,
  ) => PromiseLike<Row[]>,
): KindQuery {
  return async (exclude, close, limit) => query(exclude, close, limit);
}

/**
 * The fixed order of kinds, with one exception: a query shaped like a
 * known number, starting with one of the organization's prefixes (the
 * longest that fits, ADR-073), or exactly a lot's code, puts that kind
 * first.
 */
function ordered(
  groups: LookupGroup[],
  terms: SearchTerms,
  shaped: Shaped[],
): LookupGroup[] {
  const query = terms.text.toLowerCase();
  const first =
    shaped
      .filter(({ start }) => query.startsWith(start))
      .sort((a, b) => b.start.length - a.start.length)[0]?.kind ??
    (groups
      .find((group) => group.kind === 'lot')
      ?.results.some(
        (result) =>
          !result.close &&
          result.title.toLowerCase() === terms.text.toLowerCase(),
      )
      ? 'lot'
      : undefined);

  if (!first) return groups;
  return [
    ...groups.filter((group) => group.kind === first),
    ...groups.filter((group) => group.kind !== first),
  ];
}
