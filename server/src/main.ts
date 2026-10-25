import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import type { Env } from './config/env';
import { AccountDeletionTimer } from './core/auth/account-deletion.timer';
import { OrganizationDeletionTimer } from './core/auth/organization-deletion.timer';
import { FilesPurgeTimer } from './core/files/files-purge.timer';
import { InvitationsSweepTimer } from './core/invitations/invitations-sweep.timer';
import { LicenceRemindersTimer } from './modules/product-licences/licence-reminders.timer';
import { MailBrand } from './shared/mail/mail-brand';

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
    OrganizationDeletionTimer,
    AccountDeletionTimer,
    InvitationsSweepTimer,
  ]) {
    app.get(timer).start();
  }
  // Whether the static site serves the emails' mark yet (ADR-082).
  app.get(MailBrand).start();
}

void bootstrap();
