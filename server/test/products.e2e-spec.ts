import type { INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { and, eq } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { products, productVariants, roles } from '../src/database/schema';
import { MailService } from '../src/shared/mail/mail.service';
import {
  createTestApp,
  seedPermissions,
  unlimitedThrottler,
} from './utils/create-test-app';
import { RecordingMailService } from './utils/recording-mail';
import { authedAgent } from './utils/request';
import { resetDatabase } from './utils/reset-db';

interface VariantResponse {
  id: string;
  sku: string;
  name: string | null;
  tracksBatches: boolean;
  isActive: boolean;
}

interface ProductResponse {
  id: string;
  type: string;
  name: string;
  isActive: boolean;
  variants: VariantResponse[];
}

interface RegisterResponse {
  user: { id: string; organizationId: string };
}

function body<T>(res: { body: unknown }): T {
  return res.body as T;
}

/**
 * The first feature module, and the first table pair where an invariant spans
 * two inserts: ADR-023 says every product has at least one variant, and a
 * transaction is what makes that true rather than merely intended.
 */
describe('Products (e2e)', () => {
  let app: INestApplication;
  let db: Database;

  const PASSWORD = 'correct-horse-battery';

  const product = {
    type: 'good',
    name: 'Vitamin D3',
    variant: { sku: 'VD3-60', name: '60ct', tracksBatches: true },
  };

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder
        .overrideProvider(ThrottlerStorage)
        .useValue(unlimitedThrottler)
        .overrideProvider(MailService)
        .useValue(new RecordingMailService()),
    );

    db = app.get<Database>(UNSAFE_GLOBAL_DB);
    await seedPermissions(app);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  async function roleIdNamed(organizationId: string, name: string) {
    const [role] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(
        and(eq(roles.organizationId, organizationId), eq(roles.name, name)),
      );

    return role.id;
  }

  async function registerOrg(slugish: string) {
    const agent = authedAgent(app);

    const res = await agent
      .post('/v1/auth/register')
      .send({
        email: `owner@${slugish}.example.com`,
        password: PASSWORD,
        name: 'Owner',
        organizationName: `${slugish} Co`,
      })
      .expect(201);

    return {
      agent,
      organizationId: body<RegisterResponse>(res).user.organizationId,
    };
  }

  async function addViewer(
    owner: Awaited<ReturnType<typeof registerOrg>>,
    email: string,
  ) {
    await owner.agent
      .post('/v1/users')
      .send({
        email,
        name: 'Viewer',
        password: PASSWORD,
        roleId: await roleIdNamed(owner.organizationId, 'Viewer'),
      })
      .expect(201);

    const viewer = authedAgent(app);
    await viewer
      .post('/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return viewer;
  }

  describe('POST /v1/products', () => {
    it('creates the product and its first variant together', async () => {
      const alpha = await registerOrg('alpha');

      const res = await alpha.agent
        .post('/v1/products')
        .send(product)
        .expect(201);
      const created = body<{ product: ProductResponse }>(res).product;

      expect(created.variants).toHaveLength(1);
      expect(created.variants[0].sku).toBe('VD3-60');
      expect(created.variants[0].tracksBatches).toBe(true);

      // ADR-023's invariant, asserted against rows rather than a response: a
      // product with no variant is one nothing can ever be counted against.
      expect(await db.select().from(products)).toHaveLength(1);
      expect(await db.select().from(productVariants)).toHaveLength(1);
    });

    it('creates a variant even when the product has no variation', async () => {
      const alpha = await registerOrg('alpha');

      await alpha.agent
        .post('/v1/products')
        .send({
          type: 'supply',
          name: 'Blue pens',
          variant: { sku: 'PEN-BLUE' },
        })
        .expect(201);

      const [variant] = await db.select().from(productVariants);

      // Name null, variant present. The UI hides this row behind one SKU
      // field; the schema does not, which is what keeps stock queries free of
      // a branch.
      expect(variant.name).toBeNull();
      expect(variant.tracksBatches).toBe(false);
    });

    it('rejects a duplicate SKU and leaves no orphaned product', async () => {
      const alpha = await registerOrg('alpha');
      await alpha.agent.post('/v1/products').send(product).expect(201);

      const res = await alpha.agent
        .post('/v1/products')
        .send({ ...product, name: 'Vitamin D3 again' })
        .expect(409);

      // Names the SKU: the caller needs to know whether they meant the
      // existing item or have a collision in their own numbering.
      expect(JSON.stringify(res.body)).toContain('VD3-60');

      // The rollback. Without the transaction, the product insert would have
      // committed before the variant failed.
      expect(await db.select().from(products)).toHaveLength(1);
    });

    it('allows the same SKU in another organization', async () => {
      const alpha = await registerOrg('alpha');
      const beta = await registerOrg('beta');

      await alpha.agent.post('/v1/products').send(product).expect(201);

      // Unique per organization, never globally — rejecting this would reveal
      // that another tenant exists.
      await beta.agent.post('/v1/products').send(product).expect(201);

      expect(await db.select().from(productVariants)).toHaveLength(2);
    });

    it('rejects an unknown type', async () => {
      const alpha = await registerOrg('alpha');

      await alpha.agent
        .post('/v1/products')
        .send({ ...product, type: 'widget' })
        .expect(400);
    });

    it('rejects a product with no variant', async () => {
      const alpha = await registerOrg('alpha');

      await alpha.agent
        .post('/v1/products')
        .send({ type: 'good', name: 'Vitamin D3' })
        .expect(400);
    });

    it('refuses a Viewer, which lacks products.create', async () => {
      const alpha = await registerOrg('alpha');
      const viewer = await addViewer(alpha, 'viewer@alpha.example.com');

      await viewer.post('/v1/products').send(product).expect(403);
      expect(await db.select().from(products)).toHaveLength(0);
    });

    it('requires a session', async () => {
      await authedAgent(app).post('/v1/products').send(product).expect(401);
    });
  });

  describe('GET /v1/products', () => {
    it('does not show another organization catalogue', async () => {
      const alpha = await registerOrg('alpha');
      const beta = await registerOrg('beta');

      await beta.agent.post('/v1/products').send(product).expect(201);

      const res = await alpha.agent.get('/v1/products').expect(200);
      expect(body<ProductResponse[]>(res)).toHaveLength(0);
      expect(await db.select().from(products)).toHaveLength(1);
    });

    it('is readable by a Viewer, which holds products.view', async () => {
      const alpha = await registerOrg('alpha');
      await alpha.agent.post('/v1/products').send(product).expect(201);
      const viewer = await addViewer(alpha, 'viewer@alpha.example.com');

      const res = await viewer.get('/v1/products').expect(200);
      expect(body<ProductResponse[]>(res)).toHaveLength(1);
    });
  });

  describe('PATCH /v1/products/:id', () => {
    it('discontinues without touching its variants', async () => {
      const alpha = await registerOrg('alpha');

      const created = body<{ product: ProductResponse }>(
        await alpha.agent.post('/v1/products').send(product).expect(201),
      ).product;

      await alpha.agent
        .patch(`/v1/products/${created.id}`)
        .send({ isActive: false })
        .expect(204);

      // The decision this test exists for: the product's flag is never
      // cascaded. Deactivating would write false to every variant, and
      // reactivating could not know which had been individually discontinued
      // first — that information would be destroyed by the write.
      const [variant] = await db.select().from(productVariants);
      expect(variant.isActive).toBe(true);

      const [row] = await db.select().from(products);
      expect(row.isActive).toBe(false);
    });

    it('refuses a product in another organization', async () => {
      const alpha = await registerOrg('alpha');
      const beta = await registerOrg('beta');

      const created = body<{ product: ProductResponse }>(
        await beta.agent.post('/v1/products').send(product).expect(201),
      ).product;

      await alpha.agent
        .patch(`/v1/products/${created.id}`)
        .send({ name: 'Hijacked' })
        .expect(404);
    });

    it('ignores a type in the body', async () => {
      const alpha = await registerOrg('alpha');

      const created = body<{ product: ProductResponse }>(
        await alpha.agent.post('/v1/products').send(product).expect(201),
      ).product;

      // Type is absent from UpdateProductDto deliberately: reinterpreting a
      // good as equipment after it has moved would silently change what every
      // historical movement meant.
      await alpha.agent
        .patch(`/v1/products/${created.id}`)
        .send({ type: 'equipment' })
        .expect(400);

      const [row] = await db.select().from(products);
      expect(row.type).toBe('good');
    });

    it('refuses a Viewer, which lacks products.update', async () => {
      const alpha = await registerOrg('alpha');

      const created = body<{ product: ProductResponse }>(
        await alpha.agent.post('/v1/products').send(product).expect(201),
      ).product;

      const viewer = await addViewer(alpha, 'viewer@alpha.example.com');

      await viewer
        .patch(`/v1/products/${created.id}`)
        .send({ isActive: false })
        .expect(403);
    });
  });
});
