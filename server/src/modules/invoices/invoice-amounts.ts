import { type SQL, sql } from 'drizzle-orm';

import type { Transaction } from '../../database/database.module';

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
 *
 * The pro forma (ADR-071) is worked out by the same code over its order's
 * lines, so what it shows is what the invoice would charge.
 */
export async function computeAmounts(
  tx: Transaction,
  organizationId: string,
  invoiceId: string,
  currency: string,
): Promise<InvoiceAmounts> {
  return amountsOver(
    tx,
    organizationId,
    currency,
    sql`
      select l.id, l.sku, l.tax_code_id, l.quantity, l.unit_price
      from invoice_lines l
      where l.organization_id = ${organizationId}::uuid
        and l.invoice_id = ${invoiceId}::uuid
    `,
  );
}

/**
 * A pro forma's amounts (ADR-071): its order's lines as the invoice would
 * bill them, every one at the quantity ordered and taxed by the one code
 * chosen for it, or by none.
 */
export async function proFormaAmounts(
  tx: Transaction,
  organizationId: string,
  orderId: string,
  currency: string,
  taxCodeId: string | null,
): Promise<InvoiceAmounts> {
  return amountsOver(
    tx,
    organizationId,
    currency,
    sql`
      select
        l.id,
        l.sku,
        ${taxCodeId}::uuid as tax_code_id,
        l.quantity_ordered as quantity,
        l.unit_price
      from order_lines l
      where l.organization_id = ${organizationId}::uuid
        and l.order_id = ${orderId}::uuid
    `,
  );
}

/**
 * The calculation itself, over any lines given as rows of id, sku,
 * tax_code_id, quantity and unit_price. Raw SQL with every table aliased,
 * since the lines arrive as a subquery (engineering.md, Server).
 */
async function amountsOver(
  tx: Transaction,
  organizationId: string,
  currency: string,
  source: SQL,
): Promise<InvoiceAmounts> {
  const places = minorUnits(currency);

  const nets = sql`
    select
      s.id,
      s.sku,
      s.tax_code_id,
      round(s.quantity * s.unit_price, ${places}::int) as net
    from (${source}) s
  `;

  const lines = (
    await tx.execute<{ id: string; net_amount: string }>(sql`
      select n.id, n.net::numeric(18, 4)::text as net_amount
      from (${nets}) n
      order by n.sku
    `)
  ).rows.map((row) => ({ id: row.id, netAmount: row.net_amount }));

  const taxes = (
    await tx.execute<{
      name: string;
      rate: string;
      taxable_amount: string;
      amount: string;
    }>(sql`
      select
        c.name,
        c.rate::text as rate,
        sum(n.net)::numeric(18, 4)::text as taxable_amount,
        round(sum(n.net) * c.rate / 100, ${places}::int)::numeric(18, 4)::text
          as amount
      from (${nets}) n
      join tax_code_components c
        on c.tax_code_id = n.tax_code_id
        and c.organization_id = ${organizationId}::uuid
      group by c.name, c.rate
      order by c.name, c.rate
    `)
  ).rows.map((row) => ({
    name: row.name,
    rate: row.rate,
    taxableAmount: row.taxable_amount,
    amount: row.amount,
  }));

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
    with nets as (${nets}),
    taxes as (
      select round(sum(n.net) * c.rate / 100, ${places}::int) as amount
      from nets n
      join tax_code_components c
        on c.tax_code_id = n.tax_code_id
        and c.organization_id = ${organizationId}::uuid
      group by c.name, c.rate
    ),
    sums as (
      select
        (select coalesce(sum(n.net), 0) from nets n) as subtotal,
        (select coalesce(sum(x.amount), 0) from taxes x) as tax_total
    )
    select
      sums.subtotal::numeric(18, 4)::text as subtotal,
      sums.tax_total::numeric(18, 4)::text as tax_total,
      (sums.subtotal + sums.tax_total)::numeric(18, 4)::text as total
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
