import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import type { Database } from '../../database/database.module';
import { UNSAFE_GLOBAL_DB } from '../../database/database.tokens';
import { memberships, users } from '../../database/schema';
import { provisionOrganization } from '../organizations/provision-organization';
import { uniqueSlug } from '../organizations/slug';
import type { RegisterDto } from './dto/register.dto';
import { PasswordService } from './password.service';
import { type NewSession, SessionService } from './session.service';

export interface RegisteredUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  organizationId: string;
}

/** Postgres unique_violation. */
const PG_UNIQUE_VIOLATION = '23505';

/**
 * Registration is the only onboarding path in V1 (ADR-006).
 *
 * Uses the unscoped handle legitimately: registration *creates* the tenant, so
 * there is no tenant context to scope to. This is the case core/auth's lint
 * exemption exists for.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(UNSAFE_GLOBAL_DB) private readonly db: Database,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
  ) {}

  async register(
    input: RegisterDto,
    meta: { ip?: string; userAgent?: string } = {},
  ): Promise<{ user: RegisteredUser; session: NewSession }> {
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

    return {
      user: { ...user, emailVerified: false },
      session,
    };
  }
}

/**
 * Converts a unique-violation from the database into a 409.
 *
 * Needed because the advisory check above cannot be atomic: two simultaneous
 * registrations for the same address both pass it, and one then hits the
 * index. Without this the loser gets a 500.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === PG_UNIQUE_VIOLATION
  );
}
