import { INestApplication, VersioningType } from '@nestjs/common';
import type { AbstractHttpAdapter } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import type { Express } from 'express';
import helmet from 'helmet';

import { isBodyRefusal } from './common/filters/all-exceptions.filter';
import { TranslatingValidationPipe } from './i18n/validation';

/**
 * Everything that turns a bare Nest app into *this* app.
 *
 * main.ts and the e2e tests both call this. If it lived only in main.ts the
 * tests would exercise a differently-configured application — routes without
 * the /v1 prefix, DTOs without validation — and pass while production breaks.
 */
export function configureApp(app: INestApplication): INestApplication {
  // ADR-011: without this, Express behind a TLS-terminating proxy silently
  // refuses to set `secure` cookies. It does not give the client's address:
  // on Render the hop it trusts is one of Render's own proxies, so the
  // address the app records and counts is clientAddress()'s (amended, #316).
  (app.getHttpAdapter().getInstance() as Express).set('trust proxy', 1);

  app.use(helmet());

  app.use(cookieParser());

  // A body Express's parser refuses reaches AllExceptionsFilter as it is,
  // which answers it with the parser's own 4xx, in the request's language,
  // and never reports it (ADR-084). Nest's own mapping would make it a 500
  // anyone could send, or, for JSON that does not parse, a 400 in
  // JSON.parse's English.
  const adapter = app.getHttpAdapter() as AbstractHttpAdapter;
  const mapException = adapter.mapException.bind(
    adapter,
  ) as AbstractHttpAdapter['mapException'];
  adapter.mapException = (error: unknown) =>
    isBodyRefusal(error) ? error : mapException(error);

  // ADR-013: every API route is /v1/... . /health opts out via VERSION_NEUTRAL.
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    // ValidationPipe's options and English, with each message's id kept
    // for the filter to render in the request's language (ADR-054).
    new TranslatingValidationPipe({
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
