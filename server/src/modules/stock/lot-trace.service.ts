import { Injectable, NotFoundException } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import type { Locale } from '../../common/locales';
import { detailOf } from '../../common/movement-reasons';
import { searchTerms } from '../../common/search';
import { dayIn, todayIn } from '../../common/today';
import type { LotExpiry, ReleaseLicenceStatus } from '../../database/schema';
import { requestTimeZone } from '../../database/tenant-context';
import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import type { LotSourceKind } from './dto/lot-trace-response.dto';
import { itemName, namesIn } from './item-name';
import { pathsOf } from './place-paths';
import type { Tx } from './stock.service';
import { usableInLot } from './usable-stock';

/**
 * How far genealogy is followed, in runs. Real recipes are two or three
 * levels deep — an ingredient into a blend into a finished good — so ten is
 * generous, and the limit exists to stop a bad record from looping, not to
 * cut off a real chain.
 */
const MAX_DEPTH = 10;

/**
 * A lot reached from the traced one, through runs and moves between lots.
 * Depth counts the runs alone: a lot reached by moves alone is 0, and has
 * no run.
 */
interface ChainedLot {
  lotId: string;
  code: string;
  sku: string;
  depth: number;
  /** The last run on the way to it; null where only moves lead there. */
  runId: string | null;
  runReference: string | null;
}

/** A lot related to the traced one through production. */
export interface RelatedLot extends ChainedLot {
  /**
   * The run that connects this lot to the one before it in the chain, or
   * for a lot moved out of one that a run made, that run.
   */
  runId: string;
}

/** The lots a run lies between, as Made from and Went into list them. */
function throughRuns(chained: ChainedLot[]): RelatedLot[] {
  return chained.filter(
    (lot): lot is RelatedLot => lot.depth > 0 && lot.runId !== null,
  );
}

/**
 * The recall question, answered for one lot (ADR-044 — lot trace).
 *
 * Everything here is read from the ledger. A lot's story is its movements:
 * a receipt or a production output says where it came from, a consumption
 * says what it went into, a shipment or a sample says who has it, a return
 * says what came back. Runs are the joints between lots — what a run consumed
 * is upstream of what it produced — and following them in both directions is
 * the whole of genealogy. A move between lots is a joint too (ADR-094, R21):
 * the stock is the same under another code, so the trace follows it as if
 * the two lots were one, and a recall reaches whoever received the second.
 *
 * Nothing is stored for this. There is no genealogy table to keep in step,
 * so there is nothing that can disagree with the movements it would describe.
 *
 * Every join names the organization, so a lot, an order or a run another
 * organization holds is never joined, whatever a row says (#627, #649).
 * The users a licence's override names are the exception: a person
 * belongs to no organization, reached here through this one's run.
 */
@Injectable()
export class LotTraceService {
  constructor(private readonly tenantDb: TenantDb) {}

  /**
   * Its item named in the reader's language (ADR-056); where it is now
   * named by place only for a reader who may see places (ADR-093, 96a).
   */
  async trace(lotId: string, locale: Locale, seesPlaces: boolean) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const lot = await this.header(tx, organizationId, lotId, locale);

      // One after another: a transaction is one connection, and queries on
      // it run in turn whatever the code says, so Promise.all would only
      // pretend to be parallel.
      const { balances, usable, notUsable } = await this.whereItIsNow(
        tx,
        organizationId,
        lotId,
        seesPlaces,
      );
      const sources = await this.sources(tx, organizationId, lotId);
      const upstream = await this.related(tx, organizationId, lotId, 'up');
      const downstream = await this.related(tx, organizationId, lotId, 'down');

      /**
       * Recipients of this lot, of everything made from it, and of every lot
       * its stock moved into (ADR-094, R21). A customer who received a
       * finished batch made from a bad ingredient, or the part of a lot
       * moved under another code, is exactly who a recall has to reach,
       * though the first lot's own movements never mention them.
       */
      const recipients = await this.recipients(tx, organizationId, [
        lotId,
        ...downstream.map((related) => related.lotId),
      ]);

