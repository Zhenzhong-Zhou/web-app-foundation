import { expect, test } from './fixtures';
import { created, createPartner, createProduct, signInAs } from './support/api';

/**
 * Lists open where Home points (ADR-058, step 3): a filter in the address
 * narrows the list, a quick filter shown pressed, one no button stands for
 * shown as a chip that removes it.
 */
test('opens Orders narrowed by direction and status, as chips', async ({
  page,
  freshOrg,
}) => {
  await signInAs(page, freshOrg.api);
  await page.goto('/orders?direction=purchase&status=confirmed');

  await expect(
    page.getByRole('button', { name: 'Purchases only' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmed' })).toBeVisible();
});

test('opens Inventory with Expiring soon pressed', async ({
  page,
  freshOrg,
}) => {
  await signInAs(page, freshOrg.api);
  await page.goto('/inventory?expiring=1');

  await expect(
    page.getByRole('button', { name: /^Expiring soon/ }),
  ).toHaveAttribute('aria-pressed', 'true');
});

/**
 * The lists keep their filters and sort in the address (ADR-091, #302):
 * read while the list is open, written when pressed, so a link followed
 * while it is open lands as it says and Back brings back what was chosen.
 */
const rail = (page: import('@playwright/test').Page) =>
  page.getByRole('navigation', { name: 'Main' });

test('lands as a link says while its list is open', async ({
  page,
  freshOrg,
}) => {
  await signInAs(page, freshOrg.api);
  // Where To ship opens it.
  await page.goto('/orders?direction=sale&outstanding=1');

  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(page).toHaveURL(/[?&]status=all(&|$)/);

  // The menu's Orders, followed while Orders is open: the plain list.
  await rail(page).getByRole('link', { name: 'Orders' }).click();

  await expect(page).toHaveURL(/\/orders$/);
  await expect(
    page.getByRole('button', { name: 'Open', exact: true, pressed: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sales only' })).toBeHidden();
});

test('keeps the filter and the sort for Back, the focus on the header', async ({
  page,
  freshOrg,
}) => {
  const partner = await createPartner(freshOrg.api, { name: 'E2E Back Co' });
  const product = await createProduct(freshOrg.api, { sku: 'E2E-BACK-1' });
  const { order } = await created<{ order: { id: string; number: string } }>(
    await freshOrg.api.post('/v1/orders', {
      data: {
        partnerId: partner.id,
        direction: 'sale',
        lines: [{ variantId: product.variantId, quantityOrdered: '5' }],
      },
    }),
  );

  await signInAs(page, freshOrg.api);
  await page.goto('/orders');

  const all = page.getByRole('button', { name: 'All', exact: true });
  await all.click();
  // All drawn pressed is the list read again: its rows are the new ones.
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('link', { name: order.number })).toBeVisible();

  const expected = page.getByRole('columnheader', { name: 'Expected' });
  // Sorted from the keyboard: the list is read again, and the header it
  // was sorted by keeps the focus.
  await expected.getByRole('button').focus();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/[?&]status=all&sort=expectedAt&order=asc$/);
  await expect(expected).toHaveAttribute('aria-sort', 'ascending');
  await expect(expected.getByRole('button')).toBeFocused();

  await page.getByRole('link', { name: order.number }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${order.id}$`));
  await page.goBack();

  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await expect(expected).toHaveAttribute('aria-sort', 'ascending');
});
