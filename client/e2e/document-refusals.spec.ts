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
    tab.getByText('Focus 的规格 FOCUS-60CT（60ct）没有简体中文名称', {
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
