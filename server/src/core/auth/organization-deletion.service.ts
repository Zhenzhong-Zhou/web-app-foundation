import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  and,
  count,
  eq,
  isNotNull,
  isNull,
  lt,
  lte,
  not,
  sql,
} from 'drizzle-orm';

import { ERROR_CODES, withCode } from '../../common/error-codes';
import type { Locale } from '../../common/locales';
import { todayUtc } from '../../common/today';
import type { Database, Transaction } from '../../database/database.module';
import { UNSAFE_GLOBAL_DB } from '../../database/database.tokens';
import {
  auditLog,
  files,
  type FileSize,
  memberships,
  organizations,
  roles,
  sessions,
  users,
} from '../../database/schema';
import { t } from '../../i18n/translate';
import type { Mail } from '../../shared/mail/mail.service';
import { AUDIT_ACTIONS } from '../audit/audit-actions';
import { SYSTEM_ROLES } from '../authorization/permissions';
import { FILE_STORAGE, type FileStorage, keyOf } from '../files/file-storage';
import { lastExportOf } from '../organizations/last-export';
import { AccountService } from './account.service';
import {
  AccountDeletionService,
  deletionDayFor,
  type Executor,
  todayWhereDaysEndLast,
} from './account-deletion.service';
import type { DeletionMailContext } from './deletion-mail';
import type { DeletionStage } from './dto/auth-response.dto';
import type { DeleteOrganizationDto } from './dto/delete-organization.dto';
import type { OrganizationDeletionScheduled } from './dto/organization-deletion-response.dto';
import {
  type MemberSide,
  organizationDeletedMail,
  organizationDeletionCancelledMail,
  organizationDeletionReminderMail,
  organizationDeletionScheduledMail,
} from './organization-deletion-mail';
import type { RequestContext } from './request-context';

const DAY = 24 * 60 * 60 * 1000;

/** Emails sent at once to an organization's members. */
const MAIL_AT_ONCE = 5;

/** How many days before the deletion day the reminder goes (ADR-070). */
const REMIND_DAYS_BEFORE = 7;

/**
 * The last deletion day whose final 7 days have begun (ADR-070, amended):
 * the reminder goes, and the banner can no longer be hidden. The server's
 * UTC day, so the email and every browser agree.
 */
function lastWeekCutoff(now: Date): string {
  return todayUtc(new Date(now.getTime() + REMIND_DAYS_BEFORE * DAY));
}

/**
 * Where a deletion stands (ADR-070, amended): under way once its day has
 * ended everywhere, in its last week from the reminder on, scheduled
 * before. One function, so the session and the cancel cannot draw the
 * lines differently; the reminder's query uses the same two cutoffs.
 */
export function deletionStageOf(day: string | null): DeletionStage | null {
  if (!day) return null;
  const now = new Date();
  if (day < todayWhereDaysEndLast(now)) return 'underWay';
  return day <= lastWeekCutoff(now) ? 'lastWeek' : 'scheduled';
}

/** One member as the emails need them, and what they are to it. */
interface Member extends MemberSide {
  id: string;
  email: string;
  name: string;
  locale: Locale | null;
}

/**
 * Deleting an organization (ADR-070): any Owner asks, confirmed with their
 * password, after an export or a decline; any Owner can cancel until the
 * day has ended everywhere; then the timer erases its files and deletes it.
 *
 * Beside account deletion, which it shares the deletion day, the emails
 * and the only member's account with, and outside any tenant for the same
 * reason: completing reads every organization.
 */
@Injectable()
export class OrganizationDeletionService {
  private readonly logger = new Logger(OrganizationDeletionService.name);

  constructor(
    @Inject(UNSAFE_GLOBAL_DB) private readonly db: Database,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    private readonly account: AccountService,
    private readonly accountDeletion: AccountDeletionService,
  ) {}

