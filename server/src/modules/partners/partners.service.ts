import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';

import { isUniqueViolation } from '../../database/errors';
import { partners } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import type { CreatePartnerDto } from './dto/create-partner.dto';
import type { UpdatePartnerDto } from './dto/update-partner.dto';

/**
 * Everyone the organization trades with, in one table (ADR-026).
 *
 * No customer or supplier split, and no role filter here either: what a partner
 * is follows from what has been traded with them, which is a join over orders
 * and belongs to the orders module rather than this one.
 */
@Injectable()
export class PartnersService {
  private readonly logger = new Logger(PartnersService.name);

  constructor(private readonly tenantDb: TenantDb) {}

  /**
   * Ordered by name, including retired ones.
   *
   * Retired partners are listed rather than hidden because the screen that
   * reads this is a directory, and a name that vanished is harder to explain
   * than one shown as inactive. The order form filters them out instead —
   * that is where an inactive partner would be a mistake.
   */
  list() {
    return this.tenantDb.select(partners, undefined, {
      orderBy: asc(partners.name),
    });
  }

  async findById(partnerId: string) {
    const [partner] = await this.tenantDb.select(
      partners,
      eq(partners.id, partnerId),
    );

    if (!partner) throw new NotFoundException('No such partner');

    return partner;
  }

  async create(input: CreatePartnerDto) {
    try {
      const [partner] = await this.tenantDb
        .insert(partners, {
          name: input.name,
          code: input.code,
          taxId: input.taxId,
          notes: input.notes,
        })
        .returning();

      this.logger.log(`Partner ${partner.id} created`);
      return partner;
    } catch (error) {
      if (isUniqueViolation(error)) {
        /**
         * The only unique constraint on the table, and it is on code. Names are
         * deliberately not unique: two branches of one company are two
         * partners, and refusing the second would push someone into inventing
         * "Acme (2)".
         */
        throw new ConflictException(
          `Code ${input.code} is already used by another partner`,
        );
      }
      throw error;
    }
  }

  async update(partnerId: string, input: UpdatePartnerDto) {
    // Scoped, so a partner in another organization is simply not found.
    const [existing] = await this.tenantDb.select(
      partners,
      eq(partners.id, partnerId),
    );

    if (!existing) throw new NotFoundException('No such partner');

    try {
      await this.tenantDb.update(partners, input, eq(partners.id, partnerId));
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `Code ${input.code} is already used by another partner`,
        );
      }
      throw error;
    }

    this.logger.log(`Partner ${partnerId} updated`);
  }
}
