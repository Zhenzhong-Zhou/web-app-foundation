import { sql } from 'drizzle-orm';

import type { RequestContext } from '../../core/auth/request-context';
import { giveRoles, nameRoles } from '../../core/authorization/member-roles';
import {
  NEVER_OFFERED,
  type Permission,
  ROLE_TEMPLATES,
  type RoleTemplateKey,
  SYSTEM_ROLE_PERMISSIONS,
  SYSTEM_ROLES,
  type SystemRole,
} from '../../core/authorization/permissions';
import type { RolesService } from '../../core/authorization/roles.service';
import type { Database } from '../database.module';
import { invitations, memberships, users } from '../schema';
import type { Random } from './random';
import type { Volume } from './scale';

/**
 * The team, as the manifest records it for each organization: its made
 * roles and invitations pending, counted, and the membership perf:plans
 * times the access query for.
 */
export interface TeamAnchors {
  madeRoles: number;
  pendingInvitations: number;
  /** A member holding three made roles: the access query's case (ADR-081). */
  threeRoleMembershipId: string;
}

/** The Owner who made the roles and sent the invitations. */
interface Owner {
  email: string;
  userId: string;
  organizationId: string;
}

/**
 * A role an Owner made (ADR-080): where the editor started it, a template
 * or a copy of a built-in role, and what they ticked and unticked after.
 */
interface MadeRole {
  name: string;
  description: string;
  from: RoleTemplateKey | SystemRole;
  add?: readonly Permission[];
  remove?: readonly Permission[];
}

/**
 * The roles a firm makes, as it would name them, in the order it makes
 * them: each scale takes as many as its table says, so small has a
 * template as it comes, one with a box ticked, one with a few unticked,
 * and a copy of Admin. A test holds every one to ADR-080's rules, which
 * RolesService.create refuses otherwise.
 */
export const MADE_ROLES: readonly MadeRole[] = [
  {
    name: 'Warehouse lead',
    description:
      'Runs the dock: receives and ships against orders, moves stock and corrects counts. No prices.',
    from: 'warehouse',
    add: ['stock.adjust'],
  },
  {
    name: 'Sales, Montreal',
    description: 'Looks after customers in Quebec and raises their orders.',
    from: 'sales',
  },
  {
    name: 'Bookkeeper',
    description:
      'Drafts and checks invoices; issuing them and setting costs stay with the Owners.',
    from: 'finance',
    remove: [
      'invoices.issue',
      'costs.update',
      'tax_codes.create',
      'tax_codes.update',
    ],
  },
  {
    name: 'Office manager',
    description: 'Runs the office: people, partners, orders and invoices.',
    from: SYSTEM_ROLES.ADMIN,
    remove: [
      'stock.adjust',
      'production.create',
      'production.release',
      'production.complete',
    ],
  },
  {
    name: 'Production, day shift',
    description: 'Plans, releases and completes runs, and keeps the recipes.',
    from: 'production',
  },
  {
    name: 'Production, night shift',
    description: 'Releases and completes the runs the day shift planned.',
    from: 'production',
    remove: ['boms.create', 'boms.update', 'production.create'],
  },
  {
    name: 'Sales, Toronto',
    description: 'Looks after customers in Ontario and raises their orders.',
    from: 'sales',
  },
  {
    name: 'Customer service',
    description: 'Answers customers, changes their orders and handles returns.',
    from: 'sales',
    add: ['return_authorizations.update'],
    remove: ['orders.create', 'partners.create'],
  },
  {
    name: 'Seasonal help',
    description: 'Looks up what is on hand and where, for the busy season.',
    from: 'stock_lookup',
  },
  {
    name: 'Quality assurance',
    description: 'Reads products, licences, stock and runs. No prices.',
    from: SYSTEM_ROLES.VIEWER,
    remove: ['orders.view_prices', 'invoices.view'],
  },
  {
    name: 'Controller',
    description:
      'Everything but the organization’s settings: costs, prices, invoices and the audit log.',
    from: SYSTEM_ROLES.OWNER,
    remove: [
      'organizations.update',
      'organizations.export',
      'production.override_licence',
    ],
  },
  {
    name: 'Operations, Laval',
    description: 'Runs the Laval site day to day, without managing people.',
    from: SYSTEM_ROLES.ADMIN,
    remove: ['users.create', 'users.delete', 'roles.assign', 'audit.view'],
  },
];

/**
 * What a made role grants, as the editor would send it: where it started,
 * a copy holding only what the editor offers, with its boxes ticked and
 * unticked.
 */
export function permissionsOf(role: MadeRole): Permission[] {
  const start =
    role.from in ROLE_TEMPLATES
      ? ROLE_TEMPLATES[role.from as RoleTemplateKey].permissions
      : SYSTEM_ROLE_PERMISSIONS[role.from as SystemRole].filter(
          (key) => !NEVER_OFFERED.includes(key),
        );
  const granted = new Set([...start, ...(role.add ?? [])]);
  for (const key of role.remove ?? []) granted.delete(key);
  return [...granted];
}

/** Of the team, the shares holding Admin, three roles and two; the rest one. */
const ADMIN_SHARE = 0.04;
const THREE_ROLE_SHARE = 0.1;
const TWO_ROLE_SHARE = 0.3;
/** Invitations pending, as a share of the members. */
const INVITATION_SHARE = 0.05;

