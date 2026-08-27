import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';

import type { Env } from '../../config/env';
import type { Database } from '../../database/database.module';
import { UNSAFE_GLOBAL_DB } from '../../database/database.tokens';
import { type AuthTokenPurpose, authTokens } from '../../database/schema';

export interface IssuedToken {
  /** The only time the plaintext exists. Send it, never store it. */
  token: string;
  expiresAt: Date;
}

/**
 * Single-use tokens for email verification and password reset.
 *
 * Deliberately shaped like SessionService: 32 CSPRNG bytes, SHA-256 stored,
 * plaintext returned once. The reasoning transfers exactly — there is nothing
 * to guess in a 256-bit random value, so a fast hash costs no security, and
 * hashing at all is what makes a database leak useless.
 *
 * Uses the unscoped handle: tokens hang off a global identity, not a tenant
 * (ADR-004), and verification runs before any organization is resolved.
 */
@Injectable()
export class AuthTokenService {
  private readonly ttls: Record<AuthTokenPurpose, number>;

  constructor(
    @Inject(UNSAFE_GLOBAL_DB) private readonly db: Database,
    config: ConfigService<Env, true>,
  ) {
    this.ttls = {
      email_verification: config.get('VERIFICATION_TOKEN_TTL_MS', {
        infer: true,
      }),
      password_reset: config.get('PASSWORD_RESET_TOKEN_TTL_MS', {
        infer: true,
      }),
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Issuing invalidates this user's outstanding tokens of the same purpose.
   *
   * Two live reset links are two chances for an attacker, and "I clicked the
   * old email" is a support question rather than a security one. Requesting a
   * new link is the user saying the old one is not the one they want.
   */
  async issue(userId: string, purpose: AuthTokenPurpose): Promise<IssuedToken> {
    await this.invalidateOutstanding(userId, purpose);
    await this.sweepSpent(userId);

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.ttls[purpose]);

    await this.db.insert(authTokens).values({
      tokenHash: this.hashToken(token),
      userId,
      purpose,
      expiresAt,
    });

    return { token, expiresAt };
  }

  /**
   * Validates and spends a token in one statement, returning the user id.
   *
   * The UPDATE carries the whole condition rather than checking first and
   * writing second: two concurrent clicks on the same link would both pass a
   * separate SELECT, and a password reset that runs twice is a real problem.
   * Postgres serialises the row update, so exactly one caller sees a row.
   *
   * `purpose` is part of the condition, so a verification token cannot be
   * presented to the reset endpoint.
   *
   * Returns null for anything invalid — unknown, expired, already spent, or
   * the wrong purpose. The caller cannot distinguish them, and should not.
   */
  async consume(
    token: string,
    purpose: AuthTokenPurpose,
  ): Promise<string | null> {
    const [row] = await this.db
      .update(authTokens)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(authTokens.tokenHash, this.hashToken(token)),
          eq(authTokens.purpose, purpose),
          isNull(authTokens.consumedAt),
          gt(authTokens.expiresAt, new Date()),
        ),
      )
      .returning({ userId: authTokens.userId });

    return row?.userId ?? null;
  }

  /**
   * Called on password change and reset: any outstanding reset link must stop
   * working once the password has changed by another route, or an attacker who
   * requested one earlier still holds a way in.
   */
  async invalidateOutstanding(
    userId: string,
    purpose: AuthTokenPurpose,
  ): Promise<void> {
    await this.db
      .update(authTokens)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(authTokens.userId, userId),
          eq(authTokens.purpose, purpose),
          isNull(authTokens.consumedAt),
        ),
      );
  }

  /**
   * Lazy sweep instead of a scheduled job (ADR-005). Spent and expired rows
   * have no further use — the audit trail for these events belongs in
   * audit_log, not in retained token rows (ADR-011's reasoning for sessions).
   */
  private async sweepSpent(userId: string): Promise<void> {
    await this.db
      .delete(authTokens)
      .where(
        and(
          eq(authTokens.userId, userId),
          or(
            lt(authTokens.expiresAt, sql`now()`),
            sql`${authTokens.consumedAt} is not null`,
          ),
        ),
      );
  }
}
