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
