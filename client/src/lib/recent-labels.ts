import { defineMessages, type IntlShape } from 'react-intl';

import type { RecentEntry, RecentKind } from './recent';

/** Each kind's name, for a recently opened record (ADR-058). */
export const RECENT_KIND_LABELS = defineMessages<RecentKind>({
  order: { id: 'recent.kind.order', defaultMessage: 'Order' },
  invoice: { id: 'recent.kind.invoice', defaultMessage: 'Invoice' },
  lot: { id: 'recent.kind.lot', defaultMessage: 'Lot' },
  product: { id: 'recent.kind.product', defaultMessage: 'Product' },
  partner: { id: 'recent.kind.partner', defaultMessage: 'Partner' },
  run: { id: 'recent.kind.run', defaultMessage: 'Production run' },
  return: { id: 'recent.kind.return', defaultMessage: 'Return' },
  priceList: { id: 'recent.kind.priceList', defaultMessage: 'Price list' },
});

/** The record's name, or what it is while it has none (a draft invoice). */
export function recentTitle(intl: IntlShape, entry: RecentEntry): string {
  return (
    entry.title ??
    intl.formatMessage(
      {
        id: 'recent.untitled',
        defaultMessage: '{kind} (draft)',
      },
      { kind: intl.formatMessage(RECENT_KIND_LABELS[entry.kind]) },
    )
  );
}

/** When, in words: minutes or hours ago, yesterday, or the date. */
export function recentWhen(
  intl: IntlShape,
  openedAt: string,
  now = Date.now(),
) {
  const minutes = Math.round((now - Date.parse(openedAt)) / 60_000);
  if (minutes < 60) {
    return intl.formatRelativeTime(-Math.max(minutes, 1), 'minute', {
      numeric: 'auto',
    });
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) return intl.formatRelativeTime(-hours, 'hour');
  const days = Math.round(hours / 24);
  if (days < 7)
    return intl.formatRelativeTime(-days, 'day', { numeric: 'auto' });
  return intl.formatDate(openedAt, { day: 'numeric', month: 'short' });
}
