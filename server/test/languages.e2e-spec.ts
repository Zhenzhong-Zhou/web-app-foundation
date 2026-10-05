import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { isCheckViolation, isUniqueViolation } from '../src/database/errors';
import {
  accountEvents,
  auditLog,
  creditNotes,
  invoices,
  organizations,
  partners,
  productTranslations,
  productVariants,
  shipments,
  users,
  variantTranslations,
} from '../src/database/schema';
import {
  body,
  createE2eApp,
  createPartner,
  createVariant,
  PASSWORD,
  registerOrganization,
} from './utils/fixtures';
import { authedAgent } from './utils/request';
import { resetDatabase } from './utils/reset-db';
import { shippedSale } from './utils/sales';

/**
 * Languages (ADR-054).
 *
 * The schema first: the columns and the database's half of their rules,
 * written straight to the tables so they hold whatever a route does. A
 * language pair is whole and never repeats itself, a product has one name
 * per language and never a blank one, and a draft invoice has no language
 * yet.
 *
 * Then the routes, as each arrives: the person's language, kept on the user
 * and returned wherever the client learns who it is; then the document
 * languages, set on the organization and the partner, resolved when the
 * paper becomes a document and never again.
 */
describe('Languages (e2e)', () => {
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

  /** The error a write fails with; a write that succeeds fails the test. */
  async function refusal(write: PromiseLike<unknown>): Promise<unknown> {
    try {
      await write;
    } catch (error) {
      return error;
    }
    throw new Error('the database accepted a row it should have refused');
  }

  it('starts a person on the browser language and an organization on English alone', async () => {
    const alpha = await registerOrganization(app, 'alpha');

    const [user] = await db
      .select({ locale: users.locale })
      .from(users)
      .where(eq(users.id, alpha.userId));
    expect(user.locale).toBeNull();

    const [organization] = await db
      .select({
        documentLanguage: organizations.documentLanguage,
        documentSecondLanguage: organizations.documentSecondLanguage,
        requiredNameLanguages: organizations.requiredNameLanguages,
      })
      .from(organizations)
      .where(eq(organizations.id, alpha.organizationId));
    expect(organization).toEqual({
      documentLanguage: 'en',
      documentSecondLanguage: null,
      requiredNameLanguages: [],
    });
  });

  it('never repeats an organization language, and stores what it requires', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const byId = eq(organizations.id, alpha.organizationId);

    const error = await refusal(
      db
        .update(organizations)
        .set({ documentSecondLanguage: 'en' })
        .where(byId),
    );
    expect(
      isCheckViolation(error, 'organizations_document_languages_differ_check'),
    ).toBe(true);

    await db
      .update(organizations)
      .set({
        documentLanguage: 'fr-CA',
        documentSecondLanguage: 'en',
        requiredNameLanguages: ['zh-Hans'],
      })
      .where(byId);

    const [organization] = await db
      .select({ required: organizations.requiredNameLanguages })
      .from(organizations)
      .where(byId);
    expect(organization.required).toEqual(['zh-Hans']);
  });

  it('keeps a partner pair whole and never the same language twice', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const partnerId = await createPartner(alpha.agent, { name: 'Dépanneur' });
    const byId = eq(partners.id, partnerId);

    const halfPair = await refusal(
      db.update(partners).set({ documentSecondLanguage: 'en' }).where(byId),
    );
    expect(
      isCheckViolation(
        halfPair,
        'partners_document_second_language_needs_first_check',
      ),
    ).toBe(true);

    const twice = await refusal(
      db
        .update(partners)
        .set({ documentLanguage: 'fr-CA', documentSecondLanguage: 'fr-CA' })
        .where(byId),
    );
    expect(
      isCheckViolation(twice, 'partners_document_languages_differ_check'),
    ).toBe(true);

    await db
      .update(partners)
      .set({ documentLanguage: 'zh-Hans', documentSecondLanguage: 'en' })
      .where(byId);
  });

  it('keeps one name per product and language, never a blank one', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const variantId = await createVariant(alpha.agent, {
      type: 'good',
      name: 'Focus capsules',
      variant: { sku: 'FOCUS-60CT', name: '60ct' },
    });
    const [{ productId }] = await db
      .select({ productId: productVariants.productId })
      .from(productVariants)
      .where(eq(productVariants.id, variantId));
    const organizationId = alpha.organizationId;

    await db.insert(productTranslations).values({
      organizationId,
      productId,
      locale: 'zh-Hans',
      name: '专注胶囊',
    });

    const duplicate = await refusal(
      db.insert(productTranslations).values({
        organizationId,
        productId,
        locale: 'zh-Hans',
        name: '专注',
      }),
    );
    expect(
      isUniqueViolation(duplicate, 'product_translations_product_locale_key'),
    ).toBe(true);

    const blank = await refusal(
      db.insert(productTranslations).values({
        organizationId,
        productId,
        locale: 'fr-CA',
        name: '  ',
      }),
    );
    expect(
      isCheckViolation(blank, 'product_translations_name_not_blank_check'),
    ).toBe(true);

    await db.insert(variantTranslations).values({
      organizationId,
      variantId,
      locale: 'zh-Hans',
      name: '60粒',
    });

    const variantDuplicate = await refusal(
      db.insert(variantTranslations).values({
        organizationId,
        variantId,
        locale: 'zh-Hans',
        name: '60 粒',
      }),
    );
    expect(
      isUniqueViolation(
        variantDuplicate,
        'variant_translations_variant_locale_key',
      ),
    ).toBe(true);
  });

  it('gives a draft invoice no language until it is issued', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { shipmentId } = await shippedSale(alpha.agent);

    const invoice = body<{ invoice: { id: string } }>(
      await alpha.agent.post('/v1/invoices').send({ shipmentId }).expect(201),
    ).invoice;

    const error = await refusal(
      db
        .update(invoices)
        .set({ language: 'en' })
        .where(eq(invoices.id, invoice.id)),
    );
    expect(isCheckViolation(error, 'invoices_draft_shape_check')).toBe(true);
  });

  describe('the language a person reads', () => {
    const EMAIL = 'owner@alpha.example.com';

    function registration(extra: Record<string, unknown> = {}) {
      const agent = authedAgent(app);
      const request = agent.post('/v1/auth/register').send({
        email: EMAIL,
        password: PASSWORD,
        name: 'Owner',
        organizationName: 'alpha Co',
        ...extra,
      });
      return { agent, request };
    }

    /** Registers with the given extras, returning the agent and the user. */
    async function register(extra: Record<string, unknown> = {}) {
      const { agent, request } = registration(extra);
      const res = await request.expect(201);
      return {
        agent,
        user: body<{ user: { id: string; locale: string | null } }>(res).user,
      };
    }

    async function me(agent: ReturnType<typeof authedAgent>) {
      return body<{ user: { locale: string | null } }>(
        await agent.get('/v1/auth/me').expect(200),
      ).user;
    }

    it('keeps the language a person registered in, and returns it on sign-in', async () => {
      const { agent, user } = await register({ locale: 'zh-Hans' });

      expect(user.locale).toBe('zh-Hans');
      expect((await me(agent)).locale).toBe('zh-Hans');

      const login = await authedAgent(app)
        .post('/v1/auth/login')
        .send({ email: EMAIL, password: PASSWORD })
        .expect(200);
      expect(body<{ user: { locale: string } }>(login).user.locale).toBe(
        'zh-Hans',
      );
    });

    it('follows the browser when none was chosen', async () => {
      const { agent, user } = await register();

      expect(user.locale).toBeNull();
      expect((await me(agent)).locale).toBeNull();
    });

    it('refuses a language the app does not speak, exact tags only', async () => {
      for (const locale of ['fr', 'de']) {
        await registration({ locale }).request.expect(400);
      }

      const { agent } = await register();
      for (const locale of ['fr', 'zh', 'EN', '']) {
        await agent.patch('/v1/account/profile').send({ locale }).expect(400);
      }
    });

    it('changes the language alone, leaving the name, and null goes back to the browser', async () => {
      const { agent, user } = await register();

      await agent
        .patch('/v1/account/profile')
        .send({ locale: 'fr-CA' })
        .expect(204);

      const [changed] = await db
        .select({ name: users.name, locale: users.locale })
        .from(users)
        .where(eq(users.id, user.id));
      expect(changed).toEqual({ name: 'Owner', locale: 'fr-CA' });
      expect((await me(agent)).locale).toBe('fr-CA');

      await agent
        .patch('/v1/account/profile')
        .send({ name: 'Renamed' })
        .expect(204);
      expect((await me(agent)).locale).toBe('fr-CA');

      await agent
        .patch('/v1/account/profile')
        .send({ locale: null })
        .expect(204);
      expect((await me(agent)).locale).toBeNull();
    });

    it('refuses a null name, and changes nothing when sent nothing', async () => {
      const { agent, user } = await register();

      await agent.patch('/v1/account/profile').send({ name: null }).expect(400);

      const recorded = async () =>
        (
          await db
            .select({ action: accountEvents.action })
            .from(accountEvents)
            .where(eq(accountEvents.userId, user.id))
        ).filter((event) => event.action === 'account.profile_updated');

      await agent.patch('/v1/account/profile').send({}).expect(204);
      expect(await recorded()).toHaveLength(0);

      await agent
        .patch('/v1/account/profile')
        .send({ locale: 'zh-Hans' })
        .expect(204);
      expect(await recorded()).toHaveLength(1);
    });
  });

  describe('the languages a document prints in', () => {
    const TODAY = '2026-09-25';

    type Org = Awaited<ReturnType<typeof registerOrganization>>;

    async function organizationLanguages(org: Org) {
      const { organization } = body<{
        organization: {
          documentLanguage: string;
          documentSecondLanguage: string | null;
        };
      }>(await org.agent.get('/v1/organization').expect(200));
      return [
        organization.documentLanguage,
        organization.documentSecondLanguage,
      ];
    }

    it('sets the organization pair, checking a side sent alone against the stored one', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const patch = (languages: Record<string, unknown>) =>
        alpha.agent.patch('/v1/organization').send(languages);

      await patch({
        documentLanguage: 'fr-CA',
        documentSecondLanguage: 'en',
      }).expect(204);
      expect(await organizationLanguages(alpha)).toEqual(['fr-CA', 'en']);

      const [entry] = await db
        .select({ payload: auditLog.payload })
        .from(auditLog)
        .where(eq(auditLog.action, 'organization.updated'));
      expect(entry.payload).toEqual({
        documentLanguage: { from: 'en', to: 'fr-CA' },
        documentSecondLanguage: { from: null, to: 'en' },
      });

      // Each would leave the pair repeating itself, or with no first.
      await patch({ documentSecondLanguage: 'fr-CA' }).expect(400);
      await patch({ documentLanguage: 'en' }).expect(400);
      await patch({ documentLanguage: null }).expect(400);
      await patch({ documentLanguage: 'fr' }).expect(400);
      expect(await organizationLanguages(alpha)).toEqual(['fr-CA', 'en']);

      await patch({ documentSecondLanguage: null }).expect(204);
      await patch({ documentLanguage: 'zh-Hans' }).expect(204);
      expect(await organizationLanguages(alpha)).toEqual(['zh-Hans', null]);
    });

    it('keeps a partner pair whole, and clears it as a whole', async () => {
      const alpha = await registerOrganization(app, 'alpha');

      await alpha.agent
        .post('/v1/partners')
        .send({ name: 'Half', documentSecondLanguage: 'en' })
        .expect(400);
      await alpha.agent
        .post('/v1/partners')
        .send({
          name: 'Twice',
          documentLanguage: 'zh-Hans',
          documentSecondLanguage: 'zh-Hans',
        })
        .expect(400);

      const partnerId = await createPartner(alpha.agent, {
        name: '明德药房',
        documentLanguage: 'zh-Hans',
        documentSecondLanguage: 'en',
      });

      // Clearing the first alone would strand the second.
      await alpha.agent
        .patch(`/v1/partners/${partnerId}`)
        .send({ documentLanguage: null })
        .expect(400);

      await alpha.agent
        .patch(`/v1/partners/${partnerId}`)
        .send({ documentLanguage: null, documentSecondLanguage: null })
        .expect(204);

      const [partner] = await db
        .select({
          first: partners.documentLanguage,
          second: partners.documentSecondLanguage,
        })
        .from(partners)
        .where(eq(partners.id, partnerId));
      expect(partner).toEqual({ first: null, second: null });
    });

    it('prints a packing slip in the partner pair, else the organization pair, fixed as the box leaves', async () => {
      const shipmentLanguages = async (shipmentId: string) =>
        (
          await db
            .select({
              first: shipments.language,
              second: shipments.secondLanguage,
            })
            .from(shipments)
            .where(eq(shipments.id, shipmentId))
        )[0];

      // A partner with no choice of its own takes the organization's pair.
      const alpha = await registerOrganization(app, 'alpha');
      await alpha.agent
        .patch('/v1/organization')
        .send({ documentLanguage: 'fr-CA', documentSecondLanguage: 'en' })
        .expect(204);
      const quebec = await shippedSale(alpha.agent);

      // Changing the setting afterwards rewrites nothing already shipped.
      await alpha.agent
        .patch('/v1/organization')
        .send({ documentLanguage: 'en', documentSecondLanguage: null })
        .expect(204);
      expect(await shipmentLanguages(quebec.shipmentId)).toEqual({
        first: 'fr-CA',
        second: 'en',
      });

      // A partner with its own choice is printed in it, whole.
      const beta = await registerOrganization(app, 'beta');
      await beta.agent
        .patch('/v1/organization')
        .send({ documentLanguage: 'fr-CA', documentSecondLanguage: 'en' })
        .expect(204);
      const chinese = await createPartner(beta.agent, {
        name: '明德药房',
        documentLanguage: 'zh-Hans',
      });
      const toChinese = await shippedSale(beta.agent, { partnerId: chinese });
      expect(await shipmentLanguages(toChinese.shipmentId)).toEqual({
        first: 'zh-Hans',
        second: null,
      });
    });

    /** An issuable draft for a customer with a billing address. */
    async function draftInvoice(org: Org) {
      await org.agent
        .put('/v1/organization/address')
        .send({ line1: '100 Main St', country: 'CA' })
        .expect(204);

      const partnerId = await createPartner(org.agent, {
        name: 'Dépanneur Laval',
      });
      await org.agent
        .post(`/v1/partners/${partnerId}/addresses`)
        .send({
          line1: '9 rue du Port',
          country: 'CA',
          isBilling: true,
          isDefault: true,
        })
        .expect(201);

      const sale = await shippedSale(org.agent, { partnerId });

      const gst = body<{ taxCode: { id: string } }>(
        await org.agent
          .post('/v1/tax-codes')
          .send({ name: 'GST', components: [{ name: 'GST', rate: '5' }] })
          .expect(201),
      ).taxCode.id;

      const draft = body<{
        invoice: { id: string; lines: { id: string }[] };
      }>(
        await org.agent
          .post('/v1/invoices')
          .send({ shipmentId: sale.shipmentId, taxCodeId: gst })
          .expect(201),
      ).invoice;

      return { partnerId, invoiceId: draft.id, lineId: draft.lines[0].id };
    }

    async function invoiceLanguages(invoiceId: string) {
      const [row] = await db
        .select({
          first: invoices.language,
          second: invoices.secondLanguage,
        })
        .from(invoices)
        .where(eq(invoices.id, invoiceId));
      return row;
    }

    async function creditNoteLanguages(invoiceId: string) {
      return db
        .select({
          first: creditNotes.language,
          second: creditNotes.secondLanguage,
        })
        .from(creditNotes)
        .where(eq(creditNotes.invoiceId, invoiceId));
    }

    it('issues an invoice in the partner pair on the day it is issued, not the day it was drafted', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const draft = await draftInvoice(alpha);

      expect(await invoiceLanguages(draft.invoiceId)).toEqual({
        first: null,
        second: null,
      });

      await alpha.agent
        .patch(`/v1/partners/${draft.partnerId}`)
        .send({ documentLanguage: 'fr-CA', documentSecondLanguage: 'en' })
        .expect(204);

      await alpha.agent
        .post(`/v1/invoices/${draft.invoiceId}/issue`)
        .send({ invoiceDate: TODAY })
        .expect(200);

      expect(await invoiceLanguages(draft.invoiceId)).toEqual({
        first: 'fr-CA',
        second: 'en',
      });
    });

    it('credits in the invoice languages, even after the partner changed', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const draft = await draftInvoice(alpha);

      await alpha.agent
        .patch(`/v1/partners/${draft.partnerId}`)
        .send({ documentLanguage: 'fr-CA', documentSecondLanguage: 'en' })
        .expect(204);
      await alpha.agent
        .post(`/v1/invoices/${draft.invoiceId}/issue`)
        .send({ invoiceDate: TODAY })
        .expect(200);

      await alpha.agent
        .patch(`/v1/partners/${draft.partnerId}`)
        .send({ documentLanguage: 'zh-Hans', documentSecondLanguage: null })
        .expect(204);

      await alpha.agent
        .post(`/v1/invoices/${draft.invoiceId}/credit-notes`)
        .send({
          reason: 'Two arrived cracked',
          creditDate: TODAY,
          lines: [{ invoiceLineId: draft.lineId, quantity: '1' }],
        })
        .expect(201);

      expect(await creditNoteLanguages(draft.invoiceId)).toEqual([
        { first: 'fr-CA', second: 'en' },
      ]);
    });

    it('voids in the invoice languages, even after the organization changed', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      await alpha.agent
        .patch('/v1/organization')
        .send({ documentLanguage: 'fr-CA', documentSecondLanguage: 'en' })
        .expect(204);

      const draft = await draftInvoice(alpha);
      await alpha.agent
        .post(`/v1/invoices/${draft.invoiceId}/issue`)
        .send({ invoiceDate: TODAY })
        .expect(200);

      await alpha.agent
        .patch('/v1/organization')
        .send({ documentLanguage: 'en', documentSecondLanguage: null })
        .expect(204);

      await alpha.agent
        .post(`/v1/invoices/${draft.invoiceId}/void`)
        .send({ reason: 'Billed twice', creditDate: TODAY })
        .expect(200);

      expect(await creditNoteLanguages(draft.invoiceId)).toEqual([
        { first: 'fr-CA', second: 'en' },
      ]);
    });
  });
});
