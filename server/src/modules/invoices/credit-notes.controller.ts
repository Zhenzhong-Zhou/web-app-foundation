import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';

import { PERMISSIONS } from '../../core/authorization/permissions';
import { RequirePermissions } from '../../core/authorization/require-permissions.decorator';
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

  @Get(':id')
  @RequirePermissions(PERMISSIONS.INVOICES_VIEW)
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return { creditNote: await this.invoices.findCreditNote(id) };
  }
}
