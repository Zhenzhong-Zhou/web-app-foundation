import type { INestApplication } from '@nestjs/common';
import { and, eq, isNotNull } from 'drizzle-orm';

import { addDays, todayIn } from '../src/common/today';
import { PasswordService } from '../src/core/auth/password.service';
import type { MemberAccess } from '../src/core/authorization/dto/member-access-response.dto';
import { ALL_PERMISSIONS } from '../src/core/authorization/permissions';
import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import {
  memberships,
  notifications,
  organizations,
  users,
} from '../src/database/schema';
import type { Welcome } from '../src/modules/home/dto/home-response.dto';
import {
  body,
  createE2eApp,
  createLocation,
  createPartner,
  createVariant,
  customRole,
  invitationToken,
  PASSWORD,
  registerOrganization,
  roleIdNamed,
} from './utils/fixtures';
import { RecordingMailService } from './utils/recording-mail';
import { authedAgent } from './utils/request';
import { resetDatabase } from './utils/reset-db';

interface Notification {
  type: string;
  title: string;
  body: string | null;
  resourceType: string | null;
  resourceId: string | null;
}

const DAY = 86_400_000;

/**
 * The welcome on Home (ADR-079): the member's own card for two weeks from
 * joining, with the inviter's note, what they may do here and whom to ask,
 * and a first week chosen from their permissions and ticked by what they
 * do; and the inviter told in the bell when they join.
 */
