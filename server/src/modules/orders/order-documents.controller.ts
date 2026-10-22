import { Controller, Get, Param, ParseUUIDPipe, Res } from '@nestjs/common';
import type { Response } from 'express';

import { PERMISSIONS } from '../../core/authorization/permissions';
import { RequirePermissions } from '../../core/authorization/require-permissions.decorator';
import { DocumentsService } from '../../core/documents/documents.service';
import {
  DownloadAsked,
  PdfResponse,
} from '../../core/documents/pdf-response.decorator';
import { printablePurchaseOrder } from './purchase-order-document';
import { PurchaseOrderPrintService } from './purchase-order-print.service';

/** A purchase order's own document, beside the order (ADR-071). */
@Controller({ path: 'orders/:id/pdf', version: '1' })
export class OrderDocumentsController {
  constructor(
    private readonly purchaseOrders: PurchaseOrderPrintService,
    private readonly documents: DocumentsService,
  ) {}

  /**
   * The purchase order as a PDF, with its prices, so under the permission
   * that reads them too (ADR-080): inline for Print, an attachment with
   * ?download=1. A sale's document is its pro forma, at
   * /orders/:id/pro-forma.
   */
  @Get()
  @RequirePermissions(PERMISSIONS.ORDERS_VIEW, PERMISSIONS.ORDERS_VIEW_PRICES)
  @PdfResponse()
  async pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @DownloadAsked() download: boolean,
    @Res() res: Response,
  ): Promise<void> {
    await this.documents.send(
      res,
      download,
      this.purchaseOrders.read(id).then(printablePurchaseOrder),
    );
  }
}
