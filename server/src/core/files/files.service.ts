import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, isNull, lt, sql } from 'drizzle-orm';

import type { Env } from '../../config/env';
import {
  type Database,
  type Transaction,
  UNSAFE_GLOBAL_DB,
} from '../../database/database.module';
import {
  type FileKind,
  files,
  type FileSize,
  type StoredSize,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import type { Permission } from '../authorization/permissions';
import { KIND_RULES } from './file-kinds';
import { FILE_STORAGE, type FileStorage, keyOf } from './file-storage';
import {
  LOGO_MIN,
  LogoTooSmall,
  type Rendered,
  renderLogo,
  renderPhoto,
  UnreadableImage,
} from './images';
import { sniff, type Sniffed } from './sniff';

const DAY = 24 * 60 * 60 * 1000;

/** Released files keep their bytes this long, for undoing and restores. */
export const PURGE_AFTER_DAYS = 30;

/** An upload as multer hands it over, in memory. */
export interface UploadedBinary {
  buffer: Buffer;
  originalname: string;
  size: number;
}

/** A stored file, as the API returns it. */
export interface FileView {
  id: string;
  kind: FileKind;
  contentType: string;
  sizes: Partial<Record<FileSize, StoredSize>>;
  createdAt: Date;
}

/** One size of one file, ready to send. */
export interface Servable {
  key: string;
  contentType: string;
  bytes: number;
  etag: string;
  disposition: string;
}

/**
 * Every file (ADR-059): checked before it is kept, kept in the sizes its
 * kind needs, read back only by its own organization, released when the
 * record that used it lets go, purged 30 days later.
 */
@Injectable()
export class FilesService {
  private readonly limitBytes: number;

  constructor(
    private readonly tenantDb: TenantDb,
    @Inject(UNSAFE_GLOBAL_DB) private readonly db: Database,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    config: ConfigService<Env, true>,
  ) {
    this.limitBytes = config.get('FILES_ORG_LIMIT_BYTES', { infer: true });
  }

  /**
   * Checks an upload, makes its sizes and keeps them. The permission and
   * the size limit were checked on the way in (the controller); here, the
   * type from the bytes, the image itself, and the organization's limit.
   */
  async upload(
    kind: FileKind,
    file: UploadedBinary,
    userId: string,
  ): Promise<FileView> {
    const rule = KIND_RULES[kind];
    const type = sniff(file.buffer);
    if (!type || !rule.accepts.includes(type)) {
      throw new UnsupportedMediaTypeException(
        rule.render === 'logo'
          ? t({
              id: 'files.logo.type',
              defaultMessage: 'A logo must be a PNG, JPEG, WebP or SVG image',
            })
          : t({
              id: 'files.photo.type',
              defaultMessage: 'A photo must be a PNG, JPEG or WebP image',
            }),
      );
    }

    const rendered = await this.render(rule.render, file.buffer, type);
    const contentType = rule.render === 'logo' ? 'image/png' : 'image/webp';
    const bytes = rendered.reduce((sum, size) => sum + size.data.length, 0);

    const row = await this.tenantDb.transaction(async (tx, organizationId) => {
      // One upload at a time per organization, so two cannot both fit
      // under the limit that only one of them fits under.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`files:${organizationId}`}, 0))`,
      );
      const [{ used }] = await tx
        .select({ used: sql<string>`coalesce(sum(${files.bytes}), 0)` })
        .from(files)
        .where(eq(files.organizationId, organizationId));
      if (Number(used) + bytes > this.limitBytes) {
        throw new ConflictException(
          t(
            {
              id: 'files.quota.full',
              defaultMessage:
                'This would take your organization past its {limit} MB of files. Remove some before adding more.',
            },
            { limit: Math.round(this.limitBytes / (1024 * 1024)) },
          ),
        );
      }

      const [inserted] = await tx
        .insert(files)
        .values({
          organizationId,
          kind,
          contentType,
          sizes: Object.fromEntries(
            rendered.map((size) => [
              size.size,
              {
                width: size.width,
                height: size.height,
                bytes: size.data.length,
              },
            ]),
          ),
          bytes,
          sha256: createHash('sha256').update(file.buffer).digest('hex'),
          originalName: downloadName(
            file.originalname,
            rule.render === 'logo' ? 'png' : 'webp',
          ),
          createdBy: userId,
        })
        .returning();
      return inserted;
    });

    try {
      await Promise.all(
        rendered.map((size) =>
          this.storage.put(
            keyOf(row.organizationId, row.id, size.size),
            size.data,
            contentType,
          ),
        ),
      );
    } catch (error) {
      // Without its bytes the row is a lie: take it back, and say why.
      await this.db.delete(files).where(eq(files.id, row.id));
      throw error;
    }

    return viewOf(row);
  }

  /**
   * One size of a file, if this organization has it, it is not released,
   * and the member may see what it is for. Another organization's file is
   * simply not there, as for any record.
   */
  async find(
    id: string,
    size: FileSize,
    held: ReadonlySet<Permission>,
  ): Promise<Servable> {
    const row = await this.tenantDb.transaction(async (tx, organizationId) => {
      const [found] = await tx
        .select()
        .from(files)
        .where(
          and(
            eq(files.id, id),
            eq(files.organizationId, organizationId),
            isNull(files.releasedAt),
          ),
        );
      return found;
    });
    if (!row) {
      throw new NotFoundException(
        t({ id: 'files.notFound', defaultMessage: 'No such file' }),
      );
    }

    const view = KIND_RULES[row.kind as FileKind].view;
    if (view && !held.has(view)) {
      throw new ForbiddenException(
        t(
          {
            id: 'auth.missingPermission',
            defaultMessage: 'Missing permission: {permissions}',
          },
          { permissions: view },
        ),
      );
    }

    // A logo has only `full`; any size asked of it is that.
    const kept: FileSize = row.sizes[size] ? size : 'full';
    const stored = row.sizes[kept];
    if (!stored) throw new Error(`File ${row.id} has no ${kept} size`);

    return {
      key: keyOf(row.organizationId, row.id, kept),
      contentType: row.contentType,
      bytes: stored.bytes,
      etag: `"${row.sha256.slice(0, 32)}-${kept}"`,
      // Only images the server wrote itself are shown in the page.
      disposition: dispositionOf('inline', row.originalName),
    };
  }

  /** The bytes of what find returned. */
  stream(file: Servable): Promise<Readable> {
    return this.storage.get(file.key);
  }

  /**
   * In the transaction that saves the record using it: the upload is now
   * that record's, and kept. Refused if it is another organization's, of
   * another kind, already used, or released.
   */
  async attach(
    tx: Transaction,
    organizationId: string,
    id: string,
    kind: FileKind,
  ): Promise<void> {
    const [attached] = await tx
      .update(files)
      .set({ attachedAt: sql`now()` })
      .where(
        and(
          eq(files.id, id),
          eq(files.organizationId, organizationId),
          eq(files.kind, kind),
          isNull(files.attachedAt),
          isNull(files.releasedAt),
        ),
      )
      .returning({ id: files.id });
    if (!attached) {
      throw new BadRequestException(
        t({
          id: 'files.attach.unavailable',
          defaultMessage: 'That file cannot be used here. Upload it again.',
        }),
      );
    }
  }

  /** The record no longer uses it: purged PURGE_AFTER_DAYS from now. */
  async release(
    tx: Transaction,
    organizationId: string,
    id: string,
  ): Promise<void> {
    await tx
      .update(files)
      .set({ releasedAt: sql`now()` })
      .where(
        and(
          eq(files.id, id),
          eq(files.organizationId, organizationId),
          isNull(files.releasedAt),
        ),
      );
  }

  /**
   * Every organization's, so on the global connection. Uploads never
   * attached within a day are released; files released PURGE_AFTER_DAYS
   * ago lose their bytes, then their row. A batch at a time; the next run
   * takes the rest.
   */
  async purge(
    now = new Date(),
  ): Promise<{ released: number; deleted: number }> {
    const released = await this.db
      .update(files)
      .set({ releasedAt: now })
      .where(
        and(
          isNull(files.attachedAt),
          isNull(files.releasedAt),
          lt(files.createdAt, new Date(now.getTime() - DAY)),
        ),
      )
      .returning({ id: files.id });

    const due = await this.db
      .select({
        id: files.id,
        organizationId: files.organizationId,
        sizes: files.sizes,
      })
      .from(files)
      .where(
        lt(files.releasedAt, new Date(now.getTime() - PURGE_AFTER_DAYS * DAY)),
      )
      .limit(500);

    for (const row of due) {
      await Promise.all(
        (Object.keys(row.sizes) as FileSize[]).map((size) =>
          this.storage.delete(keyOf(row.organizationId, row.id, size)),
        ),
      );
      await this.db.delete(files).where(eq(files.id, row.id));
    }

    return { released: released.length, deleted: due.length };
  }

  private async render(
    render: 'logo' | 'photo',
    input: Buffer,
    type: Sniffed,
  ): Promise<Rendered[]> {
    try {
      return render === 'logo'
        ? await renderLogo(input, type)
        : await renderPhoto(input);
    } catch (error) {
      if (error instanceof LogoTooSmall) {
        throw new BadRequestException(
          t(
            {
              id: 'files.logo.tooSmall',
              defaultMessage: 'A logo must be at least {min} pixels wide',
            },
            { min: LOGO_MIN },
          ),
        );
      }
      if (error instanceof UnreadableImage) {
        throw new BadRequestException(
          t({
            id: 'files.image.unreadable',
            defaultMessage:
              'This image could not be read. It may be damaged, or not the type its name says.',
          }),
        );
      }
      throw error;
    }
  }
}

function viewOf(row: typeof files.$inferSelect): FileView {
  return {
    id: row.id,
    kind: row.kind as FileKind,
    contentType: row.contentType,
    sizes: row.sizes,
    createdAt: row.createdAt,
  };
}

/**
 * The name a person gave, for downloading: no folders, no control
 * characters or quotes, not too long, with the stored type's extension.
 * Multer reads a name's bytes as Latin-1; a browser sends UTF-8, so a
 * Chinese name is turned back into what was sent.
 */
export function downloadName(sent: string, extension: string): string {
  const name = Buffer.from(sent, 'latin1').toString('utf8');
  const base = name.split(/[\\/]/).pop() ?? '';
  const stem = [...base.replace(/\.[^.]*$/, '')]
    .filter((c) => c.charCodeAt(0) >= 32 && c !== '\u007f' && c !== '"')
    .join('')
    .trim()
    .slice(0, 120);
  return `${stem || 'file'}.${extension}`;
}

/** A plain ASCII name for old clients, the real one for everyone else. */
function dispositionOf(type: 'inline' | 'attachment', name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
