import { expect, test } from './fixtures';

/**
 * Issue #54: a half-built order is not thrown away by a stray click. The
 * rail's Inventory link asks first; Stay keeps the form, Leave goes; an
 * untouched form leaves without a word. Saving never asks, which every
 * order raised in orders.spec shows.
 */
const rail = (page: import('@playwright/test').Page) =>
  page.getByRole('navigation', { name: 'Main' });

test('asks before leaving a half-built order', async ({ page }) => {
  await page.goto('/orders/new');
  await page.getByLabel('Their reference').fill('PO-HALF-BUILT');

  await rail(page).getByRole('link', { name: 'Inventory' }).click();
  const dialog = page.getByRole('dialog', { name: 'Leave without saving?' });
  await expect(dialog).toBeVisible();

  await dialog.getByRole('button', { name: 'Stay' }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/orders\/new$/);
  await expect(page.getByLabel('Their reference')).toHaveValue('PO-HALF-BUILT');

  await rail(page).getByRole('link', { name: 'Inventory' }).click();
  await page
    .getByRole('dialog', { name: 'Leave without saving?' })
    .getByRole('button', { name: 'Leave' })
    .click();
  await expect(page).toHaveURL(/\/inventory$/);
});

test('leaves an untouched order form without asking', async ({ page }) => {
  await page.goto('/orders/new');
  await expect(page.getByLabel('Their reference')).toBeVisible();

  await rail(page).getByRole('link', { name: 'Inventory' }).click();
  await expect(page).toHaveURL(/\/inventory$/);
});
