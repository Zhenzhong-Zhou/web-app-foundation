import type { INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { and, eq } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { addresses, contacts, partners, roles } from '../src/database/schema';
import { MailService } from '../src/shared/mail/mail.service';
import {
  createTestApp,
  seedPermissions,
  unlimitedThrottler,
} from './utils/create-test-app';
import { RecordingMailService } from './utils/recording-mail';
import { authedAgent } from './utils/request';
import { resetDatabase } from './utils/reset-db';

interface PartnerResponse {
  id: string;
  name: string;
  code: string | null;
  taxId: string | null;
  isActive: boolean;
}

interface RegisterResponse {
  user: { id: string; organizationId: string };
}

function body<T>(res: { body: unknown }): T {
  return res.body as T;
}

/**
 * One table for customers and suppliers (ADR-026), so most of what is worth
 * asserting here is about what the table does *not* enforce: names collide
 * freely, codes do not, and nothing marks a partner as one kind or the other.
 */
describe('Partners (e2e)', () => {
  let app: INestApplication;
  let db: Database;

  const PASSWORD = 'correct-horse-battery';

  const partner = {
    name: 'Acme Supplies',
    code: 'ACME-01',
    taxId: 'GB123456789',
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

  describe('POST /v1/partners', () => {
    it('creates a partner with no kind attached to it', async () => {
      const alpha = await registerOrg('alpha');

      const res = await alpha.agent
        .post('/v1/partners')
        .send(partner)
        .expect(201);

      const created = body<{ partner: PartnerResponse }>(res).partner;

      expect(created.name).toBe('Acme Supplies');
      expect(created.isActive).toBe(true);

      /**
       * Nothing here says customer or supplier. What a partner is follows from
       * what has been traded with them (ADR-026) — flags would go stale because
       * nobody unsets them, and a stale flag is a filter that quietly excludes
       * the right answer.
       */
      const [row] = await db.select().from(partners);
      expect(Object.keys(row)).not.toContain('isCustomer');
      expect(Object.keys(row)).not.toContain('isSupplier');
    });

    it('creates a partner with no code at all', async () => {
      const alpha = await registerOrg('alpha');

      await alpha.agent
        .post('/v1/partners')
        .send({ name: 'Phoned In Ltd' })
        .expect(201);

      // Optional, and the unique index is partial — partners without a code
      // are simply not in it, so any number of them can exist.
      await alpha.agent
        .post('/v1/partners')
        .send({ name: 'Also Phoned In' })
        .expect(201);

      expect(await db.select().from(partners)).toHaveLength(2);
    });

    it('allows two partners to share a name', async () => {
      const alpha = await registerOrg('alpha');

      await alpha.agent
        .post('/v1/partners')
        .send({ name: 'Acme Supplies', code: 'ACME-LONDON' })
        .expect(201);

      /**
       * Two branches of one company are two partners, and a rebrand mid-year
       * leaves two rows with one name. Refusing this pushes someone into typing
       * "Acme (2)", which is worse than the duplicate.
       */
      await alpha.agent
        .post('/v1/partners')
        .send({ name: 'Acme Supplies', code: 'ACME-LEEDS' })
        .expect(201);

      expect(await db.select().from(partners)).toHaveLength(2);
    });

    it('rejects a duplicate code and names it', async () => {
      const alpha = await registerOrg('alpha');
      await alpha.agent.post('/v1/partners').send(partner).expect(201);

      const res = await alpha.agent
        .post('/v1/partners')
        .send({ ...partner, name: 'Acme Again' })
        .expect(409);

      // Naming the code tells the caller whether they meant the existing
      // partner or have a collision in their own numbering.
      expect(JSON.stringify(res.body)).toContain('ACME-01');
      expect(await db.select().from(partners)).toHaveLength(1);
    });

    it('allows the same code in another organization', async () => {
      const alpha = await registerOrg('alpha');
      const beta = await registerOrg('beta');

      await alpha.agent.post('/v1/partners').send(partner).expect(201);

      // Per organization, never globally — rejecting this would reveal that
      // another tenant exists.
      await beta.agent.post('/v1/partners').send(partner).expect(201);

      expect(await db.select().from(partners)).toHaveLength(2);
    });

    it('rejects a blank name', async () => {
      const alpha = await registerOrg('alpha');

      await alpha.agent.post('/v1/partners').send({ name: '   ' }).expect(400);
    });

    it('refuses a Viewer, which lacks partners.create', async () => {
      const alpha = await registerOrg('alpha');
      const viewer = await addViewer(alpha, 'viewer@alpha.example.com');

      await viewer.post('/v1/partners').send(partner).expect(403);
      expect(await db.select().from(partners)).toHaveLength(0);
    });

    it('requires a session', async () => {
      await authedAgent(app).post('/v1/partners').send(partner).expect(401);
    });
  });

  describe('GET /v1/partners', () => {
    it('does not show another organization partners', async () => {
      const alpha = await registerOrg('alpha');
      const beta = await registerOrg('beta');

      await beta.agent.post('/v1/partners').send(partner).expect(201);

      const res = await alpha.agent.get('/v1/partners').expect(200);
      expect(body<PartnerResponse[]>(res)).toHaveLength(0);
      expect(await db.select().from(partners)).toHaveLength(1);
    });

    it('includes retired partners', async () => {
      const alpha = await registerOrg('alpha');

      const created = body<{ partner: PartnerResponse }>(
        await alpha.agent.post('/v1/partners').send(partner).expect(201),
      ).partner;

      await alpha.agent
        .patch(`/v1/partners/${created.id}`)
        .send({ isActive: false })
        .expect(204);

      /**
       * The screen reading this is a directory, and a name that vanished is
       * harder to explain than one shown as inactive. The order form filters
       * them out instead — that is where an inactive partner is a mistake.
       */
      const res = await alpha.agent.get('/v1/partners').expect(200);
      const rows = body<PartnerResponse[]>(res);

      expect(rows).toHaveLength(1);
      expect(rows[0].isActive).toBe(false);
    });

    it('is readable by a Viewer, which holds partners.view', async () => {
      const alpha = await registerOrg('alpha');
      await alpha.agent.post('/v1/partners').send(partner).expect(201);
      const viewer = await addViewer(alpha, 'viewer@alpha.example.com');

      const res = await viewer.get('/v1/partners').expect(200);
      expect(body<PartnerResponse[]>(res)).toHaveLength(1);
    });
  });

  describe('PATCH /v1/partners/:id', () => {
    it('retires without deleting', async () => {
      const alpha = await registerOrg('alpha');

      const created = body<{ partner: PartnerResponse }>(
        await alpha.agent.post('/v1/partners').send(partner).expect(201),
      ).partner;

      await alpha.agent
        .patch(`/v1/partners/${created.id}`)
        .send({ isActive: false })
        .expect(204);

      // The row survives. A partner referenced by an order cannot be removed
      // without inventing gaps in the history the order exists to record, and
      // there is no partners.delete permission for the same reason.
      const [row] = await db.select().from(partners);
      expect(row.isActive).toBe(false);
    });

    it('refuses a partner in another organization', async () => {
      const alpha = await registerOrg('alpha');
      const beta = await registerOrg('beta');

      const created = body<{ partner: PartnerResponse }>(
        await beta.agent.post('/v1/partners').send(partner).expect(201),
      ).partner;

      // Scoped, so it is not found rather than forbidden — a 403 would confirm
      // the id exists somewhere.
      await alpha.agent
        .patch(`/v1/partners/${created.id}`)
        .send({ name: 'Hijacked' })
        .expect(404);
    });

    it('refuses a code already used by another partner', async () => {
      const alpha = await registerOrg('alpha');

      await alpha.agent.post('/v1/partners').send(partner).expect(201);

      const second = body<{ partner: PartnerResponse }>(
        await alpha.agent
          .post('/v1/partners')
          .send({ name: 'Other Ltd', code: 'OTHER-01' })
          .expect(201),
      ).partner;

      await alpha.agent
        .patch(`/v1/partners/${second.id}`)
        .send({ code: 'ACME-01' })
        .expect(409);
    });

    it('refuses a Viewer, which lacks partners.update', async () => {
      const alpha = await registerOrg('alpha');

      const created = body<{ partner: PartnerResponse }>(
        await alpha.agent.post('/v1/partners').send(partner).expect(201),
      ).partner;

      const viewer = await addViewer(alpha, 'viewer@alpha.example.com');

      await viewer
        .patch(`/v1/partners/${created.id}`)
        .send({ isActive: false })
        .expect(403);
    });
  });

  /**
   * Addresses and contacts hang off a partner through an exclusive arc
   * (ADR-028): one nullable foreign key per owner kind and a check that
   * exactly one is set. Almost everything worth asserting is about the two
   * rules the application cannot see — the partial unique index behind
   * is_default, and the fact that both children retire rather than delete.
   */
  describe('Partner addresses', () => {
    const address = {
      label: 'Head office',
      line1: '1 Example Way',
      city: 'Vancouver',
      region: 'BC',
      postalCode: 'V6B 1A1',
      country: 'CA',
    };

    async function createPartnerIn(
      org: Awaited<ReturnType<typeof registerOrg>>,
    ) {
      return body<{ partner: PartnerResponse }>(
        await org.agent.post('/v1/partners').send(partner).expect(201),
      ).partner;
    }

    it('stores the country uppercased', async () => {
      const alpha = await registerOrg('alpha');
      const created = await createPartnerIn(alpha);

      await alpha.agent
        .post(`/v1/partners/${created.id}/addresses`)
        .send({ ...address, country: 'ca' })
        .expect(201);

      /**
       * "ca" is unambiguous and refusing it would be pedantry, but storing
       * both spellings would make them two countries to every filter. The
       * transform runs before validation, so the @Matches on the uppercase
       * form never sees the original.
       */
      const [row] = await db.select().from(addresses);
      expect(row.country).toBe('CA');
    });

    it('demotes the previous default when a second one is set', async () => {
      const alpha = await registerOrg('alpha');
      const created = await createPartnerIn(alpha);

      const first = body<{ address: { id: string } }>(
        await alpha.agent
          .post(`/v1/partners/${created.id}/addresses`)
          .send({ ...address, isDefault: true })
          .expect(201),
      ).address;

      /**
       * A partial unique index makes the second default a 23505, not an
       * overwrite — so the service demotes and inserts in one transaction.
       * Two statements would leave a window with no default at all, and a
       * failure between them would leave the partner with none.
       */
      await alpha.agent
        .post(`/v1/partners/${created.id}/addresses`)
        .send({ ...address, label: 'Warehouse', isDefault: true })
        .expect(201);

      const rows = await db.select().from(addresses);
      expect(rows.filter((row) => row.isDefault)).toHaveLength(1);
      expect(rows.find((row) => row.id === first.id)?.isDefault).toBe(false);
    });

    it('retires rather than deletes, and clears the default flag', async () => {
      const alpha = await registerOrg('alpha');
      const created = await createPartnerIn(alpha);

      const first = body<{ address: { id: string } }>(
        await alpha.agent
          .post(`/v1/partners/${created.id}/addresses`)
          .send({ ...address, isDefault: true })
          .expect(201),
      ).address;

      // Another default has to exist first — see the refusal test below.
      await alpha.agent
        .post(`/v1/partners/${created.id}/addresses`)
        .send({ ...address, label: 'Warehouse', isDefault: true })
        .expect(201);

      await alpha.agent
        .delete(`/v1/partners/${created.id}/addresses/${first.id}`)
        .expect(204);

      /**
       * The row survives: an address deleted by accident has to be
       * recoverable, and "everywhere we have ever shipped" is a question
       * somebody eventually asks. is_default goes with it, because the index
       * counts a retired row and a stale flag would block the next default
       * with a 23505 nobody could explain.
       */
      const rows = await db.select().from(addresses);
      expect(rows).toHaveLength(2);

      const retired = rows.find((row) => row.id === first.id);
      expect(retired?.isActive).toBe(false);
      expect(retired?.isDefault).toBe(false);
    });

    it('refuses to retire the default while it is the only one', async () => {
      const alpha = await registerOrg('alpha');
      const created = await createPartnerIn(alpha);

      const only = body<{ address: { id: string } }>(
        await alpha.agent
          .post(`/v1/partners/${created.id}/addresses`)
          .send({ ...address, isDefault: true })
          .expect(201),
      ).address;

      // Refused rather than silently promoting another: which address becomes
      // the default is a decision, and guessing it is how a partner ends up
      // shipping to a closed warehouse.
      await alpha.agent
        .delete(`/v1/partners/${created.id}/addresses/${only.id}`)
        .expect(400);

      const [row] = await db.select().from(addresses);
      expect(row.isActive).toBe(true);
    });

    it('refuses an address reached through the wrong partner', async () => {
      const alpha = await registerOrg('alpha');
      const owner = await createPartnerIn(alpha);

      const other = body<{ partner: PartnerResponse }>(
        await alpha.agent
          .post('/v1/partners')
          .send({ name: 'Unrelated Ltd', code: 'OTHER-99' })
          .expect(201),
      ).partner;

      const created = body<{ address: { id: string } }>(
        await alpha.agent
          .post(`/v1/partners/${owner.id}/addresses`)
          .send(address)
          .expect(201),
      ).address;

      /**
       * Same tenant, wrong owner. Scoping to the organization alone would let
       * this through, and the audit row would name a partner that had nothing
       * to do with the change.
       */
      await alpha.agent
        .patch(`/v1/partners/${other.id}/addresses/${created.id}`)
        .send({ city: 'Hijacked' })
        .expect(404);
    });

    it('does not reach a partner in another organization', async () => {
      const alpha = await registerOrg('alpha');
      const beta = await registerOrg('beta');

      const theirs = body<{ partner: PartnerResponse }>(
        await beta.agent.post('/v1/partners').send(partner).expect(201),
      ).partner;

      await alpha.agent
        .post(`/v1/partners/${theirs.id}/addresses`)
        .send(address)
        .expect(404);

      expect(await db.select().from(addresses)).toHaveLength(0);
    });

    it('embeds addresses and contacts in the partner detail', async () => {
      const alpha = await registerOrg('alpha');
      const created = await createPartnerIn(alpha);

      await alpha.agent
        .post(`/v1/partners/${created.id}/addresses`)
        .send(address)
        .expect(201);

      await alpha.agent
        .post(`/v1/partners/${created.id}/contacts`)
        .send({ name: 'Dana Reed', email: 'dana@example.com' })
        .expect(201);

      // One request, because a detail view always wants all three. Three round
      // trips for one screen is the wrong shape at any scale.
      const res = await alpha.agent
        .get(`/v1/partners/${created.id}`)
        .expect(200);

      const detail = body<{
        addresses: unknown[];
        contacts: unknown[];
      }>(res);

      expect(detail.addresses).toHaveLength(1);
      expect(detail.contacts).toHaveLength(1);
    });

    it('refuses a Viewer, which lacks partners.update', async () => {
      const alpha = await registerOrg('alpha');
      const created = await createPartnerIn(alpha);
      const viewer = await addViewer(alpha, 'viewer@alpha.example.com');

      // No partners.addresses.* keys exist: an address is part of the partner
      // record, so the partner's own permissions govern it.
      await viewer
        .post(`/v1/partners/${created.id}/addresses`)
        .send(address)
        .expect(403);

      await viewer.get(`/v1/partners/${created.id}`).expect(200);
    });
  });

  describe('Partner contacts', () => {
    const contact = { name: 'Dana Reed', email: 'dana@example.com' };

    async function createPartnerIn(
      org: Awaited<ReturnType<typeof registerOrg>>,
    ) {
      return body<{ partner: PartnerResponse }>(
        await org.agent.post('/v1/partners').send(partner).expect(201),
      ).partner;
    }

    it('requires an email or a phone', async () => {
      const alpha = await registerOrg('alpha');
      const created = await createPartnerIn(alpha);

      /**
       * Enforced by a check constraint, not by the DTO — an update may supply
       * one and rely on the other already being stored, so the rule cannot
       * live in validation. A contact with neither is a name in a box.
       */
      await alpha.agent
        .post(`/v1/partners/${created.id}/contacts`)
        .send({ name: 'Unreachable Person' })
        .expect(500);

      expect(await db.select().from(contacts)).toHaveLength(0);
    });

    it('allows one person at two partners', async () => {
      const alpha = await registerOrg('alpha');
      const first = await createPartnerIn(alpha);

      const second = body<{ partner: PartnerResponse }>(
        await alpha.agent
          .post('/v1/partners')
          .send({ name: 'New Employer Ltd', code: 'NEW-01' })
          .expect(201),
      ).partner;

      await alpha.agent
        .post(`/v1/partners/${first.id}/contacts`)
        .send(contact)
        .expect(201);

      // Deliberately not unique: a rep changes employer, and a shared inbox is
      // one address for four people.
      await alpha.agent
        .post(`/v1/partners/${second.id}/contacts`)
        .send(contact)
        .expect(201);

      expect(await db.select().from(contacts)).toHaveLength(2);
    });

    it('demotes the previous primary when a second one is set', async () => {
      const alpha = await registerOrg('alpha');
      const created = await createPartnerIn(alpha);

      const first = body<{ contact: { id: string } }>(
        await alpha.agent
          .post(`/v1/partners/${created.id}/contacts`)
          .send({ ...contact, isPrimary: true })
          .expect(201),
      ).contact;

      await alpha.agent
        .post(`/v1/partners/${created.id}/contacts`)
        .send({ name: 'Sam Patel', phone: '555-0100', isPrimary: true })
        .expect(201);

      const rows = await db.select().from(contacts);
      expect(rows.filter((row) => row.isPrimary)).toHaveLength(1);
      expect(rows.find((row) => row.id === first.id)?.isPrimary).toBe(false);
    });

    it('retires rather than deletes', async () => {
      const alpha = await registerOrg('alpha');
      const created = await createPartnerIn(alpha);

      const only = body<{ contact: { id: string } }>(
        await alpha.agent
          .post(`/v1/partners/${created.id}/contacts`)
          .send({ ...contact, isPrimary: true })
          .expect(201),
      ).contact;

      /**
       * No refusal for the last primary, unlike the default address. A contact
       * may be named on an order that already shipped, so the row has to
       * survive — but nothing downstream picks a contact automatically, so
       * leaving a partner with none is a gap rather than a wrong shipment.
       */
      await alpha.agent
        .delete(`/v1/partners/${created.id}/contacts/${only.id}`)
        .expect(204);

      const [row] = await db.select().from(contacts);
      expect(row.isActive).toBe(false);
      expect(row.isPrimary).toBe(false);
    });
  });
});
