import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { CsrfGuard } from './common/guards/csrf.guard';
import { type Env, validateEnv } from './config/env';
import { AuditInterceptor } from './core/audit/audit.interceptor';
import { AuditModule } from './core/audit/audit.module';
import { AuthModule } from './core/auth/auth.module';
import { SessionGuard } from './core/auth/session.guard';
import { AuthorizationModule } from './core/authorization/authorization.module';
import { PermissionGuard } from './core/authorization/permission.guard';
import { UsersModule } from './core/users/users.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { LocationsModule } from './modules/locations/locations.module';
import { ProductsModule } from './modules/products/products.module';

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
      useFactory: (config: ConfigService<Env, true>) => {
        const nodeEnv = config.get('NODE_ENV', { infer: true });
        const isProd = nodeEnv === 'production';

        return {
          pinoHttp: {
            level: nodeEnv === 'test' ? 'silent' : isProd ? 'info' : 'debug',
            // Structured JSON in production so log aggregators can parse it;
            // human-readable locally.
            transport: isProd
              ? undefined
              : { target: 'pino-pretty', options: { singleLine: true } },

            // ADR-011: session tokens live in cookies. Logging them would
            // undo the reason we only store their hash.
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'res.headers["set-cookie"]',
                'req.body.password',
              ],
              remove: true,
            },

            // Correlates every log line for one request, and hands the client
            // an id to quote in a bug report.
            genReqId: (req, res) => {
              const id =
                (req.headers['x-request-id'] as string) ?? randomUUID();
              res.setHeader('x-request-id', id);
              return id;
            },

            // Liveness probes fire every few seconds; logging them buries
            // everything else.
            autoLogging: {
              ignore: (req) => req.url?.startsWith('/health') ?? false,
            },

            customLogLevel: (_req, res, err) => {
              if (err || res.statusCode >= 500) return 'error';
              if (res.statusCode >= 400) return 'warn';
              return 'info';
            },
          },
        };
      },
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
      }),
    }),

    DatabaseModule,

    // Core: identity, authorization, and the audit trail everything else
    // depends on.
    AuthModule,
    AuthorizationModule,
    AuditModule,
    UsersModule,

    // Feature modules. These consume the above and add nothing to it.
    ProductsModule,
    LocationsModule,

    // Infrastructure, not domain: a liveness probe, unversioned and public.
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },

    // Guards run in registration order, and the order is deliberate: throttle
    // before authenticating, authenticate before authorizing. A flood is cheap
    // to reject, and an anonymous request reads as 401 rather than 403 or as a
    // CSRF failure.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },

    // Writes an audit row after a handler marked @Audited() succeeds.
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
