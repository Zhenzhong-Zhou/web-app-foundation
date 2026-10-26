import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, isNull, sql } from 'drizzle-orm';

import type { Env } from '../../config/env';
import type { Transaction } from '../../database/database.module';
import {
  type FileKind,
  files,
  type FileSize,
  type OrganizationFileKind,
  organizations,
  type StoredSize,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t, type Translatable } from '../../i18n/translate';
import type { RequestContext } from '../auth/request-context';
import { PermissionsService } from '../authorization/permissions.service';
import { dispositionOf } from './content-disposition';
import { KIND_RULES, type KindRule } from './file-kinds';
import { FILE_STORAGE, type FileStorage, keyOf, ownerOf } from './file-storage';
import {
  ImageRefused,
  LOGO_MIN,
  type Rendered,
  renderLogo,
  renderPhoto,
  renderSquareLogo,
  SQUARE_LOGO_MIN,
  UnreadableImage,
} from './images';
import { sniff, type Sniffed } from './sniff';

/** What each refusal of an image says (images.ts, ImageRefused). */
const REFUSED: Record<ImageRefused['reason'], () => Translatable> = {
  logoTooSmall: () =>
    t(
      {
        id: 'files.logo.tooSmall',
        defaultMessage: 'A logo must be at least {min} pixels wide',
      },
      { min: LOGO_MIN },
    ),
  squareLogoTooSmall: () =>
    t(
      {
        id: 'files.squareLogo.small',
        defaultMessage:
          'A square logo must be at least {min} pixels on each side.',
      },
      { min: SQUARE_LOGO_MIN },
    ),
  squareLogoNotSquare: () =>
    t({
      id: 'files.squareLogo.shape',
      defaultMessage:
        'A square logo must be about square, at most 5\u00a0:\u00a04 either way. Use a wide image as the main logo.',
    }),
};

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
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    private readonly permissions: PermissionsService,
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
    kind: OrganizationFileKind,
    file: UploadedBinary,
    userId: string,
  ): Promise<FileView> {
    const rule = KIND_RULES[kind];
    const type = sniff(file.buffer);
    if (!type || !rule.accepts.includes(type)) {
      // Either logo goes by a logo's words.
      throw new UnsupportedMediaTypeException(
        rule.render !== 'photo'
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
    const contentType = `image/${rule.format}`;
    const bytes = rendered.reduce((sum, size) => sum + size.data.length, 0);
    // Before the transaction, not inside it: hashing up to 20 MB would
    // hold the organization's upload lock for as long.
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');

    // The bytes first, under an id taken beforehand, then a short
    // transaction for the row (ADR-070, amended): a transaction held
    // across storage writes would hold a database connection for as long
    // as the bucket takes, and a gallery's worth of uploads at once could
    // hold the pool.
    const { id, organizationId } = await this.tenantDb.transaction(
      async (tx, organizationId) => {
        const { rows } = await tx.execute<{ id: string }>(
          sql`select uuidv7() as id`,
        );
        return { id: rows[0].id, organizationId };
      },
    );
    const keys = rendered.map((size) => keyOf(organizationId, id, size.size));

    let row: typeof files.$inferSelect;
    try {
      // Every write settled before any is judged: a delete below must never
      // run ahead of a write still in flight, which would land after it and
      // leave bytes with no row.
      const written = await Promise.allSettled(
        rendered.map((size, index) =>
          this.storage.put(keys[index], size.data, contentType),
        ),
      );
      const failed = written.find(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected',
      );
      if (failed) throw failed.reason;

      row = await this.tenantDb.transaction(async (tx) => {
        // One upload at a time per organization, so two cannot both fit
        // under the limit that only one of them fits under.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`files:${organizationId}`}, 0))`,
        );

        // Not once its deletion has begun, nor once it is gone (ADR-070,
        // amended). The run marks its start under the organization's
        // lock, which this key-share lock waits for, before it erases any
        // file: a row saved before the mark has its bytes already.
        const [organization] = await tx
          .select({ deletionStartedAt: organizations.deletionStartedAt })
          .from(organizations)
          .where(eq(organizations.id, organizationId))
          .for('key share');
        if (!organization || organization.deletionStartedAt) {
          throw new ConflictException(
            t({
              id: 'files.organizationDeleting',
              defaultMessage:
                'This organization is being deleted, so nothing more can be added to it.',
            }),
          );
        }

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
            id,
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
            sha256,
            originalName: downloadName(file.originalname, rule.format),
            createdBy: userId,
          })
          .returning();
        return inserted;
      });
    } catch (error) {
      // Refused, or a write that failed: no row will lead a purge to these
      // bytes, so none of them may stay. Deleting what was never written
      // succeeds.
      await Promise.all(
        keys.map((key) => this.storage.delete(key).catch(() => undefined)),
      );
      throw error;
    }

    // Outside the try: nothing after the commit may delete the bytes of a
    // row already saved.
    return viewOf(row);
  }

  /**
   * One size of a file, if this organization has it, it is not released,
   * and the member may see what it is for, refused in their words when
   * not (ADR-080). Another organization's file is simply not there, as
   * for any record. No reader for a file that asks no permission, as the
   * organization's logo on a document.
   */
  async find(
    id: string,
    size: FileSize,
    reader?: Pick<RequestContext, 'userId' | 'organizationId' | 'membershipId'>,
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

    const view = KIND_RULES[row.kind as OrganizationFileKind].view;
    if (view && !reader) {
      throw new Error(`File ${row.id} asks ${view}, and no reader was given`);
    }
    if (view && reader) await this.permissions.demand(reader, [view]);

    // A size the file does not keep is answered with `full`: a logo keeps
    // only that, a square logo no `display`.
    const kept: FileSize = row.sizes[size] ? size : 'full';
    const stored = row.sizes[kept];
    if (!stored) throw new Error(`File ${row.id} has no ${kept} size`);

    return {
      key: keyOf(ownerOf(row), row.id, kept),
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
    kind: OrganizationFileKind,
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

  /** The record no longer uses it: purged 30 days from now (FilesPurge). */
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
   * A record's one file of a kind going from `from` to `to`, as an
   * organization's logo does: the new one attached and the old released,
   * in the record's transaction, so one is never left both unused and
   * kept (ADR-059). `to` undefined, or the same, changes nothing; null
   * removes it. Whether the record's column changes.
   */
  async swapFile(
    tx: Transaction,
    organizationId: string,
    kind: OrganizationFileKind,
    from: string | null,
    to: string | null | undefined,
  ): Promise<boolean> {
    if (to === undefined || to === from) return false;
    if (to) await this.attach(tx, organizationId, to, kind);
    if (from) await this.release(tx, organizationId, from);
    return true;
  }

  private async render(
    render: KindRule['render'],
    input: Buffer,
    type: Sniffed,
  ): Promise<Rendered[]> {
    try {
      if (render === 'logo') return await renderLogo(input, type);
      if (render === 'squareLogo') return await renderSquareLogo(input, type);
      return await renderPhoto(input);
    } catch (error) {
      if (error instanceof ImageRefused) {
        throw new BadRequestException(REFUSED[error.reason]());
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