const FIRST_NAMES = [
  'Anika',
  'Daniel',
  'Émilie',
  'Fatima',
  'Grace',
  'Hugo',
  'Jasper',
  'Leila',
  'Marc-André',
  'Mateo',
  'Maya',
  'Nadia',
  'Noah',
  'Olivia',
  'Owen',
  'Priya',
];
const LAST_NAMES = [
  'Becker',
  'Bouchard',
  'Chen',
  'Côté',
  'Fraser',
  'Gagnon',
  'Haddad',
  'Kowalski',
  'Nguyen',
  'Okafor',
  'Patel',
  'Rossi',
  'Sharma',
  'Singh',
  'Tremblay',
  'Wilson',
];
const CHINESE_SURNAMES = ['王', '李', '张', '刘', '陈', '杨', '黄', '赵'];
const CHINESE_GIVEN = ['静', '伟', '芳', '磊', '婷', '建国', '晓明', '丽华'];

/**
 * One organization's team (ADR-081, catching up with ADR-080): the roles
 * its Owner made, through RolesService as the editor's save goes, then
 * the members, each a confirmed account holding one to three roles, and a
 * few invitations pending that name made roles. Among the members, a
 * second Owner, holding Owner alone, and a few Admins.
 *
 * The Owner registered with the organization and the newcomer joins after
 * the team, so the team is the scale table's members less those two.
 * Members and invitations are written as joining and inviting leave them,
 * through giveRoles and nameRoles, rather than through the links, which
 * are not what perf measures. Run inside the organization's tenant
 * context, which RolesService reads.
 */
export async function writeTeam(
  roles: RolesService,
  db: Database,
  volume: Volume,
  random: Random,
  owner: Owner,
  passwordHash: string,
): Promise<TeamAnchors> {
  if (volume.madeRoles > MADE_ROLES.length) {
    throw new Error(`Only ${MADE_ROLES.length} made roles are written down`);
  }

  // Who made each role, as create reads its caller.
  const context: RequestContext = {
    sessionId: 'seed-volume',
    userId: owner.userId,
    email: owner.email,
    name: 'Volume Owner',
    organizationId: owner.organizationId,
    membershipId: null,
    timeZone: null,
    idleLimitMs: null,
  };
  const made: string[] = [];
  for (const role of MADE_ROLES.slice(0, volume.madeRoles)) {
    made.push(
      await roles.create(
        {
          name: role.name,
          description: role.description,
          permissions: permissionsOf(role),
        },
        context,
      ),
    );
  }

  const builtIn = await roles.list({ held: new Set(), locale: 'en' });
  const builtInId = (name: SystemRole) =>
    builtIn.find((role) => role.builtIn && role.name === name)!.id;

  const colleagues = volume.members - 2;
  const admins = Math.max(2, Math.round(colleagues * ADMIN_SHARE));
  const threes = Math.round(colleagues * THREE_ROLE_SHARE);
  const twos = Math.round(colleagues * TWO_ROLE_SHARE);
  const ones = colleagues - 1 - admins - threes - twos;

  // About 60 % holding one role, 30 % two and 10 % three, the second
  // Owner and the Admins holding theirs alone; joined in no order of role.
  const holdings = random.sample(
    [
      [builtInId(SYSTEM_ROLES.OWNER)],
      ...Array.from({ length: admins }, () => [builtInId(SYSTEM_ROLES.ADMIN)]),
      ...[
        ...Array<number>(threes).fill(3),
        ...Array<number>(twos).fill(2),
        ...Array<number>(ones).fill(1),
      ].map((count) => random.sample(made, count)),
    ],
    colleagues,
  );

  const [local, domain] = owner.email.split('@');
  const numbered = (kind: string, n: number) =>
    `${local}-${kind}-${String(n).padStart(3, '0')}@${domain}`;

  return db.transaction(async (tx) => {
    let threeRoleMembershipId: string | undefined;

    for (const [index, roleIds] of holdings.entries()) {
      const [user] = await tx
        .insert(users)
        .values({
          email: numbered('member', index + 1),
          name: nameOf(random),
          passwordHash,
          emailVerifiedAt: sql`now()`,
        })
        .returning({ id: users.id });
      const [membership] = await tx
        .insert(memberships)
        .values({ userId: user.id, organizationId: owner.organizationId })
        .returning({ id: memberships.id });
      await giveRoles(
        tx,
        { id: membership.id, organizationId: owner.organizationId },
        roleIds,
      );
      if (roleIds.length === 3) threeRoleMembershipId ??= membership.id;
    }

    if (!threeRoleMembershipId) {
      throw new Error('No member holds three made roles');
    }

    const pending = Math.round(volume.members * INVITATION_SHARE);
    for (let n = 1; n <= pending; n++) {
      const [invitation] = await tx
        .insert(invitations)
        .values({
          organizationId: owner.organizationId,
          email: numbered('invited', n),
          locale: 'en',
          invitedBy: owner.userId,
          link: 'emailed',
          expiresAt: sql`now() + interval '7 days'`,
        })
        .returning({ id: invitations.id });
      await nameRoles(
        tx,
        { id: invitation.id, organizationId: owner.organizationId },
        random.sample(made, random.int(1, 2)),
      );
    }

    return {
      madeRoles: made.length,
      pendingInvitations: pending,
      threeRoleMembershipId,
    };
  });
}

/** A name as the demo's team has them: English, French and Chinese. */
function nameOf(random: Random): string {
  return random.chance(0.2)
    ? `${random.pick(CHINESE_SURNAMES)}${random.pick(CHINESE_GIVEN)}`
    : `${random.pick(FIRST_NAMES)} ${random.pick(LAST_NAMES)}`;
}
