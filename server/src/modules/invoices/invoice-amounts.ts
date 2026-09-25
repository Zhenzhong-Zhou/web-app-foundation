import { and, asc, eq, sql } from 'drizzle-orm';

import type { Transaction } from '../../database/database.module';
import { invoiceLines, taxCodeComponents } from '../../database/schema';

/**
 * Digits after the point in a currency's minor unit: 2 for CAD, 0 for JPY,
 * 3 for KWD. From Intl, the same source the client formats with, so there
 * is no table of currencies to keep current (ADR-046).
 */
export function minorUnits(currency: string): number {
  return (
    new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2
  );
}

export interface InvoiceAmounts {
  lines: { id: string; netAmount: string }[];
  taxes: {
    name: string;
    rate: string;
    taxableAmount: string;
    amount: string;
  }[];
  subtotal: string;
  taxTotal: string;
  total: string;
}

/**
 * An invoice's amounts, computed in Postgres from its lines (ADR-025,
 * ADR-046). The one calculation both a draft's preview and issuing use, so
 * what a draft shows is exactly what issuing stores.
 *
 * - A line's net is quantity × unit price, rounded to minor units.
 * - Tax is per component (name and rate) on the sum of the nets of the
 *   lines whose code carries it, rounded once — not per line, which drifts
 *   by a cent a line on a long invoice.
 * - The subtotal sums the rounded nets, the tax total sums the rounded
 *   taxes, so the printed figures add up exactly as printed.
 *
 * Rounding is Postgres `round`, half away from zero. Every figure comes
 * back as numeric(18,4) text: "137.5000".
 *
 * A line with no tax code contributes to the subtotal and to no tax. Issue
 * refuses such a line; a draft's preview simply shows it untaxed.
 */
export async function computeAmounts(
  tx: Transaction,
  organizationId: string,
  invoiceId: string,
  currency: string,
): Promise<InvoiceAmounts> {
  const places = minorUnits(currency);

  const net = sql`round(${invoiceLines.quantity} * ${invoiceLines.unitPrice}, ${places}::int)`;
  const ofThisInvoice = and(
    eq(invoiceLines.organizationId, organizationId),
    eq(invoiceLines.invoiceId, invoiceId),
  );

  const lines = await tx
    .select({
      id: invoiceLines.id,
      netAmount: sql<string>`${net}::numeric(18, 4)::text`,
    })
    .from(invoiceLines)
    .where(ofThisInvoice)
    .orderBy(asc(invoiceLines.sku));

  const taxes = await tx
    .select({
      name: taxCodeComponents.name,
      rate: sql<string>`${taxCodeComponents.rate}::text`,
      taxableAmount: sql<string>`sum(${net})::numeric(18, 4)::text`,
      amount: sql<string>`round(sum(${net}) * ${taxCodeComponents.rate} / 100, ${places}::int)::numeric(18, 4)::text`,
    })
    .from(invoiceLines)
    .innerJoin(
      taxCodeComponents,
      and(
        eq(taxCodeComponents.taxCodeId, invoiceLines.taxCodeId),
        eq(taxCodeComponents.organizationId, organizationId),
      ),
    )
    .where(ofThisInvoice)
    .groupBy(taxCodeComponents.name, taxCodeComponents.rate)
    .orderBy(asc(taxCodeComponents.name), asc(taxCodeComponents.rate));

  /**
   * The totals, summed in SQL over the same rounded figures. Kept as one
   * statement with the lines and taxes re-derived rather than summed in
   * JS, where the strings would pass through doubles (ADR-025).
   */
  const result = await tx.execute<{
    subtotal: string;
    tax_total: string;
    total: string;
  }>(sql`
    with nets as (
      select ${invoiceLines.taxCodeId} as tax_code_id, ${net} as net
      from ${invoiceLines}
      where ${ofThisInvoice}
    ),
    taxes as (
      select round(sum(n.net) * c.rate / 100, ${places}::int) as amount
      from nets n
      join ${taxCodeComponents} c
        on c.tax_code_id = n.tax_code_id and c.organization_id = ${organizationId}
      group by c.name, c.rate
    ),
    sums as (
      select
        (select coalesce(sum(net), 0) from nets) as subtotal,
        (select coalesce(sum(amount), 0) from taxes) as tax_total
    )
    select
      subtotal::numeric(18, 4)::text as subtotal,
      tax_total::numeric(18, 4)::text as tax_total,
      (subtotal + tax_total)::numeric(18, 4)::text as total
    from sums
  `);

  const [totals] = result.rows;

  return {
    lines,
    taxes,
    subtotal: totals.subtotal,
    taxTotal: totals.tax_total,
    total: totals.total,
  };
}
