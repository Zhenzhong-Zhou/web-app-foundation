import { Readable, Transform } from 'node:stream';
import { finished, pipeline } from 'node:stream/promises';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, isNull, type SQL, sql } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import type { Response } from 'express';
import { ZipFile } from 'yazl';

import { BOM, csvMoment, csvRow, type CsvValue } from '../../common/csv';
import type { Locale } from '../../common/locales';
import { todayIn } from '../../common/today';
import type { Transaction } from '../../database/database.module';
import {
  FILE_SIZES,
  files,
  type FileSize,
  organizations,
  roles,
} from '../../database/schema';
import { runInTenantContext } from '../../database/tenant-context';
import { TenantDb } from '../../database/tenant-db.service';
import {
  recipientLocale,
  t,
  type Translatable,
  translate,
} from '../../i18n/translate';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-actions';
import type { RequestContext } from '../auth/request-context';
import { SYSTEM_ROLE_DESCRIPTIONS } from '../authorization/permissions';
import { FILE_STORAGE, type FileStorage, keyOf } from '../files/file-storage';
import { ExportContributions } from './export-contributions';
import { exportedTables } from './organization-tables';

/** Rows fetched from a cursor at a time: the export never holds a table. */
const BATCH = 500;

/** What the export held, for its audit entry. */
interface Counts {
  tables: number;
  rows: number;
  files: number;
  /** The invoices and credit notes, as PDFs (ADR-071). */
  documents: number;
}

/**
 * Everything the organization holds, as one ZIP (ADR-070): a CSV per table
 * it owns, members.csv, its own row, the files it uploaded, its invoices
 * and credit notes as PDFs (ADR-071), and a README with a glossary.
 *
 * Read in one repeatable-read transaction, so the files agree with each
 * other, and streamed as it is read, a cursor at a time: nothing is held
 * in memory, whatever the organization's size.
 */
