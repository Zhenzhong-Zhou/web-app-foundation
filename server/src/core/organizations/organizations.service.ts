import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import {
  addresses,
  organizations,
  stockValuations,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import { assertListAssignable } from '../../modules/price-lists/list-price';
import { recordPrevious } from '../audit/audit-context';
import { assertLanguagePair } from './document-languages';
import type { OrganizationAddressDto } from './dto/organization-address.dto';
import type { UpdateOrganizationDto } from './dto/update-organization.dto';
import { registeredAddress } from './registered-address';

/**
 * The current organization's own details (ADR-046), and the rules it chose
 * to work under, such as its licence policy at release (ADR-050).
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
          baseCurrency: organizations.baseCurrency,
          defaultSalePriceListId: organizations.defaultSalePriceListId,
          licenceNotInForcePolicy: organizations.licenceNotInForcePolicy,
          licenceExpiredPolicy: organizations.licenceExpiredPolicy,
          licenceRequired: organizations.licenceRequired,
          documentLanguage: organizations.documentLanguage,
          documentSecondLanguage: organizations.documentSecondLanguage,
          requiredNameLanguages: organizations.requiredNameLanguages,
        })
        .from(organizations)
        .where(eq(organizations.id, organizationId));

      if (!organization)
        throw new NotFoundException(
          t({
            id: 'organizations.notFound',
            defaultMessage: 'No such organization',
          }),
        );

      const address = await registeredAddress(tx, organizationId);

      return { ...organization, address: address ?? null };
    });
  }

  async update(input: UpdateOrganizationDto) {
    await this.tenantDb.transaction(async (tx, organizationId) => {
      const [existing] = await tx
        .select({
          taxRegistrationNumber: organizations.taxRegistrationNumber,
          baseCurrency: organizations.baseCurrency,
          defaultSalePriceListId: organizations.defaultSalePriceListId,
          licenceNotInForcePolicy: organizations.licenceNotInForcePolicy,
          licenceExpiredPolicy: organizations.licenceExpiredPolicy,
          licenceRequired: organizations.licenceRequired,
          documentLanguage: organizations.documentLanguage,
          documentSecondLanguage: organizations.documentSecondLanguage,
          requiredNameLanguages: organizations.requiredNameLanguages,
        })
        .from(organizations)
        .where(eq(organizations.id, organizationId));

      if (!existing)
        throw new NotFoundException(
          t({
            id: 'organizations.notFound',
            defaultMessage: 'No such organization',
          }),
        );

      // The pair as it will stand, so one side sent alone is checked against
      // the other as stored (ADR-054).
      assertLanguagePair(
        input.documentLanguage ?? existing.documentLanguage,
        input.documentSecondLanguage !== undefined
          ? input.documentSecondLanguage
          : existing.documentSecondLanguage,
      );

      /**
       * The licence policy included: loosening it is the change an auditor
       * asks about first ("when did expired licences stop being refused, and
       * who did it?"), so the log keeps what it replaced.
       */
      recordPrevious({
        taxRegistrationNumber: existing.taxRegistrationNumber,
        baseCurrency: existing.baseCurrency,
        defaultSalePriceListId: existing.defaultSalePriceListId,
        licenceNotInForcePolicy: existing.licenceNotInForcePolicy,
        licenceExpiredPolicy: existing.licenceExpiredPolicy,
        licenceRequired: existing.licenceRequired,
        documentLanguage: existing.documentLanguage,
        documentSecondLanguage: existing.documentSecondLanguage,
        requiredNameLanguages: existing.requiredNameLanguages,
      });

      if (input.defaultSalePriceListId) {
        await assertListAssignable(
          tx,
          organizationId,
          input.defaultSalePriceListId,
          'sale',
        );
      }

      const changesBase =
        input.baseCurrency !== undefined &&
        input.baseCurrency !== existing.baseCurrency;

      /**
       * Fixed once used (ADR-048). A value or a rate is denominated in the
       * base, and changing it would silently re-denominate every one. The
       * opening rows are zero and carry no rate, so an organization holding
       * stock can still set its first.
       */
      if (changesBase) {
        const [valued] = await tx
          .select({ id: stockValuations.id })
          .from(stockValuations)
          .where(
            and(
              eq(stockValuations.organizationId, organizationId),
              sql`(${stockValuations.value} <> 0 or ${stockValuations.exchangeRate} is not null)`,
            ),
          )
          .limit(1);

        if (valued) {
          throw new ConflictException(
            t(
              {
                id: 'organizations.baseCurrencyFixed',
                defaultMessage:
                  'Stock is already valued in {baseCurrency}, so the base currency cannot change',
              },
              { baseCurrency: existing.baseCurrency },
            ),
          );
        }
      }

      const changes = {
        ...(input.taxRegistrationNumber !== undefined
          ? {
              // Empty clears it: the column refuses a blank, and a cleared
              // field in a form arrives as "".
              taxRegistrationNumber: input.taxRegistrationNumber || null,
            }
          : {}),
        ...(changesBase ? { baseCurrency: input.baseCurrency } : {}),
        ...(input.defaultSalePriceListId !== undefined
          ? { defaultSalePriceListId: input.defaultSalePriceListId }
          : {}),
        // Never null by here: the DTO refuses it, since every state needs an
        // answer (ADR-050).
        ...(input.licenceNotInForcePolicy !== undefined
          ? { licenceNotInForcePolicy: input.licenceNotInForcePolicy }
          : {}),
        ...(input.licenceExpiredPolicy !== undefined
          ? { licenceExpiredPolicy: input.licenceExpiredPolicy }
          : {}),
        ...(input.licenceRequired !== undefined
          ? { licenceRequired: input.licenceRequired }
          : {}),
        ...(input.documentLanguage !== undefined
          ? { documentLanguage: input.documentLanguage }
          : {}),
        ...(input.documentSecondLanguage !== undefined
          ? { documentSecondLanguage: input.documentSecondLanguage }
          : {}),
        ...(input.requiredNameLanguages !== undefined
          ? { requiredNameLanguages: input.requiredNameLanguages }
          : {}),
      };

      if (Object.keys(changes).length === 0) return;

      await tx
        .update(organizations)
        .set(changes)
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
