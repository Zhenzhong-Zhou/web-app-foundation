import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import type { Env } from './config/env';
import { AccountDeletionTimer } from './core/auth/account-deletion.timer';
import { FilesPurgeTimer } from './core/files/files-purge.timer';
import { LicenceRemindersTimer } from './modules/product-licences/licence-reminders.timer';

async function bootstrap() {
  // bufferLogs holds early boot logs until pino replaces the default logger,
  // so nothing is emitted in two different formats.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  configureApp(app);

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  await app.listen(config.get('PORT', { infer: true }));

  // Here only, never when the application boots: tests and scripts boot it
  // too (HourlyTimer).
  for (const timer of [
    FilesPurgeTimer,
    LicenceRemindersTimer,
    AccountDeletionTimer,
  ]) {
    app.get(timer).start();
  }
}

void bootstrap();
