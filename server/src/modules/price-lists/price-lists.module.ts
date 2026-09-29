import { Module } from '@nestjs/common';

import { PriceListsController } from './price-lists.controller';
import { PriceListsService } from './price-lists.service';

/**
 * Price lists (ADR-049). The functions that resolve a line's default price
 * and check a list may be assigned live in list-price.ts and are imported
 * directly by orders, partners and organizations: they run inside those
 * modules' transactions, so a provider would only add wiring.
 */
@Module({
  controllers: [PriceListsController],
  providers: [PriceListsService],
})
export class PriceListsModule {}
