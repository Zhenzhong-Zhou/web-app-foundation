import { defineMessages } from 'react-intl';

import { intl } from '../i18n/intl';

/**
 * The built-in roles every organization starts with, stored under their
 * English names (server/src/core/authorization/permissions.ts). Shown in the
 * reader's language (ADR-054); a role an organization named itself is data
 * and shows as named.
 */
const BUILT_IN = defineMessages({
  Owner: { id: 'members.role.owner', defaultMessage: 'Owner' },
  Admin: { id: 'members.role.admin', defaultMessage: 'Admin' },
  Viewer: { id: 'members.role.viewer', defaultMessage: 'Viewer' },
});

export function roleLabel(name: string): string {
  return name in BUILT_IN
    ? intl().formatMessage(BUILT_IN[name as keyof typeof BUILT_IN])
    : name;
}

/**
 * What each built-in role lets a person do, in a line a newcomer
 * understands (ADR-077): the server's SYSTEM_ROLE_DESCRIPTIONS, said the
 * same way on the Invite dialog. A role an organization made has none.
 */
const DESCRIPTIONS = defineMessages({
  Owner: {
    id: 'members.role.owner.description',
    defaultMessage:
      'Everything, including costs, issuing invoices, settings and closing the organization.',
  },
  Admin: {
    id: 'members.role.admin.description',
    defaultMessage:
      'Day-to-day work: stock, orders, production and drafting invoices. Can invite and remove members.',
  },
  Viewer: {
    id: 'members.role.viewer.description',
    defaultMessage: 'Looks at orders, stock and invoices, and changes nothing.',
  },
});

export function roleDescription(name: string): string | null {
  return name in DESCRIPTIONS
    ? intl().formatMessage(DESCRIPTIONS[name as keyof typeof DESCRIPTIONS])
    : null;
}
