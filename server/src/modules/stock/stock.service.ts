import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, gt, lt, or, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { isCheckViolation, isUniqueViolation } from '../../database/errors';
import type { MovementReason } from '../../database/schema';
import {
  locations,
  lots,
  partners,
  productVariants,
  stockLevels,
  stockMovements,
  users,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { assertTakeable } from './availability';
import { ListLotsDto } from './dto/list-lots.dto';
import { ListMovementsDto } from './dto/list-movements.dto';
import { UpdateLotDto } from './dto/update-lot.dto';

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

/**
 * Reasons where stock leaves the business. A location marked unavailable —
 * a retention bin, a quarantine shelf — may never be their source (ADR-042).
 * Consumption is not among them: it stays in the building, and a run's own
 * location is often marked unavailable precisely because it is work in
 * progress.
 */
const LEAVES_THE_BUSINESS: ReadonlySet<MovementReason> = new Set([
  'shipment',
  'sample',
]);

/** The transaction handle TenantDb hands its callback. */
export type Tx = Parameters<Parameters<TenantDb['transaction']>[0]>[0];

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
  /** Set by server-side callers — an order, a run, a shipment — never by a client. */
  referenceType?: string | null;
  referenceId?: string | null;
  /** A sample's recipient; becomes a `partner` reference once checked. */
  recipientPartnerId?: string | null;
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
            // Whether the code was ours to invent, and so whether it can be
            // corrected rather than reclassified (MovementLotDto).
            lotIsAssigned: lots.isAssigned,
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
   * The one path that changes a quantity, for callers with no transaction of
   * their own. Opens one and delegates.
   */
  async record(input: RecordMovementInput, actorId: string) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      /**
       * The shape first, then the quantity. A movement whose direction
       * contradicts its reason is malformed, and must be refused as such
       * (400) before anything asks whether there is enough to take (409).
       */
      this.resolveDirection(input);

      /**
       * A hand-out or a one-off shipment has no order, so it may take only
       * what nobody holds (ADR-045). Orders check their own holds when they
       * ship; transfers and corrections record what happened and are not
       * checked.
       */
      if (LEAVES_THE_BUSINESS.has(input.reason)) {
        const [variant] = await tx
          .select({ sku: productVariants.sku })
          .from(productVariants)
          .where(
            and(
              eq(productVariants.id, input.variantId),
              eq(productVariants.organizationId, organizationId),
            ),
          );

        if (variant) {
          await assertTakeable(tx, {
            organizationId,
            variantId: input.variantId,
            quantity: input.quantity,
            sku: variant.sku,
          });
        }
      }

      return this.recordWithin(tx, organizationId, input, actorId);
    });
  }

  /**
   * The movement itself, inside a transaction the caller owns.
   *
   * Split out because orders need the ledger write and their own fulfilment
   * update to commit or fail together, and calling `record()` from inside
   * another transaction would open a savepoint rather than joining — correct
   * by accident, and fragile to depend on. The caller supplies the
   * transaction; this supplies the movement.
   *
   * Every reason goes through here. A second write path is the moment the
   * ledger stops being authoritative (ADR-023).
   */
  async recordWithin(
    tx: Tx,
    organizationId: string,
    input: RecordMovementInput,
    actorId: string,
  ) {
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

    const reference = await this.referenceFor(tx, organizationId, input);

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
      const location = await this.assertUsableLeaf(
        tx,
        organizationId,
        locationId,
      );

      /**
       * Stock leaving the business may not come from a location marked
       * unavailable: a retention bin, a quarantine shelf (ADR-042). Moving
       * stock out of one is still allowed — it is still ours — so only the
       * source of a shipment or a sample is checked.
       */
      if (
        locationId === direction.from &&
        LEAVES_THE_BUSINESS.has(input.reason) &&
        !location.isAvailable
      ) {
        throw new ConflictException(
          `${location.name} holds stock that is not for sending. Move it to an available location first.`,
        );
      }

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
        referenceType: reference.referenceType,
        referenceId: reference.referenceId,
        note: input.note ?? null,
        actorId,
      })
      .returning();

    this.logger.log(
      `Movement ${movement.id}: ${input.reason} ${input.quantity} of ${variant.sku}`,
    );

    return movement;
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
  ): Promise<typeof locations.$inferSelect> {
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

    return location;
  }

  /**
   * Applies a signed delta to one cache row, taking its lock in the process.
   *
   * Two statements, because CHECK (quantity >= 0) is evaluated on the tuple
   * being inserted, before Postgres looks for a conflict. ON CONFLICT catches
   * unique violations only — inserting a negative delta directly fails
   * outright even when the shelf holds plenty.
   *
   * So the insert carries zero. It exists to make the row present and to take
   * its lock, including for a shelf that has no row yet, which is the whole
   * reason the cache exists rather than the balance being summed from the
   * ledger on demand (ADR-025). DO UPDATE rather than DO NOTHING because
   * DO NOTHING returns no row on conflict and there would be nothing to update
   * in the second statement.
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
   * The ledger, read. Newest first, keyset cursor on the UUIDv7 id — the same
   * shape as the audit log, for the same reason: the table is append-only, so
   * offset paging would shift every page down as rows arrive at the head.
   *
   * Four left joins, so this drops to a raw handle like list() does. Two are
   * the same table aliased, because a transfer names both a source and a
   * destination. Left throughout: a movement with no source is inbound, a lot
   * is null for untracked variants, and an actor may be a tombstone (ADR-012)
   * — an inner join would drop exactly the rows the RESTRICT constraints exist
   * to preserve.
   *
   * The SKU is not joined. It is snapshotted on the row (ADR-023) so a rename
   * does not rewrite history.
   */
  listMovements(query: ListMovementsDto) {
    const limit = query.limit ?? 50;

    return this.tenantDb.transaction(async (tx, organizationId) => {
      const from = alias(locations, 'from_location');
      const to = alias(locations, 'to_location');

      const filters = [
        eq(stockMovements.organizationId, organizationId),
        query.before ? lt(stockMovements.id, query.before) : undefined,
        query.variantId
          ? eq(stockMovements.variantId, query.variantId)
          : undefined,
        query.lotId ? eq(stockMovements.lotId, query.lotId) : undefined,
        query.locationId
          ? or(
              eq(stockMovements.fromLocationId, query.locationId),
              eq(stockMovements.toLocationId, query.locationId),
            )
          : undefined,
        query.reason ? eq(stockMovements.reason, query.reason) : undefined,
      ].filter((f): f is SQL => f !== undefined);

      // One more than asked for, so the presence of a next page is known
      // without a second count query.
      const rows = await tx
        .select({
          id: stockMovements.id,
          sku: stockMovements.sku,
          quantity: stockMovements.quantity,
          reason: stockMovements.reason,
          reasonDetail: stockMovements.reasonDetail,
          note: stockMovements.note,
          fromLocationName: from.name,
          toLocationName: to.name,
          lotCode: lots.code,
          actorEmail: users.email,
          createdAt: stockMovements.createdAt,
        })
        .from(stockMovements)
        .leftJoin(from, eq(from.id, stockMovements.fromLocationId))
        .leftJoin(to, eq(to.id, stockMovements.toLocationId))
        .leftJoin(lots, eq(lots.id, stockMovements.lotId))
        .leftJoin(users, eq(users.id, stockMovements.actorId))
        .where(and(...filters))
        .orderBy(desc(stockMovements.id))
        .limit(limit + 1);

      const entries = rows.slice(0, limit);

      return {
        entries,
        nextCursor: rows.length > limit ? entries[entries.length - 1].id : null,
      };
    });
  }

  /**
   * The lot codes already known for one variant.
   *
   * Exists for the receive dialogs. A free-text lot field turns a typo into a
   * second lot row for one physical run — a recall for L2024-A then returns
   * the wrong units, and nothing about the split looks wrong on screen.
   * Showing what already exists is what makes the typo visible.
   *
   * Expiry comes along because it is how someone spots the other mistake:
   * typing a code that exists but belongs to a different run.
   */
  listLots(query: ListLotsDto) {
    return this.tenantDb.select(lots, eq(lots.variantId, query.variantId), {
      orderBy: desc(lots.createdAt),
    });
  }

  /**
   * Corrects a lot's expiry, and its code when the code was ours to invent.
   *
   * `isAssigned` is the discriminator. A supplier-printed code is authoritative
   * — renaming the row makes the record disagree with the boxes, and the
   * honest correction is adjustment movements between two lots. A code this
   * organization invented has no external truth behind it, so a typo is a
   * typo.
   */
  async updateLot(lotId: string, input: UpdateLotDto) {
    const [lot] = await this.tenantDb.select(lots, eq(lots.id, lotId));

    if (!lot) throw new NotFoundException('No such lot');

    if (input.code && input.code !== lot.code && !lot.isAssigned) {
      throw new ConflictException(
        `${lot.code} came from the supplier, so it cannot be renamed. Move the stock to the correct lot instead.`,
      );
    }

    try {
      await this.tenantDb.update(
        lots,
        {
          code: input.code,
          ...(input.expiresAt !== undefined
            ? { expiresAt: new Date(input.expiresAt) }
            : {}),
        },
        eq(lots.id, lotId),
      );
    } catch (error) {
      // The unique index on (organization_id, variant_id, code). Merging two
      // lots is a different operation with its own rules, not a rename.
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `${input.code} already exists for this item`,
        );
      }
      throw error;
    }

    this.logger.log(`Lot ${lotId} updated`);
  }

  /**
   * The movement's reference. Internal callers — orders, runs, shipments —
   * pass their own; the public endpoint can only name a sample's recipient,
   * which is checked against this organization before it is trusted.
   */
  private async referenceFor(
    tx: Tx,
    organizationId: string,
    input: RecordMovementInput,
  ): Promise<{ referenceType: string | null; referenceId: string | null }> {
    if (!input.recipientPartnerId) {
      return {
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
      };
    }

    if (input.reason !== 'sample') {
      throw new BadRequestException('Only a sample has a recipient');
    }

    const [partner] = await tx
      .select({ id: partners.id })
      .from(partners)
      .where(
        and(
          eq(partners.id, input.recipientPartnerId),
          eq(partners.organizationId, organizationId),
        ),
      );

    if (!partner) throw new BadRequestException('Unknown recipient');

    return { referenceType: 'partner', referenceId: partner.id };
  }
}
