import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { csvFile, everyRow, exportFilters } from '../../common/export';
import { AUDIT_ACTIONS } from '../../core/audit/audit-actions';
import { recordContext } from '../../core/audit/audit-context';
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
import { localeOf } from '../../i18n/translate';
import { CreditNotesService } from './credit-notes.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreditInvoiceDto, PreviewCreditDto } from './dto/credit-invoice.dto';
import type {
  CreditNoteEnvelope,
  CreditPreviewEnvelope,
  VoidedInvoice,
} from './dto/credit-note-response.dto';
import type { InvoiceEnvelope, InvoicePage } from './dto/invoice-response.dto';
import { IssueInvoiceDto } from './dto/issue-invoice.dto';
import { ListInvoicesDto } from './dto/list-invoices.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { UpdateInvoiceLineDto } from './dto/update-invoice-line.dto';
import { VoidInvoiceDto } from './dto/void-invoice.dto';
import { printableInvoice } from './invoice-document';
import { InvoiceDraftsService } from './invoice-drafts.service';
import { INVOICE_COLUMNS } from './invoice-exports';
import { InvoiceIssuingService } from './invoice-issuing.service';
import { InvoicesService } from './invoices.service';

/**
 * Invoices for shipments (ADR-046): drafts, issuing them, voiding an issued
 * one by credit note, and crediting part of one (ADR-047).
 */
@Controller({ path: 'invoices', version: '1' })
export class InvoicesController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly creditNotes: CreditNotesService,
    private readonly drafts: InvoiceDraftsService,
    private readonly issuing: InvoiceIssuingService,
    private readonly documents: DocumentsService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.INVOICES_VIEW)
  list(@Query() query: ListInvoicesDto): Promise<InvoicePage> {
    return this.invoices.list(query);
  }

  /** Every invoice the filters match, as CSV (ADR-057): the list's own query, every page. */
  @Get('export')
  @RequirePermissions(PERMISSIONS.INVOICES_VIEW)
  @Audited({ action: AUDIT_ACTIONS.LIST_EXPORTED, resourceType: 'invoices' })
  async exportInvoices(
    @Query() query: ListInvoicesDto,
    @Res({ passthrough: true }) res: Response,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const rows = await everyRow((before, limit) =>
      this.invoices.list({ ...query, before, limit }),
    );
    recordContext({
      list: 'invoices',
      filters: exportFilters(query),
      rows: rows.length,
    });
    return csvFile(
      res,
      'invoices',
      INVOICE_COLUMNS,
      rows,
      localeOf(acceptLanguage),
    );
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.INVOICES_VIEW)
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<InvoiceEnvelope> {
    return { invoice: await this.invoices.findById(id) };
  }

  /**
   * The invoice as a PDF (ADR-071), under the permission that reads it:
   * inline for Print, which opens it in the browser's own viewer, and an
   * attachment with ?download=1 for Download PDF.
   */
  @Get(':id/pdf')
  @RequirePermissions(PERMISSIONS.INVOICES_VIEW)
  @PdfResponse()
  async pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @DownloadAsked() download: boolean,
    @Res() res: Response,
  ): Promise<void> {
    await this.documents.send(
      res,
      download,
      this.invoices.findById(id).then(printableInvoice),
    );
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
  ): Promise<InvoiceEnvelope> {
    const draft = await this.drafts.createDraft(dto, user.userId);
    return { invoice: await this.invoices.findById(draft.id) };
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
    await this.drafts.update(id, dto);
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
    await this.drafts.updateLine(id, lineId, dto);
  }

  /**
   * Numbers the draft, stores its amounts and freezes it. A POST to an
   * action rather than a PATCH of status, as ship and void are: issuing is
   * an event with its own checks, not a field someone edits.
   *
   * 200 with the issued invoice, so the caller has its number at once.
   */
  @Post(':id/issue')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.INVOICES_ISSUE)
  @Audited({
    action: AUDIT_ACTIONS.INVOICE_ISSUED,
    resourceType: 'invoice',
    resourceId: (_response, request) => request.params.id,
    fields: ['invoiceDate'],
  })
  async issue(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IssueInvoiceDto,
    @CurrentUser() user: RequestContext,
  ): Promise<InvoiceEnvelope> {
    await this.issuing.issue(id, dto, user.userId);
    return { invoice: await this.invoices.findById(id) };
  }

  /**
   * Reverses an issued invoice with a credit note for the whole of it, and
   * frees its shipment. The same permission as issuing: the two are the
   * finance acts a customer sees, and whoever may send an invoice is who
   * may take one back.
   */
  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.INVOICES_ISSUE)
  @Audited({
    action: AUDIT_ACTIONS.INVOICE_VOIDED,
    resourceType: 'invoice',
    resourceId: (_response, request) => request.params.id,
    // Not the reason: free text stays on the documents (ADR-018). The
    // credit note's number is added by the service.
    fields: ['creditDate'],
  })
  async void(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidInvoiceDto,
    @CurrentUser() user: RequestContext,
  ): Promise<VoidedInvoice> {
    const { creditNote } = await this.issuing.void(id, dto, user.userId);
    return {
      invoice: await this.invoices.findById(id),
      creditNote: await this.invoices.findCreditNote(creditNote.id),
    };
  }

  /**
   * What a credit would come to, without storing anything: checked by the
   * same rules and computed by the same calculation issuing uses, so the
   * dialog shows what will be stored. A POST only because it carries a
   * body; it writes nothing, so it is not audited.
   */
  @Post(':id/credit-notes/preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.INVOICES_ISSUE)
  async previewCredit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PreviewCreditDto,
  ): Promise<CreditPreviewEnvelope> {
    return { credit: await this.creditNotes.preview(id, dto) };
  }

  /**
   * Credits part of an issued invoice (ADR-047): returned goods under an
   * RMA, or a credit without goods — a price correction, goodwill, an
   * uncollectable debt. The invoice stays issued. invoices.issue, as void
   * is: whoever may send an invoice is who may take money back on it.
   */
  @Post(':id/credit-notes')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.INVOICES_ISSUE)
  @Audited({
    action: AUDIT_ACTIONS.CREDIT_NOTE_ISSUED,
    resourceType: 'credit_note',
    resourceId: (response: { creditNote: { id: string } }) =>
      response.creditNote.id,
    // Not the reason: free text stays on the document (ADR-018). The
    // invoice's number and the total are added by the service.
    fields: ['creditDate'],
  })
  async credit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreditInvoiceDto,
    @CurrentUser() user: RequestContext,
  ): Promise<CreditNoteEnvelope> {
    const issued = await this.creditNotes.issue(id, dto, user.userId);
    return { creditNote: await this.invoices.findCreditNote(issued.id) };
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
    await this.drafts.delete(id);
  }
}
