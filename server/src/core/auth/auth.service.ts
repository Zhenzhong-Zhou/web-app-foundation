import { randomBytes } from 'node:crypto';

import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  type OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { asc, eq, sql } from 'drizzle-orm';

import type { Env } from '../../config/env';
import type { Database } from '../../database/database.module';
import { UNSAFE_GLOBAL_DB } from '../../database/database.tokens';
import { organizations } from '../../database/schema';
import { memberships, users } from '../../database/schema';
import { MailService } from '../../shared/mail/mail.service';
import type { Permission } from '../authorization/permissions';
import { PermissionsService } from '../authorization/permissions.service';
import { provisionOrganization } from '../organizations/provision-organization';
import { uniqueSlug } from '../organizations/slug';
import { AccountEventService } from './account-event.service';
import { AuthTokenService } from './auth-token.service';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import { PasswordService } from './password.service';
import type { RequestContext } from './request-context';
import { type NewSession, SessionService } from './session.service';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  /** Null when a user belongs to no organization — see login(). */
  organizationId: string | null;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  /** Null when a user belongs to no organization — see login(). */
  organizationId: string | null;
}

export interface CurrentSession {
  user: {
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
  };
  /** Null when the caller belongs to no organization — see SessionGuard. */
  organization: { id: string; name: string; roleId: string } | null;
  /** Empty when there is no organization: permissions come from a role. */
  permissions: Permission[];
}

/**
 * One message for every failure. "No such user" and "wrong password" must be
 * indistinguishable, or the endpoint answers "is this address registered?"
 * for anyone who asks.
 */
const INVALID_CREDENTIALS = 'Invalid email or password';

/**
 * Registration is the only onboarding path in V1 (ADR-006).
 *
 * Uses the unscoped handle legitimately: registration *creates* the tenant, so
 * there is no tenant context to scope to. This is the case core/auth's lint
 * exemption exists for.
 */
