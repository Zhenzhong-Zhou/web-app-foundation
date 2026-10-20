import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';

import { AllowNoOrganization } from './allow-no-organization.decorator';
import { CurrentUser } from './current-user.decorator';
import type { AuthenticatedUserEnvelope } from './dto/auth-response.dto';
import { StartOrganizationDto } from './dto/start-organization.dto';
import { OrganizationStartService } from './organization-start.service';
import { RegistrationOpenGuard } from './registration-open.guard';
import type { RequestContext } from './request-context';
import { limit } from './throttle-limits';

/**
 * Start an organization (ADR-078), for an account with no organization,
 * where registration is open. Under /organization, as deleting one is
 * (OrganizationDeletionController), and in core/auth beside it: the
 * account acts before there is an organization to act in.
 *
 * No @RequirePermissions: there is no organization to hold one in, and
 * starting your own is a self-action (permission-coverage's list).
 */
@Controller({ path: 'organization', version: '1' })
export class OrganizationStartController {
  constructor(private readonly organizations: OrganizationStartService) {}

  /** Rate limited as registration is: it makes an organization's rows. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @AllowNoOrganization()
  @UseGuards(RegistrationOpenGuard)
  @Throttle({ default: { limit: limit(5), ttl: 60_000 } })
  async start(
    @CurrentUser() context: RequestContext,
    @Body() dto: StartOrganizationDto,
    @Req() req: Request,
  ): Promise<AuthenticatedUserEnvelope> {
    return {
      user: await this.organizations.start(context, dto, {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      }),
    };
  }
}
