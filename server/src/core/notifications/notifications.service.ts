import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../../database/database.module';
import {
  memberships,
  notifications,
  permissions,
  rolePermissions,
} from '../../database/schema';
import type { NotificationType } from './notification-types';

const DEFAULT_LIMIT = 20;

/**
 * How long a notification outlives its usefulness.
 *
 * Read ones go at ninety days, matching account_events (ADR-022): by then the
 * thing it pointed at has its own history — the audit log, the account
 * events — and the bell was only ever the pointer.
 *
 * Unread ones get a year. Somebody may be on leave, and deleting what they
 * have not seen is the one way this could lose information. But a year-old
 * unread row is not going to be read either; it only keeps the badge at 99+,
 * which teaches people to stop looking at it.
 */
const READ_RETENTION_DAYS = 90;
const UNREAD_RETENTION_DAYS = 365;

export interface Emission {
  userId: string;
  /** Null for an account notification, which belongs to no organization. */
  organizationId?: string | null;
  type: NotificationType;
  title: string;
  body?: string;
  resourceType?: string;
  resourceId?: string;
}

/**
 * Telling people things (ADR-036).
 *
 * Takes the unscoped handle rather than TenantDb, which is the one place in
 * the application that is correct: a notification is scoped by recipient, and
 * an account notification — "somebody signed in to your account" — has no
 * organization at all. Every query below filters on userId, which is both the
 * security boundary and the only meaningful one, since a notification
 * addressed to somebody else is not theirs to read whichever tenant they are
 * in.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(@Inject(UNSAFE_GLOBAL_DB) private readonly db: Database) {}

  /**
   * Writes notifications. Never throws.
   *
   * A failure is logged and swallowed, the way the audit interceptor handles
   * its own: nobody should lose a closed production run because a notification
   * insert deadlocked, and the thing being announced has already happened.
   *
   * Callers emit *after* their transaction commits, not inside it — this uses
   * its own connection, so a notification written inside would survive a
   * rollback and announce something that never occurred. The trade is that a
   * crash between commit and emit loses the notification, which is the right
   * way round.
   */
  async emit(rows: Emission[]): Promise<void> {
    if (rows.length === 0) return;

    try {
      await this.db.insert(notifications).values(rows);
    } catch (error) {
      this.logger.error(`Notification write failed: ${String(error)}`);
    }

    await this.sweep([...new Set(rows.map((row) => row.userId))]);
  }

  /**
   * Lazy retention, the way sessions, auth_tokens and account_events already
   * do it (ADR-005): no scheduler to run, and no scheduler to notice when it
   * has stopped running.
   *
   * On emit rather than on list(). The list is a GET that runs every time
   * somebody opens the bell, and a read that deletes is a read that takes
   * write locks and bloats on every click. Emit is the only thing that grows
   * the table, so sweeping there bounds it exactly: a user who is never sent
   * anything new is not accumulating anything either.
   *
   * Cheap because it is per recipient. (user_id, id) is already indexed for
   * the list, so this touches one user's rows — tens, not the table — and
   * produces a handful of dead tuples at a time rather than a vacuum-sized
   * batch.
   *
   * Never throws, for the same reason emit does not.
   */
  private async sweep(userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;

    try {
      await this.db
        .delete(notifications)
        .where(
          and(
            inArray(notifications.userId, userIds),
            or(
              and(
                isNotNull(notifications.readAt),
                lt(
                  notifications.createdAt,
                  sql`now() - interval '${sql.raw(String(READ_RETENTION_DAYS))} days'`,
                ),
              ),
              lt(
                notifications.createdAt,
                sql`now() - interval '${sql.raw(String(UNREAD_RETENTION_DAYS))} days'`,
              ),
            ),
          ),
        );
    } catch (error) {
      this.logger.error(`Notification sweep failed: ${String(error)}`);
    }
  }

  /**
   * Everyone in an organization holding a permission.
   *
   * Coarse targeting, and it uses data that already exists. By involvement
   * would need created_by to mean "owner", which it means only by accident —
   * it records who typed it in. By subscription is a feature of its own
   * (ADR-036).
   *
   * selectDistinct because a user with two roles granting the same permission
   * would otherwise be told twice.
   */
  async recipientsWith(
    organizationId: string,
    permissionKey: string,
  ): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ userId: memberships.userId })
      .from(memberships)
      .innerJoin(
        rolePermissions,
        eq(rolePermissions.roleId, memberships.roleId),
      )
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(
        and(
          eq(memberships.organizationId, organizationId),
          eq(permissions.key, permissionKey),
        ),
      );

    return rows.map((row) => row.userId);
  }

  /**
   * The badge. Its own query because it runs on every page load, and served
   * by a partial index on unread rows — almost every row is eventually read,
   * so indexing all of them would be indexing the wrong half.
   */
  async unreadCount(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        and(eq(notifications.userId, userId), isNull(notifications.readAt)),
      );

    return row?.count ?? 0;
  }

  /** Read and unread together: the bell shows recent history, not a queue. */
  async list(userId: string, before?: string, limit = DEFAULT_LIMIT) {
    const filters = [
      eq(notifications.userId, userId),
      before ? lt(notifications.id, before) : undefined,
    ].filter((f): f is NonNullable<typeof f> => f !== undefined);

    // One row past the limit, to know whether another page exists without a
    // second count query (ADR-018).
    const rows = await this.db
      .select()
      .from(notifications)
      .where(and(...filters))
      .orderBy(desc(notifications.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const entries = hasMore ? rows.slice(0, limit) : rows;

    return {
      entries,
      nextCursor: hasMore ? entries[entries.length - 1].id : null,
    };
  }

  /**
   * Scoped by userId as well as id. Without the second condition any
   * notification in the system could be marked read through somebody else's
   * session — and a 404 rather than a 403, because whether a notification
   * exists is itself not their business.
   */
  async markRead(userId: string, id: string): Promise<void> {
    const updated = await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
      .returning({ id: notifications.id });

    if (updated.length === 0) {
      throw new NotFoundException('No such notification');
    }
  }

  /**
   * Idempotent: the isNull filter means already-read rows keep the timestamp
   * they were first read at, rather than every one of them claiming to have
   * been read the moment somebody cleared the bell.
   */
  async markAllRead(userId: string): Promise<void> {
    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(eq(notifications.userId, userId), isNull(notifications.readAt)),
      );
  }
}
