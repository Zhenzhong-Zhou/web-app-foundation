import { and, asc, eq, sql } from 'drizzle-orm';

import { files, productImages, products } from '../../database/schema';
import type { Tx } from '../stock/stock.service';

/** The most images one product holds (ADR-062). */
export const MAX_PRODUCT_IMAGES = 8;

/**
 * A product's cover: the file of its first image, or null. A correlated
 * subquery for the select of any query over products, read through the
 * gallery's own index, so a page of fifty asks for nothing more than it
 * did (ADR-062).
 *
 * The outer product is named by its table, never by a column alone. In a
 * query over one table drizzle writes columns without their table, and
 * an unqualified "id" inside this subquery would be the image's own id:
 * every product would have no cover.
 */
export function coverOf() {
  const product = (column: string) =>
    sql`${products}.${sql.identifier(column)}`;
  return sql<string | null>`(
    select image.file_id from ${productImages} image
    where image.organization_id = ${product('organization_id')}
      and image.product_id = ${product('id')}
      and image.position = 0
  )`;
}

/** A product's images in order, the first its cover, each with its sizes. */
export function imagesOf(tx: Tx, organizationId: string, productId: string) {
  return tx
    .select({
      fileId: productImages.fileId,
      position: productImages.position,
      sizes: files.sizes,
      sha256: files.sha256,
    })
    .from(productImages)
    .innerJoin(files, eq(files.id, productImages.fileId))
    .where(
      and(
        eq(productImages.organizationId, organizationId),
        eq(productImages.productId, productId),
      ),
    )
    .orderBy(asc(productImages.position));
}

/** What the API returns of an image: no checksum, which is ours. */
export function publicImages(
  images: Awaited<ReturnType<typeof imagesOf>>,
): Omit<(typeof images)[number], 'sha256'>[] {
  return images.map(({ fileId, position, sizes }) => ({
    fileId,
    position,
    sizes,
  }));
}
