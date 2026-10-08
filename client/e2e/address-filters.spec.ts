import { expect, test } from './fixtures';
import { signInAs } from './support/api';

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
