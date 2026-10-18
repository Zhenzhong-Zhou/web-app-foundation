import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { and, desc, eq, gt, isNotNull, sql } from 'drizzle-orm';

import { ERROR_CODES, withCode } from '../../common/error-codes';
import { recordPrevious } from '../../core/audit/audit-context';
import { todayOf } from '../../core/organizations/time-zone';
import type { Transaction } from '../../database/database.module';
import {
  creditNotes,
  documentNumbering,
  documentSequences,
  type DocumentType,
  invoices,
  type NumberingReset,
  orders,
  organizations,
  returnAuthorizations,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import type { Numbering, NumberingSeries } from './dto/numbering-response.dto';
import type {
  NumberingSeriesDto,
  UpdateNumberingDto,
} from './dto/update-numbering.dto';
import {
  couldPrintSame,
  formatNumber,
  patternOf,
  periodKey,
  periodOfParts,
  prefixProblem,
  render,
} from './numbering-format';

/** The API's name for each series, and the table's. */
const SERIES = {
  invoice: 'invoice',
  creditNote: 'credit_note',
  returnAuthorization: 'return_authorization',
  saleOrder: 'sale_order',
  purchaseOrder: 'purchase_order',
} as const satisfies Record<string, DocumentType>;

type SeriesKey = keyof typeof SERIES;

const KEYS = Object.keys(SERIES) as SeriesKey[];

type Counter = typeof documentSequences.$inferSelect;

/**
 * Each organization's numbering (ADR-073): the Numbering section's read,
 * and a save checked whole before anything is written.
 *
 * Refusals in order (conventions.md): a malformed prefix is 400; two series
 * that could print the same numbers, and a number already given, are 409.
 */
@Injectable()
export class NumberingService {
  constructor(private readonly tenantDb: TenantDb) {}

  get(): Promise<Numbering> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const today = await todayOf(tx, organizationId);
      const settings = await settingsOf(tx, organizationId);
      const counters = await countersOf(tx, organizationId);
      const last = await lastNumbers(tx, organizationId);

      const series = (key: SeriesKey): NumberingSeries => {
        const type = SERIES[key];
        const setting = settings.get(type)!;
        const nextUnder = (reset: NumberingReset) =>
          standing(counters, type, periodKey(reset, today));
        return {
          prefix: setting.prefix,
          digits: setting.digits,
          reset: setting.reset,
          next: {
            never: nextUnder('never'),
            yearly: nextUnder('yearly'),
            monthly: nextUnder('monthly'),
            daily: nextUnder('daily'),
          },
          last: last[type],
        };
      };

      return {
        invoice: series('invoice'),
        creditNote: series('creditNote'),
        returnAuthorization: series('returnAuthorization'),
        saleOrder: series('saleOrder'),
        purchaseOrder: series('purchaseOrder'),
        documentsInDateOrder: await inDateOrder(tx, organizationId),
        today,
      };
    });
  }

  update(input: UpdateNumberingDto): Promise<void> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      for (const key of KEYS) {
        const wanted = input[key];
        const problem = prefixProblem(
          wanted.prefix,
          wanted.digits,
          wanted.reset,
        );
        if (problem) {
          throw new BadRequestException(
            t(
              {
                id: 'numbering.prefixInvalid',
                defaultMessage:
                  'The {series, select, invoice {invoice} credit_note {credit note} return_authorization {return authorization} sale_order {sale order} other {purchase order}} prefix {problem, select, start {must start with a capital letter, a digit or the date} end {can’t end with a digit or the date, or where the number starts would be unclear} doubleSlash {can’t hold //} repeated {shows a part of the date twice} tooLong {prints more than 16 characters} tooLongWithDigits {and its digits print more than 20 characters} resetNeedsDate {needs the year, month or day it starts again by} other {can hold only capital letters, digits, -, _, / and the date}}',
              },
              { series: SERIES[key], problem },
            ),
          );
        }
      }

      const today = await todayOf(tx, organizationId);

      // Two saves queue here, each checking what the other wrote.
      const rows = await tx
        .select()
        .from(documentNumbering)
        .where(eq(documentNumbering.organizationId, organizationId))
        .for('update');
      const current = new Map(rows.map((row) => [row.documentType, row]));

      const changed = KEYS.filter((key) => {
        const wanted = input[key];
        const setting = current.get(SERIES[key])!;
        return (
          wanted.next !== undefined ||
          setting.prefix !== wanted.prefix ||
          setting.digits !== wanted.digits ||
          setting.reset !== wanted.reset
        );
      });

      // Then today's counter for each series that changes, before reading
      // any: an issue lands wholly before the save or wholly after it.
      await lockTodaysCounters(
        tx,
        organizationId,
        changed.map((key) => {
          const { prefix, digits } = current.get(SERIES[key])!;
          return {
            type: SERIES[key],
            period: periodKey(input[key].reset, today),
            prefix,
            digits,
          };
        }),
      );
      const counters = await countersOf(tx, organizationId);

      // Each series as it stood, in the shape it was sent (ADR-018): the
      // next number only where the screen sent one.
      const before = (key: SeriesKey) => {
        const type = SERIES[key];
        const setting = current.get(type)!;
        return {
          prefix: setting.prefix,
          digits: setting.digits,
          reset: setting.reset,
          ...(input[key].next !== undefined
            ? {
                next: standing(counters, type, periodKey(setting.reset, today)),
              }
            : {}),
        };
      };
      recordPrevious({
        invoice: before('invoice'),
        creditNote: before('creditNote'),
        returnAuthorization: before('returnAuthorization'),
        saleOrder: before('saleOrder'),
        purchaseOrder: before('purchaseOrder'),
        documentsInDateOrder: await inDateOrder(tx, organizationId),
      });

      KEYS.forEach((first, index) => {
        for (const second of KEYS.slice(index + 1)) {
          if (couldPrintSame(input[first].prefix, input[second].prefix)) {
            throw new ConflictException(
              withCode(
                t(
                  {
                    id: 'numbering.prefixShared',
                    defaultMessage:
                      '{first, select, invoice {Invoices} credit_note {Credit notes} return_authorization {Return authorizations} sale_order {Sale orders} other {Purchase orders}} and {second, select, invoice {invoices} credit_note {credit notes} return_authorization {return authorizations} sale_order {sale orders} other {purchase orders}} would print the same numbers. Give each its own prefix.',
                  },
                  { first: SERIES[first], second: SERIES[second] },
                ),
                ERROR_CODES.numberingPrefixShared,
                { series: [first, second] },
              ),
            );
          }
        }
      });

      for (const key of changed) {
        await assertFree(tx, organizationId, key, input[key], counters, today);
      }

      for (const key of changed) {
        await save(tx, organizationId, SERIES[key], input[key], today);
      }

      await tx
        .update(organizations)
        .set({ documentsInDateOrder: input.documentsInDateOrder })
        .where(eq(organizations.id, organizationId));
    });
  }
}

