import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';

import type { Env } from '../../config/env';
import type { Database, Transaction } from '../../database/database.module';
import { UNSAFE_GLOBAL_DB } from '../../database/database.tokens';
import {
  type AccountTokenPurpose,
  type AuthTokenPurpose,
  authTokens,
} from '../../database/schema';
import { hashToken, newToken } from './token-hash';

type Executor = Database | Transaction;

/** How long an invitation's spent links stay: the daily limit counts them. */
const DAY_MS = 24 * 60 * 60 * 1000;

export interface IssuedToken {
  /** The only time the plaintext exists. Send it, never store it. */
  token: string;
  expiresAt: Date;
}

/**
 * Single-use tokens for email verification, password reset, invitations and
 * organization invitations.
 *
 * Deliberately shaped like SessionService: 32 CSPRNG bytes, SHA-256 stored,
 * plaintext returned once. The reasoning transfers exactly — there is nothing
 * to guess in a 256-bit random value, so a fast hash costs no security, and
 * hashing at all is what makes a database leak useless.
 *
 * Uses the unscoped handle: tokens hang off a global identity, not a tenant
 * (ADR-004), and verification runs before any organization is resolved. An
 * invitation's is read the same way, by whoever holds the link (ADR-077).
 */
@Injectable()
export class AuthTokenService {
  private readonly ttls: Record<AccountTokenPurpose, number>;

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

  /**
   * Issuing invalidates this user's outstanding tokens of the same purpose.
   *
   * Two live reset links are two chances for an attacker, and "I clicked the
   * old email" is a support question rather than a security one. Requesting a
   * new link is the user saying the old one is not the one they want.
   */
  async issue(
    userId: string,
    purpose: AccountTokenPurpose,
  ): Promise<IssuedToken> {
    await this.invalidateOutstanding(userId, purpose);
    await this.sweepSpent(userId);

    const token = newToken();
    const expiresAt = new Date(Date.now() + this.ttls[purpose]);

    await this.db.insert(authTokens).values({
      tokenHash: hashToken(token),
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
    purpose: AccountTokenPurpose,
  ): Promise<string | null> {
    const [row] = await this.db
      .update(authTokens)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(authTokens.tokenHash, hashToken(token)),
          eq(authTokens.purpose, purpose),
          isNull(authTokens.consumedAt),
          gt(authTokens.expiresAt, new Date()),
        ),
      )
      .returning({ userId: authTokens.userId });

    // An account's purpose, so auth_tokens_owner_check gives it a user:
    // narrowed here, once, for verification and reset alike.
    return row?.userId ?? null;
  }

  /**
   * Called on password change and reset: any outstanding reset link must stop
   * working once the password has changed by another route, or an attacker who
   * requested one earlier still holds a way in.
   */
  async invalidateOutstanding(
    userId: string,
    purpose: AccountTokenPurpose,
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
   * An invitation's new link (ADR-077), its live one spent, as a new reset
   * link spends the last. Written in the invitation's transaction, so the
   * two are kept or lost together. Its end is the invitation's to decide:
   * the end of a day in the organization's zone.
   *
   * Swept like the others, of the links more than a day old: a day's stay,
   * spent or not, since they are what the organization's daily limit
   * counts.
   */
  async issueForInvitation(
    executor: Executor,
    invitationId: string,
    expiresAt: Date,
  ): Promise<IssuedToken> {
    await this.spendInvitation(invitationId, executor);
    await executor
      .delete(authTokens)
      .where(
        and(
          eq(authTokens.invitationId, invitationId),
          lt(authTokens.createdAt, new Date(Date.now() - DAY_MS)),
        ),
      );

    const token = newToken();

    await executor.insert(authTokens).values({
      tokenHash: hashToken(token),
      invitationId,
      purpose: 'invitation',
      expiresAt,
    });

    return { token, expiresAt };
  }

  /**
   * The invitation a live link is for, spending nothing: the invitation
   * page reads it before anyone accepts, so a mail scanner's fetch burns
   * nothing (ADR-077). Null for anything not live, all alike.
   */
  async findInvitation(token: string): Promise<string | null> {
    const [row] = await this.db
      .select({ invitationId: authTokens.invitationId })
      .from(authTokens)
      .where(this.liveInvitation(token, 'invitation'));

    return row?.invitationId ?? null;
  }

  /**
   * Validates and spends an invitation's link in one statement, as
   * consume() does, returning the invitation it is for: two clicks on Join
   * accept once.
   */
  async consumeInvitation(
    executor: Executor,
    token: string,
  ): Promise<string | null> {
    const [row] = await executor
      .update(authTokens)
      .set({ consumedAt: new Date() })
      .where(this.liveInvitation(token, 'invitation'))
      .returning({ invitationId: authTokens.invitationId });

    return row?.invitationId ?? null;
  }

  /**
   * Spends an invitation's live link: replaced by a new one, revoked, or
   * emailed by a send that failed, so that nobody holds a link the list
   * does not show (ADR-077).
   */
  async spendInvitation(
    invitationId: string,
    executor: Executor = this.db,
  ): Promise<void> {
    await executor
      .update(authTokens)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(authTokens.invitationId, invitationId),
          isNull(authTokens.consumedAt),
        ),
      );
  }

  /**
   * The organization invitation a live link is for, spending nothing, as
   * findInvitation() does for one to join (ADR-078). Null for anything
   * not live, all alike. The command issues these links itself, through
   * token-hash.ts, since it runs outside Nest.
   */
  async findOrganizationInvitation(token: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: authTokens.organizationInvitationId })
      .from(authTokens)
      .where(this.liveInvitation(token, 'organization_invitation'));

    return row?.id ?? null;
  }

  /**
   * Validates and spends an organization invitation's link in one
   * statement, as consumeInvitation() does: two clicks on Set up start
   * one organization.
   */
  async consumeOrganizationInvitation(
    executor: Executor,
    token: string,
  ): Promise<string | null> {
    const [row] = await executor
      .update(authTokens)
      .set({ consumedAt: new Date() })
      .where(this.liveInvitation(token, 'organization_invitation'))
      .returning({ id: authTokens.organizationInvitationId });

    return row?.id ?? null;
  }

  /** A live link of either invitation's kind (ADR-077, ADR-078). */
  private liveInvitation(
    token: string,
    purpose: Exclude<AuthTokenPurpose, AccountTokenPurpose>,
  ) {
    return and(
      eq(authTokens.tokenHash, hashToken(token)),
      eq(authTokens.purpose, purpose),
      isNull(authTokens.consumedAt),
      gt(authTokens.expiresAt, new Date()),
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
