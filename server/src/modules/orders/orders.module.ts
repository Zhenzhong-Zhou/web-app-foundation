import { Module } from '@nestjs/common';

import { DocumentsModule } from '../../core/documents/documents.module';
import { NotificationsModule } from '../../core/notifications/notifications.module';
import { PartnersModule } from '../partners/partners.module';
import { ReturnAuthorizationsModule } from '../return-authorizations/return-authorizations.module';
import { StockModule } from '../stock/stock.module';
import { OrderDocumentsController } from './order-documents.controller';
import { OrderLifecycleService } from './order-lifecycle.service';
import { OrderLinesService } from './order-lines.service';
import { OrderReceiptsService } from './order-receipts.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PurchaseOrderPrintService } from './purchase-order-print.service';
import { ReturnsController } from './returns.controller';
import { ReturnsService } from './returns.service';
import { ShipmentVoidsService } from './shipment-voids.service';
import { ShipmentsController } from './shipments.controller';
import { ShipmentsService } from './shipments.service';
import { ShippingService } from './shipping.service';

/**
 * Imports StockModule because receiving against a line writes a movement, and
 * that has to happen through StockService rather than against the tables
 * directly — one write path into the ledger is what makes it authoritative
 * (ADR-023).
 *
 * PartnersModule is imported for the same reason in the other direction:
 * whether a partner exists and is active is a question that belongs to
 * partners, even though this module is the only caller so far.
 */
@Module({
  imports: [
    StockModule,
    PartnersModule,
    NotificationsModule,
    ReturnAuthorizationsModule,
    DocumentsModule,
  ],
  controllers: [
    OrdersController,
    ShipmentsController,
    ReturnsController,
    OrderDocumentsController,
  ],
  providers: [
    OrdersService,
    OrderLifecycleService,
    OrderLinesService,
    OrderReceiptsService,
    PurchaseOrderPrintService,
    ShipmentsService,
    ShippingService,
    ShipmentVoidsService,
    ReturnsService,
  ],
  exports: [OrdersService],
})
export class OrdersModule {}
