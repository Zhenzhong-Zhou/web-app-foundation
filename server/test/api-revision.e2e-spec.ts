import { type INestApplication, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import request from 'supertest';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { memberships } from '../src/database/schema';
import { httpServer } from './utils/create-test-app';
import { body, createE2eApp, registerOrganization } from './utils/fixtures';
import { resetDatabase } from './utils/reset-db';

// The real revision starts at 1, below which no revision is refused; at 3,
// one below and one above are both there to send.
vi.mock('../src/common/api-revision', () => ({ API_REVISION: 3 }));

interface Refusal {
  code?: string;
  message: string;
  requestId: string;
}

const OUTDATED = {
  en: 'This tab is running an older version of the app, so nothing was saved. Copy anything you typed, then reload.',
  'fr-CA':
    'Cet onglet utilise une ancienne version de l’application, donc rien n’a été enregistré. Copiez ce que vous avez saisi, puis rechargez.',
  'zh-Hans':
    '此标签页运行的是旧版本的应用，因此没有保存任何内容。请先复制您输入的内容，再重新加载。',
};

/**
 * The API revision (ADR-081). The app's own client sends the revision it was
 * built for, and the server compares it before anything else: an older one
 * is refused before the session is read or the body validated, a newer one
 * is told to wait, and a request without one is served as it always was.
 * Sign-out is served whatever the revision.
 */
describe('API revision (e2e)', () => {
  let app: INestApplication;
  let db: Database;

  beforeAll(async () => {
    app = await createE2eApp();
    db = app.get<Database>(UNSAFE_GLOBAL_DB);
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves a request without the header, with the same revision, or with anything but a positive whole number', async () => {
    const { agent } = await registerOrganization(app, 'alpha');

    await agent.get('/v1/users').expect(200);
    for (const sent of ['3', '0', '-2', '2.5', 'two', '']) {
      await agent.get('/v1/users').set('X-Api-Revision', sent).expect(200);
    }
  });

  it('refuses a lower revision with client_outdated, in the reader’s language', async () => {
    const { agent } = await registerOrganization(app, 'alpha');

    for (const [language, message] of Object.entries(OUTDATED)) {
      const res = await agent
        .get('/v1/users')
        .set('X-Api-Revision', '2')
        .set('Accept-Language', language)
        .expect(409);
      expect(body<Refusal>(res)).toMatchObject({
        code: 'client_outdated',
        message,
      });
    }
  });

  it('refuses before the body is validated: an old tab’s roleId gets the 409, not a 400', async () => {
    const { agent, userId } = await registerOrganization(app, 'alpha');
    // What a tab open across ADR-080's deploy sent.
    const oldTab = { roleId: '01920000-0000-7000-8000-000000000000' };

    await agent.patch(`/v1/users/${userId}`).send(oldTab).expect(400);

    const res = await agent
      .patch(`/v1/users/${userId}`)
      .set('X-Api-Revision', '2')
      .send(oldTab)
      .expect(409);
    expect(body<Refusal>(res).code).toBe('client_outdated');

    // A body that is not JSON at all is the body parser's, before anything
    // else, as it always was.
    await agent
      .patch(`/v1/users/${userId}`)
      .set('X-Api-Revision', '2')
      .set('Content-Type', 'application/json')
      .send('{"roleId":')
      .expect(400);
  });

  it('refuses before the session is read: no 401 without a cookie, and nothing moved with one', async () => {
    await request(httpServer(app)).get('/v1/users').expect(401);
    const anonymous = await request(httpServer(app))
      .get('/v1/users')
      .set('X-Api-Revision', '2')
      .expect(409);
    expect(body<Refusal>(anonymous).code).toBe('client_outdated');

    // Reading the session marks the member active (ADR-063), so a refusal
    // made after it would move last active.
    const { agent, userId } = await registerOrganization(app, 'alpha');
    const lastActive = async () => {
      const [row] = await db
        .select({ at: memberships.lastActiveAt })
        .from(memberships)
        .where(eq(memberships.userId, userId));
      return row.at;
    };
    await db
      .update(memberships)
      .set({ lastActiveAt: null })
      .where(eq(memberships.userId, userId));

    await agent.get('/v1/users').set('X-Api-Revision', '2').expect(409);
    expect(await lastActive()).toBeNull();

    await agent.get('/v1/users').expect(200);
    expect(await lastActive()).not.toBeNull();
  });

  it('refuses a higher revision with api_updating, to try again in a minute', async () => {
    const res = await request(httpServer(app))
      .get('/v1/users')
      .set('X-Api-Revision', '4')
      .expect(503);

    expect(res.headers['retry-after']).toBe('60');
    expect(body<Refusal>(res)).toMatchObject({
      code: 'api_updating',
      message:
        'A new version is being installed. Try again in a minute; nothing was saved.',
    });
  });

  it('logs each refusal once, at info, without its query or a stack', async () => {
    const info = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const error = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});

    try {
      const res = await request(httpServer(app))
        .get('/v1/users?search=Acme')
        .set('X-Api-Revision', '4')
        .expect(503);

      expect(info).toHaveBeenCalledTimes(1);
      expect(info).toHaveBeenCalledWith(
        {
          method: 'GET',
          path: '/v1/users',
          clientRevision: 4,
          serverRevision: 3,
          requestId: body<Refusal>(res).requestId,
        },
        'Refused a client newer than the API',
      );
      // The exception filter logs every other 5xx with its stack.
      expect(error).not.toHaveBeenCalled();
    } finally {
      info.mockRestore();
      error.mockRestore();
    }
  });

  it('serves sign-out to an outdated tab', async () => {
    const { agent } = await registerOrganization(app, 'alpha');

    await agent.post('/v1/auth/logout').set('X-Api-Revision', '2').expect(204);
    await agent.get('/v1/users').expect(401);
  });

  it('names the revision on /health', async () => {
    const res = await request(httpServer(app)).get('/health').expect(200);
    expect(body<{ apiRevision: number }>(res).apiRevision).toBe(3);
  });
});
