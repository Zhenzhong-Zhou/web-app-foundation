import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { addresses, organizations } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { recordPrevious } from '../audit/audit-context';
import type { OrganizationAddressDto } from './dto/organization-address.dto';
import type { UpdateOrganizationDto } from './dto/update-organization.dto';
import { registeredAddress } from './registered-address';

/**
 * The current organization's own details (ADR-046).
 *
 * `organizations` is the tenant root and has no organization_id, so
 * TenantDb.select cannot scope it. Every read here goes through
 * TenantDb.transaction instead, which hands over the session's organization
 * id — the only row this service ever touches is that one.
 */
@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(private readonly tenantDb: TenantDb) {}

  async get() {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const [organization] = await tx
        .select({
          id: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
          taxRegistrationNumber: organizations.taxRegistrationNumber,
        })
        .from(organizations)
        .where(eq(organizations.id, organizationId));

      if (!organization) throw new NotFoundException('No such organization');

      const address = await registeredAddress(tx, organizationId);

      return { ...organization, address: address ?? null };
    });
  }

  async update(input: UpdateOrganizationDto) {
    await this.tenantDb.transaction(async (tx, organizationId) => {
      const [existing] = await tx
        .select({ taxRegistrationNumber: organizations.taxRegistrationNumber })
        .from(organizations)
        .where(eq(organizations.id, organizationId));

      if (!existing) throw new NotFoundException('No such organization');

      recordPrevious({
        taxRegistrationNumber: existing.taxRegistrationNumber,
      });

      if (input.taxRegistrationNumber === undefined) return;

      await tx
        .update(organizations)
        .set({
          // Empty clears it: the column refuses a blank, and a cleared field
          // in a form arrives as "".
          taxRegistrationNumber: input.taxRegistrationNumber || null,
        })
        .where(eq(organizations.id, organizationId));
    });
  }

  /**
   * Creates the registered address or replaces it — one row, updated in
   * place, so "the address on our invoices" never has two answers. Sent
   * whole: a field left out is cleared, as a PUT says.
   */
  async setAddress(input: OrganizationAddressDto) {
    await this.tenantDb.transaction(async (tx, organizationId) => {
      const fields = {
        line1: input.line1,
        line2: input.line2 ?? null,
        city: input.city ?? null,
        region: input.region ?? null,
        postalCode: input.postalCode ?? null,
        country: input.country,
      };

      const existing = await registeredAddress(tx, organizationId);

      if (existing) {
        await tx
          .update(addresses)
          .set(fields)
          .where(
            and(
              eq(addresses.organizationId, organizationId),
              eq(addresses.id, existing.id),
            ),
          );
        return;
      }

      await tx.insert(addresses).values({
        ...fields,
        organizationId,
        ownerOrganizationId: organizationId,
        isBilling: true,
        isDefault: true,
      });

      this.logger.log(`Registered address set for ${organizationId}`);
    });
  }
}
