import type { Locale } from '../../common/locales';
import { translate } from '../../i18n/translate';
import { ROLE_NAMES } from '../audit/audit-fields';
import {
  SYSTEM_ROLE_DESCRIPTIONS,
  type SystemRole,
} from '../authorization/permissions';

/**
 * A role as an invitation says it (ADR-077): a system role's name and line
 * translated by key, as the table stores them in English; a role an
 * organization made, as it named and described it.
 */
export function roleWords(
  role: { name: string; description: string | null; isSystem: boolean },
  locale: Locale,
): { name: string; description: string | null } {
  if (role.isSystem && role.name in SYSTEM_ROLE_DESCRIPTIONS) {
    const system = role.name as SystemRole;
    return {
      name: translate(ROLE_NAMES[system], locale),
      description: translate(SYSTEM_ROLE_DESCRIPTIONS[system], locale),
    };
  }
  return { name: role.name, description: role.description };
}
