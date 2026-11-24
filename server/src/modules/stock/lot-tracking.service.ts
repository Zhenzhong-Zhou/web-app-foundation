import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { recordContext } from '../../core/audit/audit-context';
import type { ProductType } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import type {
  LotTrackingQuestion,
  LotTrackingStarted,
} from './dto/lot-tracking-response.dto';
import type { StartLotTrackingDto } from './dto/start-lot-tracking.dto';
import { pathsOf } from './place-paths';
import { TRACKING_STARTED } from './start-lot';
import { expiryOf, StockService, type Tx } from './stock.service';

/** A code as the start reads it. */
type CodeRow = {
  id: string;
  sku: string;
  tracks_lots: boolean;
  type: ProductType;
};

/** A place holding the code's stock, none of it in a lot yet. */
type PlaceRow = {
  location_id: string;
  location_name: string;
  location_code: string | null;
  quantity: string;
  on_hand: string;
};

type RunRow = {
  id: string;
  reference: string | null;
  makes: boolean;
};

/**
 * Start tracking lots for a code that did not (ADR-094, R13 to R18): the
 * question's read, and the one write. Under `products.update` and
 * `stock.adjust`, the route's; never for equipment, never twice, and
 * never undone: nothing turns lot tracking off.
 */
@Injectable()
export class LotTrackingService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly stock: StockService,
  ) {}

  /**
   * What the question says (R14): the places holding the code's stock and
   * how much each, and the runs in progress that use or make it, each to
   * close against the lot (Q2a), listed for a reader who may see runs.
   */
  question(
    productId: string,
    variantId: string,
    sight: { runs: boolean },
  ): Promise<LotTrackingQuestion> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const code = await codeToStart(tx, organizationId, productId, variantId);
      const places = await placesOf(tx, organizationId, variantId);
      const paths = await pathsOf(
        tx,
        organizationId,
        places.map((place) => place.location_id),
      );
      const runs = await runsOf(tx, organizationId, variantId);

      return {
        variantId,
        sku: code.sku,
        onHand: places[0]?.on_hand ?? '0.0000',
        places: places.map((place) => ({
          locationId: place.location_id,
          locationName: place.location_name,
          locationCode: place.location_code,
          locationPath: paths.get(place.location_id) ?? [],
          quantity: place.quantity,
        })),
        runCount: runs.length,
        runs: sight.runs ? runs : null,
      };
    });
  }

  /**
   * One write (R15 to R17): the code tracks lots from now on; with stock
   * on hand, one lot made for us takes it, noted `tracking_started`, with
   * the supplier's lot and the expiry when known, by a `lots_started` lot
   * change at each place, and the code's whole cost history goes with it:
   * its pool and every value row take the lot's id, their values and dates
   * untouched (3a). With nothing on hand, nothing else is written; stock
   * coming back from before is put in a lot then (Q4a).
   *
   * The code's row is locked `for update` first, and every movement reads
   * it `for share` (recordWithin), so no movement of the code is half way
   * while its stock is moved: a receipt begun before commits first and its
   * stock goes into the lot; one begun after asks for a lot.
   */
  start(
    productId: string,
    variantId: string,
    dto: StartLotTrackingDto,
    actorId: string,
  ): Promise<LotTrackingStarted> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const code = await codeToStart(tx, organizationId, productId, variantId, {
        lock: true,
      });
      // Nothing said of it, not known yet: stock nobody checked is not
      // said to last for ever, and is listed under Details to add until
      // someone gives the day or says it does not expire (ADR-094, S6).
      const expiry = expiryOf({
        expiry: dto.expiry ?? (dto.expiresAt ? 'date' : 'unknown'),
        expiresAt: dto.expiresAt,
      });
      recordContext({ sku: code.sku });

      await tx.execute(sql`
        update product_variants
        set tracks_lots = true
        where id = ${variantId}::uuid
          and organization_id = ${organizationId}::uuid
      `);

      const places = await placesOf(tx, organizationId, variantId);
      if (places.length === 0) return { lot: null };

      const lot = await this.stock.makeLot(tx, organizationId, variantId, {
        ...expiry,
        supplierLot: dto.supplierLot || null,
        note: TRACKING_STARTED,
      });

      /**
       * The one write that relabels the value ledger (ADR-048, amended):
       * the pool first, whose row a cost given meanwhile locks, so its
       * value rows are read after that cost has committed. Every value row
       * with no lot is the code's, from before tracking: a lot exactly
       * when the variant tracks lots.
       */
      await tx.execute(sql`
        update valuation_pools
        set lot_id = ${lot.id}::uuid
        where organization_id = ${organizationId}::uuid
          and variant_id = ${variantId}::uuid
          and lot_id is null
      `);
      await tx.execute(sql`
        update stock_valuations
        set lot_id = ${lot.id}::uuid
        where organization_id = ${organizationId}::uuid
          and variant_id = ${variantId}::uuid
          and lot_id is null
      `);

      // One movement a place, none into the lot, counted in neither In
      // nor Out (R16); the movements before keep no lot, as they were.
      for (const place of places) {
        await this.stock.recordWithin(
          tx,
          organizationId,
          {
            variantId,
            lotId: null,
            toLotId: lot.id,
            fromLocationId: place.location_id,
            toLocationId: place.location_id,
            quantity: place.quantity,
            reason: 'lot_change',
            reasonDetail: 'lots_started',
          },
          actorId,
        );
      }

      recordContext({ lotId: { id: lot.id, label: lot.code } });
      return { lot };
    });
  }
}

