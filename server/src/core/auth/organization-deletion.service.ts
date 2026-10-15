import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, count, eq, gt, isNotNull, lt, sql } from 'drizzle-orm';

import { ERROR_CODES, withCode } from '../../common/error-codes';
import type { Locale } from '../../common/locales';
import type { Env } from '../../config/env';
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
import { recipientLocale, t } from '../../i18n/translate';
import { type Mail, MailService } from '../../shared/mail/mail.service';
import { AUDIT_ACTIONS } from '../audit/audit-actions';
import { recordContext } from '../audit/audit-context';
import { SYSTEM_ROLES } from '../authorization/permissions';
import { FILE_STORAGE, type FileStorage, keyOf } from '../files/file-storage';
import { AccountService } from './account.service';
import {
  AccountDeletionService,
  deletionDayFor,
  endedEverywhere,
  type Executor,
  todayWhereDaysEndLast,
} from './account-deletion.service';
import type { DeletionMailContext } from './deletion-mail';
import type { OrganizationDeletionScheduled } from './dto/organization-deletion-response.dto';
import {
  type MemberSide,
  organizationDeletedMail,
  organizationDeletionCancelledMail,
  organizationDeletionScheduledMail,
} from './organization-deletion-mail';
import type { RequestContext } from './request-context';

const DAY = 24 * 60 * 60 * 1000;

/** How recent the export a deletion relies on must be (ADR-070). */
const EXPORT_WITHIN_MS = DAY;

/** One member as the emails need them. */
interface Member {
  id: string;
  email: string;
  name: string;
  locale: Locale | null;
  isOwner: boolean;
  /** The member's own deletion day, if their account is going too. */
  accountDay: string | null;
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
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Set the deletion day 30 days ahead, confirmed with the password, after
   * an export taken in the last 24 hours or a decline. With deleteAccount,
   * the only member's account goes the same day. Asking again while one is
   * pending changes nothing.
   */
  async request(
    context: RequestContext,
    options: {
      password: string;
      declineExport?: boolean;
      deleteAccount?: boolean;
    },
  ): Promise<OrganizationDeletionScheduled> {
    const organizationId = this.organizationOf(context);
    await this.account.confirmPassword(context.userId, options.password);

    const now = new Date();
    const outcome = await this.db.transaction(async (tx) => {
      const organization = await lockOrganization(tx, organizationId);
      if (organization.deletionScheduledAt) {
        return { day: organization.deletionScheduledAt, scheduled: false };
      }

      if (!options.declineExport) {
        const [exported] = await tx
          .select({ id: auditLog.id })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.organizationId, organizationId),
              eq(auditLog.action, AUDIT_ACTIONS.ORGANIZATION_EXPORTED),
              gt(
                auditLog.createdAt,
                new Date(now.getTime() - EXPORT_WITHIN_MS),
              ),
            ),
          )
          .limit(1);
        if (!exported) {
          throw new ConflictException(
            withCode(
              t({
                id: 'organization.deletion.exportRequired',
                defaultMessage:
                  'Download the export first, or say you do not want it. Once the organization is deleted, nothing can make one.',
              }),
              ERROR_CODES.organizationExportRequired,
            ),
          );
        }
      }

      const day = deletionDayFor(now);
      if (options.deleteAccount) {
        if ((await memberCount(tx, organizationId)) > 1) {
          throw new ConflictException(
            t({
              id: 'organization.deletion.notOnlyMember',
              defaultMessage:
                'Others are members too, so your account cannot go with the organization. Delete the organization alone, then your account from the Account page.',
            }),
          );
        }
        await this.accountDeletion.schedule(tx, context, day);
      }

