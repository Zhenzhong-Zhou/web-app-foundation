import type { INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import { giveRoles } from '../../src/core/authorization/member-roles';
import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../../src/database/database.module';
import {
  membershipRoles,
  memberships,
  permissions,
  rolePermissions,
  roles,
  users,
} from '../../src/database/schema';
import { MailService } from '../../src/shared/mail/mail.service';
import {
  createTestApp,
  seedPermissions,
  unlimitedThrottler,
} from './create-test-app';
import { RecordingMailService } from './recording-mail';
import { authedAgent } from './request';

/**
 * The password every spec's Owner signs up with. Long enough for the policy,
 * and one value, so a spec that signs in again does not have to find it.
 */
export const PASSWORD = 'correct-horse-battery';

/** A response body as the shape the test expects; supertest types it any. */
export function body<T>(res: { body: unknown }): T {
  return res.body as T;
}

/** A YYYY-MM-DD day as an English email names it, unconverted. */
export function longDay(day: string): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));
}

/**
 * The app a feature spec runs against, with permissions seeded.
 *
 * Throttling is off because every test registers, and registration is
 * limited to five a minute; the limit keeps its own coverage in
 * security.e2e-spec.ts. Mail is recorded rather than sent — pass the
 * recorder in when the spec reads what was sent.
 */
export async function createE2eApp(
  mail: RecordingMailService = new RecordingMailService(),
): Promise<INestApplication> {
  const app = await createTestApp((builder) =>
    builder
      .overrideProvider(ThrottlerStorage)
      .useValue(unlimitedThrottler)
      .overrideProvider(MailService)
      .useValue(mail),
  );

  await seedPermissions(app);

  return app;
}

interface Registered {
  user: { id: string; organizationId: string };
}

/**
 * A new organization with its Owner signed in on the returned agent.
 *
 * `slugish` names both, as every spec already did: owner@alpha.example.com
 * of "alpha Co". Tests assert on that email, so the pattern is part of the
 * contract rather than a detail.
 */
export async function registerOrganization(
  app: INestApplication,
  slugish: string,
  options: { userAgent?: string } = {},
) {
  const agent = authedAgent(app);
  const email = `owner@${slugish}.example.com`;

  let request = agent.post('/v1/auth/register');
  if (options.userAgent) request = request.set('User-Agent', options.userAgent);

  const res = await request
    .send({
      email,
      password: PASSWORD,
      name: 'Owner',
      organizationName: `${slugish} Co`,
    })
    .expect(201);

  const { user } = body<Registered>(res);

  return { agent, email, userId: user.id, organizationId: user.organizationId };
}

type Agent = ReturnType<typeof authedAgent>;

/**
 * Catalogue records a test needs as setting, not as subject: post exactly
 * the payload given and hand back the new id. The payload stays with the
 * spec, because it is the spec's test data — a material or a good, lot
 * tracked or not — and a default chosen here would quietly change what a
 * test is about. What was repeated is the ceremony of posting and reading
 * the id back.
 */
export async function createPartner(
  agent: Agent,
  payload: Record<string, unknown>,
): Promise<string> {
  const res = await agent.post('/v1/partners').send(payload).expect(201);
  return body<{ partner: { id: string } }>(res).partner.id;
}

/** A location, as `createPartner`. */
export async function createLocation(
  agent: Agent,
  payload: Record<string, unknown>,
): Promise<string> {
  const res = await agent.post('/v1/locations').send(payload).expect(201);
  return body<{ location: { id: string } }>(res).location.id;
}

/** A product with its one variant, returning the variant's id. */
export async function createVariant(
  agent: Agent,
  payload: Record<string, unknown>,
): Promise<string> {
  const res = await agent.post('/v1/products').send(payload).expect(201);
  return body<{ product: { variants: { id: string }[] } }>(res).product
    .variants[0].id;
}

/** A system role's id in one organization, by name: Owner, Admin, Viewer. */
export async function roleIdNamed(
  app: INestApplication,
  organizationId: string,
  name: string,
): Promise<string> {
  const db = app.get<Database>(UNSAFE_GLOBAL_DB);
  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.organizationId, organizationId), eq(roles.name, name)));

  return role.id;
}

