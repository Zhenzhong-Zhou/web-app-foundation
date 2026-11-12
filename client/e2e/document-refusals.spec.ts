import type { APIRequestContext } from '@playwright/test';

import { expect, test } from './fixtures';
import { created, signInAs } from './support/api';

/**
 * A refused PDF opened from its link (ADR-071, amended for #526): Print
 * and Download PDF are plain links the browser follows itself, so the
 * server answers a refusal with a page of its own, in the app's language,
 * which the links carry. Here in 中文 in a browser set to English, so the
 * page's language can only have come from the app.
 *
 * The page's statuses, its escaping and each route's way back are
 * document-refusals.e2e-spec.ts's; this holds what only a browser shows:
 * the new tab, the same tab, and the links back into the app, at
 * CLIENT_URL (playwright.config.ts). Its own organization, so it runs in
 * WebKit and Firefox too.
 */

test.use({ locale: 'en-US' });

async function ok(
  response: Awaited<ReturnType<APIRequestContext['patch']>>,
): Promise<void> {
  expect(response.ok(), await response.text()).toBeTruthy();
}

/**
 * A purchase from a supplier whose documents print in Chinese, which the
 * organization requires every name in: the item is named in it, its
 * variation not, so the purchase order's PDF is refused with
 * item_name_missing.
 */
async function seedUnnamedPurchase(api: APIRequestContext) {
  await ok(
    await api.patch('/v1/organization', {
      data: { requiredNameLanguages: ['zh-Hans'] },
    }),
  );

  const { partner } = await created<{ partner: { id: string } }>(
    await api.post('/v1/partners', {
      data: {
        name: 'Pacific Capsule Supply',
        code: 'PCS',
        documentLanguage: 'zh-Hans',
      },
    }),
  );

  const { product } = await created<{
    product: { id: string; variants: { id: string }[] };
  }>(
    await api.post('/v1/products', {
      data: {
        type: 'good',
        name: 'Focus',
        variant: { sku: 'FOCUS-60CT', name: '60ct' },
      },
    }),
  );
  await ok(
    await api.put(`/v1/products/${product.id}/translations`, {
      data: { translations: [{ locale: 'zh-Hans', name: '专注胶囊' }] },
    }),
  );

  const { order } = await created<{ order: { id: string; number: string } }>(
    await api.post('/v1/orders', {
      data: {
        partnerId: partner.id,
        direction: 'purchase',
        lines: [
          {
            variantId: product.variants[0].id,
            quantityOrdered: '5',
            unitPrice: '4',
            currency: 'CAD',
          },
        ],
      },
    }),
  );

  return { productId: product.id, order };
}

