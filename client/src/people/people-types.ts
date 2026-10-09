import { defineMessages, type IntlShape } from 'react-intl';

import type { AuditRecord } from '../audit/audit-format';

/** How recently someone was here, as everyone sees it (ADR-063). */
export type ActiveSince = 'today' | 'week' | 'month' | 'older' | 'never';

/** One of the organization's people, as GET /v1/people gives them. */
export interface Person {
  id: string;
  name: string;
  email: string;
  photoFileId: string | null;
  roleId: string;
  roleName: string;
  jobTitle: string | null;
  department: string | null;
  location: string | null;
  workPhone: string | null;
  extension: string | null;
  memberSince: string;
  active: ActiveSince;
  /** Only for those who may read the history. */
  lastActiveAt?: string | null;
  /** The last 20 things they did, likewise; on a person's page only. */
  recentActivity?: AuditRecord[];
}

const ACTIVE = defineMessages<ActiveSince>({
  today: { id: 'people.active.today', defaultMessage: 'Active today' },
  week: { id: 'people.active.week', defaultMessage: 'Active this week' },
  month: { id: 'people.active.month', defaultMessage: 'Active this month' },
  older: {
    id: 'people.active.older',
    defaultMessage: 'Active over a month ago',
  },
  never: { id: 'people.active.never', defaultMessage: 'Never signed in' },
});

/**
 * When they were last here: the exact time for those who may read the
 * history, to the minute; roughly for everyone else.
 */
export function activeLabel(
  person: Pick<Person, 'active' | 'lastActiveAt'>,
  intl: IntlShape,
): string {
  if (person.lastActiveAt) {
    return intl.formatMessage(
      {
        id: 'people.active.at',
        defaultMessage: 'Active {when}',
      },
      {
        when: intl.formatDate(person.lastActiveAt, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }),
      },
    );
  }
  return intl.formatMessage(ACTIVE[person.active]);
}

/** The work phone and its extension, as one line; null when neither. */
export function phoneLine(person: Person, intl: IntlShape): string | null {
  if (!person.workPhone && !person.extension) return null;
  if (!person.extension) return person.workPhone;
  return intl.formatMessage(
    {
      id: 'people.phone.extension',
      defaultMessage: '{phone} ext. {extension}',
    },
    { phone: person.workPhone ?? '', extension: person.extension },
  );
}
