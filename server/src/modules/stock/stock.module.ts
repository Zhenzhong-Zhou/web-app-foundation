import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../../core/authorization/authorization.module';
import { NotificationsModule } from '../../core/notifications/notifications.module';
import { AdjustmentGuard } from './adjustment.guard';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';
import { LotTraceController } from './lot-trace.controller';
import { LotTraceService } from './lot-trace.service';
import { LotsService } from './lots.service';
import { LowStockNoticesService } from './low-stock-notices.service';
import { LowStockNoticesTimer } from './low-stock-notices.timer';
import { ReorderPointsController } from './reorder-points.controller';
import { ReorderPointsService } from './reorder-points.service';
import { ReorderPointsReadsService } from './reorder-points-reads.service';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';
import { StockReadsService } from './stock-reads.service';

/**
 * Exports StockService because receiving against an order line writes a
 * movement, and OrdersModule has to go through the service rather than the
 * tables directly — one write path into the ledger is what makes it
 * authoritative (ADR-023). The reads go to Home, whose cards read through
 * each list's own service (ADR-058).
 */
@Module({
  // For PermissionsService, which AdjustmentGuard resolves per request.
  // The global PermissionGuard needs no import here — it is instantiated
  // inside AuthorizationModule and registered in AppModule. And the bell,
  // for an item fallen low (ADR-085).
  imports: [AuthorizationModule, NotificationsModule],
  controllers: [
    StockController,
    LotTraceController,
    AvailabilityController,
    ReorderPointsController,
  ],
  providers: [
    StockService,
    StockReadsService,
    LotsService,
    AdjustmentGuard,
    LotTraceService,
    AvailabilityService,
    ReorderPointsService,
    ReorderPointsReadsService,
    LowStockNoticesService,
    LowStockNoticesTimer,
  ],
  exports: [StockService, StockReadsService, ReorderPointsReadsService],
})
export class StockModule {}
