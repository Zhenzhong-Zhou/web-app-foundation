import {
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { csvFile, everyRow, exportFilters } from '../../common/export';
import { AUDIT_ACTIONS } from '../../core/audit/audit-actions';
import { recordContext } from '../../core/audit/audit-context';
import { Audited } from '../../core/audit/audited.decorator';
import { PERMISSIONS } from '../../core/authorization/permissions';
import { RequirePermissions } from '../../core/authorization/require-permissions.decorator';
import { localeOf } from '../../i18n/translate';
import { ListCreditNotesDto } from './dto/list-credit-notes.dto';
import { CREDIT_NOTE_COLUMNS } from './invoice-exports';
import { InvoicesService } from './invoices.service';

/**
 * Credit notes, read-only here (ADR-046). They are created by voiding an
 * invoice — the route lives on the invoice — and, with ADR-047, by returns
 * and adjustments. Viewing one is viewing invoicing, so it takes the same
 * permission.
 */
@Controller({ path: 'credit-notes', version: '1' })
export class CreditNotesController {
  constructor(private readonly invoices: InvoicesService) {}

  /** Every credit note, newest first, with its date range and search. */
  @Get()
  @RequirePermissions(PERMISSIONS.INVOICES_VIEW)
  list(@Query() query: ListCreditNotesDto) {
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
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return { creditNote: await this.invoices.findCreditNote(id) };
  }
}
