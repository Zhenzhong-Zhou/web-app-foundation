import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { and, asc, desc, eq, type SQL } from 'drizzle-orm';

import { recordPrevious } from '../../core/audit/audit-context';
import { exchangeRates } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { baseCurrency } from '../stock/rates';
import type { ListExchangeRatesDto } from './dto/list-exchange-rates.dto';
import type { SetExchangeRateDto } from './dto/set-exchange-rate.dto';

/**
 * One rate per currency per day, into the organization's base currency
 * (ADR-048). Entered by finance, never fetched: no external service in the
 * request path (ADR-005).
 *
 * Setting a rate changes nothing already valued. A receipt copies the rate it
 * used onto its valuation, and a receipt that found no rate waits in the
 * needs-cost list until someone sets its cost.
 */
@Injectable()
export class ExchangeRatesService {
  private readonly logger = new Logger(ExchangeRatesService.name);

  constructor(private readonly tenantDb: TenantDb) {}

  /** Newest first, capped: the screen shows recent rates, not all of them. */
  list(query: ListExchangeRatesDto) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const filters = [
        eq(exchangeRates.organizationId, organizationId),
        query.currency ? eq(exchangeRates.currency, query.currency) : undefined,
      ].filter((f): f is SQL => f !== undefined);

      return tx
        .select({
          id: exchangeRates.id,
          currency: exchangeRates.currency,
          rateDate: exchangeRates.rateDate,
          rate: exchangeRates.rate,
          updatedAt: exchangeRates.updatedAt,
        })
        .from(exchangeRates)
        .where(and(...filters))
        .orderBy(desc(exchangeRates.rateDate), asc(exchangeRates.currency))
        .limit(100);
    });
  }

  /**
   * Sets the rate for one currency on one day, replacing any already there.
   * A PUT because the day is the identity: entering it twice is correcting
   * it, not adding a second.
   */
  async set(input: SetExchangeRateDto) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const base = await baseCurrency(tx, organizationId);

      if (!base) {
        throw new ConflictException(
          'Set a base currency for the organization before entering rates',
        );
      }

      if (input.currency === base) {
        throw new BadRequestException(
          `${input.currency} is the base currency. A rate converts other currencies into it.`,
        );
      }

      const [existing] = await tx
        .select({ rate: exchangeRates.rate })
        .from(exchangeRates)
        .where(
          and(
            eq(exchangeRates.organizationId, organizationId),
            eq(exchangeRates.currency, input.currency),
            eq(exchangeRates.rateDate, input.rateDate),
          ),
        );

      recordPrevious({ rate: existing?.rate ?? null });

      const [rate] = await tx
        .insert(exchangeRates)
        .values({
          organizationId,
          currency: input.currency,
          rateDate: input.rateDate,
          rate: input.rate,
        })
        .onConflictDoUpdate({
          target: [
            exchangeRates.organizationId,
            exchangeRates.currency,
            exchangeRates.rateDate,
          ],
          set: { rate: input.rate },
        })
        .returning({
          id: exchangeRates.id,
          currency: exchangeRates.currency,
          rateDate: exchangeRates.rateDate,
          rate: exchangeRates.rate,
        });

      this.logger.log(
        `Rate ${rate.currency} ${rate.rateDate} set to ${rate.rate}`,
      );

      return rate;
    });
  }
}
