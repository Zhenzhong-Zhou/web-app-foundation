import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { PERMISSIONS } from '../../core/authorization/permissions';
import { RequirePermissions } from '../../core/authorization/require-permissions.decorator';
import { DocumentsService } from '../../core/documents/documents.service';
import { PdfResponse } from '../../core/documents/pdf-response.decorator';
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
   * The purchase order as a PDF, under the permission that reads the
   * order: inline for Print, an attachment with ?download=1. A sale's
   * document is its pro forma, at /orders/:id/pro-forma.
   */
  @Get()
  @RequirePermissions(PERMISSIONS.ORDERS_VIEW)
  @PdfResponse()
  async pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('download') download: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    await this.documents.send(
      res,
      download === '1',
      this.purchaseOrders.read(id).then(printablePurchaseOrder),
    );
  }
}
