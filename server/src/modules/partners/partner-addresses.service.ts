import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';

import { addresses } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import type { CreateAddressDto } from './dto/create-address.dto';
import type { UpdateAddressDto } from './dto/update-address.dto';
import { PartnersService } from './partners.service';

/**
 * Addresses belonging to a partner (ADR-028).
 *
 * Scoped to partners on purpose. The table also accepts a location as its
 * owner, but nothing asks for a site's postal address yet, and a service that
 * takes an owner kind as an argument would be inventing the abstraction before
 * the second caller exists.
 */
@Injectable()
export class PartnerAddressesService {
  private readonly logger = new Logger(PartnerAddressesService.name);

  constructor(
    private readonly tenantDb: TenantDb,
    // Not a select against partners here: "does this partner exist, in this
    // tenant" is a question that module already answers, and asking it twice
    // is how two definitions of "exists" drift apart.
    private readonly partners: PartnersService,
  ) {}

  /**
   * Defaults first, then billing, then alphabetical by label — the order a
   * picker wants, so the client never re-sorts.
   */
  async list(partnerId: string) {
    await this.partners.findById(partnerId);

    return this.tenantDb.select(addresses, eq(addresses.partnerId, partnerId), {
      orderBy: [asc(addresses.label)],
    });
  }

  async create(partnerId: string, input: CreateAddressDto) {
    await this.partners.findById(partnerId);

    if (!input.isDefault) {
      const [created] = await this.tenantDb
        .insert(addresses, { ...input, partnerId })
        .returning();

      this.logger.log(`Address ${created.id} created for partner ${partnerId}`);
      return created;
    }

    /**
     * One transaction, because a partial unique index means the second default
     * is a 23505 rather than an overwrite. Demoting first and inserting second
     * in separate statements would leave a window with no default at all, and
     * a failure between them would leave the partner with none.
     */
    return this.tenantDb.transaction(async (tx, organizationId) => {
      await tx
        .update(addresses)
        .set({ isDefault: false })
        .where(
          and(
            eq(addresses.organizationId, organizationId),
            eq(addresses.partnerId, partnerId),
            eq(addresses.isDefault, true),
          ),
        );

      const [created] = await tx
        .insert(addresses)
        .values({ ...input, partnerId, organizationId })
        .returning();

      this.logger.log(
        `Address ${created.id} created as default for ${partnerId}`,
      );
      return created;
    });
  }

  async update(partnerId: string, addressId: string, input: UpdateAddressDto) {
    await this.findOwned(partnerId, addressId);

    if (!input.isDefault) {
      await this.tenantDb.update(addresses, input, eq(addresses.id, addressId));
      this.logger.log(`Address ${addressId} updated`);
      return;
    }

    await this.tenantDb.transaction(async (tx, organizationId) => {
      await tx
        .update(addresses)
        .set({ isDefault: false })
        .where(
          and(
            eq(addresses.organizationId, organizationId),
            eq(addresses.partnerId, partnerId),
            eq(addresses.isDefault, true),
          ),
        );

      await tx
        .update(addresses)
        .set(input)
        .where(
          and(
            eq(addresses.organizationId, organizationId),
            eq(addresses.id, addressId),
          ),
        );
    });

    this.logger.log(`Address ${addressId} updated and made default`);
  }

  /**
   * Retired, not deleted. The row survives so it can be restored and so the
   * history of where this partner has been shipped to stays readable.
   *
   * is_default is cleared at the same time: the partial unique index counts a
   * retired row, so leaving the flag set would block the next address from
   * becoming the default with a 23505 nobody could explain.
   */
  async retire(partnerId: string, addressId: string) {
    const existing = await this.findOwned(partnerId, addressId);

    if (existing.isDefault) {
      // Refused rather than silently promoting another: which address becomes
      // the default is a decision, and guessing it is how a partner ends up
      // shipping to a closed warehouse.
      throw new BadRequestException(
        'Make another address the default before retiring this one',
      );
    }

    await this.tenantDb.update(
      addresses,
      { isActive: false, isDefault: false },
      eq(addresses.id, addressId),
    );

    this.logger.log(`Address ${addressId} retired`);
  }

  /**
   * Both ids, always. Scoping to the tenant alone would let an address be
   * edited through the wrong partner's URL — same organization, wrong owner,
   * and the audit row would name a partner that had nothing to do with it.
   */
  private async findOwned(partnerId: string, addressId: string) {
    const [address] = await this.tenantDb.select(
      addresses,
      and(eq(addresses.id, addressId), eq(addresses.partnerId, partnerId)),
    );

    if (!address) throw new NotFoundException('No such address');

    return address;
  }
}