/**
 * A role of the organization's own, holding exactly these permissions.
 * Inserted directly, since no route makes a role: a spec that needs one
 * tests what it allows, not how it was made.
 */
export async function customRole(
  app: INestApplication,
  organizationId: string,
  name: string,
  keys: readonly string[],
): Promise<string> {
  const db = app.get<Database>(UNSAFE_GLOBAL_DB);
  const [role] = await db
    .insert(roles)
    .values({ organizationId, name, isSystem: false })
    .returning({ id: roles.id });
  const rows = await db
    .select({ id: permissions.id })
    .from(permissions)
    .where(inArray(permissions.key, [...keys]));
  await db
    .insert(rolePermissions)
    .values(rows.map((row) => ({ roleId: role.id, permissionId: row.id })));
  return role.id;
}

/**
 * A membership with one role, inserted directly: a member no invitation
 * made, as the demo seed adds them, or one in a second organization.
 */
export async function insertMember(
  app: INestApplication,
  member: { userId: string; organizationId: string; roleId: string },
): Promise<string> {
  const db = app.get<Database>(UNSAFE_GLOBAL_DB);
  const [membership] = await db
    .insert(memberships)
    .values({ userId: member.userId, organizationId: member.organizationId })
    .returning({ id: memberships.id });
  await giveRoles(
    db,
    { id: membership.id, organizationId: member.organizationId },
    [member.roleId],
  );
  return membership.id;
}

/** The ids of the roles a person holds, in every organization they are in. */
export async function roleIdsOf(
  app: INestApplication,
  userId: string,
): Promise<string[]> {
  const rows = await app
    .get<Database>(UNSAFE_GLOBAL_DB)
    .select({ id: membershipRoles.roleId })
    .from(membershipRoles)
    .innerJoin(memberships, eq(memberships.id, membershipRoles.membershipId))
    .where(eq(memberships.userId, userId));
  return rows.map((row) => row.id);
}

/** Who invites, signed in on the agent, and where to. */
interface Inviter {
  agent: Agent;
  organizationId: string;
}

/**
 * A member the Owner has invited with one of the organization's roles, who
 * accepted and is signed in: who a spec acts as to show what that role may
 * and may not do. Through invitations, as a person joins (ADR-077): the
 * Owner's address verified first, as inviting needs, then the link read
 * back from the email that carried it.
 */
export async function addMember(
  app: INestApplication,
  owner: Inviter,
  email: string,
  roleName: string,
) {
  const { user } = body<{ user: { id: string } }>(
    await owner.agent.get('/v1/auth/me').expect(200),
  );
  await app
    .get<Database>(UNSAFE_GLOBAL_DB)
    .update(users)
    .set({ emailVerifiedAt: new Date() })
    .where(and(eq(users.id, user.id), isNull(users.emailVerifiedAt)));

  await owner.agent
    .post('/v1/invitations')
    .send({
      email,
      roleIds: [await roleIdNamed(app, owner.organizationId, roleName)],
    })
    .expect(201);

  const member = authedAgent(app);
  await member
    .post('/v1/invitations/accept')
    .send({
      token: invitationToken(app, email),
      name: roleName,
      password: PASSWORD,
    })
    .expect(200);
  return member;
}

/**
 * The token in the latest invitation emailed to an address, as the person
 * would follow it. Needs the recording mail service createE2eApp installs.
 */
export function invitationToken(app: INestApplication, email: string): string {
  const mail = app.get<RecordingMailService>(MailService).lastTo(email);
  const token = /\/invitation\?token=([\w-]+)/.exec(mail?.text ?? '')?.[1];
  if (!token) throw new Error(`No invitation emailed to ${email}`);
  return token;
}

/** The member most permission tests act as: reads allowed, writes refused. */
export function addViewer(
  app: INestApplication,
  owner: Inviter,
  email: string,
) {
  return addMember(app, owner, email, 'Viewer');
}
