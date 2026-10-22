import { defineMessages, type IntlShape, useIntl } from 'react-intl';

import type { Role } from '../api/types.gen';
import { roleLabel } from '../members/role-names';

/** The words Settings → Roles and a role's page share (ADR-080). */
export const ROLE_WORDS = defineMessages({
  roles: { id: 'layout.menu.roles', defaultMessage: 'Roles' },
  builtIn: { id: 'roles.kind.builtIn', defaultMessage: 'Built in' },
  made: { id: 'roles.kind.made', defaultMessage: 'Made here' },
  makeRole: { id: 'roles.make', defaultMessage: 'Make a role' },
});

/**
 * A permission's line, quoted as each language quotes, where a sentence
 * names it: "Needs: “See purchase and sales orders”."
 */
export function useQuoted(): (line: string) => string {
  const intl = useIntl();
  return (line) =>
    intl.formatMessage(
      { id: 'roles.editor.quoted', defaultMessage: '“{line}”' },
      { line },
    );
}

/** "2 members", or "Nobody". */
export function heldByLabel(count: number, intl: IntlShape): string {
  return intl.formatMessage(
    {
      id: 'roles.heldBy.count',
      defaultMessage:
        '{count, plural, =0 {Nobody} one {# member} other {# members}}',
    },
    { count },
  );
}

/** Whether it is one of the app's three or the organization's own. */
export function kindLabel(role: Pick<Role, 'builtIn'>, intl: IntlShape) {
  return intl.formatMessage(
    role.builtIn ? ROLE_WORDS.builtIn : ROLE_WORDS.made,
  );
}

/**
 * A role's name for a person: a built-in one in their language, a made
 * one as its organization named it (ADR-054), in any language.
 */
export function nameOf(role: Pick<Role, 'name' | 'builtIn'>): string {
  return role.builtIn ? roleLabel(role.name) : role.name;
}
