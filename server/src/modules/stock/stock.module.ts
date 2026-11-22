import { Module } from '@nestjs/common';

import { AuditModule } from '../../core/audit/audit.module';
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
import { StockGroupedController } from './stock-grouped.controller';
import { StockGroupedService } from './stock-grouped.service';
import { StockReadsService } from './stock-reads.service';
import { WhereItStandsController } from './where-it-stands.controller';
import { WhereItStandsService } from './where-it-stands.service';

/**
 * Exports StockService because receiving against an order line writes a
 * movement, and OrdersModule has to go through the service rather than the
 * tables directly — one write path into the ledger is what makes it
 * authoritative (ADR-023). Home counts with the lists' own conditions,
 * not their services, so the reads stay here (ADR-091).
 */
@Module({
  // For PermissionsService, which AdjustmentGuard resolves per request.
  // The global PermissionGuard needs no import here — it is instantiated
  // inside AuthorizationModule and registered in AppModule. The bell, for
  // an item fallen low (ADR-085); and the audit log, for a lot's code
  // marked as made here, its own entry (ADR-094).
  imports: [AuthorizationModule, NotificationsModule, AuditModule],
  controllers: [
    StockController,
    StockGroupedController,
    LotTraceController,
    AvailabilityController,
    ReorderPointsController,
    WhereItStandsController,
  ],
  providers: [
    StockService,
    StockReadsService,
    StockGroupedService,
    WhereItStandsService,
    LotsService,
    AdjustmentGuard,
    LotTraceService,
    AvailabilityService,
    ReorderPointsService,
    ReorderPointsReadsService,
    LowStockNoticesService,
    LowStockNoticesTimer,
  ],
  exports: [StockService],
})
export class StockModule {}
