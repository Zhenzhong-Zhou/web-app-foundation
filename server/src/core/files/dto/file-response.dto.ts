import type { FileKind } from '../../../database/schema';

/**
 * A stored file as the API returns it (ADR-068, ADR-059), described for
 * the OpenAPI document by the CLI plugin. Never its storage key or its
 * checksum, which are the server's.
 */

/** One size of a file, as kept. */
export class StoredFileSize {
  width!: number;
  height!: number;
  bytes!: number;
}

/**
 * The sizes kept: a photo all three, a square logo `thumb` and `full`, a
 * logo only `full`.
 */
export class FileSizes {
  thumb?: StoredFileSize;
  display?: StoredFileSize;
  full?: StoredFileSize;
}

export class StoredFile {
  id!: string;
  kind!: FileKind;
  contentType!: string;
  sizes!: FileSizes;
  createdAt!: Date;
}

/** Uploading a logo, a square logo or a product image: the file as kept. */
export class UploadedFileEnvelope {
  file!: StoredFile;
}
