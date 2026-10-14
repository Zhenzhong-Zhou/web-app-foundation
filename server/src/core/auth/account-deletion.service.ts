import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  sql,
} from 'drizzle-orm';

import { ERROR_CODES, withCode } from '../../common/error-codes';
import { todayUtc } from '../../common/today';
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
import { recipientLocale, t, type Translatable } from '../../i18n/translate';
import { type Mail, MailService } from '../../shared/mail/mail.service';
import { AUDIT_ACTIONS } from '../audit/audit-actions';
import { SYSTEM_ROLES } from '../authorization/permissions';
import { AccountService } from './account.service';
import { AccountEventService, type EventMeta } from './account-event.service';
import { AccountPhotoService } from './account-photo.service';
import {
  deletionBlockedMail,
  deletionCancelledMail,
  type DeletionMailContext,
  deletionScheduledMail,
} from './deletion-mail';
import type {
  AccountExport,
  DeletionScheduled,
} from './dto/account-deletion-response.dto';
import type { RequestContext } from './request-context';
import { SessionService } from './session.service';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** How long a requested deletion waits before it completes (ADR-012). */
const DELETION_GRACE_DAYS = 30;

/**
 * The deletion day for a request made now: 30 days ahead, a calendar day
 * (ADR-052), named as it is in the email and on every page (ADR-069).
 */
export function deletionDayFor(now: Date): string {
  return todayUtc(new Date(now.getTime() + DELETION_GRACE_DAYS * DAY));
}

/**
 * Today where a day ends last, at UTC−12, twelve hours behind UTC. A
 * deletion day before it has ended in every time zone (ADR-069).
 */
function todayWhereDaysEndLast(now: Date): string {
  return todayUtc(new Date(now.getTime() - 12 * HOUR));
}

/** What stands in for the person once the deletion completes (ADR-012). */
const DELETED_NAME = 'Deleted User';

type Executor = Database | Transaction;

