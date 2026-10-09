import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';

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

type Org = Awaited<ReturnType<typeof registerOrganization>>;
type Agent = Org['agent'];

interface Image {
  fileId: string;
  position: number;
}

/** A photo of one colour: a different colour is a different checksum. */
function photo(hue: number): Promise<Buffer> {
  return sharp({
    create: {
      width: 600,
      height: 400,
      channels: 3,
      background: { r: hue, g: 120, b: 255 - hue },
    },
  })
    .jpeg()
    .toBuffer();
}

/**
 * A product's gallery (ADR-062): images added through file storage
 * (ADR-059), in order, the first the cover; reordered, removed, at most
 * eight, never the same photo twice.
 */
describe('Product images (e2e)', () => {
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

  async function product(agent: Agent, sku = 'FOCUS-60'): Promise<string> {
    return body<{ product: { id: string } }>(
      await agent
        .post('/v1/products')
        .send({ type: 'good', name: 'Focus', variant: { sku } })
        .expect(201),
    ).product.id;
  }

  async function upload(agent: Agent, image: Buffer): Promise<string> {
    return body<{ file: { id: string } }>(
      await agent
        .post('/v1/files/product-image')
        .attach('file', image, 'photo.jpg')
        .expect(201),
    ).file.id;
  }

  async function add(agent: Agent, productId: string, fileId: string) {
    return body<{ images: Image[] }>(
      await agent
        .post(`/v1/products/${productId}/images`)
        .send({ fileId })
        .expect(201),
    ).images;
  }

  it('adds images in order, the first the cover in the list', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const productId = await product(alpha.agent);
    const front = await upload(alpha.agent, await photo(10));
    const back = await upload(alpha.agent, await photo(200));

    await add(alpha.agent, productId, front);
    const images = await add(alpha.agent, productId, back);
    expect(images.map(({ fileId, position }) => [fileId, position])).toEqual([
      [front, 0],
      [back, 1],
    ]);

    const list = body<{ id: string; coverFileId: string | null }[]>(
      await alpha.agent.get('/v1/products').expect(200),
    );
    expect(list.find((row) => row.id === productId)?.coverFileId).toBe(front);

    const detail = body<{ images: Image[] }>(
      await alpha.agent.get(`/v1/products/${productId}`).expect(200),
    );
    expect(detail.images.map((image) => image.fileId)).toEqual([front, back]);
  });

  it('refuses the same photo twice on one product', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const productId = await product(alpha.agent);
    const same = await photo(10);

    await add(alpha.agent, productId, await upload(alpha.agent, same));
    await alpha.agent
      .post(`/v1/products/${productId}/images`)
      .send({ fileId: await upload(alpha.agent, same) })
      .expect(409);
  });

  it('reorders, and removes closing the gap', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const productId = await product(alpha.agent);
    const ids: string[] = [];
    for (const hue of [10, 100, 200]) {
      const fileId = await upload(alpha.agent, await photo(hue));
      await add(alpha.agent, productId, fileId);
      ids.push(fileId);
    }
    const [a, b, c] = ids;

    const reordered = body<{ images: Image[] }>(
      await alpha.agent
        .put(`/v1/products/${productId}/images`)
        .send({ fileIds: [c, a, b] })
        .expect(200),
    ).images;
    expect(reordered.map((image) => image.fileId)).toEqual([c, a, b]);

    // An order that leaves one out is refused.
    await alpha.agent
      .put(`/v1/products/${productId}/images`)
      .send({ fileIds: [c, a] })
      .expect(400);

    await alpha.agent
      .delete(`/v1/products/${productId}/images/${c}`)
      .expect(204);
    const detail = body<{ images: Image[] }>(
      await alpha.agent.get(`/v1/products/${productId}`).expect(200),
    );
    const order = detail.images.map(({ fileId, position }) => [
      fileId,
      position,
    ]);
    expect(order).toEqual([
      [a, 0],
      [b, 1],
    ]);
    const [released] = await db.select().from(files).where(eq(files.id, c));
    expect(released.releasedAt).not.toBeNull();
  });

  it('holds at most eight', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const productId = await product(alpha.agent);
    for (let index = 0; index < 8; index++) {
      await add(
        alpha.agent,
        productId,
        await upload(alpha.agent, await photo(index * 30)),
      );
    }

    await alpha.agent
      .post(`/v1/products/${productId}/images`)
      .send({ fileId: await upload(alpha.agent, await photo(250)) })
      .expect(409);
  });

  it('keeps each organization to its own products and files', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const beta = await registerOrganization(app, 'beta');
    const theirs = await product(alpha.agent);
    const ours = await product(beta.agent, 'CALM-90');
    const theirFile = await upload(alpha.agent, await photo(10));

    await beta.agent
      .post(`/v1/products/${theirs}/images`)
      .send({ fileId: await upload(beta.agent, await photo(20)) })
      .expect(404);
    await beta.agent
      .post(`/v1/products/${ours}/images`)
      .send({ fileId: theirFile })
      .expect(400);
  });

  it('lets a viewer see the gallery but not change it', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const viewer = await addViewer(app, alpha, 'viewer@alpha.example.com');
    const productId = await product(alpha.agent);
    const fileId = await upload(alpha.agent, await photo(10));
    await add(alpha.agent, productId, fileId);

    await viewer.get(`/v1/products/${productId}`).expect(200);
    await viewer.get(`/v1/files/${fileId}?size=thumb`).expect(200);
    await viewer
      .delete(`/v1/products/${productId}/images/${fileId}`)
      .expect(403);
  });
});
