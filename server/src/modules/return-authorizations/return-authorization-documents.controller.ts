import { Controller, Get, Param, ParseUUIDPipe, Res } from '@nestjs/common';
import type { Response } from 'express';

import { PERMISSIONS } from '../../core/authorization/permissions';
import { RequirePermissions } from '../../core/authorization/require-permissions.decorator';
import { DocumentsService } from '../../core/documents/documents.service';
import {
  DownloadAsked,
  PdfResponse,
} from '../../core/documents/pdf-response.decorator';
import { printableReturnAuthorization } from './return-authorization-document';
import { ReturnAuthorizationPrintService } from './return-authorization-print.service';

/** A return authorization's own document (ADR-071). */
@Controller({ path: 'return-authorizations/:id/pdf', version: '1' })
export class ReturnAuthorizationDocumentsController {
  constructor(
    private readonly rmas: ReturnAuthorizationPrintService,
    private readonly documents: DocumentsService,
  ) {}

  /**
   * The RMA as a PDF, under the permission that reads it: inline for
   * Print, an attachment with ?download=1.
   */
  @Get()
  @RequirePermissions(PERMISSIONS.RETURN_AUTHORIZATIONS_VIEW)
  @PdfResponse()
  async pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @DownloadAsked() download: boolean,
    @Res() res: Response,
  ): Promise<void> {
    await this.documents.send(
      res,
      download,
      this.rmas.read(id).then(printableReturnAuthorization),
    );
  }
}
