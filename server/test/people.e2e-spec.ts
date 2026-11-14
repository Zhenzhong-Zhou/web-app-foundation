import type { INestApplication } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import sharp from 'sharp';

import { SUPPORTED_LOCALES } from '../src/common/locales';
import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { files, memberships, users } from '../src/database/schema';
import {
  addMember,
  addViewer,
  body,
  createE2eApp,
  registerOrganization,
} from './utils/fixtures';
import { resetDatabase } from './utils/reset-db';
import { said } from './utils/said';

type Org = Awaited<ReturnType<typeof registerOrganization>>;
type Agent = Org['agent'];

interface Person {
  id: string;
  name: string;
  photoFileId: string | null;
  jobTitle: string | null;
  extension: string | null;
  active: string;
  lastActiveAt?: string | null;
  recentActivity?: { actorId: string }[];
}

/** A face-sized photo, not square, so the crop shows. */
function portrait(): Promise<Buffer> {
  return sharp({
    create: {
      width: 300,
      height: 400,
      channels: 3,
      background: { r: 200, g: 160, b: 120 },
    },
  })
    .jpeg()
    .toBuffer();
}

async function whoAmI(agent: Agent): Promise<string> {
  return body<{ user: { id: string } }>(
    await agent.get('/v1/auth/me').expect(200),
  ).user.id;
}

/**
 * People (ADR-063): a photo only its person sets, seen only by those who
 * share an organization with them; details at work set by the person;
 * last active coarse for everyone and exact for those who may read the
 * history, and moved by nothing in the background.
 */
