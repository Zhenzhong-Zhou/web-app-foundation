import type { INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { eq } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { auditLog, boms } from '../src/database/schema';
import { MailService } from '../src/shared/mail/mail.service';
import {
  createTestApp,
  seedPermissions,
  unlimitedThrottler,
} from './utils/create-test-app';
import { RecordingMailService } from './utils/recording-mail';
import { authedAgent } from './utils/request';
import { resetDatabase } from './utils/reset-db';

interface LicenceResponse {
  id: string;
  number: string;
  authority: string;
  isActive: boolean;
  issuedAt: string | null;
  expiresAt: string | null;
  notes: string | null;
}

interface CreatedLicence {
  licence: LicenceResponse;
}

interface ProductResponse {
  product: { variants: { id: string }[] };
}

interface CreatedBom {
  bom: { id: string; licenceId: string | null };
}

function body<T>(res: { body: unknown }): T {
  return res.body as T;
}

/**
 * The registry a recipe points at (ADR-029). What matters here is that the
 * number is identity rather than history — correcting it corrects every recipe
 * at once — and that a licence cannot be borrowed across tenants.
 */
describe('Product licences (e2e)', () => {
  let app: INestApplication;
  let db: Database;

  const PASSWORD = 'correct-horse-battery';

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

  async function registerOrg(slugish: string) {
    const agent = authedAgent(app);

    await agent
      .post('/v1/auth/register')
      .send({
        email: `owner@${slugish}.example.com`,
        password: PASSWORD,
        name: 'Owner',
        organizationName: `${slugish} Co`,
      })
      .expect(201);

    return { agent };
  }

  type Org = Awaited<ReturnType<typeof registerOrg>>;

  async function makeLicence(org: Org, number = '80012345') {
    const res = await org.agent
      .post('/v1/product-licences')
      .send({ number, authority: 'Health Canada' })
      .expect(201);

    return body<CreatedLicence>(res).licence;
  }

  async function makeVariant(org: Org, sku: string) {
    const res = await org.agent
      .post('/v1/products')
      .send({
        type: 'good',
        name: sku,
        variant: { sku, unitOfMeasure: 'each' },
      })
      .expect(201);

    return body<ProductResponse>(res).product.variants[0].id;
  }

  describe('the registry', () => {
    it('records a number with the authority that issued it', async () => {
      const alpha = await registerOrg('alpha');
      const licence = await makeLicence(alpha);

      expect(licence).toMatchObject({
        number: '80012345',
        authority: 'Health Canada',
        isActive: true,
      });

      const listed = body<LicenceResponse[]>(
        await alpha.agent.get('/v1/product-licences').expect(200),
      );
      expect(listed).toHaveLength(1);
    });

    // The pair is the identity: the same digits could be issued by two
    // regulators, but not twice by one.
    it('refuses the same number from the same authority twice', async () => {
      const alpha = await registerOrg('alpha');
      await makeLicence(alpha);

      await alpha.agent
        .post('/v1/product-licences')
        .send({ number: '80012345', authority: 'Health Canada' })
        .expect(409);

      await alpha.agent
        .post('/v1/product-licences')
        .send({ number: '80012345', authority: 'FDA' })
        .expect(201);
    });

    /**
     * A typo caught an hour later. The number is identity rather than
     * history, so correcting it fixes every recipe pointing at the row —
     * which is why a licence is a table and not a column.
     */
    it('corrects a number, and audits the change', async () => {
      const alpha = await registerOrg('alpha');
      const licence = await makeLicence(alpha, '80012344');

      await alpha.agent
        .patch(`/v1/product-licences/${licence.id}`)
        .send({ number: '80012345' })
        .expect(204);

      const [entry] = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, 'product_licence.updated'));

      expect(entry.payload).toEqual({
        number: { from: '80012344', to: '80012345' },
      });
      expect(entry.resourceLabel).toBe('Health Canada 80012345');
    });

    /**
     * Usually blank — an NPN stays valid while the product is marketed — but
     * an FDA facility registration or an ISO certificate does expire, and the
     * client derives Expired from the date rather than a switch somebody has
     * to remember to flip.
     */
    it('stores an expiry when the scheme has one', async () => {
      const alpha = await registerOrg('alpha');
      const licence = await makeLicence(alpha);

      expect(licence.expiresAt).toBeNull();

      await alpha.agent
        .patch(`/v1/product-licences/${licence.id}`)
        .send({ expiresAt: '2027-03-01' })
        .expect(204);

      const [stored] = body<LicenceResponse[]>(
        await alpha.agent.get('/v1/product-licences').expect(200),
      );

      // Midnight UTC of the day chosen, the shape every date here takes.
      expect(stored.expiresAt).toBe('2027-03-01T00:00:00.000Z');

      await alpha.agent
        .patch(`/v1/product-licences/${licence.id}`)
        .send({ expiresAt: null })
        .expect(204);

      const [cleared] = body<LicenceResponse[]>(
        await alpha.agent.get('/v1/product-licences').expect(200),
      );
      expect(cleared.expiresAt).toBeNull();
    });

    // Meaningless in that order, and a row saying so would make every
    // derived status wrong at once, so the database refuses it too.
    it('refuses an expiry before the issue date', async () => {
      const alpha = await registerOrg('alpha');
      const licence = await makeLicence(alpha);

      await alpha.agent
        .patch(`/v1/product-licences/${licence.id}`)
        .send({ issuedAt: '2027-03-01', expiresAt: '2026-03-01' })
        .expect(400);

      await alpha.agent
        .patch(`/v1/product-licences/${licence.id}`)
        .send({ issuedAt: '2026-03-01', expiresAt: '2027-03-01' })
        .expect(204);
    });

    it('withdraws rather than deletes', async () => {
      const alpha = await registerOrg('alpha');
      const licence = await makeLicence(alpha);

      await alpha.agent
        .patch(`/v1/product-licences/${licence.id}`)
        .send({ isActive: false })
        .expect(204);

      const [listed] = body<LicenceResponse[]>(
        await alpha.agent.get('/v1/product-licences').expect(200),
      );

      // Still listed: a recipe made under it must still resolve to something.
      expect(listed.isActive).toBe(false);
    });
  });

  describe('on a recipe', () => {
    it('attaches a licence to a recipe', async () => {
      const alpha = await registerOrg('alpha');
      const licence = await makeLicence(alpha);
      const variant = await makeVariant(alpha, 'FOCUS-60CT');

      const created = body<CreatedBom>(
        await alpha.agent
          .post('/v1/boms')
          .send({
            outputVariantId: variant,
            outputQuantity: '1000',
            licenceId: licence.id,
          })
          .expect(201),
      );

      expect(created.bom.licenceId).toBe(licence.id);
    });

    /**
     * The foreign key is global, like every id here, so without a scoped
     * check the database would accept another tenant's licence and the recall
     * trail would point outside the organization (ADR-003).
     */
    it('refuses another organization\u2019s licence', async () => {
      const alpha = await registerOrg('alpha');
      const beta = await registerOrg('beta');

      const theirs = await makeLicence(beta);
      const variant = await makeVariant(alpha, 'FOCUS-60CT');

      await alpha.agent
        .post('/v1/boms')
        .send({
          outputVariantId: variant,
          outputQuantity: '1000',
          licenceId: theirs.id,
        })
        .expect(400);

      expect(await db.select().from(boms)).toHaveLength(0);
    });

    it('does not list another organization\u2019s licences', async () => {
      const alpha = await registerOrg('alpha');
      const beta = await registerOrg('beta');
      await makeLicence(beta);

      expect(
        body<LicenceResponse[]>(
          await alpha.agent.get('/v1/product-licences').expect(200),
        ),
      ).toEqual([]);
    });
  });
});
