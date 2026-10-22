import type { INestApplicationContext } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import { AUDIT_ACTIONS } from '../core/audit/audit-actions';
import type { RequestContext } from '../core/auth/request-context';
import { nameRoles } from '../core/authorization/member-roles';
import {
  ROLE_TEMPLATES,
  SYSTEM_ROLES,
  type SystemRole,
} from '../core/authorization/permissions';
import { RolesService } from '../core/authorization/roles.service';
import type { WorkDetailsDto } from '../core/people/dto/work-details.dto';
import { WorkService } from '../core/people/work.service';
import { UsersService } from '../core/users/users.service';
import { translate } from '../i18n/translate';
import type { Database } from './database.module';
import { invitations, memberships, users } from './schema';
import type { Audited } from './seed-demo-audit';

/**
 * How long ago the demo's own organization was started, its Owner joining
 * with it (ADR-079): a while, so the demo reads as settled, with no welcome
 * for the Owner and nobody New but the new hire.
 */
export const FOUNDED_DAYS_AGO = 400;

/** That many days before now. */
export function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

/**
 * When an account's membership began, for its address confirmed at that
 * moment: an account the demo makes belongs to its one organization.
 */
export function startOf(userId: string) {
  return sql`(select m.created_at from memberships m where m.user_id = ${userId}::uuid)`;
}

/** Who the demo was registered as. */
export interface DemoOwner {
  userId: string;
  email: string;
  organizationId: string;
}

/** The colleagues, by the key their work is filed under. */
export type TeamKey =
  | 'anika'
  | 'daniel'
  | 'lijing'
  | 'marc'
  | 'jianguo'
  | 'sarah'
  | 'chloe'
  | 'tom'
  | 'fatima';

export type Team = Record<TeamKey, { id: string; email: string }>;

/**
 * The two roles the Owner made from templates (ADR-080), each held by one
 * of the team, with the line the Owner wrote for it.
 */
const MADE_ROLES = {
  warehouse: 'Receives and ships against orders, and moves stock. No prices.',
  sales: 'Looks after customers and raises their orders.',
} as const;

type MadeRole = keyof typeof MADE_ROLES;

interface Colleague {
  key: TeamKey;
  name: string;
  /** A built-in role, or one of the two the Owner made. */
  role: SystemRole | MadeRole;
  /** The role the Owner gave them later, so the log has a role change. */
  promotedTo?: SystemRole;
  details: WorkDetailsDto;
  /** Hours since they last did something here; null, never signed in. */
  lastActiveHoursAgo: number | null;
  /** Days since they joined, which People and the welcome go by. */
  joinedDaysAgo: number;
  /**
   * The note the Owner wrote inviting them, for the one who joined by an
   * invitation the welcome can show (ADR-077, ADR-079).
   */
  invitedWith?: string;
}

const OFFICE = '604-555-0142';

/**
 * A team of nine around the demo's Owner: every role, names in English,
 * French and Chinese (so initials show each script's rule, ADR-063), and
 * details at work filled in as people do, which is to say not all of them.
 *
 * Last active is spread so People shows every coarse value: the five who
 * work in seed-demo-team-work.ts today, Anika this week, Tom this month,
 * Chloé over a month ago, and Fatima, the new hire, never. It is set on
 * the membership directly: the app writes it when a request arrives
 * (ADR-063), and the seed makes none.
 *
 * Sarah joins as a Viewer and is promoted to Admin, so Members and the
 * audit log have a role change, from and to. Tom and Fatima hold the two
 * roles the Owner made from templates, Warehouse and Sales (ADR-080), so
 * Settings → Roles shows made roles held, and the new hire's welcome
 * names a made role.
 *
 * Each joined on a day of their own, months ago, so the demo reads as
 * settled: a membership begun when the seed runs would greet everyone with
 * a welcome and mark the whole team New (ADR-079). Fatima alone is new,
 * three days in, by the Owner's invitation with a note, so a demo still
 * shows a newcomer's welcome and People's New.
 */
