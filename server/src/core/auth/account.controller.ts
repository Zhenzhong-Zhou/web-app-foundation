import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
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
import type { UploadedBinary } from '../files/files.service';
import { AccountService } from './account.service';
import { AccountPhotoService, AVATAR_MAX_BYTES } from './account-photo.service';
import { AllowNoOrganization } from './allow-no-organization.decorator';
import { CurrentUser } from './current-user.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import type { RequestContext } from './request-context';

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
  ) {
    const revoked = await this.account.changePassword(context, dto);

    // Told, not hidden: "3 other devices were signed out" is how a user
    // notices a session they did not create.
    return { otherSessionsRevoked: revoked };
  }

  @Get('sessions')
  listSessions(@CurrentUser() context: RequestContext) {
    return this.account.listSessions(context);
  }

  /**
   * The history behind the sessions list. A notification says a new sign-in
   * happened; this is where somebody goes next to ask what else has.
   */
  @Get('events')
  listEvents(@CurrentUser() context: RequestContext) {
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
  ): Promise<{ photoFileId: string }> {
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
}