      await tx
        .update(organizations)
        .set({ deletionScheduledAt: day })
        .where(eq(organizations.id, organizationId));
      return { day, scheduled: true, name: organization.name };
    });

    if (outcome.scheduled) {
      recordContext({
        deletionScheduledAt: outcome.day,
        export: options.declineExport ? 'declined' : 'downloaded',
        withAccount: options.deleteAccount === true,
      });
      await this.tellMembers(organizationId, context, (member, mail, all) =>
        organizationDeletionScheduledMail(
          mail,
          {
            organization: outcome.name!,
            actor: context.name,
            day: outcome.day,
          },
          sideOf(member, all, outcome.day),
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
    await this.unschedule(this.organizationOf(context), context, false);
  }

  /**
   * Keep my account, from the Account page, when the person scheduled it
   * with their organization as its only member (ADR-070): scheduled
   * together, cancelled together. False when it was not, for the account's
   * own cancel to handle.
   */
  async cancelTogether(context: RequestContext): Promise<boolean> {
    const [together] = await this.db
      .select({ organizationId: organizations.id })
      .from(users)
      .innerJoin(memberships, eq(memberships.userId, users.id))
      .innerJoin(
        organizations,
        and(
          eq(organizations.id, memberships.organizationId),
          eq(organizations.deletionScheduledAt, users.deletionScheduledAt),
        ),
      )
      .where(eq(users.id, context.userId));
    if (!together) return false;
    if ((await memberCount(this.db, together.organizationId)) > 1) {
      return false;
    }

    await this.unschedule(together.organizationId, context, true);
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
   * Erase the files, then delete the organization: its sessions moved, its
   * audit log deleted on purpose, every table it owns by cascade (ADR-070).
   * False when it is no longer due.
   */
  private async complete(organizationId: string, now: Date): Promise<boolean> {
    // Bytes first: no transaction can roll back storage, and past the
    // cutoff nothing can cancel, so a run that fails after this one is
    // finished by the next. Erasing what is gone succeeds.
    const erased = new Set<string>();
    await this.eraseFiles(this.db, organizationId, erased);

    const done = await this.db.transaction(async (tx) => {
      const [organization] = await tx
        .select({
          name: organizations.name,
          day: organizations.deletionScheduledAt,
        })
        .from(organizations)
        .where(and(eq(organizations.id, organizationId), dueBy(now)))
        .for('update');
      if (!organization?.day) return null;

      // A new file's row waits for the lock, so this finds every upload
      // since the erase above, and nothing comes after it.
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
    for (const member of done.members) {
      await this.send(member, undefined, (mail) =>
        organizationDeletedMail(
          mail,
          { organization: done.name, day: done.day },
          sideOf(member, done.members, done.day),
        ),
      );
    }
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
   * every member emailed. From the Account page there is no @Audited
   * route of the organization's, so the entry is written here.
   */
  private async unschedule(
    organizationId: string,
    context: RequestContext,
    audit: boolean,
  ): Promise<void> {
    const outcome = await this.db.transaction(async (tx) => {
      const organization = await lockOrganization(tx, organizationId);
      const day = organization.deletionScheduledAt;
      if (!day) return null;
      if (endedEverywhere(day)) {
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
        .set({ deletionScheduledAt: null })
        .where(eq(organizations.id, organizationId));
      if (audit) {
        await tx.insert(auditLog).values({
          organizationId,
          actorId: context.userId,
          action: AUDIT_ACTIONS.ORGANIZATION_DELETION_CANCELLED,
          resourceType: 'organization',
          resourceId: organizationId,
          ip: context.ip,
          userAgent: context.userAgent,
        });
      }
      return { name: organization.name, day, members };
    });
    if (!outcome) return;

    const together = outcome.members.find(
      (member) => sideOf(member, outcome.members, outcome.day).withAccount,
    );
    if (together?.id === context.userId) {
      // One email says both stay: the account's own is not sent.
      await this.accountDeletion.cancel(context, { email: false });
    }

    for (const member of outcome.members) {
      await this.send(
        member,
        member.id === context.userId ? context.language : undefined,
        (mail) =>
          organizationDeletionCancelledMail(
            mail,
            { organization: outcome.name, actor: context.name },
            sideOf(member, outcome.members, outcome.day),
          ),
      );
    }
    this.logger.log(`Deletion of organization ${organizationId} cancelled`);
  }

  /** Every member emailed, in their language, or the request's for the actor. */
  private async tellMembers(
    organizationId: string,
    context: RequestContext,
    build: (member: Member, mail: DeletionMailContext, all: Member[]) => Mail,
  ): Promise<void> {
    const members = await membersOf(this.db, organizationId);
    for (const member of members) {
      await this.send(
        member,
        member.id === context.userId ? context.language : undefined,
        (mail) => build(member, mail, members),
      );
    }
  }

  /**
   * One email, logged rather than thrown when it fails: the deletion
   * stands either way, as ADR-069's emails do.
   */
  private async send(
    member: Member,
    language: string | undefined,
    build: (mail: DeletionMailContext) => Mail,
  ): Promise<void> {
    try {
      await this.mail.send(
        build({
          locale: recipientLocale(member.locale, language),
          to: member.email,
          name: member.name,
          clientUrl: this.config.get('CLIENT_URL', { infer: true }),
        }),
      );
    } catch (error) {
      this.logger.error(`Could not email ${member.id}: ${String(error)}`);
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
  return and(
    isNotNull(organizations.deletionScheduledAt),
    lt(organizations.deletionScheduledAt, todayWhereDaysEndLast(now)),
  );
}

/**
 * The organization held until the transaction ends: two Owners asking or
 * cancelling at once take turns, and the second sees the first's answer.
 */
async function lockOrganization(tx: Transaction, organizationId: string) {
  const [organization] = await tx
    .select({
      name: organizations.name,
      deletionScheduledAt: organizations.deletionScheduledAt,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .for('update');
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
      accountDay: users.deletionScheduledAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(roles, eq(roles.id, memberships.roleId))
    .where(eq(memberships.organizationId, organizationId))
    .orderBy(memberships.id);
}

/**
 * What the reader is to the organization: an Owner, and the only member
 * whose account goes with it, the same day.
 */
function sideOf(member: Member, members: Member[], day: string): MemberSide {
  return {
    isOwner: member.isOwner,
    withAccount: members.length === 1 && member.accountDay === day,
  };
}
