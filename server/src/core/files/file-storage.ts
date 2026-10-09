import type { Readable } from 'node:stream';

import type { FileSize } from '../../database/schema';

/** The injection token for the configured driver. */
export const FILE_STORAGE = Symbol('FILE_STORAGE');

/**
 * Where a file's bytes live (ADR-059): `local` on disk, `s3` in a bucket.
 * Keys are made by keyOf and nowhere else.
 */
export interface FileStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Rejects when there is no such object. */
  get(key: string): Promise<Readable>;
  /** Succeeds when there is nothing to delete. */
  delete(key: string): Promise<void>;
}

/**
 * `<owner id>/<file id>/<size>`: nothing a person typed. The owner is the
 * organization, or for a person's photo the person (ADR-063).
 */
export function keyOf(ownerId: string, fileId: string, size: FileSize): string {
  return `${ownerId}/${fileId}/${size}`;
}

/** A file's owner, the organization or the person; the check holds one. */
export function ownerOf(row: {
  id: string;
  organizationId: string | null;
  userId: string | null;
}): string {
  const owner = row.organizationId ?? row.userId;
  if (!owner) throw new Error(`File ${row.id} has no owner`);
  return owner;
}