const COLLEAGUES: Colleague[] = [
  {
    key: 'anika',
    name: 'Anika Sharma',
    role: SYSTEM_ROLES.OWNER,
    details: {
      jobTitle: 'Co-founder',
      department: 'Management',
      location: 'Main',
      workPhone: OFFICE,
      extension: '101',
    },
    lastActiveHoursAgo: 3 * 24,
    joinedDaysAgo: 395,
  },
  {
    key: 'daniel',
    name: 'Daniel Okafor',
    role: SYSTEM_ROLES.ADMIN,
    details: {
      jobTitle: 'Operations manager',
      department: 'Operations',
      location: 'Main',
      workPhone: OFFICE,
      extension: '110',
    },
    lastActiveHoursAgo: 0,
    joinedDaysAgo: 380,
  },
  {
    key: 'lijing',
    name: '李静',
    role: SYSTEM_ROLES.ADMIN,
    details: {
      jobTitle: 'Accountant',
      department: 'Finance',
      location: 'Main',
      workPhone: OFFICE,
      extension: '120',
    },
    lastActiveHoursAgo: 0,
    joinedDaysAgo: 350,
  },
  {
    key: 'marc',
    name: 'Marc-André Gagnon',
    role: SYSTEM_ROLES.ADMIN,
    details: {
      jobTitle: 'Production lead',
      department: 'Production',
      location: 'Blending room',
      extension: '130',
    },
    lastActiveHoursAgo: 0,
    joinedDaysAgo: 300,
  },
  {
    key: 'jianguo',
    name: '王建国',
    role: SYSTEM_ROLES.ADMIN,
    details: {
      jobTitle: 'Warehouse lead',
      department: 'Warehouse',
      location: 'Richmond warehouse',
      workPhone: '604-555-0187',
    },
    lastActiveHoursAgo: 0,
    joinedDaysAgo: 240,
  },
  {
    key: 'sarah',
    name: 'Sarah Chen',
    role: SYSTEM_ROLES.VIEWER,
    promotedTo: SYSTEM_ROLES.ADMIN,
    details: {
      jobTitle: 'Sales coordinator',
      department: 'Sales',
      location: 'Main',
      workPhone: OFFICE,
      extension: '150',
    },
    lastActiveHoursAgo: 0,
    joinedDaysAgo: 200,
  },
  {
    key: 'chloe',
    name: 'Chloé Tremblay',
    role: SYSTEM_ROLES.VIEWER,
    details: {
      jobTitle: 'Quality assurance',
      department: 'Quality',
      location: 'Main',
      extension: '160',
    },
    lastActiveHoursAgo: 40 * 24,
    joinedDaysAgo: 150,
  },
  {
    key: 'tom',
    name: 'Tom Becker',
    role: 'warehouse',
    details: { jobTitle: 'Warehouse associate', department: 'Warehouse' },
    lastActiveHoursAgo: 12 * 24,
    joinedDaysAgo: 90,
  },
  {
    // The new hire: nothing filled in, never signed in.
    key: 'fatima',
    name: 'Fatima Haddad',
    role: 'sales',
    details: {},
    lastActiveHoursAgo: null,
    joinedDaysAgo: 3,
    invitedWith:
      'Welcome, Fatima! Chloé will show you round on Monday morning. Until then, have a look through Products and the open orders.',
  },
];

/**
 * Adds the team through UsersService.create, each with the demo's password,
 * known on purpose: a person joins by invitation (ADR-077), but a demo's
 * colleagues are there to be signed into.
 *
 * Addresses are always at example.com, never the Owner's own domain:
 * seeding an existing account must not create accounts at a real one. The
 * organization's id makes them unique, so every run can add its own team.
 */
