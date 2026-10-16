import { Module } from '@nestjs/common';

import { DocumentsModule } from '../../core/documents/documents.module';
import { ReturnAuthorizationDocumentsController } from './return-authorization-documents.controller';
import { ReturnAuthorizationPrintService } from './return-authorization-print.service';
import { ReturnAuthorizationReceiptsService } from './return-authorization-receipts.service';
import { ReturnAuthorizationReplacementsService } from './return-authorization-replacements.service';
import { ReturnAuthorizationsController } from './return-authorizations.controller';
import { ReturnAuthorizationsService } from './return-authorizations.service';

@Module({
  imports: [DocumentsModule],
  controllers: [
    ReturnAuthorizationsController,
    ReturnAuthorizationDocumentsController,
  ],
  providers: [
    ReturnAuthorizationsService,
    ReturnAuthorizationPrintService,
    ReturnAuthorizationReceiptsService,
    ReturnAuthorizationReplacementsService,
  ],
  // Exported for returns, which are held to an RMA they are received against.
  exports: [ReturnAuthorizationReceiptsService, ReturnAuthorizationsService],
})
export class ReturnAuthorizationsModule {}