/** Why a person cannot leave an organization, or delete their account. */
interface Block {
  code: typeof ERROR_CODES.onlyMember | typeof ERROR_CODES.lastOwnerWithMembers;
  organizationId: string;
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
          defaultMessage:
            'You are not working in an organization, so there is none to leave.',
        }),
      );
    }

    await this.db.transaction(async (tx) => {
      await lockOrganizations(tx, [organizationId]);
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

      // The oldest membership left, as signing in picks one.
      const [next] = await tx
        .select({ organizationId: memberships.organizationId })
        .from(memberships)
        .where(eq(memberships.userId, context.userId))
        .orderBy(asc(memberships.id))
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
   * Set the deletion day 30 days ahead, confirmed with the password. Every
   * other device is signed out, and an email names the day. Asking again
   * while one is pending changes nothing.
   */
  async request(
    context: RequestContext,
    password: string,
  ): Promise<DeletionScheduled> {
    await this.account.confirmPassword(context.userId, password);

    const [user] = await this.db
      .select({ deletionScheduledAt: users.deletionScheduledAt })
      .from(users)
      .where(eq(users.id, context.userId));

    if (user?.deletionScheduledAt) {
      return { deletionScheduledAt: user.deletionScheduledAt };
    }

    const [block] = await this.blocksFor(this.db, context.userId);
    if (block) throw refusalFor(block);

    const deletionScheduledAt = deletionDayFor(new Date());
    await this.db
      .update(users)
      .set({ deletionScheduledAt })
      .where(eq(users.id, context.userId));

    await this.sessions.revokeAllForUser(context.userId, context.sessionId);

    await this.events.record(context.userId, 'account.deletion_requested', {
      ip: context.ip,
      userAgent: context.userAgent,
    });

    await this.send(
      context.userId,
      (to) => deletionScheduledMail(to, deletionScheduledAt),
      context.language,
    );

    this.logger.log(
      `${context.userId} scheduled for deletion after ${deletionScheduledAt}`,
    );
    return { deletionScheduledAt };
  }

  /** Keep the account. Nothing to cancel is not an error. */
  async cancel(context: RequestContext): Promise<void> {
    const cancelled = await this.unschedule(
      context.userId,
      deletionCancelledMail,
      {
        ip: context.ip,
        userAgent: context.userAgent,
        language: context.language,
      },
    );
    if (cancelled) {
      this.logger.log(`${context.userId} cancelled their deletion`);
    }
  }

  /**
   * Complete every deletion whose day has ended in every time zone, each in
   * its own transaction. A block that applies now cancels that deletion,
   * recorded in the account history, and the person is emailed what to do.
   * One that fails is logged and left for the next run, without holding up
   * the rest (ADR-069).
   */
  async completeDue(
    now = new Date(),
  ): Promise<{ completed: number; blocked: number; failed: number }> {
    const due = await this.db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          lt(users.deletionScheduledAt, todayWhereDaysEndLast(now)),
          isNull(users.deletedAt),
        ),
      );

    let completed = 0;
    let blocked = 0;
    let failed = 0;

    for (const { id } of due) {
      try {
        const block = await this.complete(id, now);
        if (block) {
          await this.unschedule(id, (to) =>
            deletionBlockedMail(to, refusalMessage(block)),
          );
          blocked += 1;
        } else {
          completed += 1;
        }
      } catch (error) {
        failed += 1;
        this.logger.error(
          `Could not complete the deletion of ${id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    return { completed, blocked, failed };
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

    const [membershipRows, devices, history, notificationRows, recentRows] =
      await Promise.all([
        this.db
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
          .orderBy(memberships.createdAt),
        this.account.listSessions(context),
        this.events.listForUser(userId, null),
        this.db
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
          .orderBy(desc(notifications.id)),
        this.db
          .select({
            organizationId: recentRecords.organizationId,
            kind: recentRecords.kind,
            recordId: recentRecords.recordId,
            openedAt: recentRecords.openedAt,
          })
          .from(recentRecords)
          .where(eq(recentRecords.userId, userId))
          .orderBy(desc(recentRecords.openedAt)),
      ]);

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
   * A block that applies now is returned instead, with nothing changed:
   * checked under the organizations' locks, as leaving is.
   */
  private async complete(userId: string, now: Date): Promise<Block | null> {
    const block = await this.db.transaction(async (tx) => {
      const held = await tx
        .select({ organizationId: memberships.organizationId })
        .from(memberships)
        .where(eq(memberships.userId, userId));
      await lockOrganizations(
        tx,
        held.map(({ organizationId }) => organizationId),
      );

      const [block] = await this.blocksFor(tx, userId);
      if (block) return block;

      // The photo goes in a transaction of its own, opened inside this one:
      // after the block check, so a block leaves it in place, and before
      // the rest, so storage that fails rolls this back to be tried again
      // on the next run (ADR-069).
      await this.photos.removeFor(userId);

      if (held.length > 0) {
        await tx.insert(auditLog).values(
          held.map(({ organizationId }) => ({
            organizationId,
            actorId: userId,
            action: AUDIT_ACTIONS.USER_ACCOUNT_DELETED,
            resourceType: 'user',
            resourceId: userId,
          })),
        );
      }

      // Recent records go with the memberships, by cascade.
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
      return null;
    });

    if (!block) this.logger.log(`Account ${userId} deleted`);
    return block;
  }

  /**
   * Every organization the person cannot leave as things stand: one they
   * are the only member of, or the only Owner of with other members.
   */
  private async blocksFor(
    executor: Executor,
    userId: string,
  ): Promise<Block[]> {
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

    return rows.flatMap((row): Block[] => {
      const base = {
        organizationId: row.organizationId,
        organizationName: row.organizationName,
      };
      if (row.others === 0) return [{ ...base, code: ERROR_CODES.onlyMember }];
      if (row.isOwner && row.otherOwners === 0) {
        return [{ ...base, code: ERROR_CODES.lastOwnerWithMembers }];
      }
      return [];
    });
  }

  /**
   * The pending deletion cancelled, recorded, and the person emailed: by
   * them, or because a block applies when it comes due. False when there
   * was none to cancel.
   */
  private async unschedule(
    userId: string,
    build: (context: DeletionMailContext) => Mail,
    meta?: EventMeta,
  ): Promise<boolean> {
    const cancelled = await this.db
      .update(users)
      .set({ deletionScheduledAt: null })
      .where(and(eq(users.id, userId), isNotNull(users.deletionScheduledAt)))
      .returning({ id: users.id });
    if (cancelled.length === 0) return false;

    await this.events.record(userId, 'account.deletion_cancelled', meta);
    await this.send(userId, build, meta?.language);
    return true;
  }

  /**
   * An email to the person, if they can be reached: in their language, or
   * else the language of the request that caused it (ADR-054).
   */
  private async send(
    userId: string,
    build: (context: DeletionMailContext) => Mail,
    language?: string,
  ): Promise<void> {
    const [user] = await this.db
      .select({ email: users.email, name: users.name, locale: users.locale })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));
    if (!user) return;

    try {
      await this.mail.send(
        build({
          locale: recipientLocale(user.locale, language),
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

/**
 * Holds the organizations until the transaction ends, so the blocks are
 * checked one person at a time: two Owners leaving at once would each see
 * the other still there, and both go (ADR-069). No key update, so it waits
 * only for another such lock, not for writes that merely refer to the
 * organization; in id order, so two holders of the same set cannot
 * deadlock.
 */
async function lockOrganizations(
  tx: Transaction,
  organizationIds: string[],
): Promise<void> {
  if (organizationIds.length === 0) return;
  await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(inArray(organizations.id, organizationIds))
    .orderBy(asc(organizations.id))
    .for('no key update');
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
  return new ConflictException(withCode(refusalMessage(block), block.code));
}
