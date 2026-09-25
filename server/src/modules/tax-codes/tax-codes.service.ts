import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq } from 'drizzle-orm';

import { recordPrevious } from '../../core/audit/audit-context';
import type { Transaction } from '../../database/database.module';
import { isCheckViolation, isUniqueViolation } from '../../database/errors';
import { taxCodeComponents, taxCodes } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import type { CreateTaxCodeDto } from './dto/create-tax-code.dto';
import type { TaxCodeComponentDto } from './dto/tax-code-component.dto';
import type { UpdateTaxCodeDto } from './dto/update-tax-code.dto';

/**
 * Tax codes and what each charges (ADR-046).
 *
 * Reference data, so no paging: an organization has a handful, and the
 * invoice's picker wants them all. Components are written as a set with
 * their code, in one transaction, so a code is never visible half-built.
 */
@Injectable()
export class TaxCodesService {
  private readonly logger = new Logger(TaxCodesService.name);

  constructor(private readonly tenantDb: TenantDb) {}

  /** Active codes first, then by name; each with its components. */
  async list() {
    const codes = await this.tenantDb.select(taxCodes, undefined, {
      orderBy: [desc(taxCodes.isActive), asc(taxCodes.name)],
    });

    const components = await this.tenantDb.select(
      taxCodeComponents,
      undefined,
      { orderBy: [asc(taxCodeComponents.name)] },
    );

    const byCode = new Map<string, typeof components>();
    for (const component of components) {
      const list = byCode.get(component.taxCodeId) ?? [];
      list.push(component);
      byCode.set(component.taxCodeId, list);
    }

    return codes.map((code) => ({
      ...code,
      components: byCode.get(code.id) ?? [],
    }));
  }

  /** For invoicing: a code in this tenant, or 404. */
  async findById(taxCodeId: string) {
    const [code] = await this.tenantDb.select(
      taxCodes,
      eq(taxCodes.id, taxCodeId),
    );

    if (!code) throw new NotFoundException('No such tax code');
    return code;
  }

  async create(input: CreateTaxCodeDto) {
    this.assertDistinctNames(input.components);

    try {
      const created = await this.tenantDb.transaction(
        async (tx, organizationId) => {
          const [code] = await tx
            .insert(taxCodes)
            .values({ organizationId, name: input.name })
            .returning();

          const components = await this.writeComponents(
            tx,
            organizationId,
            code.id,
            input.components,
          );

          return { ...code, components };
        },
      );

      this.logger.log(`Tax code ${created.id} created`);
      return created;
    } catch (error) {
      this.translate(error);
    }
  }

  async update(taxCodeId: string, input: UpdateTaxCodeDto) {
    const existing = await this.findById(taxCodeId);

    // "PST → PST (BC)", "active → retired": for a correction, what it used
    // to say is the point (ADR-018). The components are logged as the new
    // set, which is what anyone checking a rate change wants to read.
    recordPrevious({ name: existing.name, isActive: existing.isActive });

    const { components } = input;
    if (components) this.assertDistinctNames(components);

    /**
     * Built from what was sent rather than spread from the DTO. The DTO is a
     * class instance, and every declared field exists on it as undefined
     * when the body left it out — a spread would pass those along, and
     * Drizzle refuses an update whose values are all undefined.
     */
    const fields = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    };

    try {
      await this.tenantDb.transaction(async (tx, organizationId) => {
        if (Object.keys(fields).length > 0) {
          await tx
            .update(taxCodes)
            .set(fields)
            .where(
              and(
                eq(taxCodes.organizationId, organizationId),
                eq(taxCodes.id, taxCodeId),
              ),
            );
        }

        /**
         * Replaced as a set: delete and insert in one transaction. Nothing
         * references a component — an issued invoice copied its name and
         * rate — so there is no history to lose.
         */
        if (components) {
          await tx
            .delete(taxCodeComponents)
            .where(
              and(
                eq(taxCodeComponents.organizationId, organizationId),
                eq(taxCodeComponents.taxCodeId, taxCodeId),
              ),
            );

          await this.writeComponents(tx, organizationId, taxCodeId, components);
        }
      });
    } catch (error) {
      this.translate(error);
    }
  }

  private async writeComponents(
    tx: Transaction,
    organizationId: string,
    taxCodeId: string,
    components: TaxCodeComponentDto[],
  ) {
    if (components.length === 0) return [];

    return tx
      .insert(taxCodeComponents)
      .values(
        components.map((component) => ({
          organizationId,
          taxCodeId,
          name: component.name,
          rate: component.rate,
        })),
      )
      .returning();
  }

  /**
   * Checked here as well as by the unique index, so the message can say
   * which name — the index would only say that one clashed.
   */
  private assertDistinctNames(components: TaxCodeComponentDto[]): void {
    const seen = new Set<string>();

    for (const component of components) {
      if (seen.has(component.name)) {
        throw new BadRequestException(
          `${component.name} is listed twice — a code charges each tax once`,
        );
      }
      seen.add(component.name);
    }
  }

  private translate(error: unknown): never {
    if (isUniqueViolation(error, 'tax_codes_org_name_key')) {
      throw new ConflictException('A tax code with that name already exists');
    }
    if (isCheckViolation(error, 'tax_code_components_rate_range_check')) {
      throw new BadRequestException('A rate is a percentage between 0 and 100');
    }
    throw error;
  }
}
