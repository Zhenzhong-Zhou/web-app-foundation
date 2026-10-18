import type { INestApplicationContext } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { AUDIT_ACTIONS } from '../core/audit/audit-actions';
import type { RequestContext } from '../core/auth/request-context';
import {
  SYSTEM_ROLES,
  type SystemRole,
} from '../core/authorization/permissions';
import { RolesService } from '../core/authorization/roles.service';
import type { WorkDetailsDto } from '../core/people/dto/work-details.dto';
import { WorkService } from '../core/people/work.service';
import { UsersService } from '../core/users/users.service';
import type { Database } from './database.module';
import { memberships } from './schema';
import type { Audited } from './seed-demo-audit';

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

interface Colleague {
  key: TeamKey;
  name: string;
  role: SystemRole;
  /** The role the Owner gave them later, so the log has a role change. */
  promotedTo?: SystemRole;
  details: WorkDetailsDto;
  /** Hours since they last did something here; null, never signed in. */
  lastActiveHoursAgo: number | null;
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
 * audit log have a role change, from and to.
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
  },
  {
    key: 'tom',
    name: 'Tom Becker',
    role: SYSTEM_ROLES.VIEWER,
    details: { jobTitle: 'Warehouse associate', department: 'Warehouse' },
    lastActiveHoursAgo: 12 * 24,
  },
  {
    // The new hire: nothing filled in, never signed in.
    key: 'fatima',
    name: 'Fatima Haddad',
    role: SYSTEM_ROLES.VIEWER,
    details: {},
    lastActiveHoursAgo: null,
  },
];

/**
 * Adds the team through UsersService.create, as an Owner does on Members
 * (ADR-006: no invitations yet), each with the demo's password.
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
  const users = app.get(UsersService);
  const work = app.get(WorkService);

  const roleRows = await app.get(RolesService).listForOrganization();
  const roleId = (name: SystemRole) => {
    const role = roleRows.find((row) => row.name === name);
    if (!role) throw new Error(`The organization has no ${name} role`);
    return role.id;
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
        users.create({
          email,
          name: colleague.name,
          password,
          roleId: roleId(colleague.role),
        }),
    );
    team[colleague.key] = { id: member.id, email };

    // Their own details, as each would set them on Account; not audited,
    // as a change to one's own membership never is (ADR-063).
    await work.updateDetails(member.id, colleague.details);

    const hours = colleague.lastActiveHoursAgo;
    await db
      .update(memberships)
      .set({
        lastActiveAt:
          hours === null ? null : new Date(Date.now() - hours * 3_600_000),
      })
      .where(
        and(
          eq(memberships.userId, member.id),
          eq(memberships.organizationId, owner.organizationId),
        ),
      );
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

  /**
   * Sarah took on the sales desk, so the Owner made her an Admin. Through
   * updateRole, which reads the caller from a request context: this one is
   * the Owner's, with no session behind it.
   */
  const ownerContext: RequestContext = {
    sessionId: 'seed-demo',
    userId: owner.userId,
    email: owner.email,
    name: 'Demo Owner',
    organizationId: owner.organizationId,
    roleId: roleId(SYSTEM_ROLES.OWNER),
    timeZone: null,
    idleLimitMs: null,
  };
  for (const colleague of COLLEAGUES) {
    if (!colleague.promotedTo) continue;
    const { id } = team[colleague.key];
    const promoted = roleId(colleague.promotedTo);
    await audited(
      owner.userId,
      {
        action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
        type: 'user',
        id,
        body: { roleId: promoted },
        fields: ['roleId'],
      },
      () => users.updateRole(ownerContext, id, promoted),
    );
  }

  return team;
}

/** For the seed's last log line: who can sign in, and as what. */
export function describeTeam(team: Team, password: string): string {
  const lines = COLLEAGUES.map(
    (colleague) =>
      `  ${colleague.name} (${colleague.promotedTo ?? colleague.role}): ${team[colleague.key].email}`,
  );
  return [`Team, each with password ${password}:`, ...lines].join('\n');
}
