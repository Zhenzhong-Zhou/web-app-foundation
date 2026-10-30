import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
  type OnApplicationShutdown,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import { flushFaults } from './common/faults/tracker';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { CsrfGuard } from './common/guards/csrf.guard';
import { ApiRevisionMiddleware } from './common/middleware/api-revision.middleware';
import { requestLogOptions } from './common/request-log';
import { type Env, validateEnv } from './config/env';
import { AuditInterceptor } from './core/audit/audit.interceptor';
import { AuditModule } from './core/audit/audit.module';
import { AuthModule } from './core/auth/auth.module';
import { SessionGuard } from './core/auth/session.guard';
import { throttleTracker } from './core/auth/throttle-tracker';
import { AuthorizationModule } from './core/authorization/authorization.module';
import { PermissionGuard } from './core/authorization/permission.guard';
import { FilesModule } from './core/files/files.module';
import { InvitationsModule } from './core/invitations/invitations.module';
import { OrganizationsModule } from './core/organizations/organizations.module';
import { PeopleModule } from './core/people/people.module';
import { UsersModule } from './core/users/users.module';
import { DatabaseModule } from './database/database.module';
import { ErrorsModule } from './errors/errors.module';
import { HealthModule } from './health/health.module';
import { BomsModule } from './modules/boms/boms.module';
import { CostsModule } from './modules/costs/costs.module';
import { HomeModule } from './modules/home/home.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { LocationsModule } from './modules/locations/locations.module';
import { NumberingModule } from './modules/numbering/numbering.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PartnersModule } from './modules/partners/partners.module';
import { PriceListsModule } from './modules/price-lists/price-lists.module';
import { ProductLicencesModule } from './modules/product-licences/product-licences.module';
import { ProductionOrdersModule } from './modules/production-orders/production-orders.module';
import { ProductsModule } from './modules/products/products.module';
import { RecentModule } from './modules/recent/recent.module';
import { ReturnAuthorizationsModule } from './modules/return-authorizations/return-authorizations.module';
import { SearchModule } from './modules/search/search.module';
import { StockModule } from './modules/stock/stock.module';
import { TaxCodesModule } from './modules/tax-codes/tax-codes.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Resolved against process.cwd(), which is server/ when you run
      // `npm run start:dev`. One .env at the repo root serves both Nest
      // and docker compose — see README, "Repository layout".
      envFilePath: '../.env',
      validate: validateEnv,
      cache: true,
    }),

    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: requestLogOptions(config.get('NODE_ENV', { infer: true })),
      }),
    }),

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        throttlers: [
          {
            name: 'default',
            ttl: config.get('RATE_LIMIT_TTL_SECONDS', { infer: true }) * 1000,
            limit: config.get('RATE_LIMIT_MAX', { infer: true }),
          },
        ],
        // The signed-in person, or the client's own address (ADR-011).
        getTracker: throttleTracker,
      }),
    }),

    DatabaseModule,

    // Core: identity, authorization, and the audit trail everything else
    // depends on.
    AuthModule,
    AuthorizationModule,
    AuditModule,
    FilesModule,
    PeopleModule,
    UsersModule,
    InvitationsModule,

    // Feature modules. These consume the above and add nothing to it.
    ProductsModule,
    ProductLicencesModule,
    OrganizationsModule,
    TaxCodesModule,
    BomsModule,
    ProductionOrdersModule,
    SearchModule,
    HomeModule,
    RecentModule,
    LocationsModule,
    NumberingModule,
    StockModule,
    CostsModule,
    PriceListsModule,
    PartnersModule,
    OrdersModule,
    InvoicesModule,
    ReturnAuthorizationsModule,

    // Infrastructure, not domain: a liveness probe, and the browser's error
    // reports, each unversioned and public.
    HealthModule,
    ErrorsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },

    // Guards run in registration order, and the order is deliberate: throttle
    // before authenticating, authenticate before authorizing. A flood is cheap
    // to reject, and an anonymous request reads as 401 rather than 403 or as a
    // CSRF failure. The session is read before any of them, by
    // SessionContextMiddleware, so the throttler already counts per person.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },

    // Writes an audit row after a handler marked @Audited() succeeds.
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule implements NestModule, OnApplicationShutdown {
  configure(consumer: MiddlewareConsumer): void {
    // AppModule's middleware runs after the global LoggerModule's, so the
    // request has its id, and before every imported module's, so the API
    // revision is compared before SessionContextMiddleware reads the
    // session (ADR-081). Sign-out is always served, whatever the revision:
    // ending a session must never fail, on a shared computer least of all,
    // and it sends nothing to misread.
    consumer
      .apply(ApiRevisionMiddleware)
      .exclude({
        path: 'auth/logout',
        method: RequestMethod.POST,
        version: '1',
      })
      .forRoutes('*');
  }

  // Reports still pending, sent before the process ends, a deploy's
  // included: for at most two seconds (ADR-084).
  async onApplicationShutdown(): Promise<void> {
    await flushFaults();
  }
}
