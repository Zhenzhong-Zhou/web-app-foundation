import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, lt, lte, type SQL } from 'drizzle-orm';

import { addDays } from '../../common/today';
import { recordPrevious } from '../../core/audit/audit-context';
import { todayOf } from '../../core/organizations/time-zone';
import { isCheckViolation, isUniqueViolation } from '../../database/errors';
import { productLicences } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import type { CreateProductLicenceDto } from './dto/create-product-licence.dto';
import type { ListProductLicencesDto } from './dto/list-product-licences.dto';
import type { ProductLicence } from './dto/product-licence-response.dto';
import type { UpdateProductLicenceDto } from './dto/update-product-licence.dto';

/** How far ahead a licence counts as expiring: issue #17's notice. */
const LICENCE_WARNING_DAYS = 60;

/**
 * Expiring (ADR-091): an active licence whose expiry is within the notice
 * of the organization's today, or already past. The list's `expiring` and
 * Home's Licences tile, so the tile's count and the rows it opens cannot
 * drift; the expired among them are the tile's late.
 */
export function expiringLicence(today: string): SQL {
  return and(
    eq(productLicences.isActive, true),
    lte(productLicences.expiresAt, addDays(today, LICENCE_WARNING_DAYS)),
  )!;
}

/**
 * Expired (ADR-091): an active licence whose expiry is before the
 * organization's today, as its status reads Expired. The list's `expired`
 * and Home's late count on Licences, so the late button's count and the
 * rows it opens cannot drift.
 */
export function expiredLicence(today: string): SQL {
  return and(
    eq(productLicences.isActive, true),
    lt(productLicences.expiresAt, today),
  )!;
}

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

  /**
   * Every licence, by authority then number; or, with `expiring`, those
   * expiring within the notice or expired, and with `expired` the expired
   * alone, soonest first, so the expired lead (ADR-091).
   */
  async list(query: ListProductLicencesDto = {}): Promise<ProductLicence[]> {
    const expiring = query.expiring === 'true';
    const expired = query.expired === 'true';
    if (!expiring && !expired) {
      const rows = await this.tenantDb.select(productLicences, undefined, {
        orderBy: [asc(productLicences.authority), asc(productLicences.number)],
      });
      return rows.map(licenceOf);
    }

    return this.tenantDb.transaction(async (tx, organizationId) => {
      // The organization's today, in its own zone (ADR-072), as Home's.
      const today = await todayOf(tx, organizationId);
      const rows = await tx
        .select()
        .from(productLicences)
        .where(
          and(
            eq(productLicences.organizationId, organizationId),
            expiring ? expiringLicence(today) : undefined,
            expired ? expiredLicence(today) : undefined,
          ),
        )
        .orderBy(
          asc(productLicences.expiresAt),
          asc(productLicences.authority),
          asc(productLicences.number),
        );
      return rows.map(licenceOf);
    });
  }

  async create(input: CreateProductLicenceDto): Promise<ProductLicence> {
    try {
      const [licence] = await this.tenantDb
        .insert(productLicences, {
          number: input.number,
          authority: input.authority,
          // Calendar days as they arrive, YYYY-MM-DD, into `date` columns
          // (ADR-052).
          issuedAt: input.issuedAt ?? null,
          expiresAt: input.expiresAt ?? null,
          notes: input.notes,
        })
        .returning();

      this.logger.log(`Product licence ${licence.id} created`);
      return licenceOf(licence);
    } catch (error) {
      if (
        isUniqueViolation(error, 'product_licences_org_authority_number_key')
      ) {
        throw new ConflictException(
          t({
            id: 'licences.numberRecordedAuthority',
            defaultMessage:
              'That number is already recorded for that authority',
          }),
        );
      }
      if (isCheckViolation(error, 'product_licences_dates_ordered_check')) {
        throw new BadRequestException(
          t({
            id: 'licences.licenceExpireBeforeWas',
            defaultMessage: 'A licence cannot expire before it was issued',
          }),
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

    if (!existing)
      throw new NotFoundException(
        t({
          id: 'licences.suchProductLicence',
          defaultMessage: 'No such product licence',
        }),
      );

    // So the audit row reads "80012344 → 80012345" rather than the new value
    // alone: for a correction, what it used to say is the point (ADR-018).
    recordPrevious({
      number: existing.number,
      authority: existing.authority,
      isActive: existing.isActive,
    });

    /**
     * The dates go in as they arrive, YYYY-MM-DD (ADR-052): undefined is "not
     * sent" and leaves the column alone, null clears it.
     */
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
          t({
            id: 'licences.numberRecordedAuthority',
            defaultMessage:
              'That number is already recorded for that authority',
          }),
        );
      }
      if (isCheckViolation(error, 'product_licences_dates_ordered_check')) {
        throw new BadRequestException(
          t({
            id: 'licences.licenceExpireBeforeWas',
            defaultMessage: 'A licence cannot expire before it was issued',
          }),
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

  /**
   * "80012345 (Health Canada)", for audit rows that would otherwise record an
   * id. Read at the moment of the change, so the row says what the licence
   * was called then.
   */
  async labelOf(licenceId: string | null | undefined): Promise<string | null> {
    if (!licenceId) return null;

    const [licence] = await this.tenantDb.select(
      productLicences,
      eq(productLicences.id, licenceId),
    );

    return licence ? `${licence.number} (${licence.authority})` : null;
  }
}

/**
 * A licence as the API returns it (ADR-068): not the organization, nor the
 * reminder bookkeeping kept on the row for the licence reminders (ADR-064).
 */
function licenceOf(row: ProductLicence): ProductLicence {
  return {
    id: row.id,
    number: row.number,
    authority: row.authority,
    isActive: row.isActive,
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
    notes: row.notes,
  };
}
