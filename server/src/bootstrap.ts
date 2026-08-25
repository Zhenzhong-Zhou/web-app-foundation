import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import type { Express } from 'express';
import helmet from 'helmet';

/**
 * Everything that turns a bare Nest app into *this* app.
 *
 * main.ts and the e2e tests both call this. If it lived only in main.ts the
 * tests would exercise a differently-configured application — routes without
 * the /v1 prefix, DTOs without validation — and pass while production breaks.
 */
export function configureApp(app: INestApplication): INestApplication {
  // ADR-011: without this, Express behind a TLS-terminating proxy reports the
  // proxy's IP as req.ip AND silently refuses to set `secure` cookies.
  (app.getHttpAdapter().getInstance() as Express).set('trust proxy', 1);

  app.use(helmet());

  // ADR-013: every API route is /v1/... . /health opts out via VERSION_NEUTRAL.
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // Lets Nest run onApplicationShutdown — required for closing the pg pool.
  app.enableShutdownHooks();

  return app;
}
