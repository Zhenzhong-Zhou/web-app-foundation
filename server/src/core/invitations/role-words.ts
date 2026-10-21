import type { Locale } from '../../common/locales';
import { type Translatable, translate } from '../../i18n/translate';
import { ROLE_NAMES } from '../audit/audit-fields';
import {
  SYSTEM_ROLE_DESCRIPTIONS,
  type SystemRole,
} from '../authorization/permissions';

/** A built-in role, by its stored name; null for one an organization made. */
function systemRoleOf(role: {
  name: string;
  isSystem: boolean;
}): SystemRole | null {
  return role.isSystem && role.name in SYSTEM_ROLE_DESCRIPTIONS
    ? (role.name as SystemRole)
    : null;
}

/**
 * A role's name for a message stored to be read later in its reader's
 * language, as a notification's is (ADR-036): a system role's as a message
 * of its own, a role an organization named as named.
 */
export function roleName(role: {
  name: string;
  isSystem: boolean;
}): Translatable | string {
  const system = systemRoleOf(role);
  return system ? ROLE_NAMES[system] : role.name;
}

/**
 * A role as an invitation says it (ADR-077): a system role's name and line
 * translated by key, as the table stores them in English; a role an
 * organization made, as it named and described it.
 */
export function roleWords(
  role: { name: string; description: string | null; isSystem: boolean },
  locale: Locale,
): { name: string; description: string | null } {
  const system = systemRoleOf(role);
  if (system) {
    return {
      name: translate(ROLE_NAMES[system], locale),
      description: translate(SYSTEM_ROLE_DESCRIPTIONS[system], locale),
    };
  }
  return { name: role.name, description: role.description };
}
