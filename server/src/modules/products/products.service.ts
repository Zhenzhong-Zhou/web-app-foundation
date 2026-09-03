import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';

import { isUniqueViolation } from '../../database/errors';
import { products, productVariants } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import type { CreateProductDto } from './dto/create-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import type { UpdateProductDto } from './dto/update-product.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';

export interface ProductSummary {
  id: string;
  type: string;
  name: string;
  isActive: boolean;
  variantCount: number;
}

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(private readonly tenantDb: TenantDb) {}

  /**
   * A variant is visible only when both it and its product are active. Never
   * cascade the product's flag onto variants: deactivating would write false
   * to every one, and reactivating could not know which had been individually
   * discontinued first — that information is destroyed by the write.
   *
   * The cost is two booleans in a WHERE on a join already being made.
   */
  listActiveVariants() {
    return this.tenantDb.selectJoined(
      productVariants,
      products,
      eq(products.id, productVariants.productId),
      {
        id: productVariants.id,
        sku: productVariants.sku,
        variantName: productVariants.name,
        productName: products.name,
        type: products.type,
        unitOfMeasure: productVariants.unitOfMeasure,
        tracksBatches: productVariants.tracksBatches,
      },
      and(eq(products.isActive, true), eq(productVariants.isActive, true)),
    );
  }

  async list() {
    return this.tenantDb.select(products, undefined, {
      orderBy: asc(products.name),
    });
  }

  async findById(productId: string) {
    const [product] = await this.tenantDb.select(
      products,
      eq(products.id, productId),
    );

    if (!product) throw new NotFoundException('No such product');

    const variants = await this.tenantDb.select(
      productVariants,
      eq(productVariants.productId, productId),
      { orderBy: asc(productVariants.id) },
    );

    return { ...product, variants };
  }

  /**
   * Creates the product and its first variant together. ADR-023 requires every
   * product to have at least one, and a transaction is what makes that an
   * invariant rather than a convention — a failure after the product insert
   * would otherwise leave a row nothing can be counted against.
   */
  async create(input: CreateProductDto) {
    try {
      return await this.tenantDb.transaction(async (tx, organizationId) => {
        const [product] = await tx
          .insert(products)
          .values({
            organizationId,
            type: input.type,
            name: input.name,
            description: input.description,
          })
          .returning();

        const [variant] = await tx
          .insert(productVariants)
          .values({
            // Denormalised, and set from tenant context rather than from the
            // product row: the two must agree, and this is the only writer.
            organizationId,
            productId: product.id,
            ...input.variant,
          })
          .returning();

        this.logger.log(
          `Product ${product.id} created with variant ${variant.sku}`,
        );
        return { ...product, variants: [variant] };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        // The only unique constraint on either table. Naming the SKU tells the
        // caller whether they meant the existing item or have a collision in
        // their own numbering — "already exists" makes them go hunting.
        throw new ConflictException(
          `SKU ${input.variant.sku} is already in use`,
        );
      }
      throw error;
    }
  }

  async update(productId: string, input: UpdateProductDto) {
    const [existing] = await this.tenantDb.select(
      products,
      eq(products.id, productId),
    );

    if (!existing) throw new NotFoundException('No such product');

    await this.tenantDb.update(products, input, eq(products.id, productId));

    this.logger.log(`Product ${productId} updated`);
  }

  /**
   * Adds a variant to an existing product. The ordinary case ADR-023 exists
   * for: a supplement sold in 60ct gains a 120ct, and both are the same
   * product with different physical facts.
   */
  async addVariant(productId: string, input: CreateVariantDto) {
    // Scoped, so a product in another organization is simply not found.
    const [product] = await this.tenantDb.select(
      products,
      eq(products.id, productId),
    );

    if (!product) throw new NotFoundException('No such product');

    try {
      // organizationId comes from tenant context inside insert() — its
      // parameter type omits the column for exactly that reason.
      const [variant] = await this.tenantDb
        .insert(productVariants, { productId, ...input })
        .returning();

      this.logger.log(`Variant ${variant.sku} added to product ${productId}`);
      return variant;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`SKU ${input.sku} is already in use`);
      }
      throw error;
    }
  }

  /**
   * Renaming a SKU is allowed and audited. The audit row names who and when,
   * not what from — ADR-018 keeps payloads out — which is acceptable while
   * renames are rare and is recorded as a limitation in ADR-023.
   */
  async updateVariant(
    productId: string,
    variantId: string,
    input: UpdateVariantDto,
  ) {
    // Both ids checked, and the variant must belong to this product: without
    // the second condition a caller could edit any variant in their
    // organization through any product's URL.
    const [variant] = await this.tenantDb.select(
      productVariants,
      and(
        eq(productVariants.id, variantId),
        eq(productVariants.productId, productId),
      ),
    );

    if (!variant) throw new NotFoundException('No such variant');

    try {
      await this.tenantDb.update(
        productVariants,
        input,
        eq(productVariants.id, variantId),
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`SKU ${input.sku} is already in use`);
      }
      throw error;
    }

    this.logger.log(`Variant ${variantId} updated`);
  }
}