/**
 * Each series' settings. Every organization has a row for each, from the
 * migration or its registration (ADR-073).
 */
async function settingsOf(tx: Transaction, organizationId: string) {
  const rows = await tx
    .select()
    .from(documentNumbering)
    .where(eq(documentNumbering.organizationId, organizationId));
  return new Map(rows.map((row) => [row.documentType, row]));
}

async function inDateOrder(
  tx: Transaction,
  organizationId: string,
): Promise<boolean> {
  const [organization] = await tx
    .select({ inOrder: organizations.documentsInDateOrder })
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  return organization.inOrder;
}

/**
 * Takes today's counter for each series a save changes, before the save
 * reads any (ADR-073). An issue already holding one is waited for, and the
 * save's checks then see its number; an issue that comes after waits for
 * the save, and numbers with what it wrote. A counter not yet open is
 * opened as its first number would open it, with the settings as they
 * stand; the update changes nothing, and is there for the row lock.
 *
 * Exported for the test that holds a save open while an issue runs.
 */
export async function lockTodaysCounters(
  tx: Transaction,
  organizationId: string,
  counters: {
    type: DocumentType;
    period: string;
    prefix: string;
    digits: number;
  }[],
): Promise<void> {
  for (const { type, period, prefix, digits } of counters) {
    await tx.execute(sql`
      insert into document_sequences as s
        (organization_id, document_type, period, prefix, digits, next_value)
      values (${organizationId}, ${type}, ${period}, ${prefix}, ${digits}, 1)
      on conflict (organization_id, document_type, period)
      do update set next_value = s.next_value
    `);
  }
}