  /**
   * Set the deletion day 30 days ahead, confirmed with the password, after
   * an export taken in the last 24 hours or a decline. With deleteAccount,
   * the only member's account goes the same day. Asking again while one is
   * pending changes nothing.
   */
  async request(
    context: RequestContext,
    dto: DeleteOrganizationDto,
  ): Promise<OrganizationDeletionScheduled> {
    const organizationId = this.organizationOf(context);
    await this.confirmName(organizationId, dto.organizationName);
    await this.account.confirmPassword(context.userId, dto.password);

    const now = new Date();
    const outcome = await this.db.transaction(async (tx) => {
      const organization = await lockOrganization(tx, organizationId);
      if (organization.deletionScheduledAt) {
        // Already going alone: asking for the account too must not be
        // ignored in silence. The account's own deletion is the way, and
        // nothing stops it while the organization is going (ADR-070).
        if (dto.deleteAccount) {
          throw new ConflictException(
            t({
              id: 'organization.deletion.alreadyScheduled',
              defaultMessage:
                'The organization is already being deleted. To delete your account as well, use Delete my account on the Account page.',
            }),
          );
        }
        return {
          day: organization.deletionScheduledAt,
          scheduled: false,
        } as const;
      }

      if (!dto.declineExport) {
        const exported = await lastExportOf(tx, organizationId, now);
        if (!exported?.fresh) {
          throw new ConflictException(
            withCode(
              t({
                id: 'organization.deletion.exportRequired',
                defaultMessage:
                  'Download everything first, or say you do not need a copy. Once the organization is deleted, nothing can make one.',
              }),
              ERROR_CODES.organizationExportRequired,
            ),
          );
        }
      }

      const day = deletionDayFor(now);
      if (dto.deleteAccount) {
        if ((await memberCount(tx, organizationId)) > 1) {
          throw new ConflictException(
            t({
              id: 'organization.deletion.notOnlyMember',
              defaultMessage:
                'Others are members too, so your account cannot go with the organization. Delete the organization alone, then your account from the Account page.',
            }),
          );
        }
        await this.accountDeletion.schedule(
          tx,
          context.userId,
          day,
          organizationId,
        );
      }

      await tx
        .update(organizations)
        .set({ deletionScheduledAt: day })
        .where(eq(organizations.id, organizationId));
      // Here, not by @Audited: only a request that changed something is
      // recorded; asking again while one is pending changes nothing.
      await tx.insert(auditLog).values({
        organizationId,
        actorId: context.userId,
        action: AUDIT_ACTIONS.ORGANIZATION_DELETION_SCHEDULED,
        resourceType: 'organization',
        resourceId: organizationId,
        resourceLabel: organization.name,
        payload: {
          deletionScheduledAt: day,
          export: dto.declineExport ? 'declined' : 'downloaded',
          withAccount: dto.deleteAccount === true,
        },
        ip: context.ip,
        userAgent: context.userAgent,
      });
      return { day, scheduled: true, name: organization.name } as const;
    });

    if (outcome.scheduled) {
      if (dto.deleteAccount) {
        await this.accountDeletion.signOutForDeletion(context);
      }
      // Not awaited: the deletion has committed, and a slow mail provider
      // or a large team must not hold the answer (sendTo logs a failure).
      void this.tell(
        await membersOf(this.db, organizationId),
        context,
        (mail, member) =>
          organizationDeletionScheduledMail(
            mail,
            {
              organization: outcome.name,
              actor: context.name,
              day: outcome.day,
            },
            member,
          ),
      );
      this.logger.log(
        `Organization ${organizationId} scheduled for deletion after ${outcome.day}`,
      );
    }
    return { deletionScheduledAt: outcome.day };
  }

  /**
   * Keep the organization, from its page: any Owner, until the deletion
   * day has ended everywhere. Nothing to cancel is not an error.
   */
  async cancel(context: RequestContext): Promise<void> {
    await this.unschedule(this.organizationOf(context), context);
  }

