import { ConflictException } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { ERROR_CODES, withCode } from '../../common/error-codes';
import type { Transaction } from '../../database/database.module';
import type {
  DocumentType,
  NumberingReset,
  OrderDirection,
} from '../../database/schema';
import { t } from '../../i18n/translate';
import { formatNumber, periodBounds, periodKey } from './numbering-format';

/** An order's series, by its direction (ADR-071, amended). */
export function orderSeries(direction: OrderDirection): DocumentType {
  return direction === 'sale' ? 'sale_order' : 'purchase_order';
}

/**
 * The next number in an organization's series, taken inside the caller's
 * transaction (ADR-046, ADR-073), for a document dated `day` (YYYY-MM-DD):
 * an invoice's or credit note's own date, the day an order or RMA is made
 * in the organization's zone.
 *
 * One statement: the first document of a period opens its counter at 2,
 * with the series' prefix and width, and takes 1; every later one
 * increments and takes the value before, printed with the prefix and width
 * the period keeps. The row lock lasts until the caller commits, so two
 * issues queue rather than share a number, and a rolled-back issue gives
 * its number back.
 *
 * The day is given, never worked out in SQL (ADR-072): the statement only
 * cuts it into the period its reset asks for.
 */
export async function takeNumber(
  tx: Transaction,
  organizationId: string,
  documentType: DocumentType,
  day: string,
): Promise<string> {
  const result = await tx.execute<{
    prefix: string;
    digits: number;
    next_value: string;
  }>(sql`
    insert into document_sequences as s
      (organization_id, document_type, period, prefix, digits, next_value)
    select n.organization_id, n.document_type,
      case n.reset
        when 'yearly' then ${periodKey('yearly', day)}
        when 'monthly' then ${periodKey('monthly', day)}
        when 'daily' then ${periodKey('daily', day)}
        else ''
      end,
      n.prefix, n.digits, 2
    from document_numbering as n
    where n.organization_id = ${organizationId}
      and n.document_type = ${documentType}
    on conflict (organization_id, document_type, period)
    do update set next_value = s.next_value + 1
    returning s.prefix, s.digits, s.next_value
  `);

  const [row] = result.rows;
  if (!row) {
    // Every organization has its five rows, from the migration or its
    // registration; a missing one is a broken record, not a refusal.
    throw new Error(
      `No numbering for ${documentType} in organization ${organizationId}`,
    );
  }

  if (documentType === 'invoice' || documentType === 'credit_note') {
    await assertInDateOrder(tx, organizationId, documentType, day);
  }

  return formatNumber(row.prefix, row.digits, Number(row.next_value) - 1, day);
}

/**
 * With the organization's switch on, an invoice or credit note may not be
 * dated before the latest already given in its series and period (ADR-073,
 * France's rule).
 *
 * Read after the number is taken, under the counter's lock: two issues at
 * once queue there, so the second sees the first. A refusal rolls the
 * number back with everything else.
 */
async function assertInDateOrder(
  tx: Transaction,
  organizationId: string,
  documentType: 'invoice' | 'credit_note',
  day: string,
): Promise<void> {
  const settings = await tx.execute<{
    in_order: boolean;
    reset: NumberingReset;
  }>(sql`
    select o.documents_in_date_order as in_order, n.reset
    from organizations as o
    join document_numbering as n
      on n.organization_id = o.id and n.document_type = ${documentType}
    where o.id = ${organizationId}
  `);
  const [setting] = settings.rows;
  if (!setting?.in_order) return;

  const bounds = periodBounds(setting.reset, day);
  const within = (column: ReturnType<typeof sql.raw>) =>
    bounds
      ? sql`and ${column} >= ${bounds.from} and ${column} < ${bounds.before}`
      : sql``;

  const later =
    documentType === 'invoice'
      ? await tx.execute<{ number: string; dated: string }>(sql`
          select i.number, i.invoice_date::text as dated
          from invoices as i
          where i.organization_id = ${organizationId}
            and i.number is not null
            and i.invoice_date > ${day}
            ${within(sql.raw('i.invoice_date'))}
          order by i.invoice_date desc, i.id desc
          limit 1
        `)
      : await tx.execute<{ number: string; dated: string }>(sql`
          select c.number, c.credit_date::text as dated
          from credit_notes as c
          where c.organization_id = ${organizationId}
            and c.credit_date > ${day}
            ${within(sql.raw('c.credit_date'))}
          order by c.credit_date desc, c.id desc
          limit 1
        `);

  const [latest] = later.rows;
  if (latest) {
    throw new ConflictException(
      withCode(
        t(
          {
            id: 'numbering.dateOrder',
            defaultMessage:
              '{kind, select, invoice {Invoices} other {Credit notes}} are kept in date order, and {number} is dated {date}. Date this one {date} or later.',
          },
          { kind: documentType, number: latest.number, date: latest.dated },
        ),
        ERROR_CODES.numberingDateOrder,
      ),
    );
  }
}
