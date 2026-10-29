import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';

import { csvFile, everyRow, exportFilters } from '../../common/export';
import { AcceptLanguage } from '../../i18n/accept-language.decorator';
import { localeOf } from '../../i18n/translate';
import { PERMISSIONS } from '../authorization/permissions';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { AuditService } from './audit.service';
import { AUDIT_ACTIONS } from './audit-actions';
import { recordContext } from './audit-context';
import { AUDIT_COLUMNS } from './audit-exports';
import { Audited } from './audited.decorator';
import type { AuditActionName, AuditPage } from './dto/audit-response.dto';
import { ListAuditDto } from './dto/list-audit.dto';

@Controller({ path: 'audit', version: '1' })
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /**
   * Owner and Admin hold audit.view; Viewer does not. Reading the log is not
   * itself audited — recording reads is the trade ADR-012 declines.
   */
  @Get()
  @RequirePermissions(PERMISSIONS.AUDIT_VIEW)
  list(
    @Query() query: ListAuditDto,
    @AcceptLanguage() acceptLanguage?: string,
  ): Promise<AuditPage> {
    return this.audit.list(query, localeOf(acceptLanguage));
  }

  /**
   * The audit log as CSV (ADR-057), with its own filters; an export of it is
   * itself an entry, since it is the most sensitive list there is.
   */
  @Get('export')
  @RequirePermissions(PERMISSIONS.AUDIT_VIEW)
  @Audited({ action: AUDIT_ACTIONS.LIST_EXPORTED, resourceType: 'audit' })
  async exportAudit(
    @Query() query: ListAuditDto,
    @Res({ passthrough: true }) res: Response,
    @AcceptLanguage() acceptLanguage?: string,
  ) {
    const locale = localeOf(acceptLanguage);
    const rows = await everyRow((before, limit) =>
      this.audit.list({ ...query, before, limit }, locale),
    );
    recordContext({
      list: 'audit',
      filters: exportFilters(query),
      rows: rows.length,
    });
    return csvFile(res, 'audit-log', AUDIT_COLUMNS, rows, locale);
  }

  /**
   * The action vocabulary present in this organization's log, for the filter.
   *
   * Declared before any future @Get(':id'): Nest matches in declaration order,
   * and 'actions' would otherwise be read as an id — the same trap the
   * products controller documents for 'variants'.
   */
  @Get('actions')
  @RequirePermissions(PERMISSIONS.AUDIT_VIEW)
  listActions(
    @AcceptLanguage() acceptLanguage?: string,
  ): Promise<AuditActionName[]> {
    return this.audit.listActions(localeOf(acceptLanguage));
  }
}