test('a refused PDF shows a page in the app’s language, with the item and the way back to the order', async ({
  page,
  freshOrg,
}) => {
  const api = freshOrg.api;
  const { productId, order } = await seedUnnamedPurchase(api);

  // The person's own language, chosen once and kept on their account.
  await ok(
    await api.patch('/v1/account/profile', { data: { locale: 'zh-Hans' } }),
  );

  await signInAs(page, api);
  await page.goto(`/orders/${order.id}`);
  await expect(page.getByRole('heading', { name: order.number })).toBeVisible();

  // Print: a new tab, the page in place of the PDF, in Chinese though the
  // browser is English.
  const opened = page.waitForEvent('popup');
  await page.getByRole('link', { name: '打印' }).click();
  const tab = await opened;

  await expect(tab.locator('html')).toHaveAttribute('lang', 'zh-Hans');
  await expect(tab.getByRole('heading', { level: 1 })).toHaveText(
    '无法生成此 PDF',
  );
  await expect(
    tab.getByText('Focus 的规格 FOCUS-60CT（60ct）没有中文名称', {
      exact: false,
    }),
  ).toBeVisible();
  await expect(tab.getByRole('link', { name: '打开物品' })).toHaveAttribute(
    'href',
    new RegExp(`/items/${productId}$`),
  );
  await expect(tab.getByRole('link', { name: '返回订单' })).toHaveAttribute(
    'href',
    new RegExp(`/orders/${order.id}$`),
  );
  await tab.close();

  // Download PDF opens in this tab: the same page, and its way back
  // returns to the order.
  await page.getByRole('link', { name: '下载 PDF' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    '无法生成此 PDF',
  );
  await page.getByRole('link', { name: '返回订单' }).click();

  await expect(page).toHaveURL(new RegExp(`/orders/${order.id}$`));
  await expect(page.getByRole('heading', { name: order.number })).toBeVisible();
  await expect(page.getByRole('link', { name: '打印' })).toBeVisible();
});

/** The languages, as the app's settings and the account write them. */
const LANGUAGES = ['en', 'fr-CA', 'zh-Hans'] as const;
type Language = (typeof LANGUAGES)[number];

/**
 * Each language named in each, by its language alone, as Intl names it,
 * and in Chinese as a name's language is written, 英文 as the exports'
 * columns say, never Intl's 英语: the words both the page and the refusal
 * must use.
 */
const WORDS: Record<Language, Record<Language, string>> = {
  en: { en: 'English', 'fr-CA': 'French', 'zh-Hans': 'Chinese' },
  'fr-CA': { en: 'anglais', 'fr-CA': 'français', 'zh-Hans': 'chinois' },
  'zh-Hans': { en: '英文', 'fr-CA': '法文', 'zh-Hans': '中文' },
};

/** Where each says it: the item's page's line, and the refusal. */
const SAID: Record<
  Language,
  { page: (word: string) => string; refusal: (word: string) => string }
> = {
  en: {
    page: (word) => `the ${word} name of the item`,
    refusal: (word) => `Focus (FOCUS-60CT) has no ${word} name`,
  },
  'fr-CA': {
    page: (word) => `le nom en ${word} de l’article`,
    refusal: (word) => `Focus (FOCUS-60CT) n’a pas de nom en ${word}`,
  },
  'zh-Hans': {
    page: (word) => `物品的${word}名称`,
    refusal: (word) => `Focus（FOCUS-60CT）没有${word}名称`,
  },
};

/**
 * A missing name's language, named in the reader's language on both sides
 * (ADR-054's November 2026 amendment): the item's page, which
 * this browser draws, and the refusal of a document printing in it, which
 * the server writes, name it alike, each language in each. Every language
 * required, the item named in none, and a purchase printing in each.
 */
test('the item’s page and a refused document name a missing name’s language alike, in each language', async ({
  page,
  freshOrg,
}) => {
  const api = freshOrg.api;
  await ok(
    await api.patch('/v1/organization', {
      data: { requiredNameLanguages: [...LANGUAGES] },
    }),
  );
  const { product } = await created<{
    product: { id: string; variants: { id: string }[] };
  }>(
    await api.post('/v1/products', {
      data: { type: 'good', name: 'Focus', variant: { sku: 'FOCUS-60CT' } },
    }),
  );

  const orders = {} as Record<Language, string>;
  for (const language of LANGUAGES) {
    const { partner } = await created<{ partner: { id: string } }>(
      await api.post('/v1/partners', {
        data: {
          name: `Supplier ${language}`,
          code: `SUP-${language}`,
          documentLanguage: language,
        },
      }),
    );
    const { order } = await created<{ order: { id: string } }>(
      await api.post('/v1/orders', {
        data: {
          partnerId: partner.id,
          direction: 'purchase',
          lines: [
            {
              variantId: product.variants[0].id,
              quantityOrdered: '5',
              unitPrice: '4',
              currency: 'CAD',
            },
          ],
        },
      }),
    );
    orders[language] = order.id;
  }

  await signInAs(page, api);
  for (const reader of LANGUAGES) {
    await ok(
      await api.patch('/v1/account/profile', { data: { locale: reader } }),
    );
    await page.goto(`/items/${product.id}`);

    for (const language of LANGUAGES) {
      const word = WORDS[reader][language];
      await expect(
        page.getByRole('alert').filter({ hasText: SAID[reader].page(word) }),
      ).toBeVisible();

      const refused = await api.get(`/v1/orders/${orders[language]}/pdf`, {
        headers: { 'Accept-Language': reader },
      });
      expect(refused.status()).toBe(409);
      const { message } = (await refused.json()) as { message: string };
      expect(message, `${language} read in ${reader}`).toContain(
        SAID[reader].refusal(word),
      );
    }
  }
});
