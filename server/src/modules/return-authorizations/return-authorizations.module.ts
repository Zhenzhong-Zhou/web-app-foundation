import { Module } from '@nestjs/common';

import { ReturnAuthorizationReceiptsService } from './return-authorization-receipts.service';
import { ReturnAuthorizationsController } from './return-authorizations.controller';
import { ReturnAuthorizationsService } from './return-authorizations.service';

@Module({
  controllers: [ReturnAuthorizationsController],
  providers: [ReturnAuthorizationsService, ReturnAuthorizationReceiptsService],
  // Exported for returns, which are held to an RMA they are received against.
  exports: [ReturnAuthorizationReceiptsService],
})
export class ReturnAuthorizationsModule {}
