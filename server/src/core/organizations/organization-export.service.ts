import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, isNull, type SQL, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { ZipFile } from 'yazl';

import { BOM, csvRow, type CsvValue } from '../../common/csv';
import type { Locale } from '../../common/locales';
import { todayUtc } from '../../common/today';
import type { Transaction } from '../../database/database.module';
import {
  FILE_SIZES,
  files,
  type FileSize,
  organizations,
} from '../../database/schema';
import { runInTenantContext } from '../../database/tenant-context';
import { TenantDb } from '../../database/tenant-db.service';
import { t, translate } from '../../i18n/translate';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-actions';
import type { RequestContext } from '../auth/request-context';
import { FILE_STORAGE, type FileStorage, keyOf } from '../files/file-storage';
import { exportedTables } from './organization-tables';

/** Rows fetched from a cursor at a time: the export never holds a table. */
const BATCH = 500;

/** What the export held, for its audit entry. */
interface Counts {
  tables: number;
  rows: number;
  files: number;
}

/**
 * Everything the organization holds, as one ZIP (ADR-070): a CSV per table
 * it owns, members.csv, its own row, the files it uploaded, and a README.
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
  ) {}

  /**
   * Writes the ZIP to the response. The audit entry is written before the
   * response ends, so a deletion asked for straight after the download
   * finds it (ADR-070).
   */
  async writeTo(
    res: Response,
    context: RequestContext,
    locale: Locale,
  ): Promise<void> {
    const counts: Counts = { tables: 0, rows: 0, files: 0 };

    await this.tenantDb.transaction(async (tx, organizationId) => {
      await tx.execute(
        sql`set transaction isolation level repeatable read, read only`,
      );
      // Moments in UTC whatever the server's setting, as the README says.
      await tx.execute(sql`set local time zone 'UTC'`);

      const [organization] = await tx
        .select({ name: organizations.name, slug: organizations.slug })
        .from(organizations)
        .where(eq(organizations.id, organizationId));

      const today = todayUtc(new Date());
      const zip = new ZipFile();
      // A Readable at run time, typed as the older stream interface.
      const archive = zip.outputStream as Readable;
      // yazl reports a failed entry on the ZipFile, not on its output.
      zip.on('error', (error: Error) => archive.destroy(error));

      zip.addBuffer(
        Buffer.from(readme(organization.name, today, locale), 'utf8'),
        'README.txt',
      );

      const csv = (name: string, query: SQL) => {
        counts.tables += 1;
        zip.addReadStream(
          Readable.from(csvOf(tx, `export_${counts.tables}`, query, counts)),
          `${name}.csv`,
        );
      };

      csv(
        'organization',
        sql`select * from organizations where id = ${organizationId}`,
      );
      csv(
        'members',
        sql`select u.id as user_id, u.name, u.email, r.name as role,
                   m.job_title, m.department, m.location, m.work_phone,
                   m.extension, m.created_at as joined_at
            from memberships m
            join users u on u.id = m.user_id
            join roles r on r.id = m.role_id
            where m.organization_id = ${organizationId}
            order by m.created_at, m.id`,
      );
      for (const table of exportedTables()) {
        csv(
          table,
          sql`select * from ${sql.identifier(table)}
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
        zip.addReadStream(
          Readable.from(this.bytesOf(keyOf(organizationId, file.id, size))),
          `files/${file.id}-${file.originalName}`,
          { compress: false },
        );
      }
      zip.end();

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${organization.slug}-export-${today}.zip"`,
      );

      const record = () =>
        runInTenantContext({ userId: context.userId, organizationId }, () =>
          this.audit.record({
            actorId: context.userId,
            action: AUDIT_ACTIONS.ORGANIZATION_EXPORTED,
            resourceType: 'organization',
            resourceId: organizationId,
            payload: { ...counts },
            ip: context.ip,
            userAgent: context.userAgent,
          }),
        );

      try {
        await pipeline(archive, auditedAtTheEnd(record), res);
      } catch (error) {
        // Nothing to answer with once the download has begun: the browser
        // sees it cut short. Logged, and the transaction rolls back.
        if (res.headersSent) {
          this.logger.warn(
            `Export of ${organizationId} stopped: ${String(error)}`,
          );
          return;
        }
        throw error;
      }
    });
  }

  /** A file's bytes, fetched only when the archive reaches it. */
  private async *bytesOf(key: string): AsyncGenerator<Buffer> {
    const stream = await this.storage.get(key);
    for await (const chunk of stream) yield chunk as Buffer;
  }
}

/** The largest size a file is kept in. */
function largest(sizes: Partial<Record<FileSize, unknown>>): FileSize | null {
  return [...FILE_SIZES].reverse().find((size) => size in sizes) ?? null;
}

/**
 * A CSV of a query, read through a cursor a batch at a time, in the
 * export's transaction: the header from the columns, then a row per record,
 * every value as Postgres wrote it (ADR-057's rules for the fields).
 */
async function* csvOf(
  tx: Transaction,
  cursor: string,
  query: SQL,
  counts: Counts,
): AsyncGenerator<string> {
  const name = sql.identifier(cursor);
  await tx.execute(sql`declare ${name} no scroll cursor for ${query}`);

  yield BOM;
  let header = true;
  for (;;) {
    const result = await tx.execute(
      sql`fetch ${sql.raw(String(BATCH))} from ${name}`,
    );
    if (header) {
      yield csvRow(result.fields.map((field) => field.name));
      header = false;
    }
    if (result.rows.length === 0) break;
    counts.rows += result.rows.length;
    yield result.rows
      .map((row) => csvRow(Object.values(row).map(cell)))
      .join('');
  }
  await tx.execute(sql`close ${name}`);
}

/** A value for csvRow: JSON as JSON, a moment as ISO 8601, the rest as is. */
function cell(value: unknown): CsvValue {
  if (value instanceof Date) return value.toISOString();
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
        'members.csv lists the members, with the user_id that columns such as created_by and actor_id hold. Someone who is no longer a member appears by id only. organization.csv holds the organization’s own details and settings, and audit_log.csv its audit log.',
    }),
    t({
      id: 'organization.export.readme.files',
      defaultMessage:
        'The files folder holds every file in use, such as the logo and product images, named by its id in files.csv and its original name.',
    }),
    t({
      id: 'organization.export.readme.values',
      defaultMessage:
        'Quantities and money are written as stored, with a full stop for the decimal point. Days are YYYY-MM-DD, and moments are in UTC.',
    }),
  ];
  return `${paragraphs.map((each) => translate(each, locale)).join('\r\n\r\n')}\r\n`;
}
