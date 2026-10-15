import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { PERMISSIONS } from '../authorization/permissions';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { CurrentUser } from './current-user.decorator';
import { DeleteOrganizationDto } from './dto/delete-organization.dto';
import type { OrganizationDeletionScheduled } from './dto/organization-deletion-response.dto';
import { OrganizationDeletionService } from './organization-deletion.service';
import type { RequestContext } from './request-context';

/**
 * Deleting the organization the session works in, and cancelling it
 * (ADR-070). Beside account deletion, which it shares the day, the emails
 * and the only member's account with; the export is the organization's
 * own route (OrganizationController). Audited by the service rather than
 * @Audited: only a request that changed something writes an entry, as
 * ADR-018 wants.
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
  async cancelDeletion(@CurrentUser() context: RequestContext): Promise<void> {
    await this.deletion.cancel(context);
  }
}
