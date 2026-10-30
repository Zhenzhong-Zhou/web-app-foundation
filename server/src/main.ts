import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { startTracker } from './common/faults/tracker';
import { type Env, validateEnv } from './config/env';
import { AccountDeletionTimer } from './core/auth/account-deletion.timer';
import { OrganizationDeletionTimer } from './core/auth/organization-deletion.timer';
import { FilesPurgeTimer } from './core/files/files-purge.timer';
import { InvitationsSweepTimer } from './core/invitations/invitations-sweep.timer';
import { LicenceRemindersTimer } from './modules/product-licences/licence-reminders.timer';
import { MailBrand } from './shared/mail/mail-brand';

async function bootstrap() {
  // The error tracker (ADR-084), before the app is made, so a fault while it
  // boots is reported too: here only, never in the tests or the scripts.
  // Importing AppModule has read ../.env into process.env.
  const tracker = startTracker(validateEnv(process.env));

  // bufferLogs holds early boot logs until pino replaces the default logger,
  // so nothing is emitted in two different formats.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  // Whether it is on, so a setting lost in a move shows in the first lines.
  app.get(Logger).log(tracker, 'ErrorTracker');

  configureApp(app);

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  await app.listen(config.get('PORT', { infer: true }));

  // Whether the static site serves the emails' mark yet (ADR-082), asked
  // before the timers start, since their first run is at once and its
  // emails should carry the mark: within 10 seconds, after listen, so no
  // request waits for it.
  await app.get(MailBrand).start();

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
}

void bootstrap();
