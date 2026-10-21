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

/**
 * Whether a role is the Owner, which stands alone (ADR-080): it already
 * holds everything, so whoever holds it holds nothing else. Built in and
 * named so, never the name alone. What anyone may give is the server's
 * `mayGive`, never this.
 */
export function isOwnerRole(role: { name: string; builtIn: boolean }): boolean {
  return role.builtIn && role.name === 'Owner';
}

/**
 * Whether the reader may give every one of these roles, as the roles list
 * says of each (ADR-080): so may they resend or revoke an invitation that
 * names them, or change or remove a member who holds them, the server's
 * own rule. A role the list lacks is one they may not.
 */
export function mayGiveAll(
  roles: readonly { id: string; mayGive: boolean }[],
  held: readonly { id: string }[],
): boolean {
  const giving = new Map(roles.map((role) => [role.id, role.mayGive]));
  return held.every((role) => giving.get(role.id) === true);
}

/**
 * The roles chosen once `id` is ticked or unticked (ADR-080). Owner
 * stands alone: ticking it clears the rest, and ticking another clears
 * it, since Owner already holds everything.
 */
export function toggled(
  roles: readonly { id: string; name: string; builtIn: boolean }[],
  chosen: readonly string[],
  id: string,
  on: boolean,
): string[] {
  if (!on) return chosen.filter((each) => each !== id);
  const role = roles.find((each) => each.id === id);
  if (role && isOwnerRole(role)) return [id];
  const owners = new Set(roles.filter(isOwnerRole).map((each) => each.id));
  return [...chosen.filter((each) => !owners.has(each) && each !== id), id];
}

export function roleLabel(name: string): string {
  return name in BUILT_IN
    ? intl().formatMessage(BUILT_IN[name as keyof typeof BUILT_IN])
    : name;
}

/**
 * A member's or an invitation's roles as the reader's language lists
 * them (ADR-080): "Warehouse and Sales", "Entrepôt et Ventes", "仓库和销售",
 * a built-in one in that language.
 */
export function roleList(roles: readonly { name: string }[]): string {
  return intl().formatList(
    roles.map((role) => roleLabel(role.name)),
    { type: 'conjunction' },
  );
}

/**
 * What a sentence naming these roles chooses its article by (ADR-080):
 * the built-in role it names alone, never its words; a made role, or
 * several, take none: "as an Admin", "as Warehouse lead".
 */
export function articleOf(roles: readonly { name: string }[]): string {
  return roles.length === 1 && roles[0].name in BUILT_IN
    ? roles[0].name
    : 'other';
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
