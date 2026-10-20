import { addDays, dayIn, startOfDayIn, todayIn } from '../../common/today';
import type { Transaction } from '../../database/database.module';
import { timeZoneOf } from '../organizations/time-zone';

/**
 * When a link issued now stops working: the end of its seventh day in the
 * organization's zone, so "until 26 October" holds all that day (ADR-077).
 */
export async function linkEnd(
  tx: Transaction,
  organizationId: string,
): Promise<Date> {
  const timeZone = await timeZoneOf(tx, organizationId);
  return startOfDayIn(timeZone, addDays(todayIn(timeZone), 8));
}

/** A link's last day, YYYY-MM-DD: the day its end closes, not the next. */
export function lastDayOf(timeZone: string, expiresAt: Date): string {
  return dayIn(timeZone, new Date(expiresAt.getTime() - 1));
}
