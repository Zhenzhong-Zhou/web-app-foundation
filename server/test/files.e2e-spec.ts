import { access } from 'node:fs/promises';
import path from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';

import { FilesService } from '../src/core/files/files.service';
import { FilesPurgeService } from '../src/core/files/files-purge.service';
import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { files } from '../src/database/schema';
import {
  addViewer,
  body,
  createE2eApp,
  registerOrganization,
} from './utils/fixtures';
import { resetDatabase } from './utils/reset-db';

interface Kept {
  file: {
    id: string;
    kind: string;
    contentType: string;
    sizes: Record<string, { width: number; height: number; bytes: number }>;
  };
}

const DAY = 24 * 60 * 60 * 1000;

function photo(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: '#2f6f9f' },
  })
    .withExif({ IFD0: { Artist: 'a phone' } })
    .jpeg()
    .toBuffer();
}

const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#2a6"/></svg>',
);

/** A square logo's PNG (ADR-060, amended). */
function mark(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: '#2a6f' },
  })
    .png()
    .toBuffer();
}

/** Supertest keeps an image as a Buffer. */
function bytesOf(res: { body: unknown }): Buffer {
  return res.body as Buffer;
}

/**
 * Files (ADR-059), on the local driver: checked before they are kept,
 * photos in three sizes, read only by their own organization, purged 30
 * days after release.
 */
