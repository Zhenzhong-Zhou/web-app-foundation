import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, isNull, lte, sql } from 'drizzle-orm';

import { ERROR_CODES, withCode } from '../../common/error-codes';
import { DEFAULT_LOCALE } from '../../common/locales';
import type { Env } from '../../config/env';
import type { Database, Transaction } from '../../database/database.module';
import { UNSAFE_GLOBAL_DB } from '../../database/database.tokens';
import {
  accountEvents,
  auditLog,
  authTokens,
  memberships,
  notifications,
  organizations,
  recentRecords,
  roles,
  sessions,
  users,
} from '../../database/schema';
import { t, type Translatable } from '../../i18n/translate';
import { type Mail, MailService } from '../../shared/mail/mail.service';
import { AUDIT_ACTIONS } from '../audit/audit-actions';
import { SYSTEM_ROLES } from '../authorization/permissions';
import { AccountService } from './account.service';
import { AccountEventService } from './account-event.service';
import { AccountPhotoService } from './account-photo.service';
import {
  deletionBlockedMail,
  deletionCancelledMail,
  type DeletionMailContext,
  deletionScheduledMail,
} from './deletion-mail';
import type { AccountExport } from './dto/account-deletion-response.dto';
import { PasswordService } from './password.service';
import type { RequestContext } from './request-context';
import { SessionService } from './session.service';

const DAY = 24 * 60 * 60 * 1000;

/** How long a requested deletion waits before it completes (ADR-012). */
export const DELETION_GRACE_DAYS = 30;

/** What stands in for the person once the deletion completes (ADR-012). */
export const DELETED_NAME = 'Deleted User';

type Executor = Database | Transaction;

/** Why a person cannot leave an organization, or delete their account. */
interface Block {
  code: 'only_member' | 'last_owner_with_members';
  organizationName: string;
}

/**
 * Leaving an organization, and deleting your account (ADR-069). Both are
 * the person's own acts, so this runs outside any tenant: one person can
 * belong to several organizations, and each is checked.
 */
