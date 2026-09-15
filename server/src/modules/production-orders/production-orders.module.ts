import { Module } from '@nestjs/common';

import { StockModule } from '../stock/stock.module';
import { ProductionOrdersController } from './production-orders.controller';
import { ProductionOrdersService } from './production-orders.service';

/**
 * Imports StockModule for `recordWithin`, the same way orders does. Every
 * quantity change goes through that one path — a second writer into
 * `stock_movements` is the moment the ledger stops being authoritative
 * (ADR-023), and this module writes four kinds of movement.
 *
 * No BomsModule import. Release reads `bom_lines` in the insert-select that
 * copies them, which is one statement doing the scaling in SQL; routing that
 * through a service would mean fetching rows into JavaScript to multiply
 * decimals, which is what ADR-025 exists to avoid.
 */
@Module({
  imports: [StockModule],
  controllers: [ProductionOrdersController],
  providers: [ProductionOrdersService],
  exports: [ProductionOrdersService],
})
export class ProductionOrdersModule {}
