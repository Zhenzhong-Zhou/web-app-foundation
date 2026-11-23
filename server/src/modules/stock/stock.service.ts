import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { ERROR_CODES, withCode } from '../../common/error-codes';
import {
  type LotChangeDetail,
  RECEIPT_DETAILS,
} from '../../common/movement-reasons';
import { recordContext } from '../../core/audit/audit-context';
import { isCheckViolation } from '../../database/errors';
import type { LotExpiry, LotNote, MovementReason } from '../../database/schema';
import {
  locations,
  lots,
  partners,
  productVariants,
  stockLevels,
  stockMovements,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import { takeLotCode } from '../numbering/lot-codes';
import { assertTakeable } from './availability';
import { startLotsOf, TRACKING_STARTED } from './start-lot';
import { PurchaseCost, valueMovement } from './valuation';

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
  /**
   * An existing lot. Mutually exclusive with `lot`. For a lot change, the
   * lot it leaves: none for stock from before the code's lot tracking
   * started (ADR-094).
   */
  lotId?: string | null;
  /**
   * The lot a lot change enters, one of the item's (ADR-094); set by
   * server-side callers alone, as the movements route takes no lot change.
   */
  toLotId?: string | null;
  /**
   * Stock coming back as it left, with no lot (ADR-094, Q3a): a return, or
   * a voided shipment's goods. Where the code has tracked lots since it
   * left, it is written so, the one movement of a tracked code with no
   * lot, and a lot change, `from_before`, then puts it into the lot that
   * took the code's stock as its tracking started, made then if the code
   * started with nothing on hand (Q4a). Set by the server's own callers
   * alone: the movements route's DTO does not declare it.
   */
  fromBefore?: boolean;
  /**
   * A new lot arriving with the movement (MovementLotDto): a code typed as
   * printed, created if new and else reused unless `mustBeNew`, or one the
   * lot series makes for it (ADR-094).
   */
  lot?: {
    code?: string;
    makeCode?: boolean;
    mustBeNew?: boolean;
    supplierLot?: string;
    expiry?: LotExpiry;
    /** A calendar day, YYYY-MM-DD (ADR-052). */
    expiresAt?: string;
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
  /**
   * A sample's recipient, or whom a receipt with no order came from;
   * becomes a `partner` reference once checked.
   */
  recipientPartnerId?: string | null;
  note?: string | null;
  /**
   * What a receipt against a priced purchase line paid (ADR-048). Set by the
   * order that received it, never by a client — the movement endpoint's DTO
   * does not declare it, so the whitelist refuses one sent in a body.
   */
  cost?: PurchaseCost | null;
}

@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  constructor(private readonly tenantDb: TenantDb) {}

  /**
   * The one path that changes a quantity, for callers with no transaction of
   * their own. Opens one and delegates.
   */
  async record(input: RecordMovementInput, actorId: string) {
    // The movement's label is its SKU; why it moved is read from here, in
    // the reader's words (ADR-076). Only the movements route and the seeds
    // come through record(): orders and runs call recordWithin.
    recordContext({ reason: input.reason });

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
        t({
          id: 'stock.adjustmentNeedsNoteSaying',
          defaultMessage: 'An adjustment needs a note saying what was found',
        }),
      );
    }

    // Why a receipt has no order is one of its keys, translated when read,
    // or none, as a tab opened before sends it (ADR-094, R11).
    if (
      input.reason === 'receipt' &&
      input.reasonDetail != null &&
      !(RECEIPT_DETAILS as readonly string[]).includes(input.reasonDetail)
    ) {
      throw new BadRequestException(
        t({
          id: 'stock.receiptWhyUnknown',
          defaultMessage:
            'Choose why there is no order: opening stock, returned, a sample or other.',
        }),
      );
    }

    /**
     * Read `for share`, so the start of the code's lot tracking, which
     * takes the row `for update` first, waits for this movement to commit,
     * and a movement begun after it reads the code as it now is: a receipt
     * racing the start never writes stock with no lot onto a tracked code
     * (ADR-094). `for key share`, what the movement's own reference takes,
     * would not make the start wait.
     */
    const [variant] = await tx
      .select()
      .from(productVariants)
      .where(
        and(
          eq(productVariants.id, input.variantId),
          eq(productVariants.organizationId, organizationId),
        ),
      )
      .for('share');

    // The variant and the locations come from a body, or from the caller's
    // own rows, never from a path: another organization's, or one that does
    // not exist, is unknown, a 400 (engineering.md, Server).
    if (!variant)
      throw new BadRequestException(
        t({
          id: 'stock.unknownVariant',
          defaultMessage:
            'That item is not in this organization. Choose one from the list.',
        }),
      );

    // A lot change names the lot it leaves and the lot it enters, at one
    // place; any other movement one lot, or none (ADR-094).
    const ends =
      input.reason === 'lot_change'
        ? await this.lotChangeEnds(tx, organizationId, variant, input)
        : null;

    // Stock that left with no lot before the code's lot tracking started
    // comes back so, then into the code's start lot (ADR-094, Q3a): found,
    // or made, before any pile is locked.
    const before =
      !ends &&
      input.fromBefore === true &&
      variant.tracksLots &&
      !input.lotId &&
      !input.lot
        ? await this.startLot(tx, organizationId, variant.id)
        : null;
    if (before && !direction.to) {
      throw new Error('Stock from before lot tracking comes back to a place');
    }

    const lot = ends
      ? ends.enters
      : before
        ? null
        : await this.resolveLot(tx, organizationId, variant, input);
    const lotId = ends ? ends.leaves : (lot?.id ?? null);

    const reference = await this.referenceFor(tx, organizationId, input);

    /**
     * Locked in a deterministic order, sorted by location id, then by lot.
     *
     * A transfer touches two rows. Two concurrent transfers, A→B and B→A,
     * that each grab their source first will deadlock — rare in testing,
     * reliable under load. Sorting means both transactions always take the
     * same row first, so one waits instead of dying. A lot change touches
     * two piles of one place, so the lot decides between them, the pile
     * with no lot first.
     */
    const touched = [
      ...(direction.from
        ? [
            {
              locationId: direction.from,
              lotId,
              delta: `-${input.quantity}`,
            },
          ]
        : []),
      ...(direction.to
        ? [
            {
              locationId: direction.to,
              lotId: ends ? ends.enters.id : lotId,
              delta: input.quantity,
            },
          ]
        : []),
    ].sort(
      (a, b) =>
        a.locationId.localeCompare(b.locationId) ||
        (a.lotId ?? '').localeCompare(b.lotId ?? ''),
    );

    for (const { locationId, lotId: pileLotId, delta } of touched) {
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
          t(
            {
              id: 'stock.nameHoldsStockSending',
              defaultMessage:
                '{name} holds stock that is not for sending. Move it to an available location first.',
            },
            { name: location.name },
          ),
        );
      }

      await this.applyDelta(tx, organizationId, {
        variantId: input.variantId,
        locationId,
        lotId: pileLotId,
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
        toLotId: ends?.enters.id ?? null,
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

    // Every movement is valued here, so value and quantity have one write
    // path between them (ADR-048). Whether it waits for a cost goes back
    // with it, for the write to say (ADR-093, 90a), and so does the lot's
    // code, a made one among them (ADR-094, R3).
    const needsCost = await valueMovement(
      tx,
      organizationId,
      movement,
      input.cost ?? null,
    );

    this.logger.log(
      `Movement ${movement.id}: ${input.reason} ${input.quantity} of ${variant.sku}`,
    );

    // Its value, the cost it left at, follows by the lot change's rows, out
    // of the pool with no lot into the start lot's (valueMovement).
    if (before) {
      await this.recordWithin(
        tx,
        organizationId,
        {
          variantId: variant.id,
          lotId: null,
          toLotId: before.id,
          fromLocationId: direction.to,
          toLocationId: direction.to,
          quantity: input.quantity,
          reason: 'lot_change',
          reasonDetail: 'from_before' satisfies LotChangeDetail,
        },
        actorId,
      );
    }

    return { ...movement, needsCost, lotCode: lot?.code ?? null };
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
          t({
            id: 'stock.transferNeedsBothSource',
            defaultMessage:
              'A transfer needs both a source and a destination location',
          }),
        );
      }
      return { from, to };
    }

    // A lot change stays at its place, both ends (ADR-094). Only the
    // server's own callers record one; the movements route refuses the
    // reason, so a wrong shape here is a bug, never a person's mistake.
    if (input.reason === 'lot_change') {
      if (!from || from !== to) {
        throw new Error('A lot change stays at one place, both its ends');
      }
      return { from, to };
    }

    if (INBOUND.has(input.reason)) {
      if (!to || from) {
        throw new BadRequestException(
          t(
            {
              id: 'stock.reasonNeedsDestinationLocation',
              defaultMessage:
                'A {reason} needs a destination location and no source',
            },
            { reason: input.reason },
          ),
        );
      }
      return { from: null, to };
    }

    if (OUTBOUND.has(input.reason)) {
      if (!from || to) {
        throw new BadRequestException(
          t(
            {
              id: 'stock.reasonNeedsSourceLocation',
              defaultMessage:
                'A {reason} needs a source location and no destination',
            },
            { reason: input.reason },
          ),
        );
      }
      return { from, to: null };
    }

    // An adjustment is the only reason that goes either way: a miscount can
    // reveal more on the shelf than recorded, or less.
    if (!from === !to) {
      throw new BadRequestException(
        t({
          id: 'stock.adjustmentNeedsExactlyOne',
          defaultMessage:
            'An adjustment needs exactly one of a source or a destination',
        }),
      );
    }

    return { from, to };
  }

  /**
   * Enforces the invariant from ADR-023 — a lot is present exactly when the
   * variant tracks lots — and returns the lot to use, its id and its code,
   * creating it when one arrived with the movement. Tracking may start for a
   * variant that holds stock, never stop (ADR-094): from then on, its
   * movements take a lot, all but stock coming back as it left before,
   * which recordWithin writes with no lot, never reaching here, and moves
   * into the start lot in the same transaction (`fromBefore`, Q3a).
   *
   * A check constraint cannot see across tables, so this lives here and is
   * asserted in e2e. Without it a variant ends up with some lotted rows and
   * some not, and no query can answer how much exists.
   *
   * Creating the lot here rather than through its own endpoint is deliberate:
   * a lot has no independent existence, it arrives printed on a box. A separate
   * call would leave an orphan row every time the movement then failed.
   *
   * What the lot is, the write says: one of the item's by its id, a code
   * typed as printed, or one the lot series makes; and whether it must be
   * new. Never the movement's reason (#649's 46).
   */
  private async resolveLot(
    tx: Tx,
    organizationId: string,
    variant: typeof productVariants.$inferSelect,
    input: RecordMovementInput,
  ): Promise<{ id: string; code: string } | null> {
    const supplied = input.lotId ?? input.lot ?? null;

    // A screen sends a lot exactly when the code tracks lots, as it read
    // the code; one that sends none read it before its lot tracking
    // started (ADR-094, R13), so it is told so, and how to give one.
    if (variant.tracksLots && !supplied) {
      throw new BadRequestException(
        t(
          {
            id: 'stock.lotTrackingStarted',
            defaultMessage:
              'Lot tracking has started for {sku}. Reload to give its lot.',
          },
          { sku: variant.sku },
        ),
      );
    }

    if (!variant.tracksLots && supplied) {
      throw new BadRequestException(
        t(
          {
            id: 'stock.skuLotTrackedSo2',
            defaultMessage:
              '{sku} is not lot tracked, so this movement cannot have a lot',
          },
          { sku: variant.sku },
        ),
      );
    }

    if (input.lotId && input.lot) {
      throw new BadRequestException(
        t({
          id: 'stock.giveEitherExistingLot',
          defaultMessage: 'Give either an existing lot or a new one, not both',
        }),
      );
    }

    if (!supplied) return null;

    if (input.lotId) {
      // Scoped to the variant as well as the organization: a lot belongs to one
      // variant, and attaching another's would make a recall return the wrong
      // units.
      const [lot] = await tx
        .select({ id: lots.id, code: lots.code })
        .from(lots)
        .where(
          and(
            eq(lots.id, input.lotId),
            eq(lots.organizationId, organizationId),
            eq(lots.variantId, variant.id),
          ),
        );

      if (!lot)
        throw new BadRequestException(
          t({
            id: 'stock.unknownLotVariant',
            defaultMessage: 'Unknown lot for this variant',
          }),
        );
      return lot;
    }

    return this.newLot(tx, organizationId, variant, input.lot!);
  }

  /**
   * A lot arriving with a movement (MovementLotDto): one the lot series
   * makes for us, or a code typed as printed, created if new and else
   * reused unless it must be new. Also the lot a move to another lot
   * makes, which is always new (ADR-094, R20).
   */
  async newLot(
    tx: Tx,
    organizationId: string,
    variant: { id: string; sku: string },
    incoming: NonNullable<RecordMovementInput['lot']>,
  ): Promise<{ id: string; code: string }> {
    const expiry = expiryOf(incoming);

    if (incoming.makeCode) {
      if (incoming.code) {
        throw new BadRequestException(
          t({
            id: 'stock.lotTypedOrMade',
            defaultMessage:
              'Type the lot number as printed, or make a code for us, not both.',
          }),
        );
      }
      return this.makeLot(tx, organizationId, variant.id, {
        ...expiry,
        supplierLot: incoming.supplierLot?.trim() || null,
      });
    }

    if (!incoming.code) {
      throw new BadRequestException(
        t({
          id: 'stock.lotNumberMissing',
          defaultMessage:
            'Type the lot number as printed, or make a code for us.',
        }),
      );
    }

    // A typed code is the supplier's own, so it has no supplier's lot to
    // add; one made for us carries it (ADR-094, R5).
    if (incoming.supplierLot?.trim()) {
      throw new BadRequestException(
        t({
          id: 'stock.supplierLotForMadeCode',
          defaultMessage:
            'A lot number typed from the box is the supplier’s own. Leave the supplier’s lot empty, or make a code for us.',
        }),
      );
    }

    const typed = {
      organizationId,
      variantId: variant.id,
      code: incoming.code,
      ...expiry,
      // Typed as printed: a code made up here is marked so in Edit lot
      // details, by its own permission (ADR-094, R4 and R7).
      isAssigned: false,
    };

    /**
     * A lot the write must make, as Count it in's new lot (ADR-093, 84a):
     * a code the item already has is refused, since one of its lots is
     * chosen by its id. Never reused, as a second delivery is: a count
     * that merged into a lot nobody chose would put found units under
     * another run's expiry. DO NOTHING writes nothing when the code is
     * taken, so the refusal comes before any write.
     */
    if (incoming.mustBeNew) {
      const [made] = await tx
        .insert(lots)
        .values(typed)
        .onConflictDoNothing({
          target: [lots.organizationId, lots.variantId, lots.code],
        })
        .returning({ id: lots.id, code: lots.code });

      if (!made) {
        throw new ConflictException(
          withCode(
            t(
              {
                id: 'stock.lotCodeInUse',
                defaultMessage:
                  '{sku} already has lot {lot}. Choose it among its lots, or give the new lot another code.',
              },
              { sku: variant.sku, lot: incoming.code },
            ),
            ERROR_CODES.lotCodeInUse,
          ),
        );
      }
      return made;
    }

    /**
     * Create or reuse, by code. A second delivery of lot L2024-A is the same
     * lot with more units, not a unique-key collision.
     *
     * DO UPDATE rather than DO NOTHING, because DO NOTHING returns no row on
     * conflict and a follow-up SELECT to find the existing one reopens the race
     * this closes. Touching updated_at is a no-op write that returns the id in
     * one statement.
     *
     * The expiry is deliberately not updated: a later delivery of the same
     * run does not get to rewrite the expiry of units already on the shelf.
     */
    const [lot] = await tx
      .insert(lots)
      .values(typed)
      .onConflictDoUpdate({
        target: [lots.organizationId, lots.variantId, lots.code],
        set: { updatedAt: new Date() },
      })
      .returning({ id: lots.id, code: lots.code });

    return lot;
  }

  /**
   * The two lots of a lot change (ADR-094), each one of the item's: the
   * lot it leaves, none for stock from before the code's lot tracking
   * started, and the lot it enters. Only a code that tracks lots changes
   * lot; the table's checks keep the two apart.
   */
  private async lotChangeEnds(
    tx: Tx,
    organizationId: string,
    variant: typeof productVariants.$inferSelect,
    input: RecordMovementInput,
  ): Promise<{ leaves: string | null; enters: { id: string; code: string } }> {
    if (!variant.tracksLots || !input.toLotId) {
      throw new Error(
        'A lot change is of a tracked code, into one of its lots',
      );
    }

    const ids = [input.toLotId, ...(input.lotId ? [input.lotId] : [])];
    const found = await tx
      .select({ id: lots.id, code: lots.code })
      .from(lots)
      .where(
        and(
          inArray(lots.id, ids),
          eq(lots.organizationId, organizationId),
          eq(lots.variantId, variant.id),
        ),
      );

    const enters = found.find((each) => each.id === input.toLotId);
    if (!enters || found.length !== new Set(ids).size) {
      throw new BadRequestException(
        t({
          id: 'stock.unknownLotVariant',
          defaultMessage: 'Unknown lot for this variant',
        }),
      );
    }

    return { leaves: input.lotId ?? null, enters };
  }

  /**
   * A lot made for us where the delivery shows no code (ADR-094, R3): its
   * code taken from the lot series inside this transaction, as the write
   * is saved, and the lot stored as made here (R4). Also the lot that
   * takes a code's stock on hand as its lot tracking starts, its note
   * saying so (Q4a).
   *
   * Never merged into a lot of the same code: a code typed for this item by
   * a write not yet committed is one the take cannot see (takeLotCode), so
   * the insert waits for that write and, where it committed, takes the next
   * number rather than add to its lot.
   */
  async makeLot(
    tx: Tx,
    organizationId: string,
    variantId: string,
    lot: {
      expiry: LotExpiry;
      expiresAt: string | null;
      supplierLot: string | null;
      note?: LotNote | null;
    },
  ): Promise<{ id: string; code: string }> {
    for (;;) {
      const code = await takeLotCode(tx, organizationId, variantId);
      const [made] = await tx
        .insert(lots)
        .values({ organizationId, variantId, code, ...lot, isAssigned: true })
        .onConflictDoNothing({
          target: [lots.organizationId, lots.variantId, lots.code],
        })
        .returning({ id: lots.id, code: lots.code });
      if (made) return made;
    }
  }

  /**
   * The code's start lot, for stock coming back from before its lot
   * tracking started (ADR-094, Q4a): the lot that took its stock on hand,
   * found by its note, or, where the code started with nothing on hand,
   * one made for us now, noted the same, with the first stock back. Its
   * expiry is not known yet, as a start's is when nothing is said
   * (ADR-094, S6), the stock still usable; its supplier's lot is to add.
   *
   * Two at once would each make one, so the second waits on the code's own
   * lock, then finds the first's; the lock is taken only where none is
   * found, and never the code's row, which every movement holds `for share`.
   */
  private async startLot(
    tx: Tx,
    organizationId: string,
    variantId: string,
  ): Promise<{ id: string; code: string }> {
    const found = async () =>
      (await startLotsOf(tx, organizationId, [variantId])).get(variantId);

    const lot = await found();
    if (lot) return lot;

    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`start-lot:${variantId}`}, 0))`,
    );
    return (
      (await found()) ??
      (await this.makeLot(tx, organizationId, variantId, {
        ...expiryOf({ expiry: 'unknown' }),
        supplierLot: null,
        note: TRACKING_STARTED,
      }))
    );
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

    if (!location)
      throw new BadRequestException(
        t({
          id: 'stock.unknownLocation',
          defaultMessage:
            'That location is not in this organization. Choose one from the list.',
        }),
      );

    if (!location.isActive) {
      throw new ConflictException(
        t(
          { id: 'stock.nameRetired', defaultMessage: '{name} is retired' },
          { name: location.name },
        ),
      );
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
        t(
          {
            id: 'stock.nameContainsOtherLocations',
            defaultMessage:
              '{name} contains other locations. Stock belongs in one of them.',
          },
          { name: location.name },
        ),
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
          t({
            id: 'stock.enoughStockLocationMovement',
            defaultMessage:
              'Not enough stock at that location for this movement',
          }),
        );
      }
      throw error;
    }
  }

  /**
   * The movement's reference. Internal callers — orders, runs, shipments —
   * pass their own; the public endpoint can only name a partner: whom a
   * sample went to, or whom a receipt with no order came from, kept as a
   * sample's recipient is (ADR-094, R11), each checked against this
   * organization before it is trusted.
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

    const namesPartner =
      input.reason === 'sample' ||
      (input.reason === 'receipt' && !input.referenceType);
    if (!namesPartner) {
      throw new BadRequestException(
        t({
          id: 'stock.partnerSampleOrReceipt',
          defaultMessage:
            'Only a sample or stock received with no order names a partner. Leave the partner out of this movement.',
        }),
      );
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

    if (!partner)
      throw new BadRequestException(
        t({
          id: 'stock.unknownPartner',
          defaultMessage:
            'That partner is not in this organization. Choose one from the list.',
        }),
      );

    return { referenceType: 'partner', referenceId: partner.id };
  }
}

/**
 * A new lot's expiry, one of three (ADR-094, R8): a day exactly for
 * `date`, none for not known yet or none. A write that names no kind, as
 * a tab opened before sends it, reads `date` with a day and `none`
 * without, so today's lots with no day stay Doesn't expire. Edit lot
 * details reads its expiry by the same rule (LotsService.updateLot).
 */
export function expiryOf(lot: {
  expiry?: LotExpiry | null;
  expiresAt?: string | null;
}): {
  expiry: LotExpiry;
  expiresAt: string | null;
} {
  const expiresAt = lot.expiresAt ?? null;
  const expiry = lot.expiry ?? (expiresAt ? 'date' : 'none');

  if (expiry === 'date' && !expiresAt) {
    throw new BadRequestException(
      t({
        id: 'stock.lotExpiryNeedsDay',
        defaultMessage:
          'Give the day the lot expires, or say it is not known yet or that the lot doesn’t expire.',
      }),
    );
  }

  if (expiry !== 'date' && expiresAt) {
    throw new BadRequestException(
      t({
        id: 'stock.lotExpiryTakesNoDay',
        defaultMessage:
          'A lot whose expiry is not known yet, or that doesn’t expire, takes no day. Remove the day, or say the lot expires on it.',
      }),
    );
  }

  return { expiry, expiresAt };
}
