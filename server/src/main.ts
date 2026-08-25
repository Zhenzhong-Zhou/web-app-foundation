import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import type { Env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  
  // ADR-011: without this, Express behind a TLS-terminating proxy reports the
  // proxy's IP as req.ip AND silently refuses to set `secure` cookies.
  // Works fine on localhost, fails only in production.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  
  app.use(helmet());
  
  // ADR-013: every API route is /v1/... . /health opts out via VERSION_NEUTRAL.
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  
  app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true, // strip properties not on the DTO
        forbidNonWhitelisted: true, // 400 if the client sends extras
        transform: true, // coerce payloads into DTO instances
        transformOptions: { enableImplicitConversion: false },
      }),
  );
  
  // Lets Nest run onModuleDestroy hooks — required for closing the pg pool.
  app.enableShutdownHooks();
  
  const port = config.get('PORT', { infer: true });
  await app.listen(port);
}

void bootstrap();