import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../../core/authorization/authorization.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { OrdersModule } from '../orders/orders.module';
import { ProductionOrdersModule } from '../production-orders/production-orders.module';
import { ReturnAuthorizationsModule } from '../return-authorizations/return-authorizations.module';
import { StockModule } from '../stock/stock.module';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';

/**
 * Home (ADR-058). It reads through each list's own service, so its rows are
 * those lists' first rows; AuthorizationModule decides which cards a
 * member sees.
 */
@Module({
  imports: [
    AuthorizationModule,
    OrdersModule,
    StockModule,
    InvoicesModule,
    ReturnAuthorizationsModule,
    ProductionOrdersModule,
  ],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
