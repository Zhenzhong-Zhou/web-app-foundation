import { defineMessages, type IntlShape } from 'react-intl';

import type { Person } from '../api/types.gen';

/**
 * The organization's people, generated from the server's OpenAPI document
 * (ADR-068): the directory's Person, and the PersonDetail one person's
 * page reads, with their recent activity for those who may see it.
 */
export type { Person, PersonDetail } from '../api/types.gen';

/** How recently someone was here, as everyone sees it (ADR-063). */
export type ActiveSince = Person['active'];

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
