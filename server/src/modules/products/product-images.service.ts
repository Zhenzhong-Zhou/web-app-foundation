import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import { FilesService } from '../../core/files/files.service';
import { files, productImages, products } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import type { Tx } from '../stock/stock.service';
import { imagesOf, MAX_PRODUCT_IMAGES, publicImages } from './product-images';

/**
 * A product's gallery (ADR-062): images added, removed and reordered. Each
 * change locks the product, so two people changing one gallery take turns
 * and the order stays 0 to n - 1 without gaps.
 */
@Injectable()
export class ProductImagesService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly files: FilesService,
  ) {}

  /**
   * Adds an uploaded product image as the last of the gallery. Refused at
   * eight, and when the same photo is already there (by its checksum).
   */
  add(productId: string, fileId: string) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      await lockProduct(tx, organizationId, productId);
      const images = await imagesOf(tx, organizationId, productId);

      if (images.length >= MAX_PRODUCT_IMAGES) {
        throw new ConflictException(
          t(
            {
              id: 'products.images.full',
              defaultMessage:
                'A product has at most {max} images. Remove one to add another.',
            },
            { max: MAX_PRODUCT_IMAGES },
          ),
        );
      }

      const [incoming] = await tx
        .select({ sha256: files.sha256 })
        .from(files)
        .where(
          and(eq(files.id, fileId), eq(files.organizationId, organizationId)),
        );
      const duplicate =
        incoming && images.some((image) => image.sha256 === incoming.sha256);
      if (duplicate) {
        throw new ConflictException(
          t({
            id: 'products.images.duplicate',
            defaultMessage: 'That image is already on this product.',
          }),
        );
      }

      // Refuses another organization's file, another kind, or one in use.
      await this.files.attach(tx, organizationId, fileId, 'product_image');
      await tx.insert(productImages).values({
        organizationId,
        productId,
        fileId,
        position: images.length,
      });

      return publicImages(await imagesOf(tx, organizationId, productId));
    });
  }

  /** Takes an image off the gallery and releases its file (ADR-059). */
  remove(productId: string, fileId: string) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      await lockProduct(tx, organizationId, productId);

      const [removed] = await tx
        .delete(productImages)
        .where(
          and(
            eq(productImages.organizationId, organizationId),
            eq(productImages.productId, productId),
            eq(productImages.fileId, fileId),
          ),
        )
        .returning({ id: productImages.id });
      if (!removed) {
        throw new NotFoundException(
          t({
            id: 'products.images.notFound',
            defaultMessage: 'No such image on this product',
          }),
        );
      }

      await this.files.release(tx, organizationId, fileId);

      // The rest close the gap, so the first is still the cover.
      await tx.execute(sql`
        update ${productImages} set position = ranked.place
        from (
          select id, (row_number() over (order by position)) - 1 as place
          from ${productImages}
          where organization_id = ${organizationId}::uuid
            and product_id = ${productId}::uuid
        ) ranked
        where ${productImages.id} = ranked.id
      `);
    });
  }

  /** A new order: every image of the product, each once, the cover first. */
  reorder(productId: string, fileIds: string[]) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      await lockProduct(tx, organizationId, productId);
      const images = await imagesOf(tx, organizationId, productId);

      const current = new Set(images.map((image) => image.fileId));
      if (
        fileIds.length !== current.size ||
        !fileIds.every((id) => current.has(id))
      ) {
        throw new BadRequestException(
          t({
            id: 'products.images.order',
            defaultMessage:
              "The new order must list each of this product's images once.",
          }),
        );
      }

      for (const [position, fileId] of fileIds.entries()) {
        await tx
          .update(productImages)
          .set({ position })
          .where(
            and(
              eq(productImages.organizationId, organizationId),
              eq(productImages.fileId, fileId),
            ),
          );
      }

      return publicImages(await imagesOf(tx, organizationId, productId));
    });
  }
}

/** The product, locked for the rest of the transaction, or a 404. */
async function lockProduct(
  tx: Tx,
  organizationId: string,
  productId: string,
): Promise<void> {
  const [product] = await tx
    .select({ id: products.id })
    .from(products)
    .where(
      and(
        eq(products.id, productId),
        eq(products.organizationId, organizationId),
      ),
    )
    .for('update');
  if (!product) {
    throw new NotFoundException(
      t({ id: 'products.suchProduct', defaultMessage: 'No such product' }),
    );
  }
}
