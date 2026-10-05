import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { isCheckViolation, isUniqueViolation } from '../src/database/errors';
import {
  invoices,
  organizations,
  partners,
  productTranslations,
  productVariants,
  users,
  variantTranslations,
} from '../src/database/schema';
import {
  body,
  createE2eApp,
  createPartner,
  createVariant,
  registerOrganization,
} from './utils/fixtures';
import { resetDatabase } from './utils/reset-db';
import { shippedSale } from './utils/sales';

/**
 * The columns ADR-054 adds, and the database's half of their rules, before
 * any route writes them: a language pair is whole and never repeats itself,
 * a product has one name per language and never a blank one, and a draft
 * invoice has no language yet.
 *
 * Written straight to the tables, because the routes that will write them
 * arrive in later commits. Those commits test the routes; this keeps the
 * guards that hold whatever a route does.
 */
describe('Languages, the schema (e2e)', () => {
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
});
