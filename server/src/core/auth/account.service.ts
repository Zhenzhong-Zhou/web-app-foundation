import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { Database } from '../../database/database.module';
import { UNSAFE_GLOBAL_DB } from '../../database/database.tokens';
import { users } from '../../database/schema';
import { AuthTokenService } from './auth-token.service';
import type { ChangePasswordDto } from './dto/change-password.dto';
import { PasswordService } from './password.service';
import type { RequestContext } from './request-context';
import { SessionService } from './session.service';

export interface SessionSummary {
  id: string;
  issuedAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  ip: string | null;
  userAgent: string | null;
  /** The session making this request. The UI disables revoking it. */
  current: boolean;
}

/**
 * Self-service account actions.
 *
 * Lives in core/auth rather than core/users because these are about the
 * global identity, not about membership of an organization — every route is
 * @AllowNoOrganization. That also keeps ADR-016's UNSAFE_GLOBAL_DB exemption
 * list closed: users and sessions carry no organization_id, so TenantDb has
 * nothing to scope by.
 */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    @Inject(UNSAFE_GLOBAL_DB) private readonly db: Database,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly tokens: AuthTokenService,
  ) {}

  async updateProfile(userId: string, name: string): Promise<void> {
    await this.db.update(users).set({ name }).where(eq(users.id, userId));
    this.logger.log(`Profile updated for ${userId}`);
  }

  /**
   * Requires the current password even though the caller is authenticated.
   *
   * Without it a stolen session converts into a permanent takeover: the
   * attacker sets a password of their own and the owner is locked out. The
   * session proves "someone is using this browser"; the password proves
   * "someone knows the secret".
   *
   * Unlike reset, this keeps the calling session alive — the user initiating
   * the change is not the one presumed compromised (ADR-011).
   */
  async changePassword(
    context: RequestContext,
    dto: ChangePasswordDto,
  ): Promise<number> {
    const [user] = await this.db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, context.userId));

    // password_hash is nullable — an account bootstrapped without one, or an
    // anonymised row (ADR-012). Neither can prove knowledge of a current
    // password, so neither may change one this way; reset is the path.
    if (!user?.passwordHash) {
      throw new BadRequestException(
        'This account has no password set. Use the reset link instead.',
      );
    }

    const matches = await this.passwords.verify(
      user.passwordHash,
      dto.currentPassword,
    );

    if (!matches) {
      throw new UnauthorizedException('That password is not correct');
    }

    const passwordHash = await this.passwords.hash(dto.newPassword);
    await this.db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, context.userId));

    // An attacker who requested a reset link earlier still holds a live way
    // in until this runs.
    await this.tokens.invalidateOutstanding(context.userId, 'password_reset');

    // Every other device out, this one stays. ADR-011's binding rule, and it
    // is the whole point: a password change that leaves an attacker's session
    // running has not recovered anything.
    const revoked = await this.sessions.revokeAllForUser(
      context.userId,
      context.sessionId,
    );

    this.logger.log(
      `Password changed for ${context.userId}; ${revoked} sessions revoked`,
    );

    return revoked;
  }

  async listSessions(context: RequestContext): Promise<SessionSummary[]> {
    const rows = await this.sessions.listForUser(context.userId);

    // Marked rather than filtered: the user needs to see the device they are
    // on, and needs to be stopped from cutting themselves off with it.
    return rows.map((row) => ({
      ...row,
      current: row.id === context.sessionId,
    }));
  }

  /**
   * Returns false when the row does not exist or belongs to someone else —
   * the caller cannot tell which, and should not.
   */
  async revokeSession(
    context: RequestContext,
    sessionId: string,
  ): Promise<boolean> {
    // Revoking your own current session through here would delete the row
    // while leaving a live cookie pointing at nothing. Logout exists for
    // that, and it clears the cookie in the right order.
    if (sessionId === context.sessionId) {
      throw new BadRequestException('Use sign out to end the current session.');
    }

    const revoked = await this.sessions.revokeOwned(sessionId, context.userId);
    if (revoked) this.logger.log(`Session ${sessionId} revoked by its owner`);
    return revoked;
  }
}
