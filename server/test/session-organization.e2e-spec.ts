import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';

import type { Env } from '../src/config/env';
import { issueOrganizationInvitation } from '../src/core/invitations/organization-invitations';
import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { sessions, users } from '../src/database/schema';
import {
  addMember,
  body,
  createE2eApp,
  invitationToken,
  PASSWORD,
  registerOrganization,
  roleIdNamed,
} from './utils/fixtures';
import { authedAgent } from './utils/request';
import { resetDatabase } from './utils/reset-db';

const SAM = 'sam@alpha.example.com';

type Agent = ReturnType<typeof authedAgent>;

interface Me {
  organization: { id: string; name: string } | null;
}

interface Joined {
  user: { organizationId: string };
}

/**
 * A session finds its organization again (#144, ADR-079): only its own
 * device moves a session's organization, so another device of the same
 * account kept one the account had left. The session middleware now
 * chooses again, as signing in does, whenever a session's organization is
 * none or no longer the account's.
 */
describe('A session finds its organization again (e2e)', () => {
  let app: INestApplication;
  let db: Database;
  let clientUrl: string;

  beforeAll(async () => {
    app = await createE2eApp();
    db = app.get<Database>(UNSAFE_GLOBAL_DB);
    clientUrl = app
      .get<ConfigService<Env, true>>(ConfigService)
      .get('CLIENT_URL', { infer: true });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  /**
   * A member of alpha signed in on two devices: A, where they accepted
   * their invitation, and B, signed in afterwards.
   */
  async function twoDevices() {
    const alpha = await registerOrganization(app, 'alpha');
    const a = await addMember(app, alpha, SAM, 'Viewer');
    const b = authedAgent(app);
    await b
      .post('/v1/auth/login')
      .send({ email: SAM, password: PASSWORD })
      .expect(200);

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, SAM));
    return { alpha, a, b, userId: user.id };
  }

  async function organizationOf(agent: Agent) {
    return body<Me>(await agent.get('/v1/auth/me').expect(200)).organization;
  }

  /** B names the organization, and both devices' sessions store it. */
  async function expectBothIn(b: Agent, userId: string, id: string) {
    expect((await organizationOf(b))?.id).toBe(id);

    const stored = await db
      .select({ currentOrgId: sessions.currentOrgId })
      .from(sessions)
      .where(eq(sessions.userId, userId));
    expect(stored).toEqual([{ currentOrgId: id }, { currentOrgId: id }]);
  }

  it('follows another device that left and started an organization', async () => {
    const { a, b, userId } = await twoDevices();
    await a.delete('/v1/account/membership').expect(204);
    expect(await organizationOf(b)).toBeNull();

    const started = body<Joined>(
      await a
        .post('/v1/organization')
        .send({ name: 'Reid Supply Co.' })
        .expect(201),
    ).user.organizationId;

    await expectBothIn(b, userId, started);
  });

  it('follows another device that left and accepted an organization invitation', async () => {
    const { a, b, userId } = await twoDevices();
    await a.delete('/v1/account/membership').expect(204);
    const issued = await issueOrganizationInvitation(
      db,
      { email: SAM, organizationName: 'Reid Supply Co.', locale: 'en' },
      clientUrl,
    );

    const accepted = body<Joined>(
      await a
        .post('/v1/invitations/accept')
        .send({ token: issued.token })
        .expect(200),
    ).user.organizationId;

    await expectBothIn(b, userId, accepted);
  });

  it('follows another device that left and accepted an invitation to join one', async () => {
    const { a, b, userId } = await twoDevices();
    await a.delete('/v1/account/membership').expect(204);
    const beta = await registerOrganization(app, 'beta');
    await db
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(users.id, beta.userId));
    await beta.agent
      .post('/v1/invitations')
      .send({
        email: SAM,
        roleId: await roleIdNamed(app, beta.organizationId, 'Viewer'),
      })
      .expect(201);

    await a
      .post('/v1/invitations/accept')
      .send({ token: invitationToken(app, SAM) })
      .expect(200);

    await expectBothIn(b, userId, beta.organizationId);
  });

  it('reads no organization once another device left, and joined none', async () => {
    const { a, b } = await twoDevices();

    await a.delete('/v1/account/membership').expect(204);

    expect(await organizationOf(b)).toBeNull();
    await b.get('/v1/users').expect(403);
  });

  it('gives a removed member no organization and no access on the next request', async () => {
    const { alpha, b, userId } = await twoDevices();

    await alpha.agent.delete(`/v1/users/${userId}`).expect(204);

    expect(await organizationOf(b)).toBeNull();
    await b.get('/v1/users').expect(403);
  });
});