function countersOf(tx: Transaction, organizationId: string) {
  return tx
    .select()
    .from(documentSequences)
    .where(eq(documentSequences.organizationId, organizationId));
}

/** Where a counter stands: the next number it gives, 1 before it opens. */
function standing(
  counters: Counter[],
  type: DocumentType,
  period: string,
): number {
  return (
    counters.find(
      (counter) => counter.documentType === type && counter.period === period,
    )?.nextValue ?? 1
  );
}

/** The last number each series gave, as printed: by when it was given. */
async function lastNumbers(
  tx: Transaction,
  organizationId: string,
): Promise<Record<DocumentType, string | null>> {
  const first = (rows: { number: string | null }[]) => rows[0]?.number ?? null;

  const invoice = await tx
    .select({ number: invoices.number })
    .from(invoices)
    .where(
      and(
        eq(invoices.organizationId, organizationId),
        isNotNull(invoices.number),
      ),
    )
    .orderBy(desc(invoices.issuedAt), desc(invoices.id))
    .limit(1);
  const creditNote = await tx
    .select({ number: creditNotes.number })
    .from(creditNotes)
    .where(eq(creditNotes.organizationId, organizationId))
    .orderBy(desc(creditNotes.createdAt), desc(creditNotes.id))
    .limit(1);
  const returnAuthorization = await tx
    .select({ number: returnAuthorizations.number })
    .from(returnAuthorizations)
    .where(eq(returnAuthorizations.organizationId, organizationId))
    .orderBy(
      desc(returnAuthorizations.createdAt),
      desc(returnAuthorizations.id),
    )
    .limit(1);
  const order = (direction: 'sale' | 'purchase') =>
    tx
      .select({ number: orders.number })
      .from(orders)
      .where(
        and(
          eq(orders.organizationId, organizationId),
          eq(orders.direction, direction),
        ),
      )
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(1);

  return {
    invoice: first(invoice),
    credit_note: first(creditNote),
    return_authorization: first(returnAuthorization),
    sale_order: first(await order('sale')),
    purchase_order: first(await order('purchase')),
  };
}

/**
 * Refuses a series' new settings when they would give a number a document
 * in the organization already carries, from today on: in today's period at
 * or above the next number, or in a later one at or above where it stands.
 * Below where the counter stands, too, while documents carry the prefix:
 * those numbers were given, if only to drafts deleted since.
 *
 * Every document's number is read back against the prefix, so values are
 * compared, not text: INV-0050 and INV-000050 are both 50.
 */