      return {
        lot,
        balances,
        usable,
        notUsable,
        sources,
        madeFrom: throughRuns(upstream),
        wentInto: throughRuns(downstream),
        recipients,
      };
    });
  }

  /**
   * Lots whose code contains what was typed, across every product. A recall
   * usually arrives as part of a code — the batch number or date people
   * remember, "2609" from "FOC-2609-01" — with no product attached, and the
   * same code can exist for two products, so every match is returned with
   * its SKU rather than guessing.
   *
   * Codes that start with the text come first, so typing a prefix still puts
   * the obvious match on top. % and _ are escaped so they match themselves.
   *
   * Anywhere-in cannot use an ordinary index; lots_code_trgm_idx, a trigram
   * index (ADR-056, migration 0042), serves it, led by the organization
   * since migration 0077 (ADR-051, the amendment for #225 and #276), so it
   * reads only this organization's matching lots. That index hands back the
   * matches unordered, so every one is joined before the sort, and the join
   * carries the organization: without it, Postgres read every
   * organization's variants to join this one's lots (ADR-051's plan check,
   * #187).
   */
  async search(code: string) {
    // Escaped and trimmed as every search is (ADR-056, common/search.ts).
    const { anywhere, prefix } = searchTerms(code);

    return this.tenantDb.transaction(async (tx, organizationId) => {
      const rows = (
        await tx.execute(sql`
          select l.id, l.code, l.expires_at, pv.sku
          from lots l
          join product_variants pv
            on pv.id = l.variant_id
            and pv.organization_id = ${organizationId}::uuid
          where l.organization_id = ${organizationId}::uuid
            and l.code ilike ${anywhere}
          order by (l.code ilike ${prefix}) desc, l.code, pv.sku
          limit 20
        `)
      ).rows as {
        id: string;
        code: string;
        expires_at: string | null;
        sku: string;
      }[];

      return rows.map((row) => ({
        id: row.id,
        code: row.code,
        expiresAt: row.expires_at,
        sku: row.sku,
      }));
    });
  }

  private async header(
    tx: Tx,
    organizationId: string,
    lotId: string,
    locale: Locale,
  ) {
    const shown = namesIn(locale, organizationId, {
      product: 'pr',
      variant: 'pv',
    });
    const [row] = (
      await tx.execute(sql`
        select
          l.id,
          l.code,
          l.expires_at,
          l.expiry,
          l.is_assigned,
          l.supplier_lot,
          l.variant_id,
          pv.product_id,
          pv.sku,
          pv.unit_of_measure,
          ${shown.productName} as product_name,
          ${shown.variantName} as variant_name
        from lots l
        join product_variants pv
          on pv.id = l.variant_id and pv.organization_id = ${organizationId}::uuid
        join products pr
          on pr.id = pv.product_id and pr.organization_id = ${organizationId}::uuid
        where l.organization_id = ${organizationId}::uuid
          and l.id = ${lotId}::uuid
      `)
    ).rows as {
      id: string;
      code: string;
      expires_at: string | null;
      expiry: LotExpiry;
      is_assigned: boolean;
      supplier_lot: string | null;
      variant_id: string;
      product_id: string;
      sku: string;
      unit_of_measure: string;
      product_name: string;
      variant_name: string | null;
    }[];

    // Scoped by organization, so another tenant's lot is simply not found.
    if (!row)
      throw new NotFoundException(
        t({ id: 'stock.suchLot', defaultMessage: 'No such lot' }),
      );

    return {
      id: row.id,
      code: row.code,
      expiresAt: row.expires_at,
      expiry: row.expiry,
      isAssigned: row.is_assigned,
      supplierLot: row.supplier_lot,
      variantId: row.variant_id,
      productId: row.product_id,
      sku: row.sku,
      unitOfMeasure: row.unit_of_measure,
      description: itemName(row.product_name, row.variant_name),
    };
  }

  /**
   * Where it is now, including bins marked unavailable (ADR-042), each
   * place with something left: by its path, its warehouse first (#639),
   * for a reader who may see places; its id and figures alone for the
   * rest (ADR-093, 96a), as Stock leaves them out. Beside them, the lot in
   * two sums by the usable rule's reading for one lot, usableInLot
   * (ADR-093, 10a): usable, and not. Summed here, never in the browser
   * (ADR-055), for a reader who may not see the places (96a); read once
   * with the places, never a copy of the rule (review 27).
   */
  private async whereItIsNow(
    tx: Tx,
    organizationId: string,
    lotId: string,
    seesPlaces: boolean,
  ) {
    const today = todayIn(requestTimeZone());
    const rows = (
      await tx.execute(sql`
        select
          u.location_id,
          u.location_name,
          u.location_code,
          u.is_available,
          u.quantity::text as quantity,
          u.quantity <> 0 as is_here,
          coalesce(sum(u.usable) over (), 0)::text as usable,
          coalesce(sum(u.not_usable) over (), 0)::text as not_usable
        from (${usableInLot(organizationId, today, lotId)}) u
        order by u.location_name
      `)
    ).rows as {
      location_id: string;
      location_name: string;
      location_code: string | null;
      is_available: boolean;
      quantity: string;
      is_here: boolean;
      usable: string;
      not_usable: string;
    }[];
    const here = rows.filter((row) => row.is_here);

    const pathOf = seesPlaces
      ? await pathsOf(
          tx,
          organizationId,
          here.map((row) => row.location_id),
        )
      : new Map<string, string[]>();

    return {
      balances: here.map((row) => ({
        locationId: row.location_id,
        locationName: seesPlaces ? row.location_name : null,
        locationCode: seesPlaces ? row.location_code : null,
        locationPath: pathOf.get(row.location_id) ?? [],
        isAvailable: row.is_available,
        quantity: row.quantity,
      })),
      // The same on every row; nothing anywhere, none.
      usable: rows[0]?.usable ?? '0',
      notUsable: rows[0]?.not_usable ?? '0',
    };
  }

  /**
   * How the lot came into existence: received, made in a run, or moved into
   * it from another lot. A receipt entered by hand has no order, and says so
   * rather than being left out — a gap in the trail is itself worth knowing;
   * it names why it came and whom from where it was given (ADR-094, E2).
   *
   * A run says what licence it was made under, its state at release, and
   * who overrode the policy and why (ADR-050): the first questions a
   * regulator asks about a batch, answered where the recall starts.
   *
   * A lot change into it says which (ADR-094, R21): a move names the lot it
   * came from, whose page goes on up the trail; the start lot's stock on
   * hand when lot tracking started, and stock back from before it, name
   * none, as there was no lot.
   */
  private async sources(tx: Tx, organizationId: string, lotId: string) {
    const rows = (
      await tx.execute(sql`
        select
          sm.reason,
          sm.reason_detail,
          min(sm.created_at) as first_at,
          sum(sm.quantity)::text as quantity,
          o.id as order_id,
          o.number as order_number,
          o.reference as order_reference,
          p.id as partner_id,
          p.name as partner_name,
          fl.id as from_lot_id,
          fl.code as from_lot_code,
          po.id as run_id,
          po.reference as run_reference,
          po.licence_id,
          po.licence_number,
          po.licence_authority,
          po.licence_status_at_release,
          po.licence_override_reason,
          u.name as licence_overridden_by_name
        from stock_movements sm
        left join orders o
          on sm.reference_type = 'purchase_order'
          and o.id = sm.reference_id
          and o.organization_id = ${organizationId}::uuid
        left join partners p
          on p.id = coalesce(
            o.partner_id,
            case when sm.reference_type = 'partner' then sm.reference_id end
          )
          and p.organization_id = ${organizationId}::uuid
        left join lots fl
          on sm.reason = 'lot_change'
          and fl.id = sm.lot_id
          and fl.organization_id = ${organizationId}::uuid
        left join production_orders po
          on sm.reference_type = 'production_order'
          and po.id = sm.reference_id
          and po.organization_id = ${organizationId}::uuid
        left join users u on u.id = po.licence_overridden_by
        where sm.organization_id = ${organizationId}::uuid
          and (
            (sm.lot_id = ${lotId}::uuid and sm.reason in ('receipt', 'production'))
            or (sm.to_lot_id = ${lotId}::uuid and sm.reason = 'lot_change')
          )
        group by sm.reason, sm.reason_detail, o.id, o.number, o.reference,
          p.id, p.name, fl.id, fl.code, po.id, po.reference,
          po.licence_id, po.licence_number, po.licence_authority,
          po.licence_status_at_release, po.licence_override_reason, u.name
        order by first_at
      `)
    ).rows as {
      reason: LotSourceKind;
      reason_detail: string | null;
      first_at: Date;
      quantity: string;
      order_id: string | null;
      order_number: string | null;
      order_reference: string | null;
      partner_id: string | null;
      partner_name: string | null;
      from_lot_id: string | null;
      from_lot_code: string | null;
      run_id: string | null;
      run_reference: string | null;
      licence_id: string | null;
      licence_number: string | null;
      licence_authority: string | null;
      licence_status_at_release: ReleaseLicenceStatus | null;
      licence_override_reason: string | null;
      licence_overridden_by_name: string | null;
    }[];

    return rows.map((row) => ({
      kind: row.reason,
      reasonDetail: detailOf(row.reason_detail),
      at: row.first_at,
      quantity: row.quantity,
      orderId: row.order_id,
      orderNumber: row.order_number,
      orderReference: row.order_reference,
      partnerId: row.partner_id,
      supplierName: row.partner_name,
      fromLotId: row.from_lot_id,
      fromLotCode: row.from_lot_code,
      runId: row.run_id,
      runReference: row.run_reference,
      licenceId: row.licence_id,
      licenceNumber: row.licence_number,
      licenceAuthority: row.licence_authority,
      licenceStatusAtRelease: row.licence_status_at_release,
      licenceOverrideReason: row.licence_override_reason,
      licenceOverriddenByName: row.licence_overridden_by_name,
    }));
  }

  /**
   * Lots connected through production and moves between lots, followed as
   * far as they go.
   *
   * Up: the runs that produced this lot, then what those runs consumed, then
   * the runs that produced those, and so on. Down: the runs that consumed
   * this lot, then what they produced, and on. Each step starts from the lots
   * already found and reaches the next through two indexes — by lot, then by
   * reference — so the work grows with the size of the trace, not the ledger.
   *
   * A move between lots is a step too (ADR-094, R21): down, into the lot it
   * entered; up, from the lot it left, by the lot change's index on the lot
   * it enters. It is the same stock under another code, so it adds no depth
   * and keeps the run that led to it: a lot moved out of a batch is as many
   * runs away as the batch, through the same run. A lot reached by moves
   * alone is at depth 0, with no run.
   *
   * UNION rather than UNION ALL: a lot issued in several transfers appears in
   * several movements of one run, and without deduplication each would
   * multiply the rows of every step after it. Each row is a lot at a depth
   * through a run, so a lot reached again the same way, by a move back or
   * by a bad record's loop of moves, adds nothing and the walk ends; a loop
   * through runs ends at the depth limit. Each row of the traced lot itself
   * is left out at the end.
   */
  private async related(
    tx: Tx,
    organizationId: string,
    lotId: string,
    direction: 'up' | 'down',
  ): Promise<ChainedLot[]> {
    // Down: this lot is consumed, and the run's output is the next lot.
    // Up: this lot is produced, and the run's consumption is the next lot.
    const [near, far] =
      direction === 'down'
        ? (['consumption', 'production'] as const)
        : (['production', 'consumption'] as const);

    // Down: the lot a lot change out of this one entered. Up: the lot a lot
    // change into this one left, none as lot tracking started or for stock
    // from before it.
    const moved =
      direction === 'down'
        ? sql`
            select lc.to_lot_id as lot_id, 0 as runs, null::uuid as run_id
            from stock_movements lc
            where lc.organization_id = ${organizationId}::uuid
              and lc.lot_id = chain.lot_id
              and lc.reason = 'lot_change'
          `
        : sql`
            select lc.lot_id, 0 as runs, null::uuid as run_id
            from stock_movements lc
            where lc.organization_id = ${organizationId}::uuid
              and lc.to_lot_id = chain.lot_id
              and lc.reason = 'lot_change'
              and lc.lot_id is not null
          `;

    const rows = (
      await tx.execute(sql`
        with recursive chain(lot_id, depth, run_id) as (
          select ${lotId}::uuid, 0, null::uuid
          union
          select step.lot_id, chain.depth + step.runs, coalesce(step.run_id, chain.run_id)
          from chain
          cross join lateral (
            select next.lot_id, 1 as runs, here.reference_id as run_id
            from stock_movements here
            join stock_movements next
              on next.organization_id = ${organizationId}::uuid
             and next.reference_type = 'production_order'
             and next.reference_id = here.reference_id
             and next.reason = ${far}
             and next.lot_id is not null
            where here.organization_id = ${organizationId}::uuid
              and here.lot_id = chain.lot_id
              and here.reference_type = 'production_order'
              and here.reason = ${near}
            union all
            ${moved}
          ) step
          where chain.depth < ${MAX_DEPTH}
        )
        select distinct on (chain.lot_id)
          chain.lot_id,
          chain.depth,
          chain.run_id,
          l.code,
          pv.sku,
          po.reference as run_reference
        from chain
        join lots l
          on l.id = chain.lot_id and l.organization_id = ${organizationId}::uuid
        join product_variants pv
          on pv.id = l.variant_id and pv.organization_id = ${organizationId}::uuid
        left join production_orders po
          on po.id = chain.run_id and po.organization_id = ${organizationId}::uuid
        where chain.lot_id <> ${lotId}::uuid
        order by chain.lot_id, chain.depth
      `)
    ).rows as {
      lot_id: string;
      depth: number;
      run_id: string | null;
      code: string;
      sku: string;
      run_reference: string | null;
    }[];

    return rows
      .map((row) => ({
        lotId: row.lot_id,
        code: row.code,
        sku: row.sku,
        depth: Number(row.depth),
        runId: row.run_id,
        runReference: row.run_reference,
      }))
      .sort((a, b) => a.depth - b.depth || a.code.localeCompare(b.code));
  }

  /**
   * Everyone who received any of these lots, and what came back.
   *
   * A shipment reaches its customer through its order; a sample through the
   * recipient it was checked against (ADR-042); a return through its order. A
   * shipment or sample with no recipient on record is kept, with the partner
   * left empty: a recall has to know how much went somewhere it cannot name.
   * A voided shipment is left out: it was recorded, but nothing left. Each
   * says the day it first left for them, as a recall letter needs.
   */
  private async recipients(tx: Tx, organizationId: string, lotIds: string[]) {
    const ids = sql.join(
      lotIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    );

    const rows = (
      await tx.execute(sql`
        select
          p.id as partner_id,
          p.name as partner_name,
          o.id as order_id,
          o.number as order_number,
          o.reference as order_reference,
          o.is_sample,
          l.id as lot_id,
          l.code as lot_code,
          l.supplier_lot as lot_supplier_lot,
          l.is_assigned as lot_is_assigned,
          sm.sku,
          coalesce(sum(sm.quantity) filter (where sm.reason = 'shipment'), 0)::text as shipped,
          coalesce(sum(sm.quantity) filter (where sm.reason = 'sample'), 0)::text as sampled,
          coalesce(sum(sm.quantity) filter (where sm.reason = 'return'), 0)::text as returned,
          min(sm.created_at) filter (where sm.reason in ('shipment', 'sample')) as left_at
        from stock_movements sm
        join lots l
          on l.id = sm.lot_id and l.organization_id = ${organizationId}::uuid
        left join shipments s
          on sm.reference_type = 'shipment'
          and s.id = sm.reference_id
          and s.organization_id = ${organizationId}::uuid
        left join order_returns r
          on sm.reference_type = 'order_return'
          and r.id = sm.reference_id
          and r.organization_id = ${organizationId}::uuid
        left join orders o
          on o.id = coalesce(s.order_id, r.order_id)
          and o.organization_id = ${organizationId}::uuid
        left join partners p
          on p.id = coalesce(
            o.partner_id,
            case when sm.reference_type = 'partner' then sm.reference_id end
          )
          and p.organization_id = ${organizationId}::uuid
        where sm.organization_id = ${organizationId}::uuid
          and sm.lot_id in (${ids})
          and sm.reason in ('shipment', 'sample', 'return')
          -- A voided shipment never left (ADR-041), so its customer did not
          -- receive anything. True for samples and returns, which have no
          -- shipment row to join.
          and s.voided_at is null
        group by p.id, p.name, o.id, o.number, o.reference, o.is_sample,
          l.id, l.code, l.supplier_lot, l.is_assigned, sm.sku
        order by p.name nulls last, o.number nulls last, l.code
      `)
    ).rows as {
      partner_id: string | null;
      partner_name: string | null;
      order_id: string | null;
      order_number: string | null;
      order_reference: string | null;
      is_sample: boolean | null;
      lot_id: string;
      lot_code: string;
      lot_supplier_lot: string | null;
      lot_is_assigned: boolean;
      sku: string;
      shipped: string;
      sampled: string;
      returned: string;
      left_at: Date | string | null;
    }[];

    const timeZone = requestTimeZone();

    return rows.map((row) => ({
      partnerId: row.partner_id,
      partnerName: row.partner_name,
      orderId: row.order_id,
      orderNumber: row.order_number,
      orderReference: row.order_reference,
      isSampleOrder: row.is_sample ?? false,
      lotId: row.lot_id,
      lotCode: row.lot_code,
      lotSupplierLot: row.lot_supplier_lot,
      lotIsAssigned: row.lot_is_assigned,
      sku: row.sku,
      shipped: row.shipped,
      sampled: row.sampled,
      returned: row.returned,
      // The organization's day it first left for them (ADR-044, amended).
      leftOn: row.left_at ? dayIn(timeZone, row.left_at) : null,
    }));
  }
}
