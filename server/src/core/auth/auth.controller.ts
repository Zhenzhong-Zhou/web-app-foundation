import {
  Body,
  ConflictException,
  Controller,
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
import { AuthService, isUniqueViolation } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import {
  LOGIN_ATTEMPT_LIMIT,
  LOGIN_ATTEMPT_WINDOW_MS,
  loginTracker,
} from './login-throttle';
import {
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
   * Registration is expensive (an argon2 hash plus a multi-statement
   * transaction) and creates rows, so it gets a stricter limit than the global
   * default. ADR-011's email+IP keying applies to *login*; registration has no
   * account to target, so IP alone is the right key here.
   */
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
}