@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    @Inject(UNSAFE_GLOBAL_DB) private readonly db: Database,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly events: AccountEventService,
    private readonly account: AccountService,
    private readonly photos: AccountPhotoService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Leave the organization the session is working in. The account stays,
   * and the session moves to another organization the person belongs to,
   * or to none.
   */
  async leave(context: RequestContext): Promise<void> {
    const organizationId = context.organizationId;
    if (!organizationId) {
      throw new BadRequestException(
        t({
          id: 'account.leave.noOrganization',
          defaultMessage: 'You are not working in an organization',
        }),
      );
    }

    await this.db.transaction(async (tx) => {
      const block = (await this.blocksFor(tx, context.userId)).find(
        (each) => each.organizationId === organizationId,
      );
      if (block) throw refusalFor(block);

      await tx
        .delete(memberships)
        .where(
          and(
            eq(memberships.userId, context.userId),
            eq(memberships.organizationId, organizationId),
          ),
        );

      await tx.insert(auditLog).values({
        organizationId,
        actorId: context.userId,
        action: AUDIT_ACTIONS.MEMBER_LEFT,
        resourceType: 'user',
        resourceId: context.userId,
        ip: context.ip,
        userAgent: context.userAgent,
      });

      const [next] = await tx
        .select({ organizationId: memberships.organizationId })
        .from(memberships)
        .where(eq(memberships.userId, context.userId))
        .orderBy(memberships.createdAt)
        .limit(1);

      await tx
        .update(sessions)
        .set({ currentOrgId: next?.organizationId ?? null })
        .where(eq(sessions.id, context.sessionId));
    });

    await this.events.record(context.userId, 'account.left_organization', {
      ip: context.ip,
      userAgent: context.userAgent,
    });

    this.logger.log(`${context.userId} left ${organizationId}`);
  }

  /**
   * Schedule the account's deletion 30 days ahead, confirmed with the
   * password. Every other device is signed out, and an email gives the
   * date. Asking again while one is pending changes nothing.
   */
  async request(
    context: RequestContext,
    password: string,
  ): Promise<{ deletionScheduledAt: Date }> {
    const [user] = await this.db
      .select({
        passwordHash: users.passwordHash,
        deletionScheduledAt: users.deletionScheduledAt,
      })
      .from(users)
      .where(eq(users.id, context.userId));

    // As changing the password: an account with no password cannot prove
    // it is the person asking, so the reset link is the way in first.
    if (!user?.passwordHash) {
      throw new BadRequestException(
        t({
          id: 'account.password.noneSet',
          defaultMessage:
            'This account has no password set. Use the reset link instead.',
        }),
      );
    }

    if (!(await this.passwords.verify(user.passwordHash, password))) {
      throw new UnauthorizedException(
        t({
          id: 'account.password.wrong',
          defaultMessage: 'That password is not correct',
        }),
      );
    }

    if (user.deletionScheduledAt) {
      return { deletionScheduledAt: user.deletionScheduledAt };
    }

    const [block] = await this.blocksFor(this.db, context.userId);
    if (block) throw refusalFor(block);

    const deletionScheduledAt = new Date(
      Date.now() + DELETION_GRACE_DAYS * DAY,
    );
    await this.db
      .update(users)
      .set({ deletionScheduledAt })
      .where(eq(users.id, context.userId));

    await this.sessions.revokeAllForUser(context.userId, context.sessionId);

    await this.events.record(context.userId, 'account.deletion_requested', {
      ip: context.ip,
      userAgent: context.userAgent,
    });

    await this.send(context.userId, (to) =>
      deletionScheduledMail(to, deletionScheduledAt),
    );

    this.logger.log(
      `${context.userId} scheduled for deletion on ${deletionScheduledAt.toISOString()}`,
    );
    return { deletionScheduledAt };
  }

  /** Keep the account. Nothing to cancel is not an error. */
  async cancel(context: RequestContext): Promise<void> {
    const cancelled = await this.db
      .update(users)
      .set({ deletionScheduledAt: null })
      .where(
        and(
          eq(users.id, context.userId),
          sql`${users.deletionScheduledAt} is not null`,
        ),
      )
      .returning({ id: users.id });
    if (cancelled.length === 0) return;

    await this.events.record(context.userId, 'account.deletion_cancelled', {
      ip: context.ip,
      userAgent: context.userAgent,
    });

    await this.send(context.userId, (to) => deletionCancelledMail(to));

    this.logger.log(`${context.userId} cancelled their deletion`);
  }

  /**
   * Complete every deletion that has come due, each in its own
   * transaction. A block that applies now cancels that deletion, and the
   * person is emailed what to do (ADR-069).
   */
  async completeDue(
    now = new Date(),
  ): Promise<{ completed: number; blocked: number }> {
    const due = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(lte(users.deletionScheduledAt, now), isNull(users.deletedAt)));

    let completed = 0;
    let blocked = 0;

    for (const { id } of due) {
      const [block] = await this.blocksFor(this.db, id);
      if (block) {
        await this.db
          .update(users)
          .set({ deletionScheduledAt: null })
          .where(eq(users.id, id));
        await this.send(id, (to) =>
          deletionBlockedMail(to, refusalMessage(block)),
        );
        blocked += 1;
        continue;
      }

      await this.complete(id, now);
      completed += 1;
    }

    return { completed, blocked };
  }

  /** What is the person's own, as JSON (ADR-069). */
  async export(context: RequestContext): Promise<AccountExport> {
    const userId = context.userId;

    const [profile] = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        locale: users.locale,
        emailVerifiedAt: users.emailVerifiedAt,
        createdAt: users.createdAt,
        deletionScheduledAt: users.deletionScheduledAt,
      })
      .from(users)
      .where(eq(users.id, userId));
    if (!profile) throw new UnauthorizedException();

    const membershipRows = await this.db
      .select({
        organizationId: memberships.organizationId,
        organizationName: organizations.name,
        roleName: roles.name,
        jobTitle: memberships.jobTitle,
        department: memberships.department,
        location: memberships.location,
        workPhone: memberships.workPhone,
        extension: memberships.extension,
        joinedAt: memberships.createdAt,
      })
      .from(memberships)
      .innerJoin(
        organizations,
        eq(organizations.id, memberships.organizationId),
      )
      .innerJoin(roles, eq(roles.id, memberships.roleId))
      .where(eq(memberships.userId, userId))
      .orderBy(memberships.createdAt);

    const devices = await this.account.listSessions(context);

    const history = await this.db
      .select({
        id: accountEvents.id,
        action: accountEvents.action,
        ip: accountEvents.ip,
        userAgent: accountEvents.userAgent,
        createdAt: accountEvents.createdAt,
      })
      .from(accountEvents)
      .where(eq(accountEvents.userId, userId))
      .orderBy(desc(accountEvents.id));

    const notificationRows = await this.db
      .select({
        id: notifications.id,
        organizationId: notifications.organizationId,
        type: notifications.type,
        title: notifications.title,
        body: notifications.body,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.id));

    const recentRows = await this.db
      .select({
        organizationId: recentRecords.organizationId,
        kind: recentRecords.kind,
        recordId: recentRecords.recordId,
        openedAt: recentRecords.openedAt,
      })
      .from(recentRecords)
      .where(eq(recentRecords.userId, userId))
      .orderBy(desc(recentRecords.openedAt));

    return {
      exportedAt: new Date(),
      profile,
      memberships: membershipRows,
      devices,
      accountHistory: history,
      notifications: notificationRows,
      recentlyOpened: recentRows,
    };
  }

  /**
   * Anonymize the person and remove what is theirs, keeping the row that
   * every foreign key names, the audit log and the records they made
   * (ADR-012, ADR-069). Each organization they belonged to records it.
   */
  private async complete(userId: string, now: Date): Promise<void> {
    await this.photos.removeFor(userId);

    await this.db.transaction(async (tx) => {
      const held = await tx
        .select({ organizationId: memberships.organizationId })
        .from(memberships)
        .where(eq(memberships.userId, userId));

      for (const { organizationId } of held) {
        await tx.insert(auditLog).values({
          organizationId,
          actorId: userId,
          action: AUDIT_ACTIONS.USER_ACCOUNT_DELETED,
          resourceType: 'user',
          resourceId: userId,
        });
      }

      await tx.delete(recentRecords).where(eq(recentRecords.userId, userId));
      await tx.delete(memberships).where(eq(memberships.userId, userId));
      await tx.delete(sessions).where(eq(sessions.userId, userId));
      await tx.delete(authTokens).where(eq(authTokens.userId, userId));
      await tx.delete(accountEvents).where(eq(accountEvents.userId, userId));
      await tx.delete(notifications).where(eq(notifications.userId, userId));

      await tx
        .update(users)
        .set({
          email: `deleted-${userId}@invalid`,
          name: DELETED_NAME,
          passwordHash: null,
          locale: null,
          emailVerifiedAt: null,
          photoFileId: null,
          deletionScheduledAt: null,
          deletedAt: now,
        })
        .where(eq(users.id, userId));
    });

    this.logger.log(`Account ${userId} deleted`);
  }

  /**
   * Every organization the person cannot leave as things stand: one they
   * are the only member of, or the only Owner of with other members.
   */
  private async blocksFor(
    executor: Executor,
    userId: string,
  ): Promise<(Block & { organizationId: string })[]> {
    const rows = await executor
      .select({
        organizationId: memberships.organizationId,
        organizationName: organizations.name,
        isOwner: sql<boolean>`${roles.name} = ${SYSTEM_ROLES.OWNER}`,
        others: sql<number>`(
          select count(*) from ${memberships} as other
          where other.organization_id = ${memberships.organizationId}
            and other.user_id <> ${userId}
        )::int`,
        otherOwners: sql<number>`(
          select count(*) from ${memberships} as other
          join ${roles} as other_role on other_role.id = other.role_id
          where other.organization_id = ${memberships.organizationId}
            and other.user_id <> ${userId}
            and other_role.name = ${SYSTEM_ROLES.OWNER}
        )::int`,
      })
      .from(memberships)
      .innerJoin(
        organizations,
        eq(organizations.id, memberships.organizationId),
      )
      .innerJoin(roles, eq(roles.id, memberships.roleId))
      .where(eq(memberships.userId, userId));

    return rows.flatMap((row): (Block & { organizationId: string })[] => {
      const base = {
        organizationId: row.organizationId,
        organizationName: row.organizationName,
      };
      if (row.others === 0) return [{ ...base, code: 'only_member' }];
      if (row.isOwner && row.otherOwners === 0) {
        return [{ ...base, code: 'last_owner_with_members' }];
      }
      return [];
    });
  }

  /** An email to the person, in their language, if they can be reached. */
  private async send(
    userId: string,
    build: (context: DeletionMailContext) => Mail,
  ): Promise<void> {
    const [user] = await this.db
      .select({ email: users.email, name: users.name, locale: users.locale })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));
    if (!user) return;

    try {
      await this.mail.send(
        build({
          locale: user.locale ?? DEFAULT_LOCALE,
          to: user.email,
          name: user.name,
          clientUrl: this.config.get('CLIENT_URL', { infer: true }),
        }),
      );
    } catch (error) {
      // The deletion itself stands; a lost email is logged, not thrown, as
      // the security emails are (ADR-037).
      this.logger.error(`Could not email ${userId}: ${String(error)}`);
    }
  }
}

/** The refusal for a block: why, and what to do next (ADR-069). */
function refusalMessage(block: Block): Translatable {
  return block.code === 'only_member'
    ? t(
        {
          id: 'account.blocks.onlyMember',
          defaultMessage:
            'You are the only member of {organization}, so it would be left with no one. Add another member and make them an Owner first.',
        },
        { organization: block.organizationName },
      )
    : t(
        {
          id: 'account.blocks.lastOwner',
          defaultMessage:
            'You are the only Owner of {organization}. Make another member an Owner first.',
        },
        { organization: block.organizationName },
      );
}

function refusalFor(block: Block): ConflictException {
  return new ConflictException(
    withCode(
      refusalMessage(block),
      block.code === 'only_member'
        ? ERROR_CODES.onlyMember
        : ERROR_CODES.lastOwnerWithMembers,
    ),
  );
}