  /**
   * Keep my account, from the Account page, when the person scheduled it
   * with their organization as its only member (ADR-070): scheduled
   * together, cancelled together. False when it was not, for the account's
   * own cancel to handle.
   */
  async cancelTogether(context: RequestContext): Promise<boolean> {
    // The account's link, while it is still an Owner there and the
    // organization's deletion still stands: otherwise the account's own
    // cancel is the one that applies. An Owner, because only an Owner may
    // keep an organization (ADR-070): one demoted since keeps their
    // account alone.
    const [together] = await this.db
      .select({ organizationId: organizations.id })
      .from(users)
      .innerJoin(
        organizations,
        eq(organizations.id, users.deletionWithOrganizationId),
      )
      .innerJoin(
        memberships,
        and(
          eq(memberships.organizationId, organizations.id),
          eq(memberships.userId, users.id),
        ),
      )
      .innerJoin(roles, eq(roles.id, memberships.roleId))
      .where(
        and(
          eq(users.id, context.userId),
          isNotNull(organizations.deletionScheduledAt),
          eq(roles.name, SYSTEM_ROLES.OWNER),
        ),
      );
    if (!together) return false;

    await this.unschedule(together.organizationId, context);
    return true;
  }

  /**
   * Complete every deletion whose day has ended everywhere, each on its
   * own: one that fails is logged and left for the next run, without
   * holding up the rest. Then the accounts that waited for them (ADR-070).
   */
  async completeDue(
    now = new Date(),
  ): Promise<{ completed: number; failed: number }> {
    const due = await this.db
      .select({ id: organizations.id })
      .from(organizations)
      .where(dueBy(now));

    let completed = 0;
    let failed = 0;
    for (const { id } of due) {
      try {
        if (await this.complete(id, now)) completed += 1;
      } catch (error) {
        failed += 1;
        this.logger.error(
          `Could not complete the deletion of organization ${id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    // The only members' accounts, scheduled with their organizations: due
    // the same day, they waited for them to go first.
    if (completed > 0) await this.accountDeletion.completeDue(now);
    return { completed, failed };
  }

  /**
   * The reminder, 7 days before the day (ADR-070, amended): each claimed
   * by one statement, so a repeated run or a second instance sends it
   * once. Not once the day has ended everywhere: then it is under way.
   * One that fails is logged, and its members go without.
   */
  async remindDue(now = new Date()): Promise<number> {
    const claimed = await this.db
      .update(organizations)
      .set({ deletionRemindedAt: now })
      .where(
        and(
          isNull(organizations.deletionRemindedAt),
          lte(organizations.deletionScheduledAt, lastWeekCutoff(now)),
          not(dueBy(now)),
        ),
      )
      .returning({
        id: organizations.id,
        name: organizations.name,
        day: organizations.deletionScheduledAt,
      });

    for (const organization of claimed) {
      try {
        const day = organization.day!;
        await this.tell(
          await membersOf(this.db, organization.id),
          undefined,
          (mail, member) =>
            organizationDeletionReminderMail(
              mail,
              { organization: organization.name, day },
              member,
            ),
        );
        this.logger.log(
          `Organization ${organization.id} reminded of its deletion`,
        );
      } catch (error) {
        this.logger.error(
          `Could not remind organization ${organization.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
    return claimed.length;
  }

  /**
   * Erase the files, then delete the organization: its sessions moved, its
   * audit log deleted on purpose, every table it owns by cascade (ADR-070).
   * False when it is no longer due.
   */
  private async complete(organizationId: string, now: Date): Promise<boolean> {
    // The start marked first, under the lock, before any file is erased
    // (ADR-070, amended): a cancel either committed before this, and the
    // deletion is no longer due, or waits for it and is refused, as an
    // upload is. A run that fails after the mark leaves it for the next.
    const started = await this.db.transaction(async (tx) => {
      const [organization] = await tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(and(eq(organizations.id, organizationId), dueBy(now)))
        .for('update');
      if (!organization) return false;

      await tx
        .update(organizations)
        .set({ deletionStartedAt: now })
        .where(
          and(
            eq(organizations.id, organizationId),
            isNull(organizations.deletionStartedAt),
          ),
        );
      return true;
    });
    if (!started) return false;

    // Bytes next: no transaction can roll back storage, and nothing can
    // cancel now, so a run that fails after this one is finished by the
    // next. Erasing what is gone succeeds.
    const erased = new Set<string>();
    await this.eraseFiles(this.db, organizationId, erased);

    const done = await this.db.transaction(async (tx) => {
      const [organization] = await tx
        .select({
          name: organizations.name,
          day: organizations.deletionScheduledAt,
        })
        .from(organizations)
        .where(
          and(
            eq(organizations.id, organizationId),
            isNotNull(organizations.deletionStartedAt),
          ),
        )
        .for('update');
      if (!organization?.day) return null;

      // An upload begun before the mark has its row and its bytes by now,
      // and none can begin after it: this finds every file since the
      // erase above.
      await this.eraseFiles(tx, organizationId, erased);

      const members = await membersOf(tx, organizationId);

      // Sessions cascade from the organization they work in, and would
      // sign every member out: each moves to the person's next
      // organization, as leaving does, or to none.
      await tx
        .update(sessions)
        .set({
          currentOrgId: sql`(
            select m.organization_id from ${memberships} m
            where m.user_id = "sessions"."user_id"
              and m.organization_id <> ${organizationId}
            order by m.id
            limit 1
          )`,
        })
        .where(eq(sessions.currentOrgId, organizationId));

      // On purpose, by this one path: the foreign key stays RESTRICT, so
      // nothing else can (ADR-012, ADR-070).
      await tx
        .delete(auditLog)
        .where(eq(auditLog.organizationId, organizationId));
      await tx
        .delete(organizations)
        .where(eq(organizations.id, organizationId));

      return { name: organization.name, day: organization.day, members };
    });
    if (!done) return false;

    this.logger.log(`Organization ${organizationId} deleted`);
    await this.tell(done.members, undefined, (mail, member) =>
      organizationDeletedMail(
        mail,
        { organization: done.name, day: done.day },
        member,
      ),
    );
    return true;
  }

  /** The bytes of every file the organization owns, not erased already. */
  private async eraseFiles(
    executor: Executor,
    organizationId: string,
    erased: Set<string>,
  ): Promise<void> {
    const owned = await executor
      .select({ id: files.id, sizes: files.sizes })
      .from(files)
      .where(eq(files.organizationId, organizationId));

    for (const file of owned) {
      if (erased.has(file.id)) continue;
      await Promise.all(
        (Object.keys(file.sizes) as FileSize[]).map((size) =>
          this.storage.delete(keyOf(organizationId, file.id, size)),
        ),
      );
      erased.add(file.id);
    }
  }

  /**
   * The deletion cancelled, refused once its day has ended everywhere;
   * the only member's account cancelled with it when they went together;
   * every member emailed. The audit entry is written here, by either
   * route, and only when there was something to cancel: two Owners
   * pressing Cancel at once record one cancellation, not two.
   */
  private async unschedule(
    organizationId: string,
    context: RequestContext,
  ): Promise<void> {
    const outcome = await this.db.transaction(async (tx) => {
      const organization = await lockOrganization(tx, organizationId);
      const day = organization.deletionScheduledAt;
      if (!day) return null;
      // Once a run has marked its start, whatever the clock now says
      // (ADR-070, amended); before that, once the day has ended.
      if (
        organization.deletionStartedAt !== null ||
        deletionStageOf(day) === 'underWay'
      ) {
        throw new ConflictException(
          withCode(
            t({
              id: 'organization.deletion.underWay',
              defaultMessage:
                'The deletion day is over, so the organization is being deleted and it can no longer be cancelled.',
            }),
            ERROR_CODES.organizationDeletionUnderWay,
          ),
        );
      }

      const members = await membersOf(tx, organizationId);
      await tx
        .update(organizations)
        .set({ deletionScheduledAt: null, deletionRemindedAt: null })
        .where(eq(organizations.id, organizationId));
      // Scheduled together, cancelled together, whoever cancels.
      const kept = await this.accountDeletion.keepWith(tx, organizationId);
      await tx.insert(auditLog).values({
        organizationId,
        actorId: context.userId,
        action: AUDIT_ACTIONS.ORGANIZATION_DELETION_CANCELLED,
        resourceType: 'organization',
        resourceId: organizationId,
        resourceLabel: organization.name,
        ip: context.ip,
        userAgent: context.userAgent,
      });
      return { name: organization.name, members, kept };
    });
    if (!outcome) return;

    // Recorded in each kept account's history; no email of the account's
    // own, since the organization's says both stay.
    for (const id of outcome.kept) {
      await this.accountDeletion.recordKept(id, context);
    }

    // Not awaited, as when it was scheduled.
    void this.tell(outcome.members, context, (mail, member) =>
      organizationDeletionCancelledMail(
        mail,
        { organization: outcome.name, actor: context.name },
        member,
      ),
    );
    this.logger.log(`Deletion of organization ${organizationId} cancelled`);
  }

  /**
   * Every member emailed, in their language, or the request's for the
   * person who made it. A failed email is logged: the deletion stands
   * either way, as ADR-069's emails do.
   */
  private async tell(
    members: Member[],
    actor: RequestContext | undefined,
    build: (mail: DeletionMailContext, member: Member) => Mail,
  ): Promise<void> {
    // A few at a time: one by one, a slow mail provider and a large team
    // could hold the request past the host's timeout, after the deletion
    // has already committed.
    for (let at = 0; at < members.length; at += MAIL_AT_ONCE) {
      await Promise.all(
        members.slice(at, at + MAIL_AT_ONCE).map((member) =>
          this.accountDeletion.sendTo(
            member,
            // The person who acted is told "you", not their own name.
            (mail) =>
              build(mail, { ...member, isActor: member.id === actor?.userId }),
            actor && member.id === actor.userId ? actor.language : undefined,
          ),
        ),
      );
    }
  }

  /**
   * The organization's name, typed to confirm (ADR-070, amended): trimmed
   * by the DTO, as the name was when stored, and nothing else forgiven,
   * so a wrong organization is never deleted by a reflex.
   */
  private async confirmName(
    organizationId: string,
    typed: string,
  ): Promise<void> {
    const [organization] = await this.db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, organizationId));
    if (typed !== organization?.name) {
      throw new BadRequestException(
        t({
          id: 'organization.deletion.nameMismatch',
          defaultMessage:
            'Type the organization’s name exactly as it is shown, to confirm.',
        }),
      );
    }
  }

  private organizationOf(context: RequestContext): string {
    if (!context.organizationId) {
      // The permission guard has already refused a session with none.
      throw new BadRequestException();
    }
    return context.organizationId;
  }
}

/** Due: the deletion day has ended in every time zone. */
function dueBy(now: Date) {
  return lt(organizations.deletionScheduledAt, todayWhereDaysEndLast(now));
}

/**
 * The organization held until the transaction ends: two Owners asking or
 * cancelling at once take turns, and the second sees the first's answer.
 * No key update, as account deletion's lock: writes that merely refer to
 * the organization do not wait for it.
 */
async function lockOrganization(tx: Transaction, organizationId: string) {
  const [organization] = await tx
    .select({
      name: organizations.name,
      deletionScheduledAt: organizations.deletionScheduledAt,
      deletionStartedAt: organizations.deletionStartedAt,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .for('no key update');
  return organization;
}

async function memberCount(
  executor: Executor,
  organizationId: string,
): Promise<number> {
  const [row] = await executor
    .select({ members: count() })
    .from(memberships)
    .where(eq(memberships.organizationId, organizationId));
  return row.members;
}

/**
 * Every member, and what each is to the organization: an Owner, and the
 * one whose account goes with it, as their account records it. Read
 * before a cancel clears that record.
 */
async function membersOf(
  executor: Executor,
  organizationId: string,
): Promise<Member[]> {
  return executor
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      locale: users.locale,
      isOwner: sql<boolean>`${roles.name} = ${SYSTEM_ROLES.OWNER}`,
      withAccount: sql<boolean>`${users.deletionWithOrganizationId} is not distinct from ${organizationId}::uuid`,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(roles, eq(roles.id, memberships.roleId))
    .where(eq(memberships.organizationId, organizationId))
    .orderBy(memberships.id);
}
