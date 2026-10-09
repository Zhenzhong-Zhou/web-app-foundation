import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, lt } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../../database/database.module';
import { files, type FileSize } from '../../database/schema';
import { FILE_STORAGE, type FileStorage, keyOf, ownerOf } from './file-storage';

const DAY = 24 * 60 * 60 * 1000;

/** Released files keep their bytes this long, for undoing and restores. */
export const PURGE_AFTER_DAYS = 30;

/**
 * The purge (ADR-059), on its own because it is the one part of files
 * that spans every organization, so the one file here allowed the global
 * connection (eslint.config.mjs). Everything else goes through TenantDb.
 *
 * Uploads never attached within a day are released; files released
 * PURGE_AFTER_DAYS ago lose their bytes, then their row. A batch at a
 * time; the next run takes the rest.
 */
@Injectable()
export class FilesPurgeService {
  constructor(
    @Inject(UNSAFE_GLOBAL_DB) private readonly db: Database,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

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
        userId: files.userId,
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
          this.storage.delete(keyOf(ownerOf(row), row.id, size)),
        ),
      );
      await this.db.delete(files).where(eq(files.id, row.id));
    }

    return { released: released.length, deleted: due.length };
  }
}
