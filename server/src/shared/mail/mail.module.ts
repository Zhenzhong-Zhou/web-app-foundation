import { Module } from '@nestjs/common';

import { MailService } from './mail.service';
import { answersAsPng, MAIL_MARK_CHECK, MailBrand } from './mail-brand';

@Module({
  providers: [
    MailService,
    MailBrand,
    { provide: MAIL_MARK_CHECK, useValue: answersAsPng },
  ],
  exports: [MailService, MailBrand],
})
export class MailModule {}
