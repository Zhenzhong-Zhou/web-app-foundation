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
 * A value as it should read in the log.
 *
 * null is the common case rather than an edge one — a reference set for the
 * first time has no previous value — and `String(null)` puts the word "null"
 * in front of somebody investigating a change.
 */
function show(value: unknown): string {
  return value === null || value === undefined ? '—' : String(value);
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
 * Generic rather than per-action: the allow-list is small and its field names
 * are already the words people use — `reference`, `sku`, `roleId`.
 */
export function summarise(
  payload: Record<string, unknown> | null,
): string | null {
  if (!payload) return null;

  const parts = Object.entries(payload).map(([key, value]) => {
    if (
      value &&
      typeof value === 'object' &&
      'from' in value &&
      'to' in value
    ) {
      const { from, to } = value as { from: unknown; to: unknown };
      return `${key}: ${show(from)} → ${show(to)}`;
    }
    return `${key}: ${show(value)}`;
  });

  return parts.length > 0 ? parts.join(' · ') : null;
}