@Injectable()
export class OrganizationExportService {
  private readonly logger = new Logger(OrganizationExportService.name);

  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: AuditService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    private readonly contributions: ExportContributions,
  ) {}

  /**
   * Writes the ZIP to the response. The audit entry is written before the
   * response ends, so a deletion asked for straight after the download
   * finds it (ADR-070).
   */
  async writeTo(
    res: Response,
    context: RequestContext,
    /** The language the app shows, from the link (ADR-071). */
    asked?: Locale,
  ): Promise<void> {
    const counts: Counts = { tables: 0, rows: 0, files: 0, documents: 0 };
    // Cleared when the transaction ends, however it ends: a table still
    // being read must not send another fetch down a connection the pool has
    // already handed to someone else's request.
    const reading = { open: true };

    try {
      const { streaming } = await this.tenantDb.transaction(
        async (tx, organizationId) => {
          await tx.execute(
            sql`set transaction isolation level repeatable read, read only`,
          );
          // Moments in UTC whatever the server's setting, as the README says.
          await tx.execute(sql`set local time zone 'UTC'`);

          const [organization] = await tx
            .select({
              name: organizations.name,
              slug: organizations.slug,
              timeZone: organizations.timeZone,
            })
            .from(organizations)
            .where(eq(organizations.id, organizationId));
          // The README in the language the app shows the Owner, which the
          // link says (ADR-071), since a plain link cannot send the app's
          // Accept-Language. Without it, theirs, else the browser's.
          const { rows: chosen } = await tx.execute<{ locale: string | null }>(
            sql`select locale from users where id = ${context.userId}`,
          );
          const locale =
            asked ?? recipientLocale(chosen[0]?.locale, context.language);

          // The file is named by the organization's day (ADR-072); the
          // moments inside stay UTC, as the README says.
          const today = todayIn(organization.timeZone);
          const zip = new ZipFile();
          // A Readable at run time, typed as the older stream interface.
          const archive = zip.outputStream as Readable;
          // yazl reports a failed entry on the ZipFile, not on its output.
          zip.on('error', (error: Error) => archive.destroy(error));
          // Nor does it listen to an entry's own errors: one unanswered
          // 'error' on a source stream is an uncaught exception, and takes
          // the whole server down. Every entry's failure ends the archive,
          // and with it the download.
          const entry = (source: Readable, name: string, compress = true) => {
            source.once('error', (error: Error) => archive.destroy(error));
            zip.addReadStream(source, name, { compress });
            return source;
          };

          zip.addBuffer(
            Buffer.from(readme(organization.name, today, locale), 'utf8'),
            'README.txt',
          );

          // Each table's read, finished: then the transaction ends, and the
          // files after them, most of the download, stream with no connection
          // held.
          const tables: Promise<void>[] = [];
          const csv = (name: string, query: SQL) => {
            counts.tables += 1;
            const rows = Readable.from(
              csvOf(tx, `export_${counts.tables}`, query, counts, reading),
            );
            tables.push(finished(rows));
            entry(rows, `${name}.csv`);
          };

          csv(
            'organization',
            sql`select * from organizations where id = ${organizationId}`,
          );
          // Each member's roles by name, for reading (ADR-080). A made
          // role's name may hold a comma, so membership_roles.csv holds them
          // as ids, the file to count and join by (#180).
          csv(
            'members',
            sql`select u.id as user_id, u.name, u.email,
                   (select string_agg(r.name, ', ' order by r.id)
                    from membership_roles mr
                    join roles r on r.id = mr.role_id
                    where mr.membership_id = m.id) as role,
                   m.job_title, m.department, m.location, m.work_phone,
                   m.extension, m.created_at as joined_at
            from memberships m
            join users u on u.id = m.user_id
            where m.organization_id = ${organizationId}
            order by m.created_at, m.id`,
          );
          // What each role may do: role_permissions has no organization_id of
          // its own, so the tables below cannot find it.
          csv(
            'role_permissions',
            sql`select r.id as role_id, r.name as role, p.key as permission
            from role_permissions rp
            join roles r on r.id = rp.role_id
            join permissions p on p.id = rp.permission_id
            where r.organization_id = ${organizationId}
            order by r.name, p.key`,
          );
          for (const table of exportedTables()) {
            csv(
              table,
              table === 'roles'
                ? rolesOf(organizationId, locale)
                : table === 'membership_roles'
                  ? membershipRolesOf(organizationId)
                  : sql`select * from ${sql.identifier(table)}
              where organization_id = ${organizationId}
              order by 1`,
            );
          }

          // The files in use, at the largest size kept. A released file is
          // in files.csv, its bytes on their way to the purge (ADR-059).
          const uploaded = await tx
            .select({
              id: files.id,
              sizes: files.sizes,
              originalName: files.originalName,
            })
            .from(files)
            .where(
              and(
                eq(files.organizationId, organizationId),
                isNull(files.releasedAt),
              ),
            )
            .orderBy(files.id);

          for (const file of uploaded) {
            const size = largest(file.sizes);
            if (!size) continue;
            counts.files += 1;
            // Stored as they are: WebP and PNG are compressed already.
            entry(
              Readable.from(this.bytesOf(keyOf(organizationId, file.id, size))),
              `files/${file.id}-${file.originalName}`,
              false,
            );
          }

          // What modules add (ADR-071): listed here, in this snapshot, and
          // made last, each only when the archive reaches it, so one PDF is
          // drawn at a time and none is held, nor a stream for it waiting.
          // Stored as they are: a PDF is compressed already. Made outside
          // this transaction, and so in the request's tenant again, which a
          // stream does not carry.
          const tenant = { userId: context.userId, organizationId };
          for (const contributor of this.contributions.all()) {
            const added = await contributor.entries(tx, organizationId);
            for (const each of added) {
              counts.documents += 1;
              zip.addReadStreamLazy(each.name, { compress: false }, (made) => {
                runInTenantContext(tenant, each.bytes)
                  .then((bytes) => made(null, Readable.from(bytes)))
                  .catch((error: Error) => archive.destroy(error));
              });
            }
          }
          zip.end();

          res.setHeader('Content-Type', 'application/zip');
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="${organization.slug}-export-${today}.zip"`,
          );

          const record = () =>
            runInTenantContext(tenant, () =>
              this.audit.record({
                actorId: context.userId,
                action: AUDIT_ACTIONS.ORGANIZATION_EXPORTED,
                resourceType: 'organization',
                resourceId: organizationId,
                // Each key named, so the compiler checks it is declared.
                payload: {
                  tables: counts.tables,
                  rows: counts.rows,
                  files: counts.files,
                  documents: counts.documents,
                },
                ip: context.ip,
                userAgent: context.userAgent,
              }),
            );

          const streaming = pipeline(archive, auditedAtTheEnd(record), res);
          // The connection is held only while a table is read; a download that
          // stops first ends it as well.
          try {
            await Promise.race([Promise.all(tables), streaming]);
          } finally {
            reading.open = false;
          }
          return { streaming };
        },
      );
      await streaming;
    } catch (error) {
      // Nothing to answer with once the download has begun: the browser
      // sees it cut short. Logged; a transaction still open rolls back.
      if (res.headersSent) {
        this.logger.warn(
          `Export of ${context.organizationId} stopped: ${String(error)}`,
        );
        // Closed, so the browser sees a failed download rather than waiting
        // for bytes that will not come.
        res.destroy();
        return;
      }
      throw error;
    }
  }

  /** A file's bytes, fetched only when the archive reaches it. */
  private async *bytesOf(key: string): AsyncGenerator<Buffer> {
    const stream = await this.storage.get(key);
    for await (const chunk of stream) yield chunk as Buffer;
  }
}

/**
 * roles.csv: every column as stored but a built-in role's line, which the
 * table does not hold (ADR-080): the catalogue's, in the export's language.
 */
function rolesOf(organizationId: string, locale: Locale): SQL {
  const lines = Object.entries(SYSTEM_ROLE_DESCRIPTIONS).map(
    ([name, line]) =>
      sql`when is_system and name = ${name} then ${translate(line, locale)}`,
  );
  const columns = getTableConfig(roles).columns.map((column) =>
    column.name === 'description'
      ? sql`case ${sql.join(lines, sql` `)} else description end as description`
      : sql.identifier(column.name),
  );
  return sql`select ${sql.join(columns, sql`, `)} from roles
    where organization_id = ${organizationId}
    order by 1`;
}

/**
 * membership_roles.csv (#180): the roles each member holds, a row for each,
 * every column as stored but membership_id, which no file carries, given as
 * the member's user_id, which members.csv does. In members.csv's order, and
 * each member's roles in the order its role column names them.
 */
function membershipRolesOf(organizationId: string): SQL {
  return sql`select mr.id, mr.organization_id, m.user_id, mr.role_id,
      mr.created_at
    from membership_roles mr
    join memberships m on m.id = mr.membership_id
    where mr.organization_id = ${organizationId}
    order by m.created_at, m.id, mr.role_id`;
}

/** The largest size a file is kept in. */
function largest(sizes: Partial<Record<FileSize, unknown>>): FileSize | null {
  return [...FILE_SIZES].reverse().find((size) => size in sizes) ?? null;
}

/**
 * A CSV of a query, read through a cursor a batch at a time, in the
 * export's transaction: the header from the columns, then a row per record,
 * every value as Postgres wrote it but a moment (ADR-057's rules for the
 * fields).
 */
async function* csvOf(
  tx: Transaction,
  cursor: string,
  query: SQL,
  counts: Counts,
  reading: { open: boolean },
): AsyncGenerator<string> {
  // Nothing sent once the transaction has ended: its connection is back in
  // the pool, perhaps inside another request's transaction.
  const execute = (statement: SQL) => {
    if (!reading.open) throw new Error('The export’s transaction has ended');
    return tx.execute(statement);
  };
  const name = sql.identifier(cursor);
  await execute(sql`declare ${name} no scroll cursor for ${query}`);

  const next = () => execute(sql`fetch ${sql.raw(String(BATCH))} from ${name}`);

  yield BOM;
  let result = await next();
  yield csvRow(result.fields.map((field) => field.name));
  const types = result.fields.map((field) => field.dataTypeID);
  while (result.rows.length > 0) {
    counts.rows += result.rows.length;
    yield result.rows
      .map((row) =>
        csvRow(Object.values(row).map((value, i) => cell(value, types[i]))),
      )
      .join('');
    result = await next();
  }
  await execute(sql`close ${name}`);
}

/** Postgres's types for a moment, timestamptz and timestamp. */
const TIMESTAMPTZ = 1184;
const TIMESTAMP = 1114;

/**
 * A value for csvRow: JSON as JSON, the rest as is, and a moment as
 * 2026-10-15 18:54:11, in UTC, which a spreadsheet opens as a date
 * (ADR-071), rather than as Postgres writes it, with fractions and an
 * offset. Known by its column's type, since a raw query hands every moment
 * over as text, and a note that looks like a time is not one.
 */
function cell(value: unknown, type: number): CsvValue {
  if (typeof value === 'string') {
    // The session is in UTC, so a timestamptz arrives at +00. A timestamp
    // has no zone: it is written as stored, which reading it as UTC keeps.
    if (type === TIMESTAMPTZ) return csvMoment(value);
    if (type === TIMESTAMP) return csvMoment(`${value}+00`);
  }
  if (Buffer.isBuffer(value)) return value.toString('base64');
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }
  return value as CsvValue;
}

/**
 * Passes the archive through, and holds its end until the audit entry is
 * written: the download is complete only once it is recorded.
 */
function auditedAtTheEnd(record: () => Promise<void>): Transform {
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      callback(null, chunk);
    },
    flush(callback) {
      record().then(
        () => callback(),
        (error: unknown) => callback(error as Error),
      );
    },
  });
}

/** What the archive holds, in the reader's language. */
function readme(organization: string, date: string, locale: Locale): string {
  const paragraphs = [
    t(
      {
        id: 'organization.export.readme.title',
        defaultMessage: '{organization}: everything it holds, exported {date}',
      },
      { organization, date },
    ),
    t({
      id: 'organization.export.readme.snapshot',
      defaultMessage:
        'Every file shows the organization as it was when the export began.',
    }),
    t({
      id: 'organization.export.readme.tables',
      defaultMessage:
        'Each .csv file is one kind of record, named for its table, with a row per record and every column as stored. Ids join the files: a column ending in _id holds the id of a row in another file, such as invoice_id in invoice_lines.csv, which is an id in invoices.csv.',
    }),
    t({
      id: 'organization.export.readme.members',
      defaultMessage:
        'members.csv lists the members, with the user_id that columns such as created_by and actor_id hold. Someone who is no longer a member appears by id only. role_permissions.csv lists what each role may do. organization.csv holds the organization’s own details and settings, and audit_log.csv its audit log.',
    }),
    t({
      id: 'organization.export.readme.files',
      defaultMessage:
        'The files folder holds every file in use, such as the logo and product images, named by its id in files.csv and its original name.',
    }),
    t({
      id: 'organization.export.readme.documents',
      defaultMessage:
        'The documents folder holds every invoice ever issued, voided ones included, and every credit note, each as a PDF named by its number, exactly as Download PDF gives it. A draft is not there: it was never sent.',
    }),
    t({
      id: 'organization.export.readme.values',
      defaultMessage:
        'Quantities and money are written as stored, with a full stop for the decimal point. Days are written YYYY-MM-DD, and moments YYYY-MM-DD HH:MM:SS, in UTC.',
    }),
  ];

  const said = (each: Translatable) => translate(each, locale);
  return [...paragraphs.map(said), GLOSSARY.map(said).join('\r\n')]
    .join('\r\n\r\n')
    .concat('\r\n');
}

/**
 * The README's glossary (#118, ADR-071), under its title: the columns the
 * main tables share, each line naming a column, or a family of them, and
 * what it holds. The CSV headers stay as stored, so a later import maps
 * them back; the glossary is what makes them readable to a bookkeeper.
 */
const GLOSSARY = [
  t({
    id: 'organization.export.glossary.title',
    defaultMessage: 'Glossary: what the columns mean',
  }),
  t({
    id: 'organization.export.glossary.intro',
    defaultMessage:
      'Each line names a column, or a family of columns, and says what it holds. A column in several files means the same in each.',
  }),
  t({
    id: 'organization.export.glossary.id',
    defaultMessage:
      'id — the record’s own id. A column ending in _id elsewhere holds it: partner_id is an id in partners.csv.',
  }),
  t({
    id: 'organization.export.glossary.organization',
    defaultMessage:
      'organization_id — the organization. The same in every row.',
  }),
  t({
    id: 'organization.export.glossary.created',
    defaultMessage:
      'created_at, updated_at — when the record was made and last changed, in UTC.',
  }),
  t({
    id: 'organization.export.glossary.who',
    defaultMessage:
      'created_by, issued_by, voided_by, actor_id — who did it: a user_id in members.csv.',
  }),
  t({
    id: 'organization.export.glossary.status',
    defaultMessage:
      'status — where the record stands, such as draft, confirmed, issued or voided.',
  }),
  t({
    id: 'organization.export.glossary.number',
    defaultMessage:
      'number — the number printed on the document, such as INV-000001 or CN-000001.',
  }),
  t({
    id: 'organization.export.glossary.numbering',
    defaultMessage:
      'document_numbering, document_sequences — how each kind of document is numbered, and the counter for each year, month or day; a number already given stays on its document.',
  }),
  t({
    id: 'organization.export.glossary.reference',
    defaultMessage:
      'reference — on an order, the customer’s or supplier’s own number for it.',
  }),
  t({
    id: 'organization.export.glossary.direction',
    defaultMessage: 'direction — on an order, sale or purchase.',
  }),
  t({
    id: 'organization.export.glossary.sku',
    defaultMessage: 'sku — the code of a product variant, as on its label.',
  }),
  t({
    id: 'organization.export.glossary.quantity',
    defaultMessage:
      'quantity_ordered, quantity_fulfilled, quantity_returned — how many were ordered, shipped or received, and returned.',
  }),
  t({
    id: 'organization.export.glossary.price',
    defaultMessage:
      'unit_price — the price of one unit, before tax. currency — its three-letter code, such as CAD or CNY.',
  }),
  t({
    id: 'organization.export.glossary.amounts',
    defaultMessage:
      'net_amount, subtotal, tax_total, total — before tax, the tax, and the total owed or credited, tax included.',
  }),
  t({
    id: 'organization.export.glossary.parties',
    defaultMessage:
      'seller_…, bill_to_…, ship_to_… — the seller, the customer billed and where the goods went: names and addresses as the document printed them that day.',
  }),
  t({
    id: 'organization.export.glossary.dates',
    defaultMessage:
      'invoice_date, due_date, credit_date — the days the document carries.',
  }),
  t({
    id: 'organization.export.glossary.issued',
    defaultMessage:
      'issued_at, voided_at, void_reason — when the document was issued, when it was voided, and why.',
  }),
  t({
    id: 'organization.export.glossary.language',
    defaultMessage:
      'language, second_language — the languages the document prints in: en, fr-CA or zh-Hans.',
  }),
  t({
    id: 'organization.export.glossary.lots',
    defaultMessage:
      'lot_id, code, expires_at — a lot of goods, the code printed on it, and the day it expires.',
  }),
  t({
    id: 'organization.export.glossary.movements',
    defaultMessage:
      'from_location_id, to_location_id, reason — in stock_movements.csv, where stock left, where it arrived, and why.',
  }),
  t({
    id: 'organization.export.glossary.audit',
    defaultMessage:
      'action, resource_type, resource_id, payload — in audit_log.csv, what happened, named for the thing and then the event (user.created, invoice.issued), what it happened to, and its details as JSON. The app’s Audit log shows each in words.',
  }),
  t({
    id: 'organization.export.glossary.invitations',
    defaultMessage:
      'In invitations.csv, each invitation: email, the address invited; locale, the language it is written in; note, the inviter’s message; invited_by, who sent it, a user_id; link, how its latest link went: emailed, copied, or not_sent when the email did not go; expires_at, when that link ends, in UTC; accepted_at, when it was accepted, and membership_id, the membership it made; revoked_at, when it was revoked. The roles each grants are in invitation_roles.csv, by invitation_id and role_id.',
  }),
  t({
    id: 'organization.export.glossary.roles',
    defaultMessage:
      'In roles.csv, each role: name, as the organization named it, the three built in under their English names, Owner, Admin and Viewer; description, what it is for, a built-in role’s in the language of this README; updated_by, who saved a role the organization made last, a user_id. What each role may do is in role_permissions.csv.',
  }),
  t({
    id: 'organization.export.glossary.memberRoles',
    defaultMessage:
      'In membership_roles.csv, the roles each member holds, a row for each: user_id, the member in members.csv, and role_id, the role in roles.csv. The role column of members.csv names them for reading, joined with commas, which a role’s own name may also hold: count and join by membership_roles.csv.',
  }),
  t({
    id: 'organization.export.glossary.flags',
    defaultMessage:
      'A column starting is_ holds true or false, such as is_active.',
  }),
];
