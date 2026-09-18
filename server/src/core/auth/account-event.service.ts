import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, lt, sql } from 'drizzle-orm';

import type { Database } from '../../database/database.module';
import { UNSAFE_GLOBAL_DB } from '../../database/database.tokens';
import { type AccountEventAction, accountEvents } from '../../database/schema';
import {
  NOTIFICATION_TYPES,
  NotificationType,
} from '../notifications/notification-types';
import { NotificationsService } from '../notifications/notifications.service';

export interface EventMeta {
  ip?: string;
  userAgent?: string;
}

/** 90 days. See ADR-022 for why this is not audit_log's 24 months. */
const RETENTION_MS = 90 * 24 * 60 * 60_000;

/**
 * The account events worth interrupting somebody about, and what to say.
 *
 * A subset, deliberately. Updating your own profile is not news to you, and
 * session.ended is noise — these three are the ones where the answer "that
 * was not me" matters, which is the whole reason account events are kept
 * separately from the audit log (ADR-022).
 *
 * A map rather than a call at each site: record() is already the one place
 * every account event passes through, so this cannot be forgotten the way a
 * per-caller emit could.
 */
const NOTIFIABLE: Partial<
  Record<AccountEventAction, { type: NotificationType; title: string }>
> = {
  'session.created': {
    type: NOTIFICATION_TYPES.SESSION_CREATED,
    title: 'A new sign-in to your account',
  },
  'account.password_changed': {
    type: NOTIFICATION_TYPES.PASSWORD_CHANGED,
    title: 'Your password was changed',
  },
  'account.password_reset': {
    type: NOTIFICATION_TYPES.PASSWORD_RESET,
    title: 'Your password was reset',
  },
};

/**
 * Account security history (ADR-022).
 *
 * Written by explicit calls rather than an interceptor, unlike audit_log
 * (ADR-018). The actor for session.created is not in the request context —
 * login is @Public(), and the handler is what produces the identity — so an
 * interceptor would have to dig it out of a response body. The failure the
 * interceptor prevents is feature modules forgetting to call record(), and
 * this is a closed set of seven events entirely inside core/auth.
 *
 * Uses the unscoped handle: these rows carry no organization_id by design.
 */
@Injectable()
export class AccountEventService {
  private readonly logger = new Logger(AccountEventService.name);

  constructor(
    @Inject(UNSAFE_GLOBAL_DB) private readonly db: Database,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Never throws. The action has already committed by the time this runs, so
   * failing the request would report failure for something that happened —
   * ADR-018's reasoning, and it applies identically here.
   */
  async record(
    userId: string,
    action: AccountEventAction,
    meta: EventMeta = {},
  ): Promise<void> {
    try {
      /**
       * Both questions asked before the insert, or the row about to be
       * written becomes its own precedent: it would be prior history for the
       * first-event check and a familiar browser for the recognition one.
       */
      const history = await this.historyFor(userId, meta.userAgent);

      await this.db.insert(accountEvents).values({
        userId,
        action,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });

      await this.notify(userId, action, meta, history);
      await this.sweep(userId);
    } catch (error) {
      this.logger.error(
        `Could not record ${action} for ${userId}: ${String(error)}`,
      );
    }
  }

  /** Backs a future "recent activity" panel on the sessions screen. */
  listForUser(userId: string, limit = 50) {
    return (
      this.db
        .select({
          id: accountEvents.id,
          action: accountEvents.action,
          ip: accountEvents.ip,
          userAgent: accountEvents.userAgent,
          createdAt: accountEvents.createdAt,
        })
        .from(accountEvents)
        .where(eq(accountEvents.userId, userId))
        // id, not created_at: UUIDv7 is time-sortable (ADR-010) and the index
        // is already on (user_id, id).
        .orderBy(desc(accountEvents.id))
        .limit(limit)
    );
  }

  /**
   * What this account has done before, in one round trip.
   *
   * `total` answers whether anything has happened at all — registration is
   * the first event, and there is nothing to tell somebody about their own
   * registration. `sameBrowser` answers whether this browser has signed in
   * before.
   *
   * Recognition is by user agent because it is the identifying thing already
   * stored; a fingerprint or a cookie is its own decision. Two laptops on the
   * same browser version look identical, which errs toward silence — a
   * missing user agent counts as unfamiliar, because the opposite failure is
   * a missed alert about a genuine intrusion.
   */
  private async historyFor(
    userId: string,
    userAgent?: string,
  ): Promise<{ sameBrowser: number }> {
    const [row] = await this.db
      .select({
        sameBrowser: sql<number>`count(*) filter (
          where ${accountEvents.action} in ('session.created', 'account.registered')
            and ${accountEvents.userAgent} = ${userAgent ?? null}
        )::int`,
      })
      .from(accountEvents)
      .where(eq(accountEvents.userId, userId));

    return row ?? { sameBrowser: 0 };
  }

  /**
   * The recipient is the subject, so there is no targeting question — unlike
   * an organization event, where it is a permission lookup (ADR-036).
   *
   * organizationId is null: "somebody signed in to your account" belongs to a
   * person, not a workspace, and the user may belong to none.
   */
  private async notify(
    userId: string,
    action: AccountEventAction,
    meta: EventMeta,
    history: { sameBrowser: number },
  ): Promise<void> {
    const notifiable = NOTIFIABLE[action];
    if (!notifiable) return;

    /**
     * A browser this account has signed in from before, registration
     * included. Every sign-in being news is how a bell teaches people to
     * ignore it.
     */
    if (action === 'session.created' && history.sameBrowser > 0) return;

    await this.notifications.emit([
      {
        userId,
        organizationId: null,
        type: notifiable.type,
        title: notifiable.title,
        // What makes "was that me?" answerable. No resource to link to.
        body: meta.ip ? `From ${meta.ip}` : undefined,
      },
    ]);
  }

  /**
   * Lazy sweep instead of a scheduled job (ADR-005), the way sessions and
   * auth_tokens already are. Bounds the table by active users rather than by
   * total history.
   */
  private async sweep(userId: string): Promise<void> {
    await this.db
      .delete(accountEvents)
      .where(
        and(
          eq(accountEvents.userId, userId),
          lt(
            accountEvents.createdAt,
            sql`now() - interval '${sql.raw(String(RETENTION_MS / 86_400_000))} days'`,
          ),
        ),
      );
  }
}
