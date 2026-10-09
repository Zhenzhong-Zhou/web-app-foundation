import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryKey } from './columns';
import { organizations } from './organizations';
import { users } from './users';

/**
 * The kinds of file stored so far (ADR-059). Each feature that keeps files
 * adds its own, with a migration for the check below.
 */
export const FILE_KINDS = ['logo', 'product_image', 'avatar'] as const;
export type FileKind = (typeof FILE_KINDS)[number];
/** The kinds an organization owns; an avatar is its person's (ADR-063). */
export type OrganizationFileKind = Exclude<FileKind, 'avatar'>;

/** The sizes a file is kept in: a logo only `full`, a photo all three. */
export const FILE_SIZES = ['thumb', 'display', 'full'] as const;
export type FileSize = (typeof FILE_SIZES)[number];

/** One size as kept. */
export interface StoredSize {
  width: number;
  height: number;
  bytes: number;
}

/**
 * Every stored file (ADR-059): the record, where the bucket holds only
 * bytes, under `<organization id>/<file id>/<size>`. A file never changes;
 * a new one replaces it. Unattached until the record that uses it is
 * saved, released when it no longer is, and purged 30 days after that.
 */
export const files = pgTable(
  'files',
  {
    id: primaryKey(),
    /**
     * The owner: an organization, or for a person's photo the person
     * (ADR-063), never both. The storage key starts with whichever it is.
     */
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),
    kind: text('kind').notNull(),
    contentType: text('content_type').notNull(),
    sizes: jsonb('sizes')
      .$type<Partial<Record<FileSize, StoredSize>>>()
      .notNull(),
    /** Every size together: what counts against the organization's limit. */
    bytes: integer('bytes').notNull(),
    /** Of the upload as received, before any size was made. */
    sha256: text('sha256').notNull(),
    /** Cleaned, with the stored type's extension: the download's name. */
    originalName: text('original_name').notNull(),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    attachedAt: timestamp('attached_at', { withTimezone: true }),
    releasedAt: timestamp('released_at', { withTimezone: true }),
  },
  (t) => [
    index('files_org_created_at_idx').on(t.organizationId, t.createdAt),
    index('files_created_by_idx').on(t.createdBy),
    // The purge's two questions: what was never attached, and what was
    // released long enough ago.
    index('files_unattached_idx')
      .on(t.createdAt)
      .where(sql`${t.attachedAt} is null and ${t.releasedAt} is null`),
    index('files_released_at_idx')
      .on(t.releasedAt)
      .where(sql`${t.releasedAt} is not null`),
    check(
      'files_kind_check',
      sql`${t.kind} in ('logo', 'product_image', 'avatar')`,
    ),
    // One owner: an avatar is its person's, everything else an
    // organization's (ADR-063).
    check(
      'files_owner_check',
      sql`(${t.kind} = 'avatar') = (${t.userId} is not null and ${t.organizationId} is null)
        and (${t.userId} is null) <> (${t.organizationId} is null)`,
    ),
    index('files_user_id_idx').on(t.userId),
  ],
);
