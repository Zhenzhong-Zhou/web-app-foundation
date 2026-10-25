import { Module } from '@nestjs/common';

import { MailService } from './mail.service';
import { MailBrand } from './mail-brand';

@Module({
  providers: [MailService, MailBrand],
  exports: [MailService, MailBrand],
})
export class MailModule {}
