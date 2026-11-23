import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import type { LotChangeDetail } from '../../common/movement-reasons';
import { readableQuantity } from '../../common/readable-quantity';
import { recordContext } from '../../core/audit/audit-context';
import { lots, productVariants } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import type { MoveToLotDto, MoveToNewLotDto } from './dto/move-to-lot.dto';
import type { LotChanged, MovedLot } from './dto/stock-response.dto';
import { movementOf } from './movement-view';
import { openRunIssued } from './open-run';
import { StockService, type Tx } from './stock.service';

/** The lot the stock leaves, as the move reads it. */
type FirstLot = {
  id: string;
  code: string;
  variantId: string;
  sku: string;
  expiry: (typeof lots.$inferSelect)['expiry'];
  expiresAt: string | null;
  supplierLot: string | null;
  note: (typeof lots.$inferSelect)['note'];
};

/**
 * Move to another lot (ADR-094, R20): part of a lot at one place into
 * another lot of the same item, one it has or a new one, typed or made for
 * us. One lot change, `between_lots`, counted in neither In nor Out for
 * the code, its value carried from one pool into the other (Q1a). A
 * correction of the record, so under `stock.adjust` with a note, as every
 * correction is (5a); the route's.
 */
@Injectable()
export class LotChangesService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly stock: StockService,
  ) {}

  move(lotId: string, dto: MoveToLotDto, actorId: string): Promise<LotChanged> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const from = await firstLot(tx, organizationId, lotId);
      recordContext({
        reason: 'lot_change',
        sku: from.sku,
        lotId: { id: from.id, label: from.code },
      });

      if (!dto.note?.trim()) {
        throw new BadRequestException(
          t({
            id: 'stock.lotChangeNeedsNote',
            defaultMessage:
              'Say in the note why this stock belongs in another lot.',
          }),
        );
      }

      await refuseIssuedToOpenRun(tx, organizationId, from, dto.locationId);

      if (dto.toLotId && dto.lot) {
        throw new BadRequestException(
          t({
            id: 'stock.giveEitherExistingLot',
            defaultMessage:
              'Give either an existing lot or a new one, not both',
          }),
        );
      }

      const to = dto.toLotId
        ? await otherLot(tx, organizationId, from, dto.toLotId)
        : dto.lot
          ? await this.stock.newLot(
              tx,
              organizationId,
              { id: from.variantId, sku: from.sku },
              startingAs(from, dto.lot),
            )
          : null;

      if (!to) {
        throw new BadRequestException(
          t({
            id: 'stock.lotChangeNeedsLot',
            defaultMessage:
              'Choose the lot to move it into: another of its lots, or a new one.',
          }),
        );
      }

      const moved = await this.stock.recordWithin(
        tx,
        organizationId,
        {
          variantId: from.variantId,
          lotId: from.id,
          toLotId: to.id,
          fromLocationId: dto.locationId,
          toLocationId: dto.locationId,
          quantity: dto.quantity,
          reason: 'lot_change',
          reasonDetail: 'between_lots' satisfies LotChangeDetail,
          note: dto.note,
        },
        actorId,
      );

      return {
        movement: movementOf(moved),
        fromLot: { id: from.id, code: from.code },
        toLot: to,
        needsCost: moved.needsCost,
      };
    });
  }
}

/**
 * Refuses a move out of a lot issued to a run still open at that place
 * (review 73): the run's close takes from the lots it was issued there, so
 * it would find the moved units missing. Named by its reference, or by what
 * it plans to make when it has none.
 */
