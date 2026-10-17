import { todayIn } from '../../src/common/today';

/**
 * Two real places 25 hours apart: at any moment they are on different
 * days, Kiritimati always the later, and UTC's day is one of the two or
 * between them. So a test that reads the day through the organization's
 * zone cannot depend on when it runs, and one that reads it in UTC fails
 * in at least one of them (ADR-072).
 */
export const KIRITIMATI = 'Pacific/Kiritimati'; // UTC+14
export const PAGO_PAGO = 'Pacific/Pago_Pago'; // UTC−11

/**
 * Waits out a midnight in any of `zones` less than `withinMs` away. A test
 * that reads a zone's today and then has the server read it a moment later
 * would otherwise, once a day, straddle the change of day.
 */
export async function clearOfMidnight(
  zones: string[],
  withinMs = 2_000,
): Promise<void> {
  for (const zone of zones) {
    const today = todayIn(zone);
    if (todayIn(zone, new Date(Date.now() + withinMs)) === today) continue;
    while (todayIn(zone) === today) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}
