import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { AUDIT_ACTIONS } from '../../core/audit/audit-actions';
import { Audited } from '../../core/audit/audited.decorator';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import type { RequestContext } from '../../core/auth/request-context';
import { PERMISSIONS } from '../../core/authorization/permissions';
import { RequirePermissions } from '../../core/authorization/require-permissions.decorator';
import { DocumentsService } from '../../core/documents/documents.service';
import {
  DownloadAsked,
  PdfResponse,
} from '../../core/documents/pdf-response.decorator';
import { AcceptLanguage } from '../../i18n/accept-language.decorator';
import { localeOf } from '../../i18n/translate';
import { PreviewShipmentDto, ShipOrderDto } from './dto/ship-order.dto';
import type {
  PackingSlip,
  Shipment,
  ShipmentEnvelope,
  ShipmentPlan,
} from './dto/shipment-response.dto';
import { VoidShipmentDto } from './dto/void-shipment.dto';
import { printablePackingSlip } from './packing-slip-document';
import { ShipmentVoidsService } from './shipment-voids.service';
import { ShipmentsService } from './shipments.service';
import { ShippingService } from './shipping.service';

/**
 * Shipments against a sales order (ADR-041). Its own controller because a
 * shipment is its own document — several lines, several lots, one parcel —
 * rather than an action on one order line the way a receipt is.
 */
@Controller({ path: 'orders/:id/shipments', version: '1' })
export class ShipmentsController {
  constructor(
    private readonly shipments: ShipmentsService,
    private readonly shipping: ShippingService,
    private readonly voids: ShipmentVoidsService,
    private readonly documents: DocumentsService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ORDERS_VIEW)
  list(
    @Param('id', ParseUUIDPipe) id: string,
    @AcceptLanguage() acceptLanguage?: string,
  ): Promise<Shipment[]> {
    return this.shipments.listForOrder(id, localeOf(acceptLanguage));
  }

  /**
   * One shipment, with everything its packing slip prints. A read, so
   * orders.view: whoever can see the order can print what left against it.
   */
  @Get(':shipmentId')
  @RequirePermissions(PERMISSIONS.ORDERS_VIEW)
  slip(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('shipmentId', ParseUUIDPipe) shipmentId: string,
  ): Promise<PackingSlip> {
    return this.shipments.slip(id, shipmentId);
  }

  /**
   * The packing slip as a PDF (ADR-071), under the permission that reads
   * it: inline for Print, an attachment with ?download=1.
   */
  @Get(':shipmentId/pdf')
  @RequirePermissions(PERMISSIONS.ORDERS_VIEW)
  @PdfResponse()
  async pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('shipmentId', ParseUUIDPipe) shipmentId: string,
    @DownloadAsked() download: boolean,
    @Res() res: Response,
  ): Promise<void> {
    await this.documents.send(
      res,
      download,
      this.shipments.slip(id, shipmentId).then(printablePackingSlip),
    );
  }

  /**
   * A POST because the question has a body — which lines, how much of each —
   * but it writes nothing. Its own permission rather than orders.view: it
   * shows exactly what shipping would take from the shelf.
   */
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.ORDERS_SHIP)
  preview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PreviewShipmentDto,
  ): Promise<ShipmentPlan> {
    return this.shipping.preview(id, dto);
  }

  /**
   * Its own permission, as receiving has: the person packing boxes is not
   * usually the person who raises orders, and writing to the ledger is a
   * different act from editing a reference.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.ORDERS_SHIP)
  @Audited({
    action: AUDIT_ACTIONS.ORDER_SHIPPED,
    resourceType: 'order',
    resourceId: (_response, request) => request.params.id,
  })
  async ship(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ShipOrderDto,
    @CurrentUser() user: RequestContext,
  ): Promise<ShipmentEnvelope> {
    const shipment = await this.shipping.ship(id, dto, user.userId);
    // As its packing slip reads, the one read of a single shipment.
    return { shipment: await this.shipments.slip(id, shipment.id) };
  }

  /**
   * Undoes a shipment that was recorded before the box left (ADR-041).
   * orders.ship, because it is the same act run backwards by the same
   * person — the one who clicked Ship too early. Audited under the order, so
   * its History shows the shipment and its void side by side.
   */
  @Post(':shipmentId/void')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.ORDERS_SHIP)
  @Audited({
    action: AUDIT_ACTIONS.ORDER_SHIPMENT_VOIDED,
    resourceType: 'order',
    resourceId: (_response, request) => request.params.id,
  })
  async void(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('shipmentId', ParseUUIDPipe) shipmentId: string,
    @Body() dto: VoidShipmentDto,
    @CurrentUser() user: RequestContext,
  ): Promise<void> {
    await this.voids.void(id, shipmentId, dto, user.userId);
  }
}
