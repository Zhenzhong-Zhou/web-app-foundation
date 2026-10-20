import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, asc, eq, gt, lt, ne, sql } from 'drizzle-orm';

import type { Env } from '../../config/env';
import type { Database } from '../../database/database.module';
import { UNSAFE_GLOBAL_DB } from '../../database/database.tokens';
import { memberships, sessions } from '../../database/schema';

export interface SessionInfo {
  sessionId: string;
  userId: string;
  currentOrgId: string | null;
  /** The person's choice at sign-in (ADR-065). */
  keepSignedIn: boolean;
  /** When it was last used before this request, for the idle policy. */
  lastSeenAt: Date;
}

export interface NewSession {
  /** The only time the plaintext token exists. Send it, never store it. */
  token: string;
  sessionId: string;
  expiresAt: Date;
  /** Unticked, the cookie ends with the browser (ADR-065). */
  keepSignedIn: boolean;
}

/** Skip the last_seen_at write if it was updated within this window. */
const LAST_SEEN_WRITE_INTERVAL_MS = 60_000;

/**
 * A session not kept (ADR-065), for a computer others use: two hours idle
 * and twelve in all, whatever the browser does with its cookie.
 */
export const UNKEPT_IDLE_MS = 2 * 60 * 60 * 1000;
const UNKEPT_ABSOLUTE_MS = 12 * 60 * 60 * 1000;

/**
 * Opaque server-side sessions (ADR-011). Revocation is deletion; there is no
 * separate mechanism.
 *
 * Uses the unscoped handle legitimately: a session is resolved *before* any
 * organization is known — resolving it is what produces the organization.
 */
@Injectable()
export class SessionService {
  private readonly absoluteMs: number;
  private readonly idleMs: number;

  constructor(
    @Inject(UNSAFE_GLOBAL_DB) private readonly db: Database,
    config: ConfigService<Env, true>,
  ) {
    this.absoluteMs = config.get('SESSION_MAX_AGE_MS', { infer: true });
    this.idleMs = config.get('SESSION_IDLE_MS', { infer: true });
  }

  /**
   * SHA-256, not argon2 — and the difference matters.
   *
   * Passwords need a slow hash because they are low-entropy and human-chosen,
   * so an attacker can guess them. This token is 256 bits of CSPRNG output:
   * there is nothing to guess, so a fast hash gives up no security. It also
   * runs on every authenticated request, where argon2's 100ms would be
   * ruinous.
   *
   * Hashing at all is what makes a database leak useless: the stored value
   * cannot be replayed as a cookie.
   */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Always generates a fresh token; a client-supplied value is never adopted.
   * That is what prevents session fixation — an attacker cannot plant a token
   * that becomes valid once the victim authenticates.
   */
  async create(
    userId: string,
    currentOrgId: string | null,
    meta: { ip?: string; userAgent?: string } = {},
    { keepSignedIn = true }: { keepSignedIn?: boolean } = {},
  ): Promise<NewSession> {
    // Lazy sweep instead of a scheduled job (ADR-005).
    await this.sweepExpired(userId);

    const token = randomBytes(32).toString('base64url');
    // Not kept: twelve hours in all, whatever the browser does (ADR-065).
    const expiresAt = new Date(
      Date.now() + (keepSignedIn ? this.absoluteMs : UNKEPT_ABSOLUTE_MS),
    );

    const [row] = await this.db
      .insert(sessions)
      .values({
        tokenHash: this.hashToken(token),
        userId,
        currentOrgId,
        expiresAt,
        keepSignedIn,
        ip: meta.ip,
        userAgent: meta.userAgent,
      })
      .returning({ id: sessions.id });

    return { token, sessionId: row.id, expiresAt, keepSignedIn };
  }

  /**
   * Returns null for anything invalid — expired, idle, or unknown. The caller
   * decides the response; this never distinguishes "wrong token" from "expired
   * token", because that difference is information an attacker can use.
   *
   * Deliberately returns no roles or permissions. ADR-004 requires those to be
   * resolved per request through the membership, so that a demoted admin loses
   * access immediately rather than at session expiry.
   */
  async validate(
    token: string,
    { touch = true }: { touch?: boolean } = {},
  ): Promise<SessionInfo | null> {
    const now = new Date();
    const idleCutoff = new Date(now.getTime() - this.idleMs);

    const [row] = await this.db
      .select({
        id: sessions.id,
        userId: sessions.userId,
        currentOrgId: sessions.currentOrgId,
        lastSeenAt: sessions.lastSeenAt,
        keepSignedIn: sessions.keepSignedIn,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.tokenHash, this.hashToken(token)),
          // Two expiries. Absolute cap, so a stolen token cannot be kept alive
          // indefinitely by using it; idle cutoff, so an abandoned one dies.
          gt(sessions.expiresAt, now),
          gt(sessions.lastSeenAt, idleCutoff),
        ),
      );

