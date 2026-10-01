import { BadRequestException, ConflictException } from '@nestjs/common';
import { and, eq, isNotNull, ne } from 'drizzle-orm';

import { orderLines, productVariants } from '../../database/schema';
import { listForOrder, priceOnList } from '../price-lists/list-price';
import { type Tx } from '../stock/stock.service';

/**
 * How an order's lines get their prices (ADR-035, ADR-049): a price given
 * with the line, the partner's list, or none, and a sale kept to one
 * currency. Shared by creating an order, duplicating one and adding a line,
 * which is why it is not a method of either service.
 */

type OrderLine = typeof orderLines.$inferSelect;

/**
 * A line as the service inserts it. A price given here is kept as given; a
 * duplicate also carries where the original's price came from, so copying an
 * order does not quietly re-price it.
 */
export interface LineInput {
  variantId: string;
  quantityOrdered: string;
  unitPrice?: string;
  currency?: string;
  priceSource?: 'list' | 'manual';
  priceListId?: string;
}

/**
 * A line just added, with a word on its price when the list could not supply
 * one (ADR-049). Not stored: it explains this response, not the line.
 */
export type AddedLine = OrderLine & { priceNotice?: string };

/**
 * Each line snapshots the SKU the way movements do (ADR-023), so an order
 * printed last March keeps showing what was on the label at the time while
 * variant_id still resolves to the current row.
 *
 * One at a time rather than a single multi-row insert: each needs its
 * variant loaded to read that SKU, and a line naming a variant from another
 * organization has to fail the whole order rather than be skipped.
 */
export async function insertLines(
  tx: Tx,
  organizationId: string,
  order: {
    id: string;
    direction: string;
    isSample: boolean;
    partnerId: string;
  },
  lines: LineInput[],
): Promise<AddedLine[]> {
  const inserted: AddedLine[] = [];

  /**
   * The list new lines default from (ADR-049), read once for the call. A
   * line that brings its own price never consults it.
   */
  const list = lines.some((line) => line.unitPrice === undefined)
    ? await listForOrder(tx, organizationId, order)
    : null;

  /**
   * A sale is invoiced in one currency (ADR-046). The currencies its lines
   * are already priced in, so a list price in another is left off rather
   * than building an order that cannot be confirmed, and a price given in
   * another is refused.
   */
  const saleCurrencies =
    order.direction === 'sale'
      ? await pricedCurrencies(tx, order.id)
      : new Set<string>();

  for (const line of lines) {
    const [variant] = await tx
      .select()
      .from(productVariants)
      .where(
        and(
          eq(productVariants.id, line.variantId),
          eq(productVariants.organizationId, organizationId),
        ),
      );

    if (!variant) throw new BadRequestException('Unknown variant');

    let unitPrice: string | null = line.unitPrice ?? null;
    let currency: string | null = line.currency ?? null;
    let priceSource: 'list' | 'manual' | null =
      line.unitPrice !== undefined ? (line.priceSource ?? 'manual') : null;
    let priceListId: string | null =
      line.unitPrice !== undefined ? (line.priceListId ?? null) : null;
    let priceNotice: string | undefined;

    if (
      line.currency !== undefined &&
      order.direction === 'sale' &&
      !order.isSample
    ) {
      assertOneSaleCurrency(saleCurrencies, variant.sku, line.currency);
    }

    if (line.unitPrice === undefined && list) {
      const listed = await priceOnList(
        tx,
        organizationId,
        list.id,
        line.variantId,
      );

      if (listed === null) {
        priceNotice = `${list.name} has no price for ${variant.sku}`;
      } else if (
        order.direction === 'sale' &&
        saleCurrencies.size > 0 &&
        !saleCurrencies.has(list.currency)
      ) {
        // Unpriced rather than refused: the confirm check names the line,
        // and the person may not control the list (ADR-049).
        priceNotice = `This sale is in ${[...saleCurrencies].join(', ')} and ${list.name} prices in ${list.currency}, so ${variant.sku} was added without a price`;
      } else {
        unitPrice = listed;
        currency = list.currency;
        priceSource = 'list';
        priceListId = list.id;
      }
    }

    if (order.direction === 'sale' && currency !== null) {
      saleCurrencies.add(currency);
    }

    const [row] = await tx
      .insert(orderLines)
      .values({
        organizationId,
        orderId: order.id,
        variantId: line.variantId,
        sku: variant.sku,
        quantityOrdered: line.quantityOrdered,
        unitPrice,
        currency,
        priceSource,
        priceListId,
      })
      .returning();

    inserted.push(priceNotice ? { ...row, priceNotice } : row);
  }

  return inserted;
}

/**
 * The check constraint refuses a half-priced line, but as a constraint
 * violation rather than an explanation. This says which half is missing
 * (ADR-035).
 */
export function assertPriceAndCurrency(input: {
  unitPrice?: string;
  currency?: string;
}): void {
  if ((input.unitPrice === undefined) !== (input.currency === undefined)) {
    throw new BadRequestException(
      'A price needs a currency, and a currency needs a price',
    );
  }
}

/**
 * The currencies a sale's priced lines are in, leaving out the line being
 * repriced when there is one.
 */
export async function pricedCurrencies(
  tx: Tx,
  orderId: string,
  exceptLineId?: string,
): Promise<Set<string>> {
  const rows = await tx
    .selectDistinct({ currency: orderLines.currency })
    .from(orderLines)
    .where(
      and(
        eq(orderLines.orderId, orderId),
        isNotNull(orderLines.currency),
        exceptLineId ? ne(orderLines.id, exceptLineId) : undefined,
      ),
    );

  return new Set(rows.flatMap((row) => (row.currency ? [row.currency] : [])));
}

/**
 * A sale is in one currency from its first priced line (ADR-046, as
 * amended): on a draft as much as once confirmed, and whichever way the
 * price arrives — typed, from a list, or copied by a duplicate. A purchase
 * may mix (ADR-035); a sample is never priced.
 *
 * Allowed when the currency is one the sale already uses, rather than only
 * when every other line matches, so a draft priced in two currencies before
 * this rule can still be brought back to one.
 */
export function assertOneSaleCurrency(
  currencies: Set<string>,
  sku: string,
  currency: string,
): void {
  if (currencies.size > 0 && !currencies.has(currency)) {
    throw new ConflictException(
      `This sale is in ${[...currencies].sort().join(', ')}, so ${sku} cannot be priced in ${currency}`,
    );
  }
}
