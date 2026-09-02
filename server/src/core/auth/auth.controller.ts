import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import type { Env } from '../../config/env';
import { AllowNoOrganization } from './allow-no-organization.decorator';
import { AuthService, isUniqueViolation } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import {
  LOGIN_ATTEMPT_LIMIT,
  LOGIN_ATTEMPT_WINDOW_MS,
  loginTracker,
} from './login-throttle';
import { Public } from './public.decorator';
import type { RequestContext } from './request-context';
import {
  clearSessionCookieOptions,
  readSessionCookie,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from './session-cookie';

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * @AllowNoOrganization because this is how a user with no membership learns
   * they have none. Returning 403 would leave the SPA unable to render an
   * empty state — it would only know something went wrong.
   *
   * No @RequirePermissions: this describes the caller, it does not act on
   * anyone.
   */
  @Get('me')
  @AllowNoOrganization()
  me(@CurrentUser() context: RequestContext) {
    return this.auth.me(context);
  }

  /**
   * Registration is expensive (an argon2 hash plus a multi-statement
   * transaction) and creates rows, so it gets a stricter limit than the global
   * default. ADR-011's email+IP keying applies to *login*; registration has no
   * account to target, so IP alone is the right key here.
   */
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    // passthrough lets Nest still serialise the return value while giving
    // access to res.cookie().
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const { user, session } = await this.auth.register(dto, {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });

      const isProduction =
        this.config.get('NODE_ENV', { infer: true }) === 'production';

      res.cookie(
        SESSION_COOKIE_NAME,
        session.token,
        sessionCookieOptions(session.expiresAt, isProduction),
      );

      // The session token is returned in the cookie only, never in the body:
      // a token in a JSON response ends up in logs, browser history, and
      // client-side storage, which is what httpOnly exists to prevent.
      return { user };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('That email address is already registered');
      }
      throw error;
    }
  }

  /**
   * 200, not 201 — login creates a session row but the response represents an
   * existing user, and clients treat 201 as "a resource was created here".
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit: LOGIN_ATTEMPT_LIMIT,
      ttl: LOGIN_ATTEMPT_WINDOW_MS,
      blockDuration: LOGIN_ATTEMPT_WINDOW_MS,
      // Replaces the global IP-only limit on this route rather than stacking
      // with it — @Throttle overrides the named 'default' throttler here, so
      // there is no second IP-keyed counter to lock out a NAT (ADR-011).
      getTracker: loginTracker,
    },
  })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, session } = await this.auth.login(
      dto,
      { ip: req.ip, userAgent: req.headers['user-agent'] },
      readSessionCookie(req),
    );

    const isProduction =
      this.config.get('NODE_ENV', { infer: true }) === 'production';

    res.cookie(
      SESSION_COOKIE_NAME,
      session.token,
      sessionCookieOptions(session.expiresAt, isProduction),
    );

    return { user };
  }

  /**
   * Not @Public(): logout must know *which* session to delete, and an
   * unauthenticated caller has none. A public logout that trusts the cookie
   * value would let anyone revoke a session they merely observed.
   *
   * @AllowNoOrganization because signing out is account-scoped — a user with no
   * membership must still be able to leave.
   *
   * 204: nothing to return, and an empty body cannot leak session state.
   */
  @Post('logout')
  @AllowNoOrganization()
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentUser() user: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    // Order matters. Delete the row first: if clearing the cookie succeeded
    // and the delete then failed, the user would believe they were signed out
    // while a live token sat in the table (ADR-011). This way a failure leaves
    // them visibly signed in, which is the safe direction to fail.
    await this.auth.logout(user);

    const isProduction =
      this.config.get('NODE_ENV', { infer: true }) === 'production';

    res.clearCookie(
      SESSION_COOKIE_NAME,
      clearSessionCookieOptions(isProduction),
    );
  }

  /**
   * POST, not GET, and the link in the email points at the SPA rather than
   * here. Corporate mail scanners (Safe Links, Proofpoint) fetch every URL in
   * an incoming message — a GET that spends a token is consumed before the
   * human ever clicks, and they report that verification is broken.
   *
   * Public: the caller may be on a different device from the one they signed
   * up on, and the token is the credential.
   */
  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async verifyEmail(@Body() dto: VerifyEmailDto, @Req() req: Request) {
    const verified = await this.auth.verifyEmail(dto.token, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    if (!verified) {
      throw new BadRequestException(
        'That link is invalid or has expired. Request a new one.',
      );
    }

    return { verified: true };
  }

  /**
   * Authenticated, so there is no address to guess at and no enumeration
   * surface. @AllowNoOrganization because verifying is an account action.
   *
   * 202 and always the same: whether a message was actually sent depends on
   * whether the caller is already verified, and that is not the client's
   * business.
   */
  @Post('verify-email/resend')
  @AllowNoOrganization()
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  async resendVerification(@CurrentUser() user: RequestContext) {
    await this.auth.resendVerification(user);
    return { sent: true };
  }

  /**
   * 202 whether or not the address exists. The response, the status, and the
   * timing must all be identical, or this becomes the enumeration oracle that
   * login carefully is not.
   *
   * Rate limited on email + IP like login, and for the same reasons: IP alone
   * fails against a rotating attacker and locks out a corporate NAT. Sending
   * mail is also the most expensive thing an unauthenticated caller can make
   * this server do.
   */
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({
    default: {
      limit: 5,
      ttl: LOGIN_ATTEMPT_WINDOW_MS,
      blockDuration: LOGIN_ATTEMPT_WINDOW_MS,
      getTracker: loginTracker,
    },
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.auth.requestPasswordReset(dto.email);
    return { sent: true };
  }

  /**
   * 204 and no session. The user signs in with the password they just set —
   * see resetPassword() for why that is deliberate rather than an omission.
   *
   * Public: the token is the credential, and whoever is resetting has by
   * definition lost access to the account.
   */
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Req() req: Request,
  ): Promise<void> {
    const reset = await this.auth.resetPassword(dto.token, dto.password, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    if (!reset) {
      throw new BadRequestException(
        'That link is invalid or has expired. Request a new one.',
      );
    }
  }
}
