import { createHash } from 'node:crypto';

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import type { Database } from '../../database/database.module';
import { UNSAFE_GLOBAL_DB } from '../../database/database.tokens';
import { files, users } from '../../database/schema';
import { t } from '../../i18n/translate';
import { FILE_STORAGE, type FileStorage, keyOf } from '../files/file-storage';
import type { UploadedBinary } from '../files/files.service';
import {
  AVATAR_SIZES,
  renderAvatar,
  type Rendered,
  UnreadableImage,
} from '../files/images';
import { sniff } from '../files/sniff';
import { AccountEventService } from './account-event.service';
import type { RequestContext } from './request-context';

/** What a person's photo may be (ADR-063). */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTS = ['image/png', 'image/jpeg', 'image/webp'];
const SIZES = Object.keys(AVATAR_SIZES) as (keyof typeof AVATAR_SIZES)[];

/**
 * A person's photo (ADR-063): theirs, set and removed only by them, kept
 * with the account rather than an organization. A file of kind avatar
 * whose owner is the person, so the global database: no organization owns
 * it. Removing or replacing one deletes it at once, bytes and row, with no
 * 30 days in between: a face someone took back is not kept.
 */
@Injectable()
export class AccountPhotoService {
  private readonly logger = new Logger(AccountPhotoService.name);

  constructor(
    @Inject(UNSAFE_GLOBAL_DB) private readonly db: Database,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    private readonly events: AccountEventService,
  ) {}

  /** Sets the person's photo, replacing and deleting any before it. */
  async set(
    context: RequestContext,
    upload: UploadedBinary,
  ): Promise<{ photoFileId: string }> {
    const type = sniff(upload.buffer);
    if (!type || !ACCEPTS.includes(type)) {
      throw new BadRequestException(
        t({
          id: 'files.photo.type',
          defaultMessage: 'A photo must be a PNG, JPEG or WebP image',
        }),
      );
    }

    let rendered: Rendered[];
    try {
      rendered = await renderAvatar(upload.buffer);
    } catch (error) {
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

    const userId = context.userId;
    const [row] = await this.db
      .insert(files)
      .values({
        userId,
        kind: 'avatar',
        contentType: 'image/webp',
        sizes: Object.fromEntries(
          rendered.map((size) => [
            size.size,
            { width: size.width, height: size.height, bytes: size.data.length },
          ]),
        ),
        bytes: rendered.reduce((sum, size) => sum + size.data.length, 0),
        sha256: createHash('sha256').update(upload.buffer).digest('hex'),
        originalName: 'photo.webp',
        createdBy: userId,
        // In use from the start: it is set below, in the same request.
        attachedAt: new Date(),
      })
      .returning({ id: files.id });

    try {
      await Promise.all(
        rendered.map((size) =>
          this.storage.put(
            keyOf(userId, row.id, size.size),
            size.data,
            'image/webp',
          ),
        ),
      );
    } catch (error) {
      await this.db.delete(files).where(eq(files.id, row.id));
      throw error;
    }

    // The person's row locked, so two uploads at once leave one photo and
    // delete the other, rather than both thinking they replaced nothing.
    const previous = await this.db.transaction(async (tx) => {
      const [user] = await tx
        .select({ photoFileId: users.photoFileId })
        .from(users)
        .where(eq(users.id, userId))
        .for('update');
      await tx
        .update(users)
        .set({ photoFileId: row.id })
        .where(eq(users.id, userId));
      return user?.photoFileId ?? null;
    });
    if (previous) await this.erase(userId, previous);

    await this.events.record(userId, 'account.profile_updated', {
      ip: context.ip,
      userAgent: context.userAgent,
    });
    this.logger.log(`Photo set for ${userId}`);
    return { photoFileId: row.id };
  }

  /** Takes the photo away and deletes it; initials show from now on. */
  async remove(context: RequestContext): Promise<void> {
    const userId = context.userId;
    const previous = await this.db.transaction(async (tx) => {
      const [user] = await tx
        .select({ photoFileId: users.photoFileId })
        .from(users)
        .where(eq(users.id, userId))
        .for('update');
      if (!user?.photoFileId) return null;
      await tx
        .update(users)
        .set({ photoFileId: null })
        .where(eq(users.id, userId));
      return user.photoFileId;
    });
    if (!previous) return;

    await this.erase(userId, previous);
    await this.events.record(userId, 'account.profile_updated', {
      ip: context.ip,
      userAgent: context.userAgent,
    });
    this.logger.log(`Photo removed for ${userId}`);
  }

  /** Bytes first, then the row: a row without bytes would be a lie. */
  private async erase(userId: string, fileId: string): Promise<void> {
    await Promise.all(
      SIZES.map((size) => this.storage.delete(keyOf(userId, fileId, size))),
    );
    await this.db
      .delete(files)
      .where(and(eq(files.id, fileId), eq(files.userId, userId)));
  }
}