describe('The welcome (e2e)', () => {
  let app: INestApplication;
  let db: Database;
  let mail: RecordingMailService;

  beforeAll(async () => {
    mail = new RecordingMailService();
    app = await createE2eApp(mail);
    db = app.get<Database>(UNSAFE_GLOBAL_DB);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    mail.reset();
  });

  type Owner = Awaited<ReturnType<typeof registerOrganization>>;
  type Agent = Owner['agent'];

  /**
   * An organization whose Owner may invite, their address confirmed; with
   * Getting started dismissed, unless a test is about it, so a newcomer's
   * first week is their whole list.
   */
  async function organization(
    slugish: string,
    options: { gettingStarted?: boolean } = {},
  ): Promise<Owner> {
    const owner = await registerOrganization(app, slugish);
    await db
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(users.id, owner.userId));
    if (!options.gettingStarted) {
      await owner.agent.post('/v1/home/getting-started/dismiss').expect(204);
    }
    return owner;
  }

  /**
   * Someone invited by `inviter` who accepted by the link: the emailed
   * one, or a copied one, which leaves the address unconfirmed (ADR-077).
   */
  async function join(
    inviter: { agent: Agent; organizationId: string },
    email: string,
    role = 'Viewer',
    options: { name?: string; note?: string; copied?: boolean } = {},
  ) {
    const res = await inviter.agent
      .post('/v1/invitations')
      .send({
        email,
        roleId: await roleIdNamed(app, inviter.organizationId, role),
        ...(options.note ? { note: options.note } : {}),
        ...(options.copied ? { delivery: 'link' } : {}),
      })
      .expect(201);
    const token = options.copied
      ? body<{ link: string }>(res).link.split('token=')[1]
      : invitationToken(app, email);

    const agent = authedAgent(app);
    const accepted = await agent
      .post('/v1/invitations/accept')
      .send({ token, name: options.name ?? 'Sam Lee', password: PASSWORD })
      .expect(200);
    return {
      agent,
      organizationId: inviter.organizationId,
      userId: body<{ user: { id: string } }>(accepted).user.id,
    };
  }

  async function welcome(agent: Agent): Promise<Welcome | null> {
    return body<{ welcome: Welcome | null }>(
      await agent.get('/v1/home').expect(200),
    ).welcome;
  }

  const keys = (card: Welcome | null) => card?.items.map((item) => item.key);
  const item = (card: Welcome | null, key: string) =>
    card?.items.find((each) => each.key === key);

  /**
   * As if they joined `days` ago, by an emailed link, which confirmed their
   * address as they joined.
   */
  async function joinedDaysAgo(userId: string, days: number) {
    const at = new Date(Date.now() - days * DAY);
    await db
      .update(memberships)
      .set({ createdAt: at })
      .where(eq(memberships.userId, userId));
    await db
      .update(users)
      .set({ emailVerifiedAt: at })
      .where(and(eq(users.id, userId), isNotNull(users.emailVerifiedAt)));
  }

  describe('who sees it, and until when', () => {
    it('shows a newcomer theirs from the day they join until fourteen days later, in the organization’s zone', async () => {
      const alpha = await organization('alpha');
      const sam = await join(alpha, 'sam@example.com');

      const today = todayIn('UTC');
      expect(await welcome(sam.agent)).toMatchObject({
        joinedOn: today,
        lastDay: addDays(today, 14),
        founder: false,
      });

      // Its days are the organization's (ADR-072): already tomorrow on
      // Kiritimati for most of a UTC day.
      await db
        .update(organizations)
        .set({ timeZone: 'Pacific/Kiritimati' })
        .where(eq(organizations.id, alpha.organizationId));
      expect((await welcome(sam.agent))?.joinedOn).toBe(
        todayIn('Pacific/Kiritimati'),
      );
      await db
        .update(organizations)
        .set({ timeZone: 'UTC' })
        .where(eq(organizations.id, alpha.organizationId));

      // Its last day, then gone.
      await joinedDaysAgo(sam.userId, 14);
      expect((await welcome(sam.agent))?.lastDay).toBe(today);
      await joinedDaysAgo(sam.userId, 15);
      expect(await welcome(sam.agent)).toBeNull();
    });

    it('goes when dismissed, and Undo brings it back, for that membership alone', async () => {
      const alpha = await organization('alpha');
      const sam = await join(alpha, 'sam@example.com');
      const pat = await join(alpha, 'pat@example.com', 'Viewer', {
        name: 'Pat Kim',
      });

      // A Viewer's own: no permission asked.
      await sam.agent.post('/v1/home/welcome/dismiss').expect(204);
      expect(await welcome(sam.agent)).toBeNull();
      expect(await welcome(pat.agent)).not.toBeNull();

      const dismissed = await db
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(isNotNull(memberships.welcomeDismissedAt));
      expect(dismissed).toEqual([{ userId: sam.userId }]);

      await sam.agent.delete('/v1/home/welcome/dismiss').expect(204);
      expect(await welcome(sam.agent)).not.toBeNull();
    });
  });

  describe('the first week', () => {
    it('lists an Admin’s own and the first three of their work, each ticked by their own act and not by another member’s, until every item is done', async () => {
      const alpha = await organization('alpha');
      const li = await join(alpha, 'li@example.com', 'Admin', {
        name: 'Li Na',
      });

      const before = await welcome(li.agent);
      // Joined by an emailed link, so confirmed as they joined.
      expect(keys(before)).toEqual([
        'sayWhoYouAre',
        'lookUp',
        'receiveStock',
        'raiseOrder',
      ]);
      expect(before?.items.every((each) => !each.done && !each.what)).toBe(
        true,
      );

      const shelf = await createLocation(alpha.agent, {
        type: 'site',
        name: 'Shelf',
      });
      const variantId = await createVariant(alpha.agent, {
        type: 'good',
        name: 'Vitamin D3',
        variant: { sku: 'VD3-1000', tracksLots: true },
      });
      const partnerId = await createPartner(alpha.agent, { name: 'Supplier' });
      const receive = (agent: Agent, code: string) =>
        agent
          .post('/v1/stock/movements')
          .send({
            variantId,
            toLocationId: shelf,
            quantity: '10',
            reason: 'receipt',
            lot: { code },
          })
          .expect(201)
          .then((res) => body<{ movement: { lotId: string } }>(res).movement);
      const raise = (agent: Agent) =>
        agent
          .post('/v1/orders')
          .send({
            partnerId,
            direction: 'purchase',
            lines: [{ variantId, quantityOrdered: '5' }],
          })
          .expect(201)
          .then(
            (res) => body<{ order: { id: string; number: string } }>(res).order,
          );

      // The Owner does all three: nothing of Li's is ticked.
      const ownerLot = await receive(alpha.agent, 'NN-2410-01');
      await alpha.agent
        .post('/v1/recent')
        .send({ kind: 'lot', id: ownerLot.lotId })
        .expect(204);
      await raise(alpha.agent);
      expect((await welcome(li.agent))?.items.some((each) => each.done)).toBe(
        false,
      );

      // A movement that is not a receipt receives nothing.
      await li.agent
        .post('/v1/stock/movements')
        .send({
          variantId,
          fromLocationId: shelf,
          lotId: ownerLot.lotId,
          quantity: '1',
          reason: 'adjustment',
          reasonDetail: 'miscount',
          note: 'One missing from the shelf',
        })
        .expect(201);
      expect(item(await welcome(li.agent), 'receiveStock')?.done).toBe(false);

      // Li's own, each naming what was done.
      await li.agent
        .post('/v1/recent')
        .send({ kind: 'lot', id: ownerLot.lotId })
        .expect(204);
      const lot = await receive(li.agent, 'NN-2410-07');
      const order = await raise(li.agent);

      const after = await welcome(li.agent);
      expect(item(after, 'lookUp')).toEqual({
        key: 'lookUp',
        done: true,
        what: { kind: 'lot', id: ownerLot.lotId, words: 'NN-2410-01' },
      });
      expect(item(after, 'receiveStock')?.what).toEqual({
        kind: 'lot',
        id: lot.lotId,
        words: 'NN-2410-07',
      });
      expect(item(after, 'raiseOrder')?.what).toEqual({
        kind: 'order',
        id: order.id,
        words: order.number,
      });
      expect(item(after, 'sayWhoYouAre')?.done).toBe(false);

      // Say who you are, by a job title here; then every item is done.
      await li.agent
        .patch('/v1/account/details')
        .send({ jobTitle: 'Warehouse lead' })
        .expect(204);
      expect(await welcome(li.agent)).toBeNull();
    });

    it('ticks shipping, planning a run and drafting an invoice each by its own entry, naming what was done', async () => {
      const alpha = await organization('alpha');
      await customRole(app, alpha.organizationId, 'Dispatch', [
        'orders.view',
        'orders.ship',
        'production.create',
        'invoices.create',
      ]);
      const jo = await join(alpha, 'jo@example.com', 'Dispatch', {
        name: 'Jo Park',
      });
      expect(keys(await welcome(jo.agent))).toEqual([
        'sayWhoYouAre',
        'shipOrder',
        'planRun',
        'draftInvoice',
      ]);

      // A confirmed sale, in stock, for Jo to ship.
      const shelf = await createLocation(alpha.agent, {
        type: 'site',
        name: 'Shelf',
      });
      const variantId = await createVariant(alpha.agent, {
        type: 'good',
        name: 'Focus 60ct',
        variant: { sku: 'FOCUS-60' },
      });
      await alpha.agent
        .post('/v1/stock/movements')
        .send({
          variantId,
          toLocationId: shelf,
          quantity: '100',
          reason: 'receipt',
        })
        .expect(201);
      const partnerId = await createPartner(alpha.agent, {
        name: 'Northside Pharmacy',
      });
      const sale = body<{
        order: { id: string; number: string; lines: { id: string }[] };
      }>(
        await alpha.agent
          .post('/v1/orders')
          .send({
            partnerId,
            direction: 'sale',
            lines: [
              {
                variantId,
                quantityOrdered: '10',
                unitPrice: '12.5',
                currency: 'CAD',
              },
            ],
          })
          .expect(201),
      ).order;
      await alpha.agent
        .patch(`/v1/orders/${sale.id}`)
        .send({ status: 'confirmed' })
        .expect(204);

      const shipment = body<{ shipment: { id: string } }>(
        await jo.agent
          .post(`/v1/orders/${sale.id}/shipments`)
          .send({
            fromLocationId: shelf,
            lines: [{ lineId: sale.lines[0].id, quantity: '4' }],
          })
          .expect(201),
      ).shipment;
      const invoice = body<{ invoice: { id: string } }>(
        await jo.agent
          .post('/v1/invoices')
          .send({ shipmentId: shipment.id })
          .expect(201),
      ).invoice;
      const run = body<{ productionOrder: { id: string } }>(
        await jo.agent
          .post('/v1/production-orders')
          .send({
            outputVariantId: variantId,
            locationId: shelf,
            quantityPlanned: '50',
            reference: 'RUN-01',
          })
          .expect(201),
      ).productionOrder;

      const after = await welcome(jo.agent);
      expect(item(after, 'shipOrder')?.what).toEqual({
        kind: 'order',
        id: sale.id,
        words: sale.number,
      });
      expect(item(after, 'planRun')?.what).toEqual({
        kind: 'run',
        id: run.id,
        words: 'RUN-01',
      });
      // A draft has no number yet: named by its customer.
      expect(item(after, 'draftInvoice')?.what).toEqual({
        kind: 'invoice',
        id: invoice.id,
        words: 'Northside Pharmacy',
      });
    });

    it('gives someone who may do none of the five Open an order after the lookup, each ticked by opening one', async () => {
      const alpha = await organization('alpha');
      const sam = await join(alpha, 'sam@example.com');
      expect(keys(await welcome(sam.agent))).toEqual([
        'sayWhoYouAre',
        'lookUp',
        'openOrder',
      ]);

      const variantId = await createVariant(alpha.agent, {
        type: 'good',
        name: 'Vitamin D3',
        variant: { sku: 'VD3-1000' },
      });
      const order = body<{ order: { id: string; number: string } }>(
        await alpha.agent
          .post('/v1/orders')
          .send({
            partnerId: await createPartner(alpha.agent, { name: 'Supplier' }),
            direction: 'purchase',
            lines: [{ variantId, quantityOrdered: '5' }],
          })
          .expect(201),
      ).order;
      await sam.agent
        .post('/v1/recent')
        .send({ kind: 'order', id: order.id })
        .expect(204);
      const card = await welcome(sam.agent);
      expect(item(card, 'openOrder')?.what).toEqual({
        kind: 'order',
        id: order.id,
        words: order.number,
      });
      // An order is not a product or a lot.
      expect(item(card, 'lookUp')?.done).toBe(false);
    });

    it('keeps only the member’s own two while Getting started shows, Confirm your email address first for whoever joined unconfirmed', async () => {
      const alpha = await organization('alpha', { gettingStarted: true });
      const li = await join(alpha, 'li@example.com', 'Admin', {
        name: 'Li Na',
      });
      const pat = await join(alpha, 'pat@example.com', 'Admin', {
        name: 'Pat Kim',
        copied: true,
      });

      expect(keys(await welcome(li.agent))).toEqual(['sayWhoYouAre']);
      expect(keys(await welcome(pat.agent))).toEqual([
        'confirmEmail',
        'sayWhoYouAre',
      ]);

      // Getting started gone, the week is whole again.
      await alpha.agent.post('/v1/home/getting-started/dismiss').expect(204);
      expect(keys(await welcome(pat.agent))).toEqual([
        'confirmEmail',
        'sayWhoYouAre',
        'lookUp',
        'receiveStock',
        'raiseOrder',
      ]);

      // Confirmed later: still listed, and ticked.
      await db
        .update(users)
        .set({ emailVerifiedAt: new Date() })
        .where(eq(users.id, pat.userId));
      expect(item(await welcome(pat.agent), 'confirmEmail')).toEqual({
        key: 'confirmEmail',
        done: true,
        what: { kind: 'email', id: null, words: null },
      });
    });

    it('reads joining by an emailed link as joined confirmed, signed in or not', async () => {
      // An account unconfirmed and in no organization: joined one by a
      // copied link, then left it.
      const beta = await organization('beta');
      const pat = await join(beta, 'pat@example.com', 'Viewer', {
        name: 'Pat Kim',
        copied: true,
      });
      await pat.agent.delete('/v1/account/membership').expect(204);

      // Alpha's emailed link, accepted signed in: confirmed by joining.
      const alpha = await organization('alpha');
      await alpha.agent
        .post('/v1/invitations')
        .send({
          email: 'pat@example.com',
          roleId: await roleIdNamed(app, alpha.organizationId, 'Viewer'),
        })
        .expect(201);
      await pat.agent
        .post('/v1/invitations/accept')
        .send({ token: invitationToken(app, 'pat@example.com') })
        .expect(200);

      expect(keys(await welcome(pat.agent))).not.toContain('confirmEmail');
    });
  });

  describe('the founder', () => {
    it('greets whoever started the organization with no inviter or note, and their own two while Getting started shows', async () => {
      const alpha = await registerOrganization(app, 'alpha');

      const card = await welcome(alpha.agent);
      expect(card).toMatchObject({
        founder: true,
        inviter: null,
        note: null,
        access: { holdsEverything: true, whomToAsk: [] },
      });
      expect(card?.access.role.name).toBe('Owner');
      // Registered unconfirmed (ADR-078).
      expect(keys(card)).toEqual(['confirmEmail', 'sayWhoYouAre']);

      await db
        .update(users)
        .set({ emailVerifiedAt: new Date() })
        .where(eq(users.id, alpha.userId));
      expect(item(await welcome(alpha.agent), 'confirmEmail')?.done).toBe(true);
    });

    it('is the membership made with the organization, not one with no invitation behind it', async () => {
      const alpha = await organization('alpha');

      // A colleague added with no invitation, as the demo seed adds them.
      const [colleague] = await db
        .insert(users)
        .values({
          email: 'mei@example.com',
          name: 'Mei Lin',
          passwordHash: await app.get(PasswordService).hash(PASSWORD),
          emailVerifiedAt: new Date(),
        })
        .returning({ id: users.id });
      await db.insert(memberships).values({
        userId: colleague.id,
        organizationId: alpha.organizationId,
        roleId: await roleIdNamed(app, alpha.organizationId, 'Admin'),
      });
      const mei = authedAgent(app);
      await mei
        .post('/v1/auth/login')
        .send({ email: 'mei@example.com', password: PASSWORD })
        .expect(200);

      expect(await welcome(mei)).toMatchObject({
        founder: false,
        inviter: null,
        note: null,
      });
      expect((await welcome(alpha.agent))?.founder).toBe(true);
    });

    it('stays the founder’s once they leave: the next member keeps their own card and note', async () => {
      const alpha = await organization('alpha');
      const note = 'Welcome, Mei! The books are yours from Monday.';
      const mei = await join(alpha, 'mei@example.com', 'Owner', {
        name: 'Mei Lin',
        note,
      });

      // Another Owner now, so the founder may leave within their two weeks.
      await alpha.agent.delete('/v1/account/membership').expect(204);

      expect(await welcome(mei.agent)).toMatchObject({
        founder: false,
        inviter: null,
        note,
      });
    });
  });

  describe('the inviter and the note', () => {
    it('shows the note under its inviter, and from the organization once they have left', async () => {
      const alpha = await organization('alpha');
      const mei = await join(alpha, 'mei@example.com', 'Admin', {
        name: 'Mei Lin',
      });
      const note =
        'Welcome, Sam! On Monday you’ll shadow Li Na at the North site.';
      const sam = await join(mei, 'sam@example.com', 'Viewer', { note });
      const pat = await join(alpha, 'pat@example.com', 'Viewer', {
        name: 'Pat Kim',
      });

      expect(await welcome(sam.agent)).toMatchObject({
        inviter: { id: mei.userId, name: 'Mei Lin', photoFileId: null },
        note,
      });
      expect((await welcome(pat.agent))?.note).toBeNull();

      await mei.agent.delete('/v1/account/membership').expect(204);
      expect(await welcome(sam.agent)).toMatchObject({ inviter: null, note });
    });
  });

  describe('what you can do here', () => {
    it('names up to three who may change roles, those who joined first first, never the reader, and none for someone who may', async () => {
      const alpha = await organization('alpha');
      const ana = await join(alpha, 'ana@example.com', 'Admin', {
        name: 'Ana Ruiz',
      });
      await join(alpha, 'ben@example.com', 'Admin', { name: 'Ben Ode' });
      await join(alpha, 'cy@example.com', 'Admin', { name: 'Cy Tan' });
      const sam = await join(alpha, 'sam@example.com');

      const access = (await welcome(sam.agent))?.access;
      expect(access?.whomToAsk.map((each) => each.name)).toEqual([
        'Owner',
        'Ana Ruiz',
        'Ben Ode',
      ]);
      expect(access).toMatchObject({
        role: { name: 'Viewer' },
        holdsEverything: false,
      });

      // Account's is the same answer.
      expect(
        body<MemberAccess>(
          await sam.agent.get('/v1/account/membership').expect(200),
        ),
      ).toEqual(access);

      // Someone who may change roles asks nobody, the Owner included.
      expect((await welcome(ana.agent))?.access).toMatchObject({
        holdsEverything: false,
        whomToAsk: [],
      });
      expect(
        body<MemberAccess>(
          await alpha.agent.get('/v1/account/membership').expect(200),
        ),
      ).toMatchObject({ holdsEverything: true, whomToAsk: [] });
    });

    it('says whoever holds every permission may do everything, whatever the role is called', async () => {
      const alpha = await organization('alpha');
      await customRole(app, alpha.organizationId, 'Partner', ALL_PERMISSIONS);
      const partner = await join(alpha, 'jo@example.com', 'Partner', {
        name: 'Jo Park',
      });

      expect(
        body<MemberAccess>(
          await partner.agent.get('/v1/account/membership').expect(200),
        ),
      ).toMatchObject({
        role: { name: 'Partner' },
        holdsEverything: true,
        whomToAsk: [],
      });
    });

    it('has nothing to show someone working in no organization', async () => {
      const alpha = await organization('alpha');
      const sam = await join(alpha, 'sam@example.com');
      await sam.agent.delete('/v1/account/membership').expect(204);

      await sam.agent.get('/v1/account/membership').expect(404);
    });
  });

  describe('the inviter hears', () => {
    async function listIn(agent: Agent, language: string) {
      return body<{ entries: Notification[] }>(
        await agent
          .get('/v1/notifications')
          .set('Accept-Language', language)
          .expect(200),
      ).entries.filter((entry) => entry.type === 'invitation.accepted');
    }

    it('tells the inviter in the bell, in their language, opening the newcomer on People', async () => {
      const alpha = await organization('alpha');
      const mei = await join(alpha, 'mei@example.com', 'Admin', {
        name: 'Mei Lin',
      });
      await db
        .update(users)
        .set({ locale: 'zh-Hans' })
        .where(eq(users.id, mei.userId));
      const invitedMei = mail.sent.length;

      const sam = await join(mei, 'sam@example.com');

      // Written in Mei's language, and read in whichever she reads in.
      const stored = await db
        .select({
          organizationId: notifications.organizationId,
          title: notifications.title,
        })
        .from(notifications)
        .where(
          and(
            eq(notifications.type, 'invitation.accepted'),
            eq(notifications.userId, mei.userId),
          ),
        );
      expect(stored).toEqual([
        { organizationId: alpha.organizationId, title: 'Sam Lee加入了' },
      ]);
      expect(await listIn(mei.agent, 'en')).toEqual([
        expect.objectContaining({
          title: 'Sam Lee joined',
          body: 'Sam Lee accepted your invitation and joined alpha Co as a Viewer.',
          resourceType: 'user',
          resourceId: sam.userId,
        }),
      ]);
      expect((await listIn(mei.agent, 'fr-CA'))[0]).toMatchObject({
        title: 'Nouvelle arrivée : Sam Lee',
        body: 'Sam Lee a accepté votre invitation et fait maintenant partie de alpha Co en tant que Lecteur.',
      });
      expect((await listIn(mei.agent, 'zh-Hans'))[0]?.body).toBe(
        'Sam Lee接受了您的邀请，以查看者身份加入 alpha Co。',
      );

      // Mei's alone, and the bell alone: no email to her. The Owner heard
      // only of Mei, whom they invited.
      expect(
        (await listIn(alpha.agent, 'en')).map((entry) => entry.title),
      ).toEqual(['Mei Lin joined']);
      expect(
        mail.sent
          .slice(invitedMei)
          .filter((each) => each.to === 'mei@example.com'),
      ).toEqual([]);
    });

    it('tells nobody once the inviter has left', async () => {
      const alpha = await organization('alpha');
      const mei = await join(alpha, 'mei@example.com', 'Admin', {
        name: 'Mei Lin',
      });
      await mei.agent
        .post('/v1/invitations')
        .send({
          email: 'pat@example.com',
          roleId: await roleIdNamed(app, alpha.organizationId, 'Viewer'),
        })
        .expect(201);
      await mei.agent.delete('/v1/account/membership').expect(204);

      await authedAgent(app)
        .post('/v1/invitations/accept')
        .send({
          token: invitationToken(app, 'pat@example.com'),
          name: 'Pat Kim',
          password: PASSWORD,
        })
        .expect(200);

      expect(
        await db
          .select({ id: notifications.id })
          .from(notifications)
          .where(
            and(
              eq(notifications.type, 'invitation.accepted'),
              eq(notifications.userId, mei.userId),
            ),
          ),
      ).toEqual([]);
    });
  });
});