@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private timingDecoyHash!: string;

  constructor(
    @Inject(UNSAFE_GLOBAL_DB) private readonly db: Database,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly permissions: PermissionsService,
    private readonly tokens: AuthTokenService,
    private readonly events: AccountEventService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // Hashed once at boot against a value nobody holds. See login().
  async onModuleInit(): Promise<void> {
    this.timingDecoyHash = await this.passwords.hash(
      randomBytes(32).toString('base64url'),
    );
  }

  async register(
    input: RegisterDto,
    meta: { ip?: string; userAgent?: string } = {},
  ): Promise<{ user: AuthenticatedUser; session: NewSession }> {
    // Hashed before the transaction opens. argon2 takes ~100ms by design, and
    // holding a transaction open across it would keep locks for the duration
    // under concurrency for no reason.
    const passwordHash = await this.passwords.hash(input.password);

    const user = await this.db.transaction(async (tx) => {
      // Advisory check, for a clean error message. The unique index below is
      // the actual guarantee — two concurrent registrations both pass this.
      const existing = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(sql`lower(${users.email})`, input.email));

      if (existing.length > 0) {
        throw new ConflictException('That email address is already registered');
      }

      const [created] = await tx
        .insert(users)
        .values({
          email: input.email,
          passwordHash,
          name: input.name,
          // Verification lands in step 5. Until then the account exists but is
          // unverified, and the UI shows a banner rather than blocking login.
          emailVerifiedAt: null,
        })
        .returning({
          id: users.id,
          email: users.email,
          name: users.name,
        });

      // ADR-004: user + organization + Owner membership in ONE transaction.
      // A user with no organization has no role, so no permissions, and no way
      // to acquire either — an account that exists but cannot do anything.
      const slug = await uniqueSlug(tx, input.organizationName);
      const { organizationId, roleIds } = await provisionOrganization(tx, {
        name: input.organizationName,
        slug,
      });

      await tx.insert(memberships).values({
        userId: created.id,
        organizationId,
        roleId: roleIds.Owner,
      });

      return { ...created, organizationId };
    });

    this.logger.log(
      `Registered ${user.id} with organization ${user.organizationId}`,
    );

    const session = await this.sessions.create(
      user.id,
      user.organizationId,
      meta,
    );

    await this.sendVerificationEmail(user.id, user.email, user.name);

    return {
      user: { ...user, emailVerified: false },
      session,
    };
  }

  async login(
    input: LoginDto,
    meta: { ip?: string; userAgent?: string } = {},
    previousToken?: string,
  ): Promise<{ user: AuthenticatedUser; session: NewSession }> {
    const [row] = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        passwordHash: users.passwordHash,
        emailVerifiedAt: users.emailVerifiedAt,
        deletedAt: users.deletedAt,
      })
      .from(users)
      .where(eq(sql`lower(${users.email})`, input.email));

    // Verified against a throwaway hash when there is no account, so a miss
    // costs the same ~100ms as a wrong password. Returning early on a miss
    // answers in ~1ms and makes this a timing oracle for which addresses are
    // registered — an identical error message alone does not close that.
    //
    // password_hash is nullable (anonymised rows today, SSO-only users later),
    // so the fallback covers that case too.
    const passwordMatches = await this.passwords.verify(
      row?.passwordHash ?? this.timingDecoyHash,
      input.password,
    );

    if (!row || !passwordMatches || row.deletedAt !== null) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    // Login is the only moment the plaintext exists, so it is the only chance
    // to re-hash under stronger parameters. Swallowed on failure: an upgrade
    // that cannot be written must not fail an otherwise valid login.
    if (row.passwordHash && this.passwords.needsRehash(row.passwordHash)) {
      try {
        const upgraded = await this.passwords.hash(input.password);
        await this.db
          .update(users)
          .set({ passwordHash: upgraded })
          .where(eq(users.id, row.id));
        this.logger.log(`Upgraded password hash for ${row.id}`);
      } catch (error) {
        this.logger.warn(
          `Password rehash failed for ${row.id}: ${String(error)}`,
        );
      }
    }

    // ADR-004: identity alone is not enough context. Oldest membership wins,
    // ordered by id because UUIDv7 sorts by creation time (ADR-010) — that is
    // the organization the user registered with.
    const [membership] = await this.db
      .select({ organizationId: memberships.organizationId })
      .from(memberships)
      .where(eq(memberships.userId, row.id))
      .orderBy(asc(memberships.id))
      .limit(1);

    // Reachable: a user removed from their last organization can still sign in
    // and be told they belong to none. The guard must treat a null current_org
    // as "no org-scoped access", not as an error.
    const currentOrgId = membership?.organizationId ?? null;

    // After the password check, never before — otherwise anyone holding the
    // cookie signs its owner out by posting a wrong password.
    //
    // res.cookie() is about to overwrite the browser's value, so without this
    // the old row stays live in the table with no way for its owner to reach
    // it. Other devices are untouched: multi-session is deliberate (ADR-011's
    // "active sessions" screen). Fixation is prevented by never adopting a
    // client-supplied token, not by deleting other sessions.
    if (previousToken) {
      const previous = await this.sessions.validate(previousToken);
      if (previous) await this.sessions.revoke(previous.sessionId);
    }

    const session = await this.sessions.create(row.id, currentOrgId, meta);

    await this.events.record(row.id, 'session.created', meta);

    this.logger.log(`Login ${row.id} org=${currentOrgId ?? 'none'}`);

    return {
      user: {
        id: row.id,
        email: row.email,
        name: row.name,
        emailVerified: row.emailVerifiedAt !== null,
        organizationId: currentOrgId,
      },
      session,
    };
  }

  /**
   * Revocation is deletion; there is no separate mechanism (ADR-011).
   * Idempotent by construction — deleting an already-deleted row affects zero
   * rows and is not an error, so a double-click logs out once and returns 204
   * twice.
   */
  async logout(context: RequestContext): Promise<void> {
    await this.sessions.revoke(context.sessionId);

    await this.events.record(context.userId, 'session.ended', {
      ip: context.ip,
      userAgent: context.userAgent,
    });

    this.logger.log(`Logout ${context.sessionId}`);
  }

  /**
   * Everything the SPA needs on boot.
   *
   * The session cookie is httpOnly, so after a page reload the client cannot
   * read who it is signed in as. This is how it finds out: 200 renders the
   * app, 401 redirects to login.
   *
   * Reads through rather than trusting the request context alone, because the
   * name and verification state can change between requests and the middleware
   * only carries identity. Permissions are resolved here for the same reason
   * the guard resolves them per request (ADR-016) — a demotion shows up on the
   * next page load rather than at session expiry.
   */
  async me(context: RequestContext): Promise<CurrentSession> {
    const [user] = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        emailVerifiedAt: users.emailVerifiedAt,
      })
      .from(users)
      .where(eq(users.id, context.userId));

    // A valid session pointing at no user should be impossible — sessions
    // cascade on delete, and ADR-012 tombstones rather than removing rows. If
    // it happens anyway, the answer is 401: the credential resolves to nobody,
    // and a 500 on boot would leave the SPA with no way to recover.
    if (!user) throw new UnauthorizedException();

    const base = {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerifiedAt !== null,
      },
    };

    // Both are null together: roleId comes from the membership that produced
    // organizationId, so there is no state where one exists without the other.
    if (!context.organizationId || !context.roleId) {
      return { ...base, organization: null, permissions: [] };
    }

    // Independent reads, and this runs on every page load. Sequential await
    // here costs a round trip for nothing.
    const [[organization], permissions] = await Promise.all([
      this.db
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, context.organizationId)),
      this.permissions.listForRole(context.roleId),
    ]);

    return {
      ...base,
      organization: { ...organization, roleId: context.roleId },
      permissions,
    };
  }

  /**
   * Issues a verification token and emails the link.
   *
   * Failure is logged, never thrown. The account exists and the user is signed
   * in; losing their registration to a dead SMTP connection would be absurd,
   * and the resend endpoint is the remedy. Password reset takes the opposite
   * position — see requestPasswordReset().
   */
  async sendVerificationEmail(userId: string, email: string, name: string) {
    try {
      const { token } = await this.tokens.issue(userId, 'email_verification');
      const clientUrl = this.config.get('CLIENT_URL', { infer: true });
      const link = `${clientUrl}/verify-email?token=${token}`;

      await this.mail.send({
        to: email,
        subject: 'Confirm your email address',
        text: `Hi ${name},\n\nConfirm your email address:\n${link}\n\nThe link expires in 24 hours. If you did not sign up, ignore this message.`,
        html: `<p>Hi ${name},</p><p><a href="${link}">Confirm your email address</a></p><p>The link expires in 24 hours. If you did not sign up, ignore this message.</p>`,
      });
    } catch (error) {
      // Broad by design: registration must survive a dead SMTP connection.
      // But that also swallows token-issue failures, so the message must not
      // claim the problem was email — it might be the database.
      this.logger.error(
        `Could not send verification for ${userId}: ${String(error)}`,
      );
    }
  }

  /**
   * Returns false for anything invalid — unknown, expired, spent, or the wrong
   * purpose. AuthTokenService does not distinguish them and neither does this.
   *
   * Verifying twice is not an error worth surfacing: the token is spent, so
   * the second attempt returns false, and the controller answers the same way
   * either way. What matters is that the address ends up verified.
   */
  async verifyEmail(
    token: string,
    meta: { ip?: string; userAgent?: string } = {},
  ): Promise<boolean> {
    const userId = await this.tokens.consume(token, 'email_verification');
    if (!userId) return false;

    await this.db
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(users.id, userId));

    await this.events.record(userId, 'account.email_verified', meta);

    this.logger.log(`Verified email for ${userId}`);
    return true;
  }

  /** Re-sends verification for an already-authenticated caller. */
  async resendVerification(context: RequestContext): Promise<void> {
    const [user] = await this.db
      .select({
        email: users.email,
        name: users.name,
        emailVerifiedAt: users.emailVerifiedAt,
      })
      .from(users)
      .where(eq(users.id, context.userId));

    // Already verified: nothing to send, and no reason to tell them otherwise.
    if (!user || user.emailVerifiedAt !== null) return;

    await this.sendVerificationEmail(context.userId, user.email, user.name);
  }

  /**
   * Sends a reset link, or does nothing, and the caller cannot tell which.
   *
   * Login goes to real trouble not to be an enumeration oracle — the decoy
   * hash, the identical error. An endpoint answering "no such address" hands
   * back exactly what login refused, so this returns the same way either way
   * and the UI must never say "we couldn't find that email".
   *
   * Unlike verification, a send failure **propagates**. Reporting success
   * while the mail never left leaves someone waiting for a link that is not
   * coming, and their only recourse is to try again — which produces the same
   * silence.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const [user] = await this.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        deletedAt: users.deletedAt,
      })
      .from(users)
      .where(eq(sql`lower(${users.email})`, email));

    // No account, or a tombstone (ADR-012). Nothing to send, nothing to say.
    if (!user || user.deletedAt !== null) {
      this.logger.log(`Password reset requested for unknown address`);
      return;
    }

    const { token } = await this.tokens.issue(user.id, 'password_reset');
    const clientUrl = this.config.get('CLIENT_URL', { infer: true });
    const link = `${clientUrl}/reset-password?token=${token}`;

    await this.mail.send({
      to: user.email,
      subject: 'Reset your password',
      text: `Hi ${user.name},\n\nReset your password:\n${link}\n\nThe link expires in one hour and can be used once. If you did not request this, ignore this message — your password has not changed.`,
      html: `<p>Hi ${user.name},</p><p><a href="${link}">Reset your password</a></p><p>The link expires in one hour and can be used once. If you did not request this, ignore this message — your password has not changed.</p>`,
    });

    this.logger.log(`Password reset link sent for ${user.id}`);
  }

  /**
   * Consumes the token, sets the new password, and signs the user out
   * everywhere.
   *
   * Revoking every session is the point, not a side effect (ADR-011): the
   * likely reason someone is here is that an attacker holds their password. A
   * reset that leaves the attacker's session live is not a recovery.
   *
   * No session is issued in exchange. The user signs in with the password they
   * just chose, which is the moment a password manager reliably captures it —
   * and a reset link from an inbox is a weaker credential than a password, so
   * asking for the password once, immediately, is proportionate.
   *
   * Outstanding reset tokens are invalidated too: a second live link is a
   * second way in for whoever requested it.
   */
  async resetPassword(
    token: string,
    password: string,
    meta: { ip?: string; userAgent?: string } = {},
  ): Promise<boolean> {
    const userId = await this.tokens.consume(token, 'password_reset');
    if (!userId) return false;

    const passwordHash = await this.passwords.hash(password);

    await this.db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, userId));

    await this.tokens.invalidateOutstanding(userId, 'password_reset');
    const revoked = await this.sessions.revokeAllForUser(userId);

    // Distinct from password_changed: a reset the user did not request is the
    // strongest available signal of an attempted takeover, and folding the
    // two together hides it.
    await this.events.record(userId, 'account.password_reset', meta);

    this.logger.log(
      `Password reset for ${userId}; ${revoked} sessions revoked`,
    );
    return true;
  }
}
