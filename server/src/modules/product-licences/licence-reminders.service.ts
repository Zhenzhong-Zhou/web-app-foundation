import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, between, eq, isNotNull, sql } from 'drizzle-orm';

import { todayUtc } from '../../common/today';
import { PERMISSIONS } from '../../core/authorization/permissions';
import { NOTIFICATION_TYPES } from '../../core/notifications/notification-types';
import { NotificationsService } from '../../core/notifications/notifications.service';
import type { Database } from '../../database/database.module';
import { UNSAFE_GLOBAL_DB } from '../../database/database.tokens';
import { productLicences } from '../../database/schema';
import { t } from '../../i18n/translate';

/** The notices before an expiry date, the furthest first (ADR-064). */
export const NOTICE_DAYS = [60, 30, 7, 0] as const;
/** How long after the day an expiry notice still catches up. */
const CATCH_UP_DAYS = 7;
const DAY = 24 * 60 * 60 * 1000;

/** Whole calendar days from `today` to `day`, both YYYY-MM-DD. */
export function daysUntil(day: string, today: string): number {
  return Math.round((Date.parse(day) - Date.parse(today)) / DAY);
}

function shifted(today: string, days: number): string {
  return new Date(Date.parse(today) + days * DAY).toISOString().slice(0, 10);
}

/**
 * The notice a licence is owed today, if any: the nearest of 60, 30, 7 or
 * 0 days it has reached, so a check that missed some days sends the latest
 * rather than all of them. Null outside the window, and null once the
 * expiry is more than a week past.
 */
export function noticeDue(daysLeft: number): number | null {
  if (daysLeft < -CATCH_UP_DAYS || daysLeft > NOTICE_DAYS[0]) return null;
  return [...NOTICE_DAYS].reverse().find((days) => daysLeft <= days) ?? null;
}

/**
 * Licence expiry reminders (ADR-064), over every organization: no request
 * and so no tenant, hence the global database, as the file purge has it.
 * Each notice is claimed on the licence row before it is sent, so two
 * instances or two runs never send one twice.
 */
@Injectable()
export class LicenceRemindersService {
  private readonly logger = new Logger(LicenceRemindersService.name);

  constructor(
    @Inject(UNSAFE_GLOBAL_DB) private readonly db: Database,
    private readonly notifications: NotificationsService,
  ) {}

  /** Sends what is owed today; returns how many licences were told about. */
  async remind(now: Date = new Date()): Promise<number> {
    const today = todayUtc(now);
    const candidates = await this.db
      .select({
        id: productLicences.id,
        organizationId: productLicences.organizationId,
        number: productLicences.number,
        authority: productLicences.authority,
        expiresAt: productLicences.expiresAt,
        noticeFor: productLicences.expiryNoticeFor,
        noticeDays: productLicences.expiryNoticeDays,
      })
      .from(productLicences)
      .where(
        and(
          eq(productLicences.isActive, true),
          isNotNull(productLicences.expiresAt),
          between(
            productLicences.expiresAt,
            shifted(today, -CATCH_UP_DAYS),
            shifted(today, NOTICE_DAYS[0]),
          ),
        ),
      );

    let told = 0;
    for (const licence of candidates) {
      const expiresAt = licence.expiresAt!;
      const daysLeft = daysUntil(expiresAt, today);
      const due = noticeDue(daysLeft);
      if (due === null) continue;

      // Already sent this notice, or a nearer one, for this date.
      const sent =
        licence.noticeFor === expiresAt && licence.noticeDays !== null
          ? licence.noticeDays
          : null;
      if (sent !== null && sent <= due) continue;

      // Claimed only if nobody moved the row since it was read.
      const [claimed] = await this.db
        .update(productLicences)
        .set({ expiryNoticeFor: expiresAt, expiryNoticeDays: due })
        .where(
          and(
            eq(productLicences.id, licence.id),
            eq(productLicences.expiresAt, expiresAt),
            sql`${productLicences.expiryNoticeFor} is not distinct from ${licence.noticeFor}`,
            sql`${productLicences.expiryNoticeDays} is not distinct from ${licence.noticeDays}`,
          ),
        )
        .returning({ id: productLicences.id });
      if (!claimed) continue;

      await this.tell(licence, expiresAt, daysLeft);
      told++;
    }

    if (told > 0) this.logger.log(`Licence reminders: ${told} sent`);
    return told;
  }

  /** One notice to everyone who can renew it or whose runs it stops. */
  private async tell(
    licence: {
      id: string;
      organizationId: string;
      number: string;
      authority: string;
    },
    expiresAt: string,
    daysLeft: number,
  ): Promise<void> {
    const recipients = new Set([
      ...(await this.notifications.recipientsWith(
        licence.organizationId,
        PERMISSIONS.PRODUCT_LICENCES_UPDATE,
      )),
      ...(await this.notifications.recipientsWith(
        licence.organizationId,
        PERMISSIONS.PRODUCTION_RELEASE,
      )),
    ]);

    const values = {
      number: licence.number,
      authority: licence.authority,
      date: expiresAt,
      days: daysLeft,
    };
    const title =
      daysLeft > 0
        ? t(
            {
              id: 'notifications.licence.expiring',
              defaultMessage:
                'Licence {number} ({authority}) expires in {days, plural, one {# day} other {# days}}, on {date}',
            },
            values,
          )
        : daysLeft === 0
          ? t(
              {
                id: 'notifications.licence.lastDay',
                defaultMessage:
                  'Licence {number} ({authority}) expires today, {date}',
              },
              values,
            )
          : t(
              {
                id: 'notifications.licence.expired',
                defaultMessage:
                  'Licence {number} ({authority}) expired on {date}',
              },
              values,
            );
    const body =
      daysLeft > 0
        ? t({
            id: 'notifications.licence.renew',
            defaultMessage:
              'Renew it, or record the new date once renewed, so release keeps working.',
          })
        : t({
            id: 'notifications.licence.policy',
            defaultMessage:
              'From the day after, production releases under it follow your licence policy.',
          });

    await this.notifications.emit(
      [...recipients].map((userId) => ({
        userId,
        organizationId: licence.organizationId,
        type: NOTIFICATION_TYPES.LICENCE_EXPIRING,
        title,
        body,
        resourceType: 'product_licence',
        resourceId: licence.id,
      })),
    );
  }
}
