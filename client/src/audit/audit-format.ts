import { formatDay } from '../lib/format';

/**
 * How an audit row reads, shared by the audit page and the history drawer.
 *
 * Moved out of the page when the drawer became a second reader: two copies of
 * `describe` would drift the way the old label map did, and the drawer would
 * start calling the same event something different from the log.
 */

export interface AuditRecord {
  id: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  /**
   * What the resource was called when this happened (ADR-038). Snapshotted,
   * so it may differ from the record's name today — which is the point. Null
   * on rows from before it was recorded, and for member events.
   */
  resourceLabel: string | null;
  actorId: string | null;
  /** Joined server-side: a tombstoned actor is not in GET /v1/users. */
  actorEmail: string | null;
  /**
   * What a field was set to, for the routes that name fields (ADR-018). Not
   * before and after — the interceptor runs after the handler and never saw
   * the old row.
   */
  payload: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

export interface AuditPageResponse {
  entries: AuditRecord[];
  /** Pass as `before` for the next page. Null when the log is exhausted. */
  nextCursor: string | null;
}

/**
 * Wording for actions where the derived text reads badly. An override, not a
 * requirement.
 *
 * It used to be the only source, and it drifted the moment products, BOMs and
 * production orders added actions nobody came back to label — an investigation
 * is the worst time to meet a raw key. `describe` derives instead, and this
 * holds the handful of exceptions.
 */
const ACTION_LABELS: Record<string, string> = {
  'user.created': 'Added a member',
  'user.role_changed': "Changed a member's role",
};

/**
 * Human text for an action key.
 *
 * Derived, because the keys are already structured: `order.line_closed_short`
 * carries its own words. A map of every action would be a second vocabulary to
 * keep in step with the server's, and the client cannot import that constant.
 */
export function describe(action: string): string {
  const override = ACTION_LABELS[action];
  if (override) return override;

  const [resource, ...rest] = action.split('.');
  const words = `${resource} ${rest.join('.')}`.replace(/_/g, ' ').trim();

  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Fields that hold a calendar day, stored as UTC midnight. Named rather than
 * guessed from the value: a real timestamp that happens to fall on midnight
 * UTC would otherwise read as a day, and the list is two entries long.
 */
const CALENDAR_DAYS = new Set(['expectedAt', 'expiresAt']);

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

const MOMENT = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/**
 * A value as it should read in the log.
 *
 * null is the common case rather than an edge one — a reference set for the
 * first time has no previous value — and `String(null)` puts the word "null"
 * in front of somebody investigating a change.
 *
 * Dates are the other raw form that leaked through: "2026-10-10T00:00:00.000Z"
 * is a storage format, not an answer. A calendar day reads as the day that
 * was picked (formatDay, in UTC, for the reason given there); any other
 * timestamp reads in the viewer's local time, because it was a moment.
 */
function show(key: string, value: unknown): string {
  if (value === null || value === undefined) return '—';

  if (typeof value === 'string' && ISO_TIMESTAMP.test(value)) {
    return CALENDAR_DAYS.has(key)
      ? formatDay(value)
      : MOMENT.format(new Date(value));
  }

  return String(value);
}

/** "expectedAt" → "expected at": the field names are the words, just joined. */
function label(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

/**
 * The recorded values as one line.
 *
 * Two shapes, because a route only reports a previous value when its service
 * recorded one (ADR-018): `{ from, to }` renders as an arrow, a bare value as
 * itself. Keeping them distinguishable matters — "set to 30" and "3 → 30" are
 * different claims, and collapsing the first into the second would invent a
 * before-value that was never captured.
 *
 * A `{ from, to }` that did not move is left out. A form sends every field
 * it shows, so an edit to the date also reports the unchanged reference, and
 * "reference: X → X" beside the real change only hides it. Rows where nothing
 * moved at all predate the interceptor skipping them, and say so.
 *
 * Generic rather than per-action: the allow-list is small and its field names
 * are already the words people use — `reference`, `sku`, `roleId`.
 */
export function summarise(
  payload: Record<string, unknown> | null,
): string | null {
  if (!payload) return null;

  const entries = Object.entries(payload);
  const parts: string[] = [];

  for (const [key, value] of entries) {
    if (
      value !== null &&
      typeof value === 'object' &&
      'from' in value &&
      'to' in value
    ) {
      const { from, to } = value as { from: unknown; to: unknown };
      if (JSON.stringify(from) === JSON.stringify(to)) continue;

      parts.push(`${label(key)}: ${show(key, from)} → ${show(key, to)}`);
    } else {
      parts.push(`${label(key)}: ${show(key, value)}`);
    }
  }

  if (parts.length > 0) return parts.join(' · ');
  return entries.length > 0 ? 'Saved with no changes' : null;
}
