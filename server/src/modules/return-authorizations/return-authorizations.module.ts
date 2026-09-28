import { Module } from '@nestjs/common';

import { ReturnAuthorizationsController } from './return-authorizations.controller';
import { ReturnAuthorizationsService } from './return-authorizations.service';

@Module({
  controllers: [ReturnAuthorizationsController],
  providers: [ReturnAuthorizationsService],
  // Exported for returns (held to an RMA) and credit notes (settling one).
  exports: [ReturnAuthorizationsService],
})
export class ReturnAuthorizationsModule {}
