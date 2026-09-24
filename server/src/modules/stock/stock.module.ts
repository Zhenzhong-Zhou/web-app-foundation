import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../../core/authorization/authorization.module';
import { AdjustmentGuard } from './adjustment.guard';
import { LotTraceController } from './lot-trace.controller';
import { LotTraceService } from './lot-trace.service';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

/**
 * Exports StockService because receiving against an order line writes a
 * movement, and OrdersModule has to go through the service rather than the
 * tables directly — one write path into the ledger is what makes it
 * authoritative (ADR-023).
 */
@Module({
  // For PermissionsService, which AdjustmentGuard resolves per request.
  // The global PermissionGuard needs no import here — it is instantiated
  // inside AuthorizationModule and registered in AppModule.
  imports: [AuthorizationModule],
  controllers: [StockController, LotTraceController],
  providers: [StockService, AdjustmentGuard, LotTraceService],
  exports: [StockService],
})
export class StockModule {}
