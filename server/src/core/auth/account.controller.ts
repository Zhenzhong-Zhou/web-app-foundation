import {
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
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { AccountService } from './account.service';
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
  constructor(private readonly account: AccountService) {}

  @Patch('profile')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateProfile(
    @CurrentUser() context: RequestContext,
    @Body() dto: UpdateProfileDto,
  ): Promise<void> {
    await this.account.updateProfile(context, dto.name);
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

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @CurrentUser() context: RequestContext,
    // Rejects a malformed id before it reaches a query, so a junk parameter
    // is a 400 rather than a database error.
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    const revoked = await this.account.revokeSession(context, id);
    if (!revoked) throw new NotFoundException('No such session');
  }
}