describe('People (e2e)', () => {
  let app: INestApplication;
  let db: Database;

  beforeAll(async () => {
    app = await createE2eApp();
    db = app.get<Database>(UNSAFE_GLOBAL_DB);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  it('sets a photo, square, seen by colleagues and nobody else', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const viewer = await addViewer(app, alpha, 'viewer@alpha.example.com');
    const beta = await registerOrganization(app, 'beta');

    const { photoFileId } = body<{ photoFileId: string }>(
      await alpha.agent
        .post('/v1/account/photo')
        .attach('file', await portrait(), 'me.jpg')
        .expect(201),
    );

    const photo = await viewer
      .get(`/v1/people/${alpha.userId}/photo?size=thumb&v=${photoFileId}`)
      .expect(200);
    expect(photo.headers['content-type']).toBe('image/webp');
    const { width, height } = await sharp(photo.body as Buffer).metadata();
    expect([width, height]).toEqual([128, 128]);

    // Another organization's member is no colleague: as if there were none.
    await beta.agent.get(`/v1/people/${alpha.userId}/photo`).expect(404);
  });

  it('replaces and removes a photo, deleting each at once', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const first = body<{ photoFileId: string }>(
      await alpha.agent
        .post('/v1/account/photo')
        .attach('file', await portrait(), 'me.jpg')
        .expect(201),
    ).photoFileId;
    const second = body<{ photoFileId: string }>(
      await alpha.agent
        .post('/v1/account/photo')
        .attach('file', await portrait(), 'me.jpg')
        .expect(201),
    ).photoFileId;

    expect(await db.select().from(files).where(eq(files.id, first))).toEqual(
      [],
    );

    await alpha.agent.delete('/v1/account/photo').expect(204);
    expect(await db.select().from(files).where(eq(files.id, second))).toEqual(
      [],
    );
    const [user] = await db
      .select({ photoFileId: users.photoFileId })
      .from(users)
      .where(eq(users.id, alpha.userId));
    expect(user.photoFileId).toBeNull();
    await alpha.agent.get(`/v1/people/${alpha.userId}/photo`).expect(404);
  });

  it('refuses a photo that is not an image, a person’s picture 头像 in Chinese', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await alpha.agent
      .post('/v1/account/photo')
      .attach('file', Buffer.from('%PDF-1.7\n'), 'cv.pdf')
      .expect(400);

    // Its own message, not an item photo's 照片 (ADR-054's November 2026
    // amendment).
    const refused = await alpha.agent
      .post('/v1/account/photo')
      .set('Accept-Language', 'zh-Hans')
      .attach('file', Buffer.from('%PDF-1.7\n'), 'cv.pdf')
      .expect(400);
    expect(body<{ message: string }>(refused).message).toBe(
      '头像必须是 PNG、JPEG 或 WebP 图片',
    );
  });

  // Past 5 MB, cut off and refused naming the limit, in the reader's
  // language (#249); the person keeps no photo.
  it('refuses a photo past 5 MB in words, and keeps nothing', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const huge = Buffer.alloc(5 * 1024 * 1024 + 1, 1);
    const refusals: [string, string][] = [
      [
        'en',
        'A photo can be up to 5 MB. Choose a smaller file, or save it smaller first.',
      ],
      [
        'fr-CA',
        'Une photo peut faire jusqu’à 5 Mo. Choisissez un fichier plus petit, ou réduisez-en d’abord la taille.',
      ],
      ['zh-Hans', '头像最大 5 MB。请选择更小的文件，或先压缩后再上传。'],
    ];

    for (const [language, message] of refusals) {
      const refused = await alpha.agent
        .post('/v1/account/photo')
        .set('Accept-Language', language)
        .attach('file', huge, 'me.jpg')
        .expect(413);
      expect(body<{ error: string; message: string }>(refused)).toMatchObject({
        error: 'PAYLOAD_TOO_LARGE',
        message,
      });
    }

    const [user] = await db
      .select({ photoFileId: users.photoFileId })
      .from(users)
      .where(eq(users.id, alpha.userId));
    expect(user.photoFileId).toBeNull();
    expect(await db.select().from(files)).toEqual([]);
  });

  it('keeps details at work per person, shown on People', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await alpha.agent
      .patch('/v1/account/details')
      .send({ jobTitle: '  Operations manager ', extension: '214' })
      .expect(204);
    await alpha.agent
      .patch('/v1/account/details')
      .send({ workPhone: 'call me' })
      .expect(400);

    const people = body<Person[]>(
      await alpha.agent.get('/v1/people').expect(200),
    );
    expect(people[0]).toMatchObject({
      jobTitle: 'Operations manager',
      extension: '214',
    });

    // A cleared field is none, not an empty string.
    await alpha.agent
      .patch('/v1/account/details')
      .send({ jobTitle: '' })
      .expect(204);
    expect(
      body<{ jobTitle: string | null }>(
        await alpha.agent.get('/v1/account/details').expect(200),
      ).jobTitle,
    ).toBeNull();
  });

  /**
   * The form holds each field's length but not its characters, so Work
   * phone and Extension refuse in words that name the field, never
   * "workPhone is not in the expected form" (#148), in each language; and
   * nothing is kept.
   */
  it('refuses a work phone with letters in words naming it, in each language', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    for (const language of SUPPORTED_LOCALES) {
      const refused = await alpha.agent
        .patch('/v1/account/details')
        .set('Accept-Language', language)
        .send({ jobTitle: 'Buyer', workPhone: '604-555-0100 ext 12' })
        .expect(400);
      expect(body<{ message: string[] }>(refused).message).toEqual([
        said(language, 'validation.workPhone'),
      ]);
    }

    expect(
      body<{ jobTitle: string | null; workPhone: string | null }>(
        await alpha.agent.get('/v1/account/details').expect(200),
      ),
    ).toMatchObject({ jobTitle: null, workPhone: null });
  });

  it('refuses an extension with letters in words naming it, in each language', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const refusals: [string, string][] = [
      ['en', 'Enter the extension in digits only, such as 214.'],
      ['fr-CA', 'Saisissez le poste en chiffres seulement, comme 214.'],
      ['zh-Hans', '请只用数字填写分机，例如 214。'],
    ];

    for (const [language, message] of refusals) {
      const refused = await alpha.agent
        .patch('/v1/account/details')
        .set('Accept-Language', language)
        .send({ jobTitle: 'Buyer', extension: 'ext 12' })
        .expect(400);
      expect(body<{ message: string[] }>(refused).message).toEqual([message]);
    }

    expect(
      body<{ jobTitle: string | null; extension: string | null }>(
        await alpha.agent.get('/v1/account/details').expect(200),
      ),
    ).toMatchObject({ jobTitle: null, extension: null });
  });

  it('says when each member joined: their membership’s start, for New on People (ADR-079)', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const viewer = await addViewer(app, alpha, 'viewer@example.com');
    const viewerId = await whoAmI(viewer);

    const [membership] = await db
      .select({ createdAt: memberships.createdAt })
      .from(memberships)
      .where(eq(memberships.userId, viewerId));
    const people = body<(Person & { memberSince: string })[]>(
      await alpha.agent.get('/v1/people').expect(200),
    );
    expect(people.find((person) => person.id === viewerId)?.memberSince).toBe(
      membership.createdAt.toISOString(),
    );
  });

  it('shows last active coarse, and exact with the history', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const viewer = await addViewer(app, alpha, 'viewer@alpha.example.com');

    const asViewer = body<Person[]>(await viewer.get('/v1/people').expect(200));
    const owner = asViewer.find((person) => person.id === alpha.userId);
    expect(owner?.active).toBe('today');
    expect(owner && 'lastActiveAt' in owner).toBe(false);

    const asOwner = body<Person[]>(
      await alpha.agent.get('/v1/people').expect(200),
    );
    expect(
      asOwner.find((person) => person.id === alpha.userId)?.lastActiveAt,
    ).toEqual(expect.any(String));
  });

  it('moves last active for a request, not for a background one', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const longAgo = new Date('2026-01-01T00:00:00Z');
    const mine = and(
      eq(memberships.userId, alpha.userId),
      eq(memberships.organizationId, alpha.organizationId),
    );
    const lastActive = async () =>
      (
        await db
          .select({ at: memberships.lastActiveAt })
          .from(memberships)
          .where(mine)
      )[0].at;

    await db.update(memberships).set({ lastActiveAt: longAgo }).where(mine);
    await alpha.agent
      .get('/v1/notifications/unread-count')
      .set('X-Background', '1')
      .expect(200);
    expect(await lastActive()).toEqual(longAgo);

    await alpha.agent.get('/v1/people').expect(200);
    expect((await lastActive())?.getTime()).toBeGreaterThan(longAgo.getTime());
  });

  it('shows recent work only to those who may read the history', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const viewer = await addViewer(app, alpha, 'viewer@alpha.example.com');
    const viewerId = await whoAmI(viewer);
    const admin = await addMember(
      app,
      alpha,
      'admin@alpha.example.com',
      'Admin',
    );
    const adminId = await whoAmI(admin);
    // Something the owner and the admin did: a location each, audited.
    await alpha.agent
      .post('/v1/locations')
      .send({ type: 'site', name: 'Main' })
      .expect(201);
    await admin
      .post('/v1/locations')
      .send({ type: 'site', name: 'Annex' })
      .expect(201);

    const asOwner = body<Person>(
      await alpha.agent.get(`/v1/people/${adminId}`).expect(200),
    );
    expect(asOwner.recentActivity?.length).toBeGreaterThan(0);

    const asViewer = body<Person>(
      await viewer.get(`/v1/people/${adminId}`).expect(200),
    );
    expect(asViewer.recentActivity).toBeUndefined();

    // Your own page shows none: your work is on your Account page.
    const own = body<Person>(
      await alpha.agent.get(`/v1/people/${alpha.userId}`).expect(200),
    );
    expect(own.recentActivity).toBeUndefined();

    // Your own activity is yours whatever the filter sent says: the owner
    // asking for the viewer's gets their own.
    const mine = body<{ entries: { actorId: string }[] }>(
      await alpha.agent
        .get(`/v1/account/activity?actorId=${viewerId}`)
        .expect(200),
    );
    expect(mine.entries.length).toBeGreaterThan(0);
    expect(mine.entries.every((entry) => entry.actorId === alpha.userId)).toBe(
      true,
    );
  });
});
