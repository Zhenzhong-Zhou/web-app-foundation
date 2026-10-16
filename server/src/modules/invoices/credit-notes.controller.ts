import {
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOkResponse, ApiProduces, ApiQuery } from '@nestjs/swagger';
import type { Response } from 'express';

import { csvFile, everyRow, exportFilters } from '../../common/export';
import { AUDIT_ACTIONS } from '../../core/audit/audit-actions';
import { recordContext } from '../../core/audit/audit-context';
import { Audited } from '../../core/audit/audited.decorator';
import { PERMISSIONS } from '../../core/authorization/permissions';
import { RequirePermissions } from '../../core/authorization/require-permissions.decorator';
import { localeOf } from '../../i18n/translate';
import type {
  CreditNoteEnvelope,
  CreditNotePage,
} from './dto/credit-note-response.dto';
import { ListCreditNotesDto } from './dto/list-credit-notes.dto';
import { CREDIT_NOTE_COLUMNS } from './invoice-exports';
import { InvoicePdfService } from './invoice-pdf.service';
import { InvoicesService } from './invoices.service';

/**
 * Credit notes, read-only here (ADR-046). They are created by voiding an
 * invoice — the route lives on the invoice — and, with ADR-047, by returns
 * and adjustments. Viewing one is viewing invoicing, so it takes the same
 * permission.
 */
@Controller({ path: 'credit-notes', version: '1' })
export class CreditNotesController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly pdfs: InvoicePdfService,
  ) {}

  /** Every credit note, newest first, with its date range and search. */
  @Get()
  @RequirePermissions(PERMISSIONS.INVOICES_VIEW)
  list(@Query() query: ListCreditNotesDto): Promise<CreditNotePage> {
    return this.invoices.listCreditNotes(query);
  }

  /** Every credit note the filters match, as CSV (ADR-057): the list's own query, every page. */
  @Get('export')
  @RequirePermissions(PERMISSIONS.INVOICES_VIEW)
  @Audited({
    action: AUDIT_ACTIONS.LIST_EXPORTED,
    resourceType: 'credit-notes',
  })
  async exportCreditNotes(
    @Query() query: ListCreditNotesDto,
    @Res({ passthrough: true }) res: Response,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const rows = await everyRow((before, limit) =>
      this.invoices.listCreditNotes({ ...query, before, limit }),
    );
    recordContext({
      list: 'credit-notes',
      filters: exportFilters(query),
      rows: rows.length,
    });
    return csvFile(
      res,
      'credit-notes',
      CREDIT_NOTE_COLUMNS,
      rows,
      localeOf(acceptLanguage),
    );
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.INVOICES_VIEW)
  async get(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CreditNoteEnvelope> {
    return { creditNote: await this.invoices.findCreditNote(id) };
  }

  /**
   * The credit note as a PDF (ADR-071), under the permission that reads
   * it: inline for Print, an attachment with ?download=1.
   */
  @Get(':id/pdf')
  @RequirePermissions(PERMISSIONS.INVOICES_VIEW)
  @ApiProduces('application/pdf')
  @ApiQuery({ name: 'download', required: false, enum: ['1'] })
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('download') download: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    await this.pdfs.creditNote(id, res, download === '1');
  }
}
