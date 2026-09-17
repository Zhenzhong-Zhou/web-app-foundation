import { Controller, Get, Query } from '@nestjs/common';

import { PERMISSIONS } from '../authorization/permissions';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { AuditService } from './audit.service';
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
  list(@Query() query: ListAuditDto) {
    return this.audit.list(query);
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
  listActions() {
    return this.audit.listActions();
  }
}
