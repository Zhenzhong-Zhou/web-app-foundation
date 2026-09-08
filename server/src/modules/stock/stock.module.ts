import { Module } from '@nestjs/common';

import { StockController } from './stock.controller';
import { StockService } from './stock.service';

/**
 * Exports StockService because order management will need to record shipments
 * and receipts without going through HTTP. Nothing imports it yet; the export
 * is what keeps that from becoming a reason to reach for the table directly.
 */
@Module({
  controllers: [StockController],
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}
