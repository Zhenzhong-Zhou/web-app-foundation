import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import type { Env } from '../../config/env';
import { localeOf } from '../../i18n/translate';
import { AUDIT_ACTIONS } from '../audit/audit-actions';
import { Audited } from '../audit/audited.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUserEnvelope } from '../auth/dto/auth-response.dto';
import { Public } from '../auth/public.decorator';
import {
  getRequestContext,
  type RequestContext,
} from '../auth/request-context';
import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from '../auth/session-cookie';
import { limit } from '../auth/throttle-limits';
import { PERMISSIONS } from '../authorization/permissions';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import type {
  CopiedInvitationLink,
  CreatedInvitation,
  Invitation,
  InvitationEnvelope,
  InvitationRead,
} from './dto/invitation-response.dto';
import { InvitationTokenDto } from './dto/invitation-token.dto';
import { InvitationAcceptanceService } from './invitation-acceptance.service';
import { InvitationsService } from './invitations.service';
import { OrganizationInvitationAcceptanceService } from './organization-invitation-acceptance.service';

/**
 * Invitations (ADR-077). Inviting, listing, resending, copying a link and
 * revoking need users.create, as adding a member did; each link issued,
 * and each revoked, is recorded with the address and the role. Reading
 * and accepting are public: the link is the credential, rate limited as
 * verification's and reset's are.
 *
 * Reading and accepting serve organization invitations too (ADR-078): one
 * link shape, `/invitation?token=…`, and the token says which kind.
 */
@Controller({ path: 'invitations', version: '1' })
export class InvitationsController {
  constructor(
    private readonly invitations: InvitationsService,
    private readonly acceptance: InvitationAcceptanceService,
    private readonly organizationAcceptance: OrganizationInvitationAcceptanceService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.USERS_CREATE)
  list(): Promise<Invitation[]> {
    return this.invitations.list();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.USERS_CREATE)
  @Audited({
    // Made by a link to pass on, the event is the link copied.
    action: (response: CreatedInvitation) =>
      response.link
        ? AUDIT_ACTIONS.INVITATION_LINK_COPIED
        : AUDIT_ACTIONS.INVITATION_SENT,
    resourceType: 'invitation',
    resourceId: (response: CreatedInvitation) => response.invitation.id,
  })
  invite(
    @CurrentUser() user: RequestContext,
    @Body() dto: CreateInvitationDto,
  ): Promise<CreatedInvitation> {
    return this.invitations.invite(user, dto);
  }

  @Post(':id/resend')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.USERS_CREATE)
  @Audited({
    action: AUDIT_ACTIONS.INVITATION_RESENT,
    resourceType: 'invitation',
    resourceId: (_response, request) => request.params.id,
  })
  async resend(
    @CurrentUser() user: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<InvitationEnvelope> {
    return { invitation: await this.invitations.resend(user, id) };
  }

  @Post(':id/link')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.USERS_CREATE)
  @Audited({
    action: AUDIT_ACTIONS.INVITATION_LINK_COPIED,
    resourceType: 'invitation',
    resourceId: (_response, request) => request.params.id,
  })
  copyLink(
    @CurrentUser() user: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CopiedInvitationLink> {
    return this.invitations.copyLink(user, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.USERS_CREATE)
  @Audited({
    action: AUDIT_ACTIONS.INVITATION_REVOKED,
    resourceType: 'invitation',
    resourceId: (_response, request) => request.params.id,
  })
  async revoke(
    @CurrentUser() user: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.invitations.revoke(user, id);
  }

  /**
   * POST, not GET, and spending nothing: the link in the email opens a
   * page in the app, which reads the invitation here, so a mail scanner's
   * fetch neither accepts nor burns it (ADR-077). The role in words in the
   * page's language.
   */
  @Public()
  @Post('read')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: limit(10), ttl: 60_000 } })
  async read(
    @Body() dto: InvitationTokenDto,
    @Req() req: Request,
  ): Promise<InvitationRead> {
    const locale = localeOf(req.headers['accept-language']);
    const invitation = await this.acceptance.read(dto.token, locale);
    return {
      invitation,
      // An invitation to join is the common case, read first.
      organizationInvitation: invitation
        ? null
        : await this.organizationAcceptance.read(dto.token, locale),
    };
  }

  /**
   * Spends the link. Signed in, as the invitation's address, the account
   * joins; otherwise a new account is made and signed in, the session in
   * the cookie only, as at registration.
   */
  @Public()
  @Post('accept')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: limit(10), ttl: 60_000 } })
  async accept(
    @Body() dto: AcceptInvitationDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthenticatedUserEnvelope> {
    const meta = {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      language: req.headers['accept-language'],
    };

    // An organization invitation's link starts an organization (ADR-078);
    // any other, live or not, goes the way an invitation to join does,
    // where an ended one is refused as ended.
    const organization = await this.organizationAcceptance.owns(dto.token);

    const context = getRequestContext(req);
    if (context) {
      return {
        user: organization
          ? await this.organizationAcceptance.acceptSignedIn(context, dto, meta)
          : await this.acceptance.acceptSignedIn(context, dto.token, meta),
      };
    }

    const { user, session } = organization
      ? await this.organizationAcceptance.acceptNew(dto, meta)
      : await this.acceptance.acceptNew(dto, meta);
    res.cookie(
      SESSION_COOKIE_NAME,
      session.token,
      sessionCookieOptions(
        session.expiresAt,
        this.config.get('NODE_ENV', { infer: true }) === 'production',
        session.keepSignedIn,
      ),
    );
    return { user };
  }
}
