import type { INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { and, eq } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../../src/database/database.module';
import { roles } from '../../src/database/schema';
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
 * A member the Owner has added with one of the system roles, signed in: who a
 * spec acts as to show what that role may and may not do.
 */
export async function addMember(
  app: INestApplication,
  owner: Awaited<ReturnType<typeof registerOrganization>>,
  email: string,
  roleName: string,
) {
  await owner.agent
    .post('/v1/users')
    .send({
      email,
      name: roleName,
      password: PASSWORD,
      roleId: await roleIdNamed(app, owner.organizationId, roleName),
    })
    .expect(201);

  const member = authedAgent(app);
  await member
    .post('/v1/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);
  return member;
}

/** The member most permission tests act as: reads allowed, writes refused. */
export function addViewer(
  app: INestApplication,
  owner: Awaited<ReturnType<typeof registerOrganization>>,
  email: string,
) {
  return addMember(app, owner, email, 'Viewer');
}