/**
 * The code, one of this item's in this organization, as one whose lot
 * tracking may start: 404 for another's, 409 for equipment, which is
 * counted where it stands and never by lot (ADR-092), and for a code that
 * tracks lots already. Locked `for update` for the write.
 */
async function codeToStart(
  tx: Tx,
  organizationId: string,
  productId: string,
  variantId: string,
  options: { lock?: boolean } = {},
): Promise<CodeRow> {
  const org = sql`${organizationId}::uuid`;
  const { rows } = await tx.execute<CodeRow>(sql`
    select pv.id, pv.sku, pv.tracks_lots, p.type
    from product_variants pv
    join products p on p.id = pv.product_id and p.organization_id = ${org}
    where pv.id = ${variantId}::uuid
      and pv.product_id = ${productId}::uuid
      and pv.organization_id = ${org}
    ${options.lock ? sql`for update of pv` : sql``}
  `);
  const [code] = rows;

  if (!code) {
    throw new NotFoundException(
      t({ id: 'products.suchVariant', defaultMessage: 'No such variant' }),
    );
  }

  if (code.type === 'equipment') {
    throw new ConflictException(
      t(
        {
          id: 'stock.lotTrackingNotForEquipment',
          defaultMessage:
            '{sku} is equipment, counted where it stands and never by lot. To track its lots, change the item’s type first.',
        },
        { sku: code.sku },
      ),
    );
  }

  if (code.tracks_lots) {
    throw new ConflictException(
      t(
        {
          id: 'stock.lotTrackingAlready',
          defaultMessage:
            '{sku} tracks lots already. Reload the page to see its lots.',
        },
        { sku: code.sku },
      ),
    );
  }

  return code;
}

/**
 * The places holding the code's stock, by name, with all of it beside
 * each: before its tracking starts none of it is in a lot.
 */
async function placesOf(
  tx: Tx,
  organizationId: string,
  variantId: string,
): Promise<PlaceRow[]> {
  const org = sql`${organizationId}::uuid`;
  const { rows } = await tx.execute<PlaceRow>(sql`
    select sl.location_id, l.name as location_name,
           l.code as location_code, sl.quantity,
           sum(sl.quantity) over () as on_hand
    from stock_levels sl
    join locations l on l.id = sl.location_id and l.organization_id = ${org}
    where sl.organization_id = ${org}
      and sl.variant_id = ${variantId}::uuid
      and sl.lot_id is null
      and sl.quantity > 0
    order by l.name, l.id
  `);
  return rows;
}

/**
 * Runs released and not yet closed that make the code, or use it on a
 * line stocked from a place: an external line moves nothing (ADR-030).
 */
async function runsOf(
  tx: Tx,
  organizationId: string,
  variantId: string,
): Promise<RunRow[]> {
  const org = sql`${organizationId}::uuid`;
  const variant = sql`${variantId}::uuid`;
  const { rows } = await tx.execute<RunRow>(sql`
    select po.id, po.reference, po.output_variant_id = ${variant} as makes
    from production_orders po
    where po.organization_id = ${org}
      and po.status = 'released'
      and (
        po.output_variant_id = ${variant}
        or exists (
          select 1
          from production_order_lines pl
          where pl.organization_id = ${org}
            and pl.production_order_id = po.id
            and pl.component_variant_id = ${variant}
            and pl.supply_type = 'stocked'
        )
      )
    order by po.created_at, po.id
  `);
  return rows;
}
