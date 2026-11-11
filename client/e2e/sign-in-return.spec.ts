import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import {
  created,
  createPartner,
  createProduct,
  type SeededOrganization,
} from './support/api';

/**
 * Sign-in returns to the page asked for (ADR-071, amended for #526, R8): a
 * refused PDF's Sign in links to its order's page, which signed out opens
 * the sign-in form, and signing in opens the order, not Home. Its own
 * organization, so it runs in WebKit and Firefox too, where two
 * navigations at once may land in another order.
 */

// Signed out, as someone following the refused PDF's link is.
test.use({ storageState: { cookies: [], origins: [] } });

async function seedOrder(organization: SeededOrganization) {
  const partner = await createPartner(organization.api);
  const product = await createProduct(organization.api);
  const { order } = await created<{ order: { id: string; number: string } }>(
    await organization.api.post('/v1/orders', {
      data: {
        partnerId: partner.id,
        direction: 'sale',
        lines: [{ variantId: product.variantId, quantityOrdered: '5' }],
      },
    }),
  );
  return order;
}

async function signIn(page: Page, organization: SeededOrganization) {
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel(/email/i).fill(organization.email);
  await page.getByLabel(/^password/i).fill(organization.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('signing in opens the order asked for', async ({ page, freshOrg }) => {
  const order = await seedOrder(freshOrg);

  await page.goto(`/orders/${order.id}`);
  await signIn(page, freshOrg);

  await expect(page).toHaveURL(new RegExp(`/orders/${order.id}$`));
  await expect(page.getByRole('heading', { name: order.number })).toBeVisible();
});

test('signing in keeps the address’s search', async ({ page, freshOrg }) => {
  const order = await seedOrder(freshOrg);

  await page.goto(`/orders?search=${order.number}`);
  await signIn(page, freshOrg);

  await expect(page).toHaveURL(new RegExp(`/orders\\?search=${order.number}$`));
  await expect(page.getByRole('heading', { name: 'Orders' })).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue(
    order.number,
  );
  await expect(page.getByRole('link', { name: order.number })).toBeVisible();
});
