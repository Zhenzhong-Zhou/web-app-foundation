import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, lt, sql } from 'drizzle-orm';

import type { Database } from '../../database/database.module';
import { UNSAFE_GLOBAL_DB } from '../../database/database.tokens';
import { type AccountEventAction, accountEvents } from '../../database/schema';

export interface EventMeta {
  ip?: string;
  userAgent?: string;
}

/** 90 days. See ADR-022 for why this is not audit_log's 24 months. */
const RETENTION_MS = 90 * 24 * 60 * 60_000;

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

  constructor(@Inject(UNSAFE_GLOBAL_DB) private readonly db: Database) {}

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
      await this.db.insert(accountEvents).values({
        userId,
        action,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });

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
