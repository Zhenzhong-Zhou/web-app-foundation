import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';

import type { Transaction } from '../../database/database.module';
import { invoices } from '../../database/schema';
import type { CreditLineDto } from './dto/credit-invoice.dto';
import { minorUnits } from './invoice-amounts';

type Invoice = typeof invoices.$inferSelect;

/** One requested line, checked and priced. */
interface CheckedLine {
  invoiceLineId: string;
  returnAuthorizationLineId: string | null;
  sku: string;
  description: string;
  taxCodeName: string | null;
  quantity: string;
  unitPrice: string;
  netAmount: string;
}

/** A credit's figures: the preview, and exactly what issuing stores. */
export interface CreditAmounts {
  lines: CheckedLine[];
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
 * A credit's figures, the one calculation preview and issuing both use, as
 * computeAmounts() is an invoice's (ADR-046, ADR-047).
 *
 * Checks every requested line and computes the credit, all in SQL
 * (ADR-025). A line sent twice never gets here: the DTO refuses it (400).
 * Refusals, in order: a line not on this invoice (404); a price above the
 * invoice's, a quantity above what the line billed, or more value than
 * the line has left to credit (409); and for an RMA line, one that is not
 * this order's, not open, not resolved as credit, not for this item, or
 * authorizes less than asked (400/409).
 */
export async function computeCredit(
  tx: Transaction,
  organizationId: string,
  invoice: Invoice,
  requested: CreditLineDto[],
  lock = false,
): Promise<CreditAmounts> {
  const places = minorUnits(invoice.currency);

  const values = sql.join(
    requested.map(
      (line, index) =>
        sql`(${index}::int, ${line.invoiceLineId}::uuid, ${line.quantity}::numeric, ${line.unitPrice ?? null}::numeric, ${line.returnAuthorizationLineId ?? null}::uuid)`,
    ),
    sql`, `,
  );

  /**
   * Per requested line: the invoice line it names, the price it will be
   * credited at, its net, what earlier credits took from that line, and
   * whether any limit is broken. One statement, so the "already credited"
   * figure every check reads is one reading.
   */
  const checked = (
    await tx.execute<{
      ord: number;
      invoice_line_id: string;
      rma_line_id: string | null;
      missing: boolean;
      sku: string | null;
      description: string | null;
      tax_code_name: string | null;
      order_line_id: string | null;
      quantity: string;
      unit_price: string | null;
      net_amount: string | null;
      above_price: boolean | null;
      above_quantity: boolean | null;
      above_value: boolean | null;
      remaining: string | null;
    }>(sql`
      with requested(ord, invoice_line_id, quantity, unit_price, rma_line_id) as (
        values ${values}
      ),
      priced as (
        select
          r.*,
          il.id is null as missing,
          il.sku,
          il.description,
          il.tax_code_name,
          il.order_line_id,
          il.unit_price as billed_price,
          il.quantity as billed_quantity,
          il.net_amount as billed_net,
          coalesce(r.unit_price, il.unit_price) as price,
          round(r.quantity * coalesce(r.unit_price, il.unit_price), ${places}::int) as net,
          coalesce((
            select sum(cnl.net_amount)
            from credit_note_lines cnl
            where cnl.organization_id = ${organizationId}::uuid
              and cnl.invoice_line_id = il.id
          ), 0) as credited
        from requested r
        left join invoice_lines il
          on il.id = r.invoice_line_id
         and il.invoice_id = ${invoice.id}::uuid
         and il.organization_id = ${organizationId}::uuid
      )
      select
        ord,
        invoice_line_id,
        rma_line_id,
        missing,
        sku,
        description,
        tax_code_name,
        order_line_id,
        quantity::numeric(18, 4)::text as quantity,
        price::numeric(18, 4)::text as unit_price,
        net::numeric(18, 4)::text as net_amount,
        price > billed_price as above_price,
        quantity > billed_quantity as above_quantity,
        credited + net > billed_net as above_value,
        (billed_net - credited)::numeric(18, 4)::text as remaining
      from priced
      order by ord
    `)
  ).rows;

  for (const row of checked) {
    if (row.missing) {
      throw new NotFoundException(
        `No line ${row.invoice_line_id} on ${invoice.number}`,
      );
    }

    if (row.above_price) {
      throw new ConflictException(
        `${row.sku} can be credited at its invoiced price or less, never more`,
      );
    }

    if (row.above_quantity) {
      throw new ConflictException(
        `${row.sku} was billed in a smaller quantity than that`,
      );
    }

    if (row.above_value) {
      throw new ConflictException(
        `${row.sku} has ${row.remaining} left to credit on ${invoice.number}, less than this credit`,
      );
    }
  }

  await assertWithinAuthorizations(
    tx,
    organizationId,
    invoice,
    checked,
    lock,
  );

  const lines: CheckedLine[] = checked.map((row) => ({
    invoiceLineId: row.invoice_line_id,
    returnAuthorizationLineId: row.rma_line_id,
    sku: row.sku as string,
    description: row.description as string,
    taxCodeName: row.tax_code_name,
    quantity: row.quantity,
    unitPrice: row.unit_price as string,
    netAmount: row.net_amount as string,
  }));

  const nets = sql.join(
    lines.map(
      (line) =>
        sql`(${line.invoiceLineId}::uuid, ${line.netAmount}::numeric)`,
    ),
    sql`, `,
  );

  /**
   * Tax per component at the rates the invoice charged (invoice_line_taxes,
   * never the code's current ones), summed over the credited nets and
   * rounded once — the invoice rule. Then capped at what the invoice
   * charged for that component less what earlier credits took, so partial
   * credits rounding on their own can never total more than was charged.
   */
  const taxes = (
    await tx.execute<{
      name: string;
      rate: string;
      taxable_amount: string;
      amount: string;
    }>(sql`
      with nets(invoice_line_id, net) as (values ${nets}),
      computed as (
        select ilt.name, ilt.rate,
               sum(n.net) as taxable,
               round(sum(n.net) * ilt.rate / 100, ${places}::int) as amount
        from nets n
        join invoice_line_taxes ilt
          on ilt.invoice_line_id = n.invoice_line_id
         and ilt.organization_id = ${organizationId}::uuid
        group by ilt.name, ilt.rate
      )
      select c.name,
             c.rate::text as rate,
             c.taxable::numeric(18, 4)::text as taxable_amount,
             greatest(least(c.amount, it.amount - coalesce(earlier.amount, 0)), 0)
               ::numeric(18, 4)::text as amount
      from computed c
      join invoice_taxes it
        on it.invoice_id = ${invoice.id}::uuid
       and it.organization_id = ${organizationId}::uuid
       and it.name = c.name
       and it.rate = c.rate
      left join lateral (
        select sum(cnt.amount) as amount
        from credit_note_taxes cnt
        join credit_notes cn on cn.id = cnt.credit_note_id
        where cn.organization_id = ${organizationId}::uuid
          and cn.invoice_id = ${invoice.id}::uuid
          and cnt.name = c.name
          and cnt.rate = c.rate
      ) earlier on true
      order by c.name, c.rate
    `)
  ).rows.map((row) => ({
    name: row.name,
    rate: row.rate,
    taxableAmount: row.taxable_amount,
    amount: row.amount,
  }));

  const taxAmounts =
    taxes.length > 0
      ? sql.join(
          taxes.map((tax) => sql`(${tax.amount}::numeric)`),
          sql`, `,
        )
      : sql`(0::numeric)`;

  // Summed in SQL over the same rounded figures (ADR-025).
  const [totals] = (
    await tx.execute<{ subtotal: string; tax_total: string; total: string }>(
      sql`
        with nets(net) as (values ${sql.join(
          lines.map((line) => sql`(${line.netAmount}::numeric)`),
          sql`, `,
        )}),
        taxes(amount) as (values ${taxAmounts}),
        sums as (
          select (select sum(net) from nets) as subtotal,
                 (select coalesce(sum(amount), 0) from taxes) as tax_total
        )
        select subtotal::numeric(18, 4)::text as subtotal,
               tax_total::numeric(18, 4)::text as tax_total,
               (subtotal + tax_total)::numeric(18, 4)::text as total
        from sums
      `,
    )
  ).rows;

  return {
    lines,
    taxes,
    subtotal: totals.subtotal,
    taxTotal: totals.tax_total,
    total: totals.total,
  };
}

/**
 * For lines settling an RMA line (ADR-047): the RMA must be this
 * invoice's order's (409), exist here (400, an id in a body), be open,
 * resolve that line as credit, name the same item, and have authorized at
 * least this much beyond what earlier credits took (409). Locked when
 * issuing, so two credits against one RMA line queue.
 */
async function assertWithinAuthorizations(
  tx: Transaction,
  organizationId: string,
  invoice: Invoice,
  checked: {
    rma_line_id: string | null;
    order_line_id: string | null;
    quantity: string;
    sku: string | null;
  }[],
  lock: boolean,
) {
  const settling = checked.filter((row) => row.rma_line_id !== null);
  if (settling.length === 0) return;

  const requested = sql.join(
    settling.map(
      (row) =>
        sql`(${row.rma_line_id}::uuid, ${row.order_line_id}::uuid, ${row.quantity}::numeric)`,
    ),
    sql`, `,
  );

  /**
   * The RMAs first, locked on their own: Postgres will not lock the
   * nullable side of the outer join the check below needs, and two
   * credits against one RMA line must queue before either reads what
   * was credited.
   */
  if (lock) {
    await tx.execute(sql`
      select ra.id
      from return_authorizations ra
      join return_authorization_lines ral
        on ral.return_authorization_id = ra.id
      where ral.organization_id = ${organizationId}::uuid
        and ral.id in (${sql.join(
          settling.map((row) => sql`${row.rma_line_id}::uuid`),
          sql`, `,
        )})
      order by ra.id
      for update of ra
    `);
  }

  const rows = (
    await tx.execute<{
      rma_line_id: string;
      missing: boolean;
      number: string | null;
      other_order: boolean | null;
      status: string | null;
      resolution: string | null;
      other_item: boolean | null;
      exceeds: boolean | null;
      remaining: string | null;
    }>(sql`
      with requested(rma_line_id, order_line_id, quantity) as (values ${requested})
      select
        r.rma_line_id,
        ral.id is null as missing,
        ra.number,
        ra.order_id <> ${invoice.orderId}::uuid as other_order,
        ra.status,
        ral.resolution,
        ral.order_line_id <> r.order_line_id as other_item,
        coalesce((
          select sum(cnl.quantity)
          from credit_note_lines cnl
          where cnl.organization_id = ${organizationId}::uuid
            and cnl.return_authorization_line_id = ral.id
        ), 0) + r.quantity > ral.quantity as exceeds,
        (ral.quantity - coalesce((
          select sum(cnl.quantity)
          from credit_note_lines cnl
          where cnl.organization_id = ${organizationId}::uuid
            and cnl.return_authorization_line_id = ral.id
        ), 0))::numeric(18, 4)::text as remaining
      from requested r
      left join return_authorization_lines ral
        on ral.id = r.rma_line_id
       and ral.organization_id = ${organizationId}::uuid
      left join return_authorizations ra on ra.id = ral.return_authorization_id
    `)
  ).rows;

  for (const row of rows) {
    if (row.missing) {
      throw new BadRequestException('No such return authorization line');
    }
    if (row.other_order) {
      throw new ConflictException(
        `${row.number} is for another order than this invoice`,
      );
    }
    if (row.status !== 'open') {
      throw new ConflictException(
        `${row.number} is ${row.status}, so nothing more is credited under it`,
      );
    }
    if (row.resolution !== 'credit') {
      throw new ConflictException(
        `That line of ${row.number} is resolved as ${row.resolution}, not credit`,
      );
    }
    if (row.other_item) {
      throw new ConflictException(
        `That line of ${row.number} is for a different item`,
      );
    }
    if (row.exceeds) {
      throw new ConflictException(
        `${row.number} has ${row.remaining} left to credit on that line, less than this credit`,
      );
    }
  }
}
