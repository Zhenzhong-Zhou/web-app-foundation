import { Module } from '@nestjs/common';

import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/**
 * Exported because the modules that detect something worth telling people
 * about are the ones that emit: production orders on a variance, orders on a
 * short close, account events on a password change or a new session
 * (ADR-036).
 *
 * No DatabaseModule import — it is global, and this service takes the
 * unscoped handle deliberately: a notification is scoped by recipient rather
 * than by tenant, and an account notification has no organization at all.
 */
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
