import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../../core/authorization/authorization.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { OrdersModule } from '../orders/orders.module';
import { ProductionOrdersModule } from '../production-orders/production-orders.module';
import { RecentModule } from '../recent/recent.module';
import { ReturnAuthorizationsModule } from '../return-authorizations/return-authorizations.module';
import { StockModule } from '../stock/stock.module';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';
import { WelcomeService } from './welcome.service';

/**
 * Home (ADR-058). It reads through each list's own service, so its rows are
 * those lists' first rows; AuthorizationModule decides which cards a
 * member sees, and says what they may do for the welcome (ADR-079), whose
 * lookups RecentModule ticks.
 */
@Module({
  imports: [
    AuthorizationModule,
    OrdersModule,
    StockModule,
    InvoicesModule,
    ReturnAuthorizationsModule,
    ProductionOrdersModule,
    RecentModule,
  ],
  controllers: [HomeController],
  providers: [HomeService, WelcomeService],
})
export class HomeModule {}
