import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';

import { recordPrevious } from '../../core/audit/audit-context';
import { isUniqueViolation } from '../../database/errors';
import { productLicences } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import type { CreateProductLicenceDto } from './dto/create-product-licence.dto';
import type { UpdateProductLicenceDto } from './dto/update-product-licence.dto';

/**
 * The registrations formulations are made and sold under — an NPN, a DIN, a
 * cosmetic notification number (ADR-029).
 *
 * Reference data, so no paging: an organization has a handful of these, and
 * the recipe picker wants them all anyway. No delete either — a licence a
 * recipe was made under is what a finished lot traces back to, so it is
 * deactivated rather than removed, the same shape as products and locations.
 */
@Injectable()
export class ProductLicencesService {
  private readonly logger = new Logger(ProductLicencesService.name);

  constructor(private readonly tenantDb: TenantDb) {}

  list() {
    return this.tenantDb.select(productLicences, undefined, {
      orderBy: [asc(productLicences.authority), asc(productLicences.number)],
    });
  }

  async create(input: CreateProductLicenceDto) {
    try {
      const [licence] = await this.tenantDb
        .insert(productLicences, {
          number: input.number,
          authority: input.authority,
          notes: input.notes,
        })
        .returning();

      this.logger.log(`Product licence ${licence.id} created`);
      return licence;
    } catch (error) {
      if (
        isUniqueViolation(error, 'product_licences_org_authority_number_key')
      ) {
        throw new ConflictException(
          'That number is already recorded for that authority',
        );
      }
      throw error;
    }
  }

  /**
   * The number and the authority stay editable, for the typo caught an hour
   * later. They are identity rather than history: a recipe points at the row,
   * so correcting the digits corrects every recipe at once, which is the
   * reason this is a table (ADR-029).
   */
  async update(licenceId: string, input: UpdateProductLicenceDto) {
    const [existing] = await this.tenantDb.select(
      productLicences,
      eq(productLicences.id, licenceId),
    );

    if (!existing) throw new NotFoundException('No such product licence');

    // So the audit row reads "80012344 → 80012345" rather than the new value
    // alone: for a correction, what it used to say is the point (ADR-018).
    recordPrevious({
      number: existing.number,
      authority: existing.authority,
      isActive: existing.isActive,
    });

    try {
      await this.tenantDb.update(
        productLicences,
        input,
        eq(productLicences.id, licenceId),
      );
    } catch (error) {
      if (
        isUniqueViolation(error, 'product_licences_org_authority_number_key')
      ) {
        throw new ConflictException(
          'That number is already recorded for that authority',
        );
      }
      throw error;
    }

    this.logger.log(`Product licence ${licenceId} updated`);
  }

  /**
   * Scoped existence check for the BOM service: the foreign key is global, so
   * without this a recipe could be attached to another tenant's licence by id
   * and the FK would happily accept it.
   */
  async existsWithin(licenceId: string): Promise<boolean> {
    const [licence] = await this.tenantDb.select(
      productLicences,
      eq(productLicences.id, licenceId),
    );

    return !!licence;
  }
}
