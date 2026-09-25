import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { AUDIT_ACTIONS } from '../../core/audit/audit-actions';
import { Audited } from '../../core/audit/audited.decorator';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import type { RequestContext } from '../../core/auth/request-context';
import { PERMISSIONS } from '../../core/authorization/permissions';
import { RequirePermissions } from '../../core/authorization/require-permissions.decorator';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { ListInvoicesDto } from './dto/list-invoices.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { UpdateInvoiceLineDto } from './dto/update-invoice-line.dto';
import { InvoicesService } from './invoices.service';

/**
 * Invoices for shipments (ADR-046). This step covers drafts; issue and void
 * are added in the next two.
 */
@Controller({ path: 'invoices', version: '1' })
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.INVOICES_VIEW)
  list(@Query() query: ListInvoicesDto) {
    return this.invoices.list(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.INVOICES_VIEW)
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return { invoice: await this.invoices.findById(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.INVOICES_CREATE)
  @Audited({
    action: AUDIT_ACTIONS.INVOICE_CREATED,
    resourceType: 'invoice',
    resourceId: (response: { invoice: { id: string } }) => response.invoice.id,
    fields: ['shipmentId', 'taxCodeId'],
  })
  async create(
    @Body() dto: CreateInvoiceDto,
    @CurrentUser() user: RequestContext,
  ) {
    return { invoice: await this.invoices.createDraft(dto, user.userId) };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.INVOICES_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.INVOICE_UPDATED,
    resourceType: 'invoice',
    resourceId: (_response, request) => request.params.id,
    // Not the note: free text is where people put what should not sit in a
    // two-year table (ADR-018).
    fields: ['dueDate', 'taxCodeId'],
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInvoiceDto,
  ): Promise<void> {
    await this.invoices.update(id, dto);
  }

  @Patch(':id/lines/:lineId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.INVOICES_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.INVOICE_LINE_UPDATED,
    resourceType: 'invoice',
    resourceId: (_response, request) => request.params.id,
    fields: ['unitPrice', 'taxCodeId'],
  })
  async updateLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body() dto: UpdateInvoiceLineDto,
  ): Promise<void> {
    await this.invoices.updateLine(id, lineId, dto);
  }

  /**
   * Drafts only. The audit row has no label, because the invoice is gone
   * by the time labels are read; its id and the actor are enough for a
   * document nobody outside ever saw.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.INVOICES_DELETE)
  @Audited({
    action: AUDIT_ACTIONS.INVOICE_DELETED,
    resourceType: 'invoice',
    resourceId: (_response, request) => request.params.id,
  })
  async delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.invoices.delete(id);
  }
}
