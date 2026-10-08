import { Module } from '@nestjs/common';

import { ReturnAuthorizationReceiptsService } from './return-authorization-receipts.service';
import { ReturnAuthorizationReplacementsService } from './return-authorization-replacements.service';
import { ReturnAuthorizationsController } from './return-authorizations.controller';
import { ReturnAuthorizationsService } from './return-authorizations.service';

@Module({
  controllers: [ReturnAuthorizationsController],
  providers: [
    ReturnAuthorizationsService,
    ReturnAuthorizationReceiptsService,
    ReturnAuthorizationReplacementsService,
  ],
  // Exported for returns, which are held to an RMA they are received against.
  exports: [ReturnAuthorizationReceiptsService, ReturnAuthorizationsService],
})
export class ReturnAuthorizationsModule {}
