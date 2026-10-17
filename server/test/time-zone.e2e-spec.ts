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
import { clearOfMidnight, KIRITIMATI, PAGO_PAGO } from './utils/time-zones';

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

    it('stores the current name, Kolkata, where Node says Calcutta', async () => {
      const agent = authedAgent(app);
      await register(agent, { timeZone: 'Asia/Kolkata' }).expect(201);

      expect((await organization(agent)).timeZone).toBe('Asia/Kolkata');
    });

    // Nobody typed it, so nobody could correct it: the organization starts
    // on UTC rather than the registration failing.
    it('starts on UTC when the browser reports a zone the server does not take', async () => {
      const reported = ['Etc/Unknown', 'Mars/Olympus_Mons', '+05:00', 'EST'];
      for (const [index, timeZone] of reported.entries()) {
        const agent = authedAgent(app);
        await register(agent, {
          email: `owner${index}@zone.example.com`,
          timeZone,
        }).expect(201);

        expect((await organization(agent)).timeZone).toBe('UTC');
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

    // Chrome lists Kyiv under its old name; Safari knows only the new one.
    it('stores Europe/Kiev as Europe/Kyiv', async () => {
      const org = await registerOrganization(app, 'alpha');

      await org.agent
        .patch('/v1/organization')
        .send({ timeZone: 'Europe/Kiev' })
        .expect(204);
      expect((await organization(org.agent)).timeZone).toBe('Europe/Kyiv');
      expect((await session(org.agent)).timeZone).toBe('Europe/Kyiv');
    });

    it('refuses an offset, and leaves the zone as it was', async () => {
      const org = await registerOrganization(app, 'alpha');

      // Offsets under other names too: Etc/GMT+8 is UTC−8 all year, and
      // EST is Panama's zone to Intl.
      for (const timeZone of ['-0800', 'Etc/GMT+8', 'EST']) {
        const res = await org.agent
          .patch('/v1/organization')
          .send({ timeZone })
          .expect(400);
        expect(JSON.stringify(res.body)).toContain('time zone');
      }
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

    /** Ten of a tracked good on a shelf, in one lot expiring on a day. */
    async function receiveLot(
      org: { agent: Agent },
      code: string,
      expiresAt: string,
    ) {
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
          lot: { code, expiresAt },
        })
        .expect(201);
    }

    /**
     * Expiring soon counts from the organization's today (ADR-060, ADR-072),
     * not the database's. A lot expiring the day after Kiritimati's today
     * is within a day there, and never within a day in Pago Pago, which is
     * always at least a day behind.
     */
    it("counts expiring stock from the organization's today", async () => {
      const org = await registerOrganization(app, 'alpha');
      await clearOfMidnight([KIRITIMATI]);
      await receiveLot(org, 'TOMORROW', after(todayIn(KIRITIMATI), 1));

      const expiring = async () =>
        body<{ entries: { lotCode: string | null }[] }>(
          await org.agent.get('/v1/stock?expiringWithin=1').expect(200),
        ).entries.map((row) => row.lotCode);

      await inZone(org, KIRITIMATI);
      expect(await expiring()).toEqual(['TOMORROW']);

      await inZone(org, PAGO_PAGO);
      expect(await expiring()).toEqual([]);
    });

    /**
     * Home counts from the organization's today, which the server decides
     * (ADR-058, ADR-072): a lot whose last day is Pago Pago's today is due
     * today there and already late in Kiritimati, a day or two on.
     */
    it("counts Home's cards from the organization's today", async () => {
      const org = await registerOrganization(app, 'alpha');
      await clearOfMidnight([PAGO_PAGO]);
      await receiveLot(org, 'LAST-DAY', todayIn(PAGO_PAGO));

      const expiring = async () =>
        body<{ cards: { kind: string; count: number; late: number }[] }>(
          await org.agent.get('/v1/home').expect(200),
        ).cards.find((card) => card.kind === 'expiring');

      await inZone(org, PAGO_PAGO);
      expect(await expiring()).toMatchObject({ count: 1, late: 0 });

      await inZone(org, KIRITIMATI);
      expect(await expiring()).toMatchObject({ count: 1, late: 1 });
    });

    it("names a CSV export by the organization's today", async () => {
      const org = await registerOrganization(app, 'alpha');

      for (const zone of [KIRITIMATI, PAGO_PAGO]) {
        await inZone(org, zone);
        await clearOfMidnight([zone]);
        const res = await org.agent.get('/v1/orders/export').expect(200);
        expect(res.headers['content-disposition']).toBe(
          `attachment; filename="orders-${todayIn(zone)}.csv"`,
        );
      }
    });

    it("names the organization's export by its today", async () => {
      const org = await registerOrganization(app, 'alpha');

      for (const zone of [KIRITIMATI, PAGO_PAGO]) {
        await inZone(org, zone);
        await clearOfMidnight([zone]);
        const today = todayIn(zone);
        const res = await org.agent
          .get('/v1/organization/export')
          .responseType('blob')
          .expect(200);
        expect(res.headers['content-disposition']).toMatch(
          new RegExp(`-export-${today}\\.zip"$`),
        );
      }
    });
  });
});
