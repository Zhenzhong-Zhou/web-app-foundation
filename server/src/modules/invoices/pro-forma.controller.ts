import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
} from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';
import type { Response } from 'express';

import { AuditService } from '../../core/audit/audit.service';
import { AUDIT_ACTIONS } from '../../core/audit/audit-actions';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import type { RequestContext } from '../../core/auth/request-context';
import { PERMISSIONS } from '../../core/authorization/permissions';
import { RequirePermissions } from '../../core/authorization/require-permissions.decorator';
import { DocumentsService } from '../../core/documents/documents.service';
import { PdfResponse } from '../../core/documents/pdf-response.decorator';
import { ProFormaService } from './pro-forma.service';
import { printableProForma } from './pro-forma-document';

/**
 * The pro forma invoice of a sale (ADR-071), beside its order: a PDF
 * drawn on demand, inline for Print, an attachment with ?download=1.
 */
@Controller({ path: 'orders/:id/pro-forma', version: '1' })
export class ProFormaController {
  constructor(
    private readonly proFormas: ProFormaService,
    private readonly documents: DocumentsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Under orders.view, which already shows the order's prices. A GET that
   * writes one thing: the audit entry each pro forma made leaves, with its
   * total, the trail of what was sent (ADR-071). Recorded once the PDF is
   * drawn and before it is sent, so a refusal records nothing and nobody
   * holds a pro forma its history lacks; the decorator audits writes, so
   * this route records its own, as the export does.
   */
  @Get()
  @RequirePermissions(PERMISSIONS.ORDERS_VIEW)
  @PdfResponse()
  @ApiQuery({ name: 'taxCodeId', required: false, type: String })
  async pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('taxCodeId', new ParseUUIDPipe({ optional: true }))
    taxCodeId: string | undefined,
    @Query('download') download: string | undefined,
    @CurrentUser() user: RequestContext,
    @Res() res: Response,
  ): Promise<void> {
    const proForma = await this.proFormas.make(id, taxCodeId ?? null);
    await this.documents.send(
      res,
      download === '1',
      Promise.resolve(printableProForma(proForma)),
      () =>
        this.audit.record({
          actorId: user.userId,
          action: AUDIT_ACTIONS.ORDER_PRO_FORMA_MADE,
          resourceType: 'order',
          resourceId: id,
          payload: {
            total: proForma.amounts.total,
            currency: proForma.currency,
            taxCodeId: taxCodeId ?? null,
          },
          ip: user.ip,
          userAgent: user.userAgent,
        }),
    );
  }
}
