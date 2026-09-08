import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, gt, sql } from 'drizzle-orm';

import { isCheckViolation } from '../../database/errors';
import type { MovementReason } from '../../database/schema';
import {
  locations,
  lots,
  productVariants,
  stockLevels,
  stockMovements,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';

/**
 * Reasons that only ever add stock, and reasons that only ever remove it.
 *
 * Direction is not a column (ADR-023) — it is which location is set. This
 * table is what maps a reason onto that, so a controller passing
 * `reason: 'shipment'` with a `toLocationId` is rejected here rather than
 * quietly recorded as an inbound movement.
 */
const INBOUND: ReadonlySet<MovementReason> = new Set([
  'receipt',
  'production',
  'return',
]);

const OUTBOUND: ReadonlySet<MovementReason> = new Set([
  'shipment',
  'consumption',
  'sample',
]);

/** The transaction handle TenantDb hands its callback. */
type Tx = Parameters<Parameters<TenantDb['transaction']>[0]>[0];

export interface RecordMovementInput {
  variantId: string;
  /** An existing lot. Mutually exclusive with `lot`. */
  lotId?: string | null;
  /** A lot arriving with the shipment, created if its code is new. */
  lot?: {
    code: string;
    expiresAt?: string;
    isAssigned?: boolean;
  } | null;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  /** A positive decimal string. Never a number — see ADR-025. */
  quantity: string;
  reason: MovementReason;
  reasonDetail?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  note?: string | null;
}

export interface ListStockFilters {
  locationId?: string;
  variantId?: string;
  includeEmpty?: string;
}

@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  constructor(private readonly tenantDb: TenantDb) {}

  /**
   * Current stock, optionally narrowed to one location or one variant.
   *
   * Reads the cache and never aggregates the ledger (ADR-025). The join is
   * three tables deep — variant for the SKU, location for the name, lot for the
   * code — which `TenantDb.selectJoined` does not express, so this drops to a
   * raw handle. The scope is applied by hand as a result; that is the cost of
   * the escape hatch and the reason it is one query rather than the default.
   *
   * Extending TenantDb to take several joins is the real answer and is not
   * worth designing around a single caller.
   */
  list(filters: ListStockFilters = {}) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const scope = [eq(stockLevels.organizationId, organizationId)];

      if (filters.locationId) {
        scope.push(eq(stockLevels.locationId, filters.locationId));
      }

      if (filters.variantId) {
        scope.push(eq(stockLevels.variantId, filters.variantId));
      }

      /**
       * Zero rows are kept, not deleted — a shelf that emptied yesterday is a
       * fact worth having, and `LocationsService` depends on the row surviving
       * so an emptied leaf can still gain children. But "what is on this shelf"
       * means what is there, so they are hidden unless asked for.
       */
      if (filters.includeEmpty !== 'true') {
        scope.push(gt(stockLevels.quantity, '0'));
      }

      return (
        tx
          .select({
            variantId: stockLevels.variantId,
            sku: productVariants.sku,
            variantName: productVariants.name,
            unitOfMeasure: productVariants.unitOfMeasure,
            locationId: stockLevels.locationId,
            locationName: locations.name,
            locationCode: locations.code,
            lotId: stockLevels.lotId,
            lotCode: lots.code,
            lotExpiresAt: lots.expiresAt,
            quantity: stockLevels.quantity,
          })
          .from(stockLevels)
          .innerJoin(
            productVariants,
            eq(productVariants.id, stockLevels.variantId),
          )
          .innerJoin(locations, eq(locations.id, stockLevels.locationId))
          // Left, because lot_id is null for every untracked variant and an
          // inner join would silently drop most of the warehouse.
          .leftJoin(lots, eq(lots.id, stockLevels.lotId))
          .where(and(...scope))
          .orderBy(asc(locations.name), asc(productVariants.sku))
      );
    });
  }

  /**
   * The one path that changes a quantity. Every reason goes through it, because
   * the validation and the locking are identical and only the direction
   * differs — a second write path is the moment the ledger stops being
   * authoritative (ADR-023).
   */
  async record(input: RecordMovementInput, actorId: string) {
    const direction = this.resolveDirection(input);

    /**
     * Checked here rather than left to the check constraint, which would
     * surface as a 500 — nothing catches a violation on the movement insert,
     * only on the stock_levels upsert. The constraint stays as the backstop.
     */
    if (input.reason === 'adjustment' && !input.note?.trim()) {
      throw new BadRequestException(
        'An adjustment needs a note saying what was found',
      );
    }

    return this.tenantDb.transaction(async (tx, organizationId) => {
      const [variant] = await tx
        .select()
        .from(productVariants)
        .where(
          and(
            eq(productVariants.id, input.variantId),
            eq(productVariants.organizationId, organizationId),
          ),
        );

      if (!variant) throw new NotFoundException('No such variant');

      const lotId = await this.resolveLot(tx, organizationId, variant, input);

      /**
       * Locked in a deterministic order, sorted by location id.
       *
       * A transfer touches two rows. Two concurrent transfers, A→B and B→A,
       * that each grab their source first will deadlock — rare in testing,
       * reliable under load. Sorting means both transactions always take the
       * same row first, so one waits instead of dying.
       */
      const touched = [
        ...(direction.from
          ? [{ locationId: direction.from, delta: `-${input.quantity}` }]
          : []),
        ...(direction.to
          ? [{ locationId: direction.to, delta: input.quantity }]
          : []),
      ].sort((a, b) => a.locationId.localeCompare(b.locationId));

      for (const { locationId, delta } of touched) {
        await this.assertUsableLeaf(tx, organizationId, locationId);
        await this.applyDelta(tx, organizationId, {
          variantId: input.variantId,
          locationId,
          lotId,
          delta,
        });
      }

      const [movement] = await tx
        .insert(stockMovements)
        .values({
          organizationId,
          variantId: input.variantId,
          // Snapshot, not a join: a SKU rename must not rewrite history
          // (ADR-023).
          sku: variant.sku,
          lotId,
          fromLocationId: direction.from,
          toLocationId: direction.to,
          quantity: input.quantity,
          reason: input.reason,
          reasonDetail: input.reasonDetail ?? null,
          referenceType: input.referenceType ?? null,
          referenceId: input.referenceId ?? null,
          note: input.note ?? null,
          actorId,
        })
        .returning();

      this.logger.log(
        `Movement ${movement.id}: ${input.reason} ${input.quantity} of ${variant.sku}`,
      );

      return movement;
    });
  }

  /**
   * Maps a reason onto the two location columns, rejecting combinations the
   * database would accept but that mean nothing.
   *
   * `stock_movements_has_location_check` catches a movement with neither
   * location set; it cannot catch a shipment recorded as inbound, because both
   * are structurally valid rows.
   */
  private resolveDirection(input: RecordMovementInput): {
    from: string | null;
    to: string | null;
  } {
    const from = input.fromLocationId ?? null;
    const to = input.toLocationId ?? null;

    if (input.reason === 'transfer') {
      if (!from || !to) {
        throw new BadRequestException(
          'A transfer needs both a source and a destination location',
        );
      }
      return { from, to };
    }

    if (INBOUND.has(input.reason)) {
      if (!to || from) {
        throw new BadRequestException(
          `A ${input.reason} needs a destination location and no source`,
        );
      }
      return { from: null, to };
    }

    if (OUTBOUND.has(input.reason)) {
      if (!from || to) {
        throw new BadRequestException(
          `A ${input.reason} needs a source location and no destination`,
        );
      }
      return { from, to: null };
    }

    // An adjustment is the only reason that goes either way: a miscount can
    // reveal more on the shelf than recorded, or less.
    if (!from === !to) {
      throw new BadRequestException(
        'An adjustment needs exactly one of a source or a destination',
      );
    }

    return { from, to };
  }

  /**
   * Enforces the invariant from ADR-023 — a lot is present exactly when the
   * variant tracks lots — and returns the id to use, creating the lot when one
   * arrived with the shipment.
   *
   * A check constraint cannot see across tables, so this lives here and is
   * asserted in e2e. Without it a variant ends up with some lotted rows and
   * some not, and no query can answer how much exists.
   *
   * Creating the lot here rather than through its own endpoint is deliberate:
   * a lot has no independent existence, it arrives printed on a box. A separate
   * call would leave an orphan row every time the movement then failed.
   */
  private async resolveLot(
    tx: Tx,
    organizationId: string,
    variant: typeof productVariants.$inferSelect,
    input: RecordMovementInput,
  ): Promise<string | null> {
    const supplied = input.lotId ?? input.lot ?? null;

    if (variant.tracksLots && !supplied) {
      throw new BadRequestException(
        `${variant.sku} is lot tracked, so this movement needs a lot`,
      );
    }

    if (!variant.tracksLots && supplied) {
      throw new BadRequestException(
        `${variant.sku} is not lot tracked, so this movement cannot have a lot`,
      );
    }

    if (input.lotId && input.lot) {
      throw new BadRequestException(
        'Give either an existing lot or a new one, not both',
      );
    }

    if (!supplied) return null;

    if (input.lotId) {
      // Scoped to the variant as well as the organization: a lot belongs to one
      // variant, and attaching another's would make a recall return the wrong
      // units.
      const [lot] = await tx
        .select()
        .from(lots)
        .where(
          and(
            eq(lots.id, input.lotId),
            eq(lots.organizationId, organizationId),
            eq(lots.variantId, variant.id),
          ),
        );

      if (!lot) throw new BadRequestException('Unknown lot for this variant');
      return lot.id;
    }

    const incoming = input.lot!;

    /**
     * Create or reuse, by code. A second delivery of lot L2024-A is the same
     * lot with more units, not a unique-key collision.
     *
     * DO UPDATE rather than DO NOTHING, because DO NOTHING returns no row on
     * conflict and a follow-up SELECT to find the existing one reopens the race
     * this closes. Touching updated_at is a no-op write that returns the id in
     * one statement.
     *
     * expiresAt is deliberately not updated: a later delivery of the same run
     * does not get to rewrite the expiry of units already on the shelf.
     */
    const [lot] = await tx
      .insert(lots)
      .values({
        organizationId,
        variantId: variant.id,
        code: incoming.code,
        expiresAt: incoming.expiresAt ? new Date(incoming.expiresAt) : null,
        isAssigned: incoming.isAssigned ?? false,
      })
      .onConflictDoUpdate({
        target: [lots.organizationId, lots.variantId, lots.code],
        set: { updatedAt: new Date() },
      })
      .returning();

    return lot.id;
  }

  /**
   * Stock sits only at leaves (ADR-024), and leaf-ness is computed — so this
   * asks whether the location has children rather than reading a flag.
   *
   * `LocationsService` refuses to add a child to a location holding stock,
   * which is the other half of the same invariant. Both are needed: one stops
   * stock arriving at a branch, the other stops a leaf becoming a branch
   * underneath existing stock.
   */
  private async assertUsableLeaf(
    tx: Tx,
    organizationId: string,
    locationId: string,
  ): Promise<void> {
    const [location] = await tx
      .select()
      .from(locations)
      .where(
        and(
          eq(locations.id, locationId),
          eq(locations.organizationId, organizationId),
        ),
      );

    if (!location) throw new NotFoundException('No such location');

    if (!location.isActive) {
      throw new ConflictException(`${location.name} is retired`);
    }

    const [child] = await tx
      .select({ id: locations.id })
      .from(locations)
      .where(
        and(
          eq(locations.parentId, locationId),
          eq(locations.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (child) {
      throw new ConflictException(
        `${location.name} contains other locations. Stock belongs in one of them.`,
      );
    }
  }

  /**
   * Applies a signed delta to one cache row, taking its lock in the process.
   *
   * Written as raw SQL for two reasons. The arbiter is named explicitly rather
   * than inferred from a column list, because the constraint is
   * NULLS NOT DISTINCT and a mis-inferred arbiter surfaces as a duplicate-key
   * error instead of an upsert. And the arithmetic happens in Postgres, so a
   * numeric never passes through a JS double (ADR-025).
   *
   * The insert is what acquires the lock, even for a shelf with no row yet —
   * which is the whole reason the cache exists rather than the balance being
   * summed from the ledger on demand.
   */
  private async applyDelta(
    tx: Tx,
    organizationId: string,
    row: {
      variantId: string;
      locationId: string;
      lotId: string | null;
      delta: string;
    },
  ): Promise<void> {
    /**
     * Two statements, because CHECK (quantity >= 0) is evaluated on the tuple
     * being inserted, before Postgres looks for a conflict. ON CONFLICT catches
     * unique violations only — inserting a negative delta directly fails
     * outright even when the shelf holds plenty.
     *
     * So the insert carries zero. It exists to make the row present and to take
     * its lock, including for a shelf that has no row yet, which is the whole
     * reason the cache exists rather than the balance being summed from the
     * ledger on demand (ADR-025). DO UPDATE rather than DO NOTHING because
     * DO NOTHING returns no row on conflict and there would be nothing to
     * update in the second statement.
     */
    const existing = await tx.execute(sql`
      insert into ${stockLevels}
        (organization_id, variant_id, location_id, lot_id, quantity)
      values (
        ${organizationId}, ${row.variantId}, ${row.locationId},
        ${row.lotId}, 0
      )
      on conflict on constraint stock_levels_org_variant_location_lot_key
      do update set updated_at = now()
      returning id
    `);

    const id = (existing.rows[0] as { id: string }).id;

    try {
      /**
       * The arithmetic happens in Postgres, so a numeric never passes through a
       * JS double (ADR-025). The row is already locked by the statement above,
       * so this reads the true balance even under concurrent movements.
       */
      await tx.execute(sql`
        update ${stockLevels}
        set quantity = quantity + ${row.delta}::numeric,
            updated_at = now()
        where id = ${id}
      `);
    } catch (error) {
      /**
       * The constraint fired, so the shelf does not hold enough. The service
       * could SELECT the balance first for a friendlier message, and
       * deliberately does not: that read would be one more round trip and
       * still not authoritative.
       */
      if (isCheckViolation(error, 'stock_levels_quantity_non_negative_check')) {
        throw new ConflictException(
          'Not enough stock at that location for this movement',
        );
      }
      throw error;
    }
  }

  /**
   * Sum of movements equals the cache, for one variant. ADR-023 promises this
   * and e2e asserts it; exposed here so the assertion does not reimplement the
   * direction logic and agree with itself while both are wrong.
   */
  async reconcile(variantId: string) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const [ledger] = await tx
        .select({
          total: sql<string>`
            coalesce(sum(
              case
                when ${stockMovements.toLocationId} is not null
                 and ${stockMovements.fromLocationId} is not null then 0
                when ${stockMovements.toLocationId} is not null
                  then ${stockMovements.quantity}
                else -${stockMovements.quantity}
              end
            ), 0)`,
        })
        .from(stockMovements)
        .where(
          and(
            eq(stockMovements.variantId, variantId),
            eq(stockMovements.organizationId, organizationId),
          ),
        );

      const [cache] = await tx
        .select({
          total: sql<string>`coalesce(sum(${stockLevels.quantity}), 0)`,
        })
        .from(stockLevels)
        .where(
          and(
            eq(stockLevels.variantId, variantId),
            eq(stockLevels.organizationId, organizationId),
          ),
        );

      return { ledger: ledger.total, cache: cache.total };
    });
  }
}