async function assertFree(
  tx: Transaction,
  organizationId: string,
  series: SeriesKey,
  wanted: NumberingSeriesDto,
  counters: Counter[],
  today: string,
): Promise<void> {
  const type = SERIES[series];
  const key = periodKey(wanted.reset, today);
  const stands = standing(counters, type, key);
  const next = wanted.next ?? stands;
  const pattern = patternOf(wanted.prefix);
  const printed = render(wanted.prefix, today);

  const carried = await tx.execute<{ kind: DocumentType; number: string }>(sql`
    select 'invoice' as kind, i.number from invoices as i
      where i.organization_id = ${organizationId} and i.number ~ ${pattern.source}
    union all
    select 'credit_note', c.number from credit_notes as c
      where c.organization_id = ${organizationId} and c.number ~ ${pattern.source}
    union all
    select 'return_authorization', r.number from return_authorizations as r
      where r.organization_id = ${organizationId} and r.number ~ ${pattern.source}
    union all
    select case o.direction when 'sale' then 'sale_order' else 'purchase_order' end,
      o.number from orders as o
      where o.organization_id = ${organizationId} and o.number ~ ${pattern.source}
  `);

  let highest: { kind: DocumentType; number: string; value: number } | null =
    null;
  for (const row of carried.rows) {
    const read = pattern.read(row.number);
    if (!read) continue;
    const period = periodOfParts(wanted.reset, read.parts);
    if (period === key) {
      if (!highest || read.value > highest.value) {
        highest = { ...row, value: read.value };
      }
    } else if (period.length === key.length && period > key) {
      if (read.value >= standing(counters, type, period)) {
        throw new ConflictException(
          withCode(
            t(
              {
                id: 'numbering.numberTakenLater',
                defaultMessage:
                  '{number} is already {kind, select, invoice {an invoice} credit_note {a credit note} return_authorization {a return authorization} sale_order {a sale order} other {a purchase order}}, and this numbering would give it again. Choose another prefix.',
              },
              { number: row.number, kind: row.kind },
            ),
            ERROR_CODES.numberingNumberTaken,
            { series: [series] },
          ),
        );
      }
    }
  }

  const lowered = highest !== null && next < stands;
  if (highest && highest.value >= next) {
    const lowest = Math.max(highest.value + 1, lowered ? stands : 1);
    throw new ConflictException(
      withCode(
        t(
          {
            id: 'numbering.numberTaken',
            defaultMessage:
              '{number} is already {kind, select, invoice {an invoice} credit_note {a credit note} return_authorization {a return authorization} sale_order {a sale order} other {a purchase order}}. {prefix, select, none {Without a prefix} other {Under {prefix}}}, the next number must be {lowest} or more.',
          },
          {
            number: highest.number,
            kind: highest.kind,
            prefix: printed || 'none',
            lowest: String(lowest),
          },
        ),
        ERROR_CODES.numberingNumberTaken,
        { series: [series], lowest },
      ),
    );
  }
  if (lowered) {
    throw new ConflictException(
      withCode(
        t(
          {
            id: 'numbering.numberLower',
            defaultMessage:
              'Numbers up to {last} have been given. {prefix, select, none {Without a prefix} other {Under {prefix}}}, the next number must be {lowest} or more.',
          },
          {
            last: formatNumber(wanted.prefix, wanted.digits, stands - 1, today),
            prefix: printed || 'none',
            lowest: String(stands),
          },
        ),
        ERROR_CODES.numberingNumberTaken,
        { series: [series], lowest: stands },
      ),
    );
  }
}

/**
 * Writes a series' settings, and carries them to today's counter, which the
 * save holds (lockTodaysCounters), and to any later one already open. An
 * earlier period keeps what it numbered with, so a backdated invoice reads
 * like the rest of its year (ADR-073).
 */
async function save(
  tx: Transaction,
  organizationId: string,
  type: DocumentType,
  wanted: NumberingSeriesDto,
  today: string,
): Promise<void> {
  const key = periodKey(wanted.reset, today);
  const { prefix, digits, reset } = wanted;

  const [setting] = await tx
    .update(documentNumbering)
    .set({ prefix, digits, reset })
    .where(
      and(
        eq(documentNumbering.organizationId, organizationId),
        eq(documentNumbering.documentType, type),
      ),
    )
    .returning({ documentType: documentNumbering.documentType });
  if (!setting) {
    // As in takeNumber: a missing row is a broken record, not a refusal.
    throw new Error(
      `No numbering for ${type} in organization ${organizationId}`,
    );
  }

  await tx
    .update(documentSequences)
    .set({
      prefix,
      digits,
      ...(wanted.next !== undefined ? { nextValue: wanted.next } : {}),
    })
    .where(
      and(
        eq(documentSequences.organizationId, organizationId),
        eq(documentSequences.documentType, type),
        eq(documentSequences.period, key),
      ),
    );

  if (key !== '') {
    await tx
      .update(documentSequences)
      .set({ prefix, digits })
      .where(
        and(
          eq(documentSequences.organizationId, organizationId),
          eq(documentSequences.documentType, type),
          gt(documentSequences.period, key),
          eq(sql`length(${documentSequences.period})`, key.length),
        ),
      );
  }
}
