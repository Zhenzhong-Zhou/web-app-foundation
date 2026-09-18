import { Module } from '@nestjs/common';

import { NotificationsModule } from '../../core/notifications/notifications.module';
import { PartnersModule } from '../partners/partners.module';
import { StockModule } from '../stock/stock.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

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
  imports: [StockModule, PartnersModule, NotificationsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
