import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { todayIn } from '../src/common/today';
import type { Database } from '../src/database/database.module';
import { UNSAFE_GLOBAL_DB } from '../src/database/database.tokens';
import { auditLog } from '../src/database/schema';
import {
  body,
  createE2eApp,
  createLocation,
  createVariant,
  PASSWORD,
  registerOrganization,
} from './utils/fixtures';
import { authedAgent } from './utils/request';
import { resetDatabase } from './utils/reset-db';

/**
 * Two real places 25 hours apart: at any moment they are on different
 * days, Kiritimati always the later. So a test that reads the day through
 * the organization's zone cannot depend on when it runs.
 */
const KIRITIMATI = 'Pacific/Kiritimati'; // UTC+14
const PAGO_PAGO = 'Pacific/Pago_Pago'; // UTC−11

/** A calendar day so many days after another, YYYY-MM-DD. */
function after(day: string, days: number): string {
  return new Date(Date.parse(day) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

interface Organization {
  timeZone: string;
}

/**
 * Each organization's time zone (ADR-072): set at registration from the
 * browser, changed on Profile and logged with what it replaced, carried by
 * the session, and the day it decides.
 */
describe('Time zone (e2e)', () => {
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

  type Agent = ReturnType<typeof authedAgent>;

  function register(agent: Agent, extra: Record<string, unknown>) {
    return agent.post('/v1/auth/register').send({
      email: 'owner@zone.example.com',
      password: PASSWORD,
      name: 'Owner',
      organizationName: 'Zone Co',
      ...extra,
    });
  }

  async function organization(agent: Agent): Promise<Organization> {
    return body<{ organization: Organization }>(
      await agent.get('/v1/organization').expect(200),
    ).organization;
  }

  async function session(agent: Agent): Promise<Organization> {
    return body<{ organization: Organization }>(
      await agent.get('/v1/auth/me').expect(200),
    ).organization;
  }

  describe('registration', () => {
    it('takes the browser zone, under its canonical name', async () => {
      const agent = authedAgent(app);
      await register(agent, { timeZone: 'america/vancouver' }).expect(201);

      expect((await organization(agent)).timeZone).toBe('America/Vancouver');
      expect((await session(agent)).timeZone).toBe('America/Vancouver');
    });

    it('is UTC without one, as every organization was before', async () => {
      const agent = authedAgent(app);
      await register(agent, {}).expect(201);

      expect((await organization(agent)).timeZone).toBe('UTC');
    });

    it('refuses an offset, and a name no zone has', async () => {
      for (const timeZone of ['+05:00', 'Mars/Olympus_Mons']) {
        const res = await register(authedAgent(app), { timeZone }).expect(400);
        expect(JSON.stringify(res.body)).toContain('time zone');
      }
    });
  });

  describe('Profile', () => {
    it('changes it, logging what it replaced, and nothing for the same zone', async () => {
      const org = await registerOrganization(app, 'alpha');
      const changes = () =>
        db
          .select()
          .from(auditLog)
          .where(eq(auditLog.action, 'organization.updated'));

      await org.agent
        .patch('/v1/organization')
        .send({ timeZone: 'Asia/Shanghai' })
        .expect(204);
      expect((await organization(org.agent)).timeZone).toBe('Asia/Shanghai');
      expect((await session(org.agent)).timeZone).toBe('Asia/Shanghai');

      const [entry] = await changes();
      expect(entry.payload).toEqual({
        timeZone: { from: 'UTC', to: 'Asia/Shanghai' },
      });

      // Saved again unchanged: nothing more to log.
      await org.agent
        .patch('/v1/organization')
        .send({ timeZone: 'Asia/Shanghai' })
        .expect(204);
      expect(await changes()).toHaveLength(1);
    });

    it('refuses an offset, and leaves the zone as it was', async () => {
      const org = await registerOrganization(app, 'alpha');

      await org.agent
        .patch('/v1/organization')
        .send({ timeZone: '-0800' })
        .expect(400);
      await org.agent
        .patch('/v1/organization')
        .send({ timeZone: null })
        .expect(400);

      expect((await organization(org.agent)).timeZone).toBe('UTC');
    });
  });

  describe('the day it decides', () => {
    async function inZone(org: { agent: Agent }, timeZone: string) {
      await org.agent.patch('/v1/organization').send({ timeZone }).expect(204);
    }

    /**
     * Expiring soon counts from the organization's today (ADR-060, ADR-072),
     * not the database's. A lot expiring the day after Kiritimati's today
     * is within a day there, and never within a day in Pago Pago, which is
     * always at least a day behind.
     */
    it("counts expiring stock from the organization's today", async () => {
      const org = await registerOrganization(app, 'alpha');
      const site = await createLocation(org.agent, {
        name: 'SITE',
        code: 'SITE',
        type: 'site',
      });
      const shelf = await createLocation(org.agent, {
        name: 'SHELF',
        code: 'SHELF',
        type: 'bin',
        parentId: site,
      });
      const calm = await createVariant(org.agent, {
        type: 'good',
        name: 'Calm',
        variant: { sku: 'CALM-30', unitOfMeasure: 'each', tracksLots: true },
      });

      await org.agent
        .post('/v1/stock/movements')
        .send({
          variantId: calm,
          toLocationId: shelf,
          quantity: '10',
          reason: 'receipt',
          lot: { code: 'TOMORROW', expiresAt: after(todayIn(KIRITIMATI), 1) },
        })
        .expect(201);

      const expiring = async () =>
        body<{ entries: { lotCode: string | null }[] }>(
          await org.agent.get('/v1/stock?expiringWithin=1').expect(200),
        ).entries.map((row) => row.lotCode);

      await inZone(org, KIRITIMATI);
      expect(await expiring()).toEqual(['TOMORROW']);

      await inZone(org, PAGO_PAGO);
      expect(await expiring()).toEqual([]);
    });

    it("names a CSV export by the organization's today", async () => {
      const org = await registerOrganization(app, 'alpha');

      for (const zone of [KIRITIMATI, PAGO_PAGO]) {
        await inZone(org, zone);
        const res = await org.agent.get('/v1/orders/export').expect(200);
        expect(res.headers['content-disposition']).toBe(
          `attachment; filename="orders-${todayIn(zone)}.csv"`,
        );
      }
    });
  });
});