    if (!row) return null;

    // Not kept: two hours idle, before anything moves it (ADR-065).
    if (
      !row.keepSignedIn &&
      now.getTime() - row.lastSeenAt.getTime() > UNKEPT_IDLE_MS
    ) {
      return null;
    }

    // One UPDATE per request per user is significant write traffic for a
    // column read at minute granularity. Throttle it. A background request
    // (touch: false) moves nothing: an untouched tab's polling must not keep
    // its session alive past the idle limit (ADR-063).
    if (
      touch &&
      now.getTime() - row.lastSeenAt.getTime() > LAST_SEEN_WRITE_INTERVAL_MS
    ) {
      await this.db
        .update(sessions)
        .set({ lastSeenAt: now })
        .where(eq(sessions.id, row.id));
    }

    return {
      sessionId: row.id,
      userId: row.userId,
      currentOrgId: row.currentOrgId,
      keepSignedIn: row.keepSignedIn,
      // As it was before this request, for the organization's policy.
      lastSeenAt: row.lastSeenAt,
    };
  }

  /** Logout. Deletes the row — clearing the cookie alone leaves it live. */
  async revoke(sessionId: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.id, sessionId));
  }

  /**
   * Password change, reset, and admin-disables-user all call this.
   *
   * `exceptSessionId` keeps the caller signed in after changing their own
   * password, while every other device is signed out — without which account
   * recovery leaves an attacker's session untouched.
   */
  async revokeAllForUser(
    userId: string,
    exceptSessionId?: string,
  ): Promise<number> {
    const rows = await this.db
      .delete(sessions)
      .where(
        exceptSessionId
          ? and(eq(sessions.userId, userId), ne(sessions.id, exceptSessionId))
          : eq(sessions.userId, userId),
      )
      .returning({ id: sessions.id });

    return rows.length;
  }

  /**
   * Deletes a session only if it belongs to `userId`.
   *
   * revoke() deletes by id alone, which is right for logout: that id came
   * from the caller's own resolved session. Here it arrives in a URL, so
   * ownership is part of the WHERE rather than a separate SELECT — checking
   * first and deleting second is a race and a round trip.
   *
   * Returns false when nothing matched, so the caller answers the same way
   * for "no such session" and "not yours". Which it was is information the
   * caller has not earned.
   */
  async revokeOwned(sessionId: string, userId: string): Promise<boolean> {
    const rows = await this.db
      .delete(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
      .returning({ id: sessions.id });

    return rows.length > 0;
  }

  /**
   * The organization a session works in when nothing else says which
   * (ADR-004): the oldest membership, ordered by id because UUIDv7 sorts by
   * creation time (ADR-010), which is the organization the person joined
   * first. Signing in picks it, and so does the session middleware when a
   * session's own no longer resolves (#144). Null for an account in none.
   */
  async firstOrganizationOf(userId: string): Promise<string | null> {
    const [membership] = await this.db
      .select({ organizationId: memberships.organizationId })
      .from(memberships)
      .where(eq(memberships.userId, userId))
      .orderBy(asc(memberships.id))
      .limit(1);

    return membership?.organizationId ?? null;
  }

  /** Org switching (ADR-011): mutable per-session state a token cannot hold. */
  async setCurrentOrg(
    sessionId: string,
    organizationId: string,
  ): Promise<void> {
    await this.db
      .update(sessions)
      .set({ currentOrgId: organizationId })
      .where(eq(sessions.id, sessionId));
  }

  /** Backs the "your active sessions" screen. Never exposes token_hash. */
  listForUser(userId: string) {
    return this.db
      .select({
        id: sessions.id,
        issuedAt: sessions.issuedAt,
        lastSeenAt: sessions.lastSeenAt,
        expiresAt: sessions.expiresAt,
        ip: sessions.ip,
        userAgent: sessions.userAgent,
      })
      .from(sessions)
      .where(eq(sessions.userId, userId));
  }

  private async sweepExpired(userId: string): Promise<void> {
    await this.db
      .delete(sessions)
      .where(
        and(eq(sessions.userId, userId), lt(sessions.expiresAt, sql`now()`)),
      );
  }
}
