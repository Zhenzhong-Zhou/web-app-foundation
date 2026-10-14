import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';

import { t } from '../../i18n/translate';
import { AUDIT_ACTIONS } from '../audit/audit-actions';
import { Audited } from '../audit/audited.decorator';
import type { UploadedBinary } from '../files/files.service';
import { AccountService } from './account.service';
import { AccountDeletionService } from './account-deletion.service';
import { AccountPhotoService, AVATAR_MAX_BYTES } from './account-photo.service';
import { AllowNoOrganization } from './allow-no-organization.decorator';
import { CurrentUser } from './current-user.decorator';
import type {
  AccountExport,
  DeletionScheduled,
} from './dto/account-deletion-response.dto';
import type { AccountEvent } from './dto/account-event-response.dto';
import type {
  PasswordChanged,
  PhotoSet,
  SessionSummary,
} from './dto/auth-response.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { getRequestContext, type RequestContext } from './request-context';

/**
 * Account, not membership. Every route is @AllowNoOrganization: a user with
 * no organization must still be able to change their password and sign other
 * devices out.
 *
 * No @RequirePermissions anywhere — permissions gate what you may do to
 * *others*. Acting on yourself is not a capability someone grants you.
 */
@Controller({ path: 'account', version: '1' })
@AllowNoOrganization()
export class AccountController {
  constructor(
    private readonly account: AccountService,
    private readonly photo: AccountPhotoService,
    private readonly deletion: AccountDeletionService,
  ) {}

  @Patch('profile')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateProfile(
    @CurrentUser() context: RequestContext,
    @Body() dto: UpdateProfileDto,
  ): Promise<void> {
    await this.account.updateProfile(context, dto);
  }

  /**
   * Rate limited because the current-password check is a guessing oracle —
   * an attacker holding a session could otherwise brute-force the password
   * they do not know, from inside the account.
   */
  @Post('password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  async changePassword(
    @CurrentUser() context: RequestContext,
    @Body() dto: ChangePasswordDto,
  ): Promise<PasswordChanged> {
    const revoked = await this.account.changePassword(context, dto);

    // Told, not hidden: "3 other devices were signed out" is how a user
    // notices a session they did not create.
    return { otherSessionsRevoked: revoked };
  }

  @Get('sessions')
  listSessions(
    @CurrentUser() context: RequestContext,
  ): Promise<SessionSummary[]> {
    return this.account.listSessions(context);
  }

  /**
   * The history behind the sessions list. A notification says a new sign-in
   * happened; this is where somebody goes next to ask what else has.
   */
  @Get('events')
  listEvents(@CurrentUser() context: RequestContext): Promise<AccountEvent[]> {
    return this.account.listEvents(context);
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @CurrentUser() context: RequestContext,
    // Rejects a malformed id before it reaches a query, so a junk parameter
    // is a 400 rather than a database error.
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    const revoked = await this.account.revokeSession(context, id);
    if (!revoked)
      throw new NotFoundException(
        t({
          id: 'account.sessions.notFound',
          defaultMessage: 'No such session',
        }),
      );
  }

  /**
   * Your photo (ADR-063): only yours, set here and nowhere else. Cut off at
   * 5 MB while it arrives; cropped square and re-encoded by the service.
   */
  @Post('photo')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: AVATAR_MAX_BYTES, files: 1 },
    }),
  )
  async setPhoto(
    @CurrentUser() context: RequestContext,
    @UploadedFile() file: UploadedBinary | undefined,
  ): Promise<PhotoSet> {
    if (!file) {
      throw new BadRequestException(
        t({
          id: 'account.photo.missing',
          defaultMessage: 'Choose a photo to upload',
        }),
      );
    }
    return this.photo.set(context, file);
  }

  /** Removed, and deleted at once: a face someone took back is not kept. */
  @Delete('photo')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removePhoto(@CurrentUser() context: RequestContext): Promise<void> {
    await this.photo.remove(context);
  }

  /**
   * Leave the organization this session is working in (ADR-069). The
   * account stays; the session moves to another organization, or none.
   */
  @Delete('membership')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audited({
    action: AUDIT_ACTIONS.MEMBER_LEFT,
    resourceType: 'user',
    resourceId: (_response, request) => getRequestContext(request)?.userId,
  })
  async leaveOrganization(
    @CurrentUser() context: RequestContext,
  ): Promise<void> {
    await this.deletion.leave(context);
  }

  /**
   * Ask for the account to be deleted in 30 days (ADR-069). Rate limited
   * as the password change is: the password check is a guessing oracle.
   */
  @Post('deletion')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  requestDeletion(
    @CurrentUser() context: RequestContext,
    @Body() dto: DeleteAccountDto,
  ): Promise<DeletionScheduled> {
    return this.deletion.request(context, dto.password);
  }

  /** Keep the account: the pending deletion is cancelled. */
  @Delete('deletion')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancelDeletion(@CurrentUser() context: RequestContext): Promise<void> {
    await this.deletion.cancel(context);
  }

  /** Everything that is the person's own, as a JSON file (ADR-069). */
  @Get('export')
  @Header('Content-Disposition', 'attachment; filename="account-export.json"')
  exportData(@CurrentUser() context: RequestContext): Promise<AccountExport> {
    return this.deletion.export(context);
  }
}