async function refuseIssuedToOpenRun(
  tx: Tx,
  organizationId: string,
  from: FirstLot,
  locationId: string,
): Promise<void> {
  const found = await tx.execute(
    openRunIssued(organizationId, {
      variantId: sql`${from.variantId}::uuid`,
      locationId: sql`${locationId}::uuid`,
      lotId: sql`${from.id}::uuid`,
      lotNote: sql`${from.note}::text`,
    }),
  );
  const run = found.rows[0] as
    { reference: string | null; quantity_planned: string } | undefined;
  if (!run) return;

  throw new ConflictException(
    run.reference
      ? t(
          {
            id: 'stock.lotChangeIssuedToRun',
            defaultMessage:
              'Lot {code} here was issued to run {run}, which is still open. Close or cancel the run first, then move what is left to another lot.',
          },
          { code: from.code, run: run.reference },
        )
      : t(
          {
            id: 'stock.lotChangeIssuedToUnnamedRun',
            defaultMessage:
              'Lot {code} here was issued to a run still open, {quantity} planned. Close or cancel the run first, then move what is left to another lot.',
          },
          { code: from.code, quantity: readableQuantity(run.quantity_planned) },
        ),
  );
}

/**
 * The lot the stock leaves, by the path's id: 404 for another
 * organization's. Its code is read `for share`, as every movement reads it
 * (recordWithin), first, so the move takes its locks in a receipt's order.
 */
async function firstLot(
  tx: Tx,
  organizationId: string,
  lotId: string,
): Promise<FirstLot> {
  const [lot] = await tx
    .select({
      id: lots.id,
      code: lots.code,
      variantId: lots.variantId,
      sku: productVariants.sku,
      expiry: lots.expiry,
      expiresAt: lots.expiresAt,
      supplierLot: lots.supplierLot,
      note: lots.note,
    })
    .from(lots)
    .innerJoin(
      productVariants,
      and(
        eq(productVariants.id, lots.variantId),
        eq(productVariants.organizationId, organizationId),
      ),
    )
    .where(and(eq(lots.id, lotId), eq(lots.organizationId, organizationId)))
    .for('share', { of: productVariants });

  if (!lot) {
    throw new NotFoundException(
      t({ id: 'stock.suchLot', defaultMessage: 'No such lot' }),
    );
  }
  return lot;
}

/**
 * The lot it goes into, by the body's id: one of the same item's, never
 * the lot it leaves. Another item's, or another organization's, is
 * unknown here, a 400 (#314).
 */
async function otherLot(
  tx: Tx,
  organizationId: string,
  from: FirstLot,
  toLotId: string,
): Promise<MovedLot> {
  const [lot] = await tx
    .select({ id: lots.id, code: lots.code })
    .from(lots)
    .where(
      and(
        eq(lots.id, toLotId),
        eq(lots.organizationId, organizationId),
        eq(lots.variantId, from.variantId),
      ),
    );

  if (!lot) {
    throw new BadRequestException(
      t(
        {
          id: 'stock.lotChangeNotItsLot',
          defaultMessage:
            'That lot is not one of {sku}’s. Choose another of its lots, or a new one.',
        },
        { sku: from.sku },
      ),
    );
  }

  if (lot.id === from.id) {
    throw new BadRequestException(
      t(
        {
          id: 'stock.lotChangeSameLot',
          defaultMessage:
            'The stock is in lot {lot} already. Choose another of its lots, or a new one.',
        },
        { lot: from.code },
      ),
    );
  }

  return lot;
}

/**
 * A new lot starts as the first lot is (ADR-094, E7): its expiry, unless
 * one is given, and for a code made for us its supplier's lot, unless one
 * is given, empty to add later. A code typed from the box is the
 * supplier's own, so it takes none (R5), and one given for it is refused
 * as at receipt.
 */
function startingAs(
  from: FirstLot,
  lot: MoveToNewLotDto,
): NonNullable<Parameters<StockService['newLot']>[3]> {
  const expiryGiven = lot.expiry !== undefined || lot.expiresAt !== undefined;
  return {
    code: lot.code,
    makeCode: lot.makeCode,
    mustBeNew: true,
    supplierLot:
      lot.supplierLot ??
      (lot.makeCode ? (from.supplierLot ?? undefined) : undefined),
    ...(expiryGiven
      ? { expiry: lot.expiry, expiresAt: lot.expiresAt }
      : {
          expiry: from.expiry,
          expiresAt: from.expiresAt ?? undefined,
        }),
  };
}
