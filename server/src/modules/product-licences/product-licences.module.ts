import { Module } from '@nestjs/common';

import { NotificationsModule } from '../../core/notifications/notifications.module';
import { LicenceRemindersService } from './licence-reminders.service';
import { LicenceRemindersTimer } from './licence-reminders.timer';
import { ProductLicencesController } from './product-licences.controller';
import { ProductLicencesService } from './product-licences.service';

@Module({
  // The bell, for expiry reminders (ADR-064).
  imports: [NotificationsModule],
  controllers: [ProductLicencesController],
  providers: [
    ProductLicencesService,
    LicenceRemindersService,
    LicenceRemindersTimer,
  ],
  // Exported for the BOM service, which checks a licence is this tenant's
  // before attaching it — the foreign key alone cannot (ADR-003).
  exports: [ProductLicencesService],
})
export class ProductLicencesModule {}
