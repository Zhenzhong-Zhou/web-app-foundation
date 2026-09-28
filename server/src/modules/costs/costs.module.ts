import { Module } from '@nestjs/common';

import { CostsController } from './costs.controller';
import { CostsService } from './costs.service';
import { ExchangeRatesService } from './exchange-rates.service';

/**
 * Costs are read here and corrected here (ADR-048). The valuation ledger
 * itself is written by the stock module, which is why the correction this
 * module offers is a function it imports rather than a second write path.
 */
@Module({
  controllers: [CostsController],
  providers: [CostsService, ExchangeRatesService],
})
export class CostsModule {}
