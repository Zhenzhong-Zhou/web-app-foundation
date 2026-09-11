import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';

import { contacts } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import type { CreateContactDto } from './dto/create-contact.dto';
import type { UpdateContactDto } from './dto/update-contact.dto';
import { PartnersService } from './partners.service';

/**
 * People at a partner (ADR-028). Same ownership rules as addresses, and the
 * same is_primary-demotion dance, for the same reason: the uniqueness lives in
 * a partial index, so the second primary is a 23505 rather than an overwrite.
 */
@Injectable()
export class PartnerContactsService {
  private readonly logger = new Logger(PartnerContactsService.name);

  constructor(
    private readonly tenantDb: TenantDb,
    private readonly partners: PartnersService,
  ) {}

  /**
   * Retired contacts are listed, matching partners: this is a directory, and a
   * name that vanished is harder to explain than one shown as inactive. The
   * order form filters them out instead.
   */
  async list(partnerId: string) {
    await this.partners.findById(partnerId);

    return this.tenantDb.select(contacts, eq(contacts.partnerId, partnerId), {
      orderBy: [asc(contacts.name)],
    });
  }

  async create(partnerId: string, input: CreateContactDto) {
    await this.partners.findById(partnerId);

    if (!input.isPrimary) {
      const [created] = await this.tenantDb
        .insert(contacts, { ...input, partnerId })
        .returning();

      this.logger.log(`Contact ${created.id} created for partner ${partnerId}`);
      return created;
    }

    return this.tenantDb.transaction(async (tx, organizationId) => {
      await tx
        .update(contacts)
        .set({ isPrimary: false })
        .where(
          and(
            eq(contacts.organizationId, organizationId),
            eq(contacts.partnerId, partnerId),
            eq(contacts.isPrimary, true),
          ),
        );

      const [created] = await tx
        .insert(contacts)
        .values({ ...input, partnerId, organizationId })
        .returning();

      this.logger.log(
        `Contact ${created.id} created as primary for ${partnerId}`,
      );
      return created;
    });
  }

  async update(partnerId: string, contactId: string, input: UpdateContactDto) {
    await this.findOwned(partnerId, contactId);

    if (!input.isPrimary) {
      await this.tenantDb.update(contacts, input, eq(contacts.id, contactId));
      this.logger.log(`Contact ${contactId} updated`);
      return;
    }

    await this.tenantDb.transaction(async (tx, organizationId) => {
      await tx
        .update(contacts)
        .set({ isPrimary: false })
        .where(
          and(
            eq(contacts.organizationId, organizationId),
            eq(contacts.partnerId, partnerId),
            eq(contacts.isPrimary, true),
          ),
        );

      await tx
        .update(contacts)
        .set(input)
        .where(
          and(
            eq(contacts.organizationId, organizationId),
            eq(contacts.id, contactId),
          ),
        );
    });

    this.logger.log(`Contact ${contactId} updated and made primary`);
  }

  /**
   * Retired, not deleted — the opposite of an address, and deliberately.
   *
   * A contact is a person who may be named on an order that has already
   * shipped, so removing the row would put a hole in what happened. An address
   * carries no such reference because the order snapshots it.
   */
  async retire(partnerId: string, contactId: string) {
    await this.findOwned(partnerId, contactId);

    await this.tenantDb.update(
      contacts,
      { isActive: false, isPrimary: false },
      eq(contacts.id, contactId),
    );

    this.logger.log(`Contact ${contactId} retired`);
  }

  private async findOwned(partnerId: string, contactId: string) {
    const [contact] = await this.tenantDb.select(
      contacts,
      and(eq(contacts.id, contactId), eq(contacts.partnerId, partnerId)),
    );

    if (!contact) throw new NotFoundException('No such contact');

    return contact;
  }
}
