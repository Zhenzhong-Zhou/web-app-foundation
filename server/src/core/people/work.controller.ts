import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { csvFile, everyRow, exportFilters } from '../../common/export';
import { AcceptLanguage } from '../../i18n/accept-language.decorator';
import { localeOf } from '../../i18n/translate';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-actions';
import { recordContext } from '../audit/audit-context';
import { AUDIT_COLUMNS } from '../audit/audit-exports';
import { Audited } from '../audit/audited.decorator';
import type { AuditPage } from '../audit/dto/audit-response.dto';
import { ListAuditDto } from '../audit/dto/list-audit.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestContext } from '../auth/request-context';
import { WorkDetailsDto } from './dto/work-details.dto';
import type { WorkDetails } from './dto/work-response.dto';
import { WorkService } from './work.service';

/**
 * You at work, in the current organization (ADR-063): your details there,
 * and everything you did there. Yours alone, so no permission: the server
 * sets you as the person, never a filter the browser sends.
 */
@Controller({ path: 'account', version: '1' })
export class WorkController {
  constructor(
    private readonly work: WorkService,
    private readonly audit: AuditService,
  ) {}

  @Get('details')
  details(@CurrentUser() context: RequestContext): Promise<WorkDetails> {
    return this.work.details(context.userId);
  }

  @Patch('details')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateDetails(
    @CurrentUser() context: RequestContext,
    @Body() dto: WorkDetailsDto,
  ): Promise<void> {
    await this.work.updateDetails(context.userId, dto);
  }

  /** Your activity: the audit log's list, held to what you did. */
  @Get('activity')
  activity(
    @CurrentUser() context: RequestContext,
    @Query() query: ListAuditDto,
    @AcceptLanguage() acceptLanguage?: string,
  ): Promise<AuditPage> {
    return this.audit.list(
      { ...query, actorId: context.userId },
      localeOf(acceptLanguage),
    );
  }

  /** As the audit log's export (ADR-057), and an entry of its own. */
  @Get('activity/export')
  @Audited({ action: AUDIT_ACTIONS.LIST_EXPORTED, resourceType: 'audit' })
  async exportActivity(
    @CurrentUser() context: RequestContext,
    @Query() query: ListAuditDto,
    @Res({ passthrough: true }) res: Response,
    @AcceptLanguage() acceptLanguage?: string,
  ) {
    const mine = { ...query, actorId: context.userId };
    const locale = localeOf(acceptLanguage);
    const rows = await everyRow((before, limit) =>
      this.audit.list({ ...mine, before, limit }, locale),
    );
    recordContext({
      list: 'your-activity',
      filters: exportFilters(mine),
      rows: rows.length,
    });
    return csvFile(res, 'your-activity', AUDIT_COLUMNS, rows, locale);
  }
}