export async function addTeam(
  app: INestApplicationContext,
  db: Database,
  audited: Audited,
  owner: DemoOwner,
  password: string,
): Promise<Team> {
  const accounts = app.get(UsersService);
  const work = app.get(WorkService);
  const roles = app.get(RolesService);

  /**
   * The Owner's request context, for the services that read the caller
   * from one: this one has no session behind it.
   */
  const ownerContext: RequestContext = {
    sessionId: 'seed-demo',
    userId: owner.userId,
    email: owner.email,
    name: 'Demo Owner',
    organizationId: owner.organizationId,
    membershipId: await membershipOf(db, owner),
    timeZone: null,
    idleLimitMs: null,
  };

  const roleRows = await roles.list({ held: new Set(), locale: 'en' });
  const made = await makeRoles(audited, roles, ownerContext, roleRows);
  const roleId = (role: SystemRole | MadeRole) => {
    if (role in made) return made[role as MadeRole];
    const row = roleRows.find((each) => each.builtIn && each.name === role);
    if (!row) throw new Error(`The organization has no ${role} role`);
    return row.id;
  };

  const suffix = owner.organizationId.slice(-8);
  const team = {} as Team;

  for (const colleague of COLLEAGUES) {
    const email = `${colleague.key}.${suffix}@example.com`;
    const member = await audited(
      owner.userId,
      {
        action: AUDIT_ACTIONS.USER_CREATED,
        type: 'user',
        id: (created) => created.id,
      },
      () =>
        accounts.create({
          email,
          name: colleague.name,
          password,
          roleId: roleId(colleague.role),
        }),
    );
    team[colleague.key] = { id: member.id, email };

    // Joined on their own day, and last active as set above.
    const joinedAt = daysAgo(colleague.joinedDaysAgo);
    const hours = colleague.lastActiveHoursAgo;
    const [membership] = await db
      .update(memberships)
      .set({
        createdAt: joinedAt,
        lastActiveAt:
          hours === null ? null : new Date(Date.now() - hours * 3_600_000),
      })
      .where(
        and(
          eq(memberships.userId, member.id),
          eq(memberships.organizationId, owner.organizationId),
        ),
      )
      .returning({ id: memberships.id });

    // Verified, as the Owner is: nobody reads these inboxes (ADR-077).
    // From the start, as their membership began (ADR-079).
    await db
      .update(users)
      .set({ emailVerifiedAt: startOf(member.id) })
      .where(eq(users.id, member.id));

    // The invitation behind the new hire's membership, emailed the day
    // before she accepted it, as accepting leaves it (ADR-077): the
    // welcome reads the Owner's note from it.
    if (colleague.invitedWith) {
      const sentAt = daysAgo(colleague.joinedDaysAgo + 1);
      const [invitation] = await db
        .insert(invitations)
        .values({
          organizationId: owner.organizationId,
          email,
          locale: 'en',
          note: colleague.invitedWith,
          invitedBy: owner.userId,
          link: 'emailed',
          expiresAt: daysAgo(colleague.joinedDaysAgo + 1 - 7),
          membershipId: membership.id,
          acceptedAt: joinedAt,
          createdAt: sentAt,
          updatedAt: joinedAt,
        })
        .returning({ id: invitations.id });
      await nameRoles(
        db,
        { id: invitation.id, organizationId: owner.organizationId },
        [roleId(colleague.role)],
      );
    }

    // Their own details, as each would set them on Account; not audited,
    // as a change to one's own membership never is (ADR-063).
    await work.updateDetails(member.id, colleague.details);
  }

  // The Owner's own details, only where none are set: an existing
  // account's real ones survive.
  const own = await work.details(owner.userId);
  if (own && Object.values(own).every((value) => value === null)) {
    await work.updateDetails(owner.userId, {
      jobTitle: 'General manager',
      department: 'Management',
      location: 'Main',
      workPhone: OFFICE,
      extension: '100',
    });
  }

  // Sarah took on the sales desk, so the Owner made her an Admin.
  for (const colleague of COLLEAGUES) {
    if (!colleague.promotedTo) continue;
    const { id } = team[colleague.key];
    const promoted = [roleId(colleague.promotedTo)];
    await audited(
      owner.userId,
      {
        action: AUDIT_ACTIONS.MEMBER_ROLES_CHANGED,
        type: 'user',
        id,
        body: { roleIds: promoted },
        fields: ['roleIds'],
      },
      () => accounts.updateRoles(ownerContext, id, promoted),
    );
  }

  return team;
}

/**
 * Warehouse and Sales, made by the Owner from their templates and named
 * as the templates are in English, or the organization's own of those
 * names when it has them already.
 */
async function makeRoles(
  audited: Audited,
  roles: RolesService,
  owner: RequestContext,
  existing: { id: string; name: string }[],
): Promise<Record<MadeRole, string>> {
  const made = {} as Record<MadeRole, string>;
  for (const [key, description] of Object.entries(MADE_ROLES) as [
    MadeRole,
    string,
  ][]) {
    const name = translate(ROLE_TEMPLATES[key].name, 'en');
    const found = existing.find(
      (role) => role.name.toLowerCase() === name.toLowerCase(),
    );
    const body = {
      name,
      description,
      permissions: [...ROLE_TEMPLATES[key].permissions],
    };
    made[key] =
      found?.id ??
      (await audited(
        owner.userId,
        {
          action: AUDIT_ACTIONS.ROLE_CREATED,
          type: 'role',
          id: (id) => id,
          body,
          fields: ['name', 'description'],
        },
        () => roles.create(body, owner),
      ));
  }
  return made;
}

/** The Owner's membership, which their request context carries (ADR-080). */
async function membershipOf(db: Database, owner: DemoOwner): Promise<string> {
  const [row] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, owner.userId),
        eq(memberships.organizationId, owner.organizationId),
      ),
    );
  return row.id;
}

/** For the seed's last log line: who can sign in, and as what. */
export function describeTeam(team: Team, password: string): string {
  const lines = COLLEAGUES.map(
    (colleague) =>
      `  ${colleague.name} (${roleNameOf(colleague.promotedTo ?? colleague.role)}): ${team[colleague.key].email}`,
  );
  return [`Team, each with password ${password}:`, ...lines].join('\n');
}

/** A colleague's role as the log line names it. */
function roleNameOf(role: SystemRole | MadeRole): string {
  return role in MADE_ROLES
    ? translate(ROLE_TEMPLATES[role as MadeRole].name, 'en')
    : role;
}
