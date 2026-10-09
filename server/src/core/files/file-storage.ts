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

/** `<organization id>/<file id>/<size>`: nothing a person typed. */
export function keyOf(
  organizationId: string,
  fileId: string,
  size: FileSize,
): string {
  return `${organizationId}/${fileId}/${size}`;
}