describe('Files (e2e)', () => {
  let app: INestApplication;
  let db: Database;
  let service: FilesService;
  let purge: FilesPurgeService;

  beforeAll(async () => {
    app = await createE2eApp();
    db = app.get<Database>(UNSAFE_GLOBAL_DB);
    service = app.get(FilesService);
    purge = app.get(FilesPurgeService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  type Agent = Awaited<ReturnType<typeof registerOrganization>>['agent'];

  async function productImage(agent: Agent, image: Buffer, name = 'a.jpg') {
    return body<Kept>(
      await agent
        .post('/v1/files/product-image')
        .attach('file', image, name)
        .expect(201),
    ).file;
  }

  it('keeps a photo in three sizes and serves the one asked for', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const kept = await productImage(alpha.agent, await photo(4000, 3000));

    expect(kept.contentType).toBe('image/webp');
    expect(kept.sizes.thumb).toMatchObject({ width: 400, height: 300 });
    expect(kept.sizes.display).toMatchObject({ width: 1200, height: 900 });
    expect(kept.sizes.full).toMatchObject({ width: 3000, height: 2250 });

    const res = await alpha.agent
      .get(`/v1/files/${kept.id}?size=thumb`)
      .expect(200);
    expect(res.headers['content-type']).toBe('image/webp');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe(
      'private, max-age=31536000, immutable',
    );
    expect(res.headers['content-disposition']).toMatch(/^inline;/);
    const served = await sharp(bytesOf(res)).metadata();
    expect([served.width, served.height]).toEqual([400, 300]);
    expect(served.exif).toBeUndefined();

    // A browser that has it already gets nothing more.
    await alpha.agent
      .get(`/v1/files/${kept.id}?size=thumb`)
      .set('If-None-Match', String(res.headers.etag))
      .expect(304);
  });

  it('keeps a logo as one PNG, an SVG drawn and never kept', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const kept = body<Kept>(
      await alpha.agent
        .post('/v1/files/logo')
        .attach('file', SVG, 'logo.svg')
        .expect(201),
    ).file;

    expect(kept.contentType).toBe('image/png');
    expect(Object.keys(kept.sizes)).toEqual(['full']);

    // Any size asked of a logo is its one.
    const res = await alpha.agent
      .get(`/v1/files/${kept.id}?size=thumb`)
      .expect(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect((await sharp(bytesOf(res)).metadata()).format).toBe('png');
  });

  it('keeps a logo from an SVG that declares itself large', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    // Drawn at 300 dpi, 2000 px came to 69 million pixels and was refused
    // as unreadable; drawn at the size kept, it is 1024.
    const large = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="2000"><circle cx="1000" cy="1000" r="900" fill="#2f6b4f"/></svg>',
    );
    const kept = body<Kept>(
      await alpha.agent
        .post('/v1/files/logo')
        .attach('file', large, 'logo.svg')
        .expect(201),
    ).file;

    expect(kept.contentType).toBe('image/png');
    expect(kept.sizes.full).toMatchObject({ width: 1024, height: 1024 });
  });

  it('keeps a square logo as two PNGs, and full for a size it lacks', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const kept = body<Kept>(
      await alpha.agent
        .post('/v1/files/square-logo')
        .attach('file', await mark(800, 800), 'mark.png')
        .expect(201),
    ).file;

    expect(kept.kind).toBe('square_logo');
    expect(kept.contentType).toBe('image/png');
    expect(Object.keys(kept.sizes).sort()).toEqual(['full', 'thumb']);
    expect(kept.sizes.thumb).toMatchObject({ width: 128, height: 128 });
    expect(kept.sizes.full).toMatchObject({ width: 512, height: 512 });

    const served = async (query: string) => {
      const res = await alpha.agent
        .get(`/v1/files/${kept.id}${query}`)
        .expect(200);
      expect(res.headers['content-type']).toBe('image/png');
      return (await sharp(bytesOf(res)).metadata()).width;
    };
    expect(await served('?size=thumb')).toBe(128);
    expect(await served('')).toBe(512);
    expect(await served('?size=display')).toBe(512);
  });

  it('refuses a square logo too wide or too small, in words', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const refused = async (image: Buffer) =>
      body<{ message: string }>(
        await alpha.agent
          .post('/v1/files/square-logo')
          .attach('file', image, 'mark.png')
          .expect(400),
      ).message;

    expect(await refused(await mark(600, 400))).toBe(
      'A square logo must be about square, at most 5\u00a0:\u00a04 either way. Use a wide image as the main logo.',
    );
    expect(await refused(await mark(100, 100))).toBe(
      'A square logo must be at least 128 pixels on each side.',
    );
    // Nothing kept.
    expect(await db.select().from(files)).toEqual([]);
  });

  it('goes by the bytes, and refuses what will not decode', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const broken = Buffer.concat([jpegHeader, Buffer.alloc(64)]);

    await alpha.agent
      .post('/v1/files/product-image')
      .attach('file', Buffer.from('not a picture at all'), 'photo.jpg')
      .expect(415);
    await alpha.agent
      .post('/v1/files/product-image')
      .attach('file', SVG, 'drawing.svg')
      .expect(415);
    await alpha.agent
      .post('/v1/files/product-image')
      .attach('file', broken, 'broken.jpg')
      .expect(400);
    await alpha.agent.post('/v1/files/product-image').expect(400);
  });

  it('cuts an upload off at its kind’s limit', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await alpha.agent
      .post('/v1/files/logo')
      .attach('file', Buffer.alloc(2 * 1024 * 1024 + 1, 1), 'huge.png')
      .expect(413);
    await alpha.agent
      .post('/v1/files/square-logo')
      .attach('file', Buffer.alloc(2 * 1024 * 1024 + 1, 1), 'huge.png')
      .expect(413);
  });

  it('refuses a raster logo narrower than 256 pixels', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const small = await sharp({
      create: { width: 120, height: 60, channels: 4, background: '#fff0' },
    })
      .png()
      .toBuffer();
    await alpha.agent
      .post('/v1/files/logo')
      .attach('file', small, 'small.png')
      .expect(400);
  });

  it('is not there for another organization', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const beta = await registerOrganization(app, 'beta');
    const kept = await productImage(alpha.agent, await photo(800, 600));

    await beta.agent.get(`/v1/files/${kept.id}`).expect(404);
  });

  it('lets a viewer see product images, not upload them', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const viewer = await addViewer(app, alpha, 'viewer@alpha.example.com');
    const kept = await productImage(alpha.agent, await photo(800, 600));

    await viewer.get(`/v1/files/${kept.id}?size=display`).expect(200);
    await viewer
      .post('/v1/files/product-image')
      .attach('file', await photo(800, 600), 'b.jpg')
      .expect(403);
    await viewer
      .post('/v1/files/logo')
      .attach('file', SVG, 'logo.svg')
      .expect(403);
  });

  it('lets a viewer see the square logo, refused one before reading it', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const viewer = await addViewer(app, alpha, 'viewer@alpha.example.com');
    const kept = body<Kept>(
      await alpha.agent
        .post('/v1/files/square-logo')
        .attach('file', await mark(300, 300), 'mark.png')
        .expect(201),
    ).file;

    await viewer.get(`/v1/files/${kept.id}?size=thumb`).expect(200);
    // Past the limit, which reading would answer with 413: refused first.
    await viewer
      .post('/v1/files/square-logo')
      .attach('file', Buffer.alloc(2 * 1024 * 1024 + 1, 1), 'huge.png')
      .expect(403);
  });

  it('releases what was never used, and purges it 30 days on', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const unused = await productImage(alpha.agent, await photo(800, 600));
    const used = await productImage(alpha.agent, await photo(800, 600));
    await db.transaction((tx) =>
      service.attach(tx, alpha.organizationId, used.id, 'product_image'),
    );

    const now = Date.now();
    expect(await purge.purge(new Date(now + 2 * DAY))).toEqual({
      released: 1,
      deleted: 0,
    });
    await alpha.agent.get(`/v1/files/${unused.id}`).expect(404);
    await alpha.agent.get(`/v1/files/${used.id}`).expect(200);

    expect(await purge.purge(new Date(now + 33 * DAY))).toEqual({
      released: 0,
      deleted: 1,
    });
    expect(
      await db.select().from(files).where(eq(files.id, unused.id)),
    ).toEqual([]);
    await expect(
      access(path.resolve('storage', alpha.organizationId, unused.id, 'thumb')),
    ).rejects.toThrow();
  });

  it('refuses to attach a file twice, or as another kind', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const kept = await productImage(alpha.agent, await photo(800, 600));

    await expect(
      db.transaction((tx) =>
        service.attach(tx, alpha.organizationId, kept.id, 'logo'),
      ),
    ).rejects.toThrow();
    await db.transaction((tx) =>
      service.attach(tx, alpha.organizationId, kept.id, 'product_image'),
    );
    await expect(
      db.transaction((tx) =>
        service.attach(tx, alpha.organizationId, kept.id, 'product_image'),
      ),
    ).rejects.toThrow();
  });
});
