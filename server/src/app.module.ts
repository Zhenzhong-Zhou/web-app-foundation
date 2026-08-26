import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { type Env, validateEnv } from './config/env';
import { AuthModule } from './core/auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';

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
    AuthModule,
    HealthModule,
  ],
  providers: [
    // Applied to every route by default. Endpoints needing a stricter limit
    // (login, password reset — ADR-011) override with @Throttle().
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
