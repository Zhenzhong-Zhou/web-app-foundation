import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { AUDIT_ACTIONS } from '../audit/audit-actions';
import { Audited } from '../audit/audited.decorator';
import { PERMISSIONS } from '../authorization/permissions';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { CurrentUser } from './current-user.decorator';
import { DeleteOrganizationDto } from './dto/delete-organization.dto';
import type { OrganizationDeletionScheduled } from './dto/organization-deletion-response.dto';
import { OrganizationDeletionService } from './organization-deletion.service';
import { getRequestContext, type RequestContext } from './request-context';

/**
 * Deleting the organization the session works in, and cancelling it
 * (ADR-070). Beside account deletion, which it shares the day, the emails
 * and the only member's account with; the export is the organization's
 * own route (OrganizationController).
 */
@Controller({ path: 'organization', version: '1' })
export class OrganizationDeletionController {
  constructor(private readonly deletion: OrganizationDeletionService) {}

  /**
   * Ask for the organization to be deleted in 30 days. Rate limited as
   * account deletion is: the password check is a guessing oracle.
   */
  @Post('deletion')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @RequirePermissions(PERMISSIONS.ORGANIZATIONS_DELETE)
  @Audited({
    action: AUDIT_ACTIONS.ORGANIZATION_DELETION_SCHEDULED,
    resourceType: 'organization',
    resourceId: (_response, request) =>
      getRequestContext(request)?.organizationId ?? undefined,
  })
  requestDeletion(
    @CurrentUser() context: RequestContext,
    @Body() dto: DeleteOrganizationDto,
  ): Promise<OrganizationDeletionScheduled> {
    return this.deletion.request(context, dto);
  }

  /** Keep the organization, until its deletion day has ended everywhere. */
  @Delete('deletion')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.ORGANIZATIONS_DELETE)
  @Audited({
    action: AUDIT_ACTIONS.ORGANIZATION_DELETION_CANCELLED,
    resourceType: 'organization',
    resourceId: (_response, request) =>
      getRequestContext(request)?.organizationId ?? undefined,
  })
  async cancelDeletion(@CurrentUser() context: RequestContext): Promise<void> {
    await this.deletion.cancel(context);
  }
}
