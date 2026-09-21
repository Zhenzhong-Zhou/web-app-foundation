import { expect, test } from './fixtures';
import {
  createLocation,
  createPartner,
  createProduct,
  signInAs,
} from './support/api';

/**
 * The path the whole app was built for: an order raised against a partner,
 * confirmed, received against, and the stock landing on a shelf. Five modules
 * that meet nowhere else.
 *
 * "Raise an order" is a link, not a button — it is a MUI Button rendered as a
 * RouterLink, so its role is `link`. Worth knowing: a toBeHidden() against the
 * wrong role passes whether the control is there or not.
 */

test('raises an order, receives against it, and moves the stock', async ({
  page,
  freshOrg,
}) => {
  await createPartner(freshOrg.api, { name: 'E2E Mill Co' });
  await createProduct(freshOrg.api, { sku: 'E2E-ORD-1' });
  await createLocation(freshOrg.api, { type: 'site', name: 'E2E Dock' });

  await signInAs(page, freshOrg.api);
  await page.goto('/orders');

  await page.getByRole('link', { name: 'Raise an order' }).click();

  await page.getByLabel('Partner').fill('E2E Mill');
  await page.getByRole('option', { name: /E2E Mill Co/ }).click();

  await page.getByLabel('Item', { exact: true }).fill('E2E-ORD-1');
  await page.getByRole('option', { name: /E2E-ORD-1/ }).click();
  await page.getByLabel('Quantity').fill('40');

  await page.getByRole('button', { name: 'Raise as draft' }).click();

  /**
   * Landed on the detail page, and as a draft. Asserted through the controls
   * rather than the status chip: what "draft" means here is that confirming is
   * still ahead and nothing can be received yet, and that is what the buttons
   * say.
   */
  await expect(page.getByRole('button', { name: 'Confirm' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Receive', exact: true }),
  ).toBeHidden();

  await page.getByRole('button', { name: 'Confirm' }).click();
  await page.getByRole('button', { name: 'Receive', exact: true }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Into').click();
  await page.getByRole('option', { name: /E2E Dock/ }).click();
  await dialog.getByLabel('Quantity').fill('15');
  await dialog.getByRole('button', { name: 'Receive' }).click();

  // Partial, and the line says so rather than the order advancing on its own.
  const line = page.getByRole('row', { name: /E2E-ORD-1/ });
  await expect(line).toContainText('15.0000');
  await expect(line).toContainText('25.0000');

  /**
   * The point of the whole vertical: receiving wrote a movement and the stock
   * level moved, in the same transaction. One ledger, no receipts table.
   */
  await page.goto('/inventory');
  await expect(page.getByRole('row', { name: /E2E-ORD-1/ })).toContainText(
    '15.0000',
  );
});

test('asks before closing an order that is short', async ({
  page,
  freshOrg,
}) => {
  const partner = await createPartner(freshOrg.api, { name: 'E2E Short Co' });
  const product = await createProduct(freshOrg.api, { sku: 'E2E-ORD-2' });

  await signInAs(page, freshOrg.api);

  // Raised through the API: this test is about closing, and driving the form
  // again would make it fail for reasons that belong to the test above.
  const response = await freshOrg.api.post('/v1/orders', {
    data: {
      partnerId: partner.id,
      direction: 'purchase',
      lines: [{ variantId: product.variantId, quantityOrdered: '40' }],
    },
  });

  const { order } = (await response.json()) as { order: { id: string } };

  await page.goto(`/orders/${order.id}`);
  await page.getByRole('button', { name: 'Confirm' }).click();
  await page.getByRole('button', { name: 'Mark received' }).click();

  /**
   * Asked, not refused. A short shipment nobody expects to complete is a real
   * reason to close an order (ADR-027) — the dialog is for the other case,
   * where somebody reached for the wrong button.
   */
  await expect(page.getByText('Close this order?')).toBeVisible();

  await page.getByRole('button', { name: 'Keep it open' }).click();
  await expect(
    page.getByRole('button', { name: 'Receive', exact: true }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Mark received' }).click();
  await page.getByRole('button', { name: 'Close it' }).click();

  /**
   * Terminal, so every control goes. Asserted through the buttons rather than
   * the status text, which collides with the Received column header and with
   * the dialog's own copy.
   */
  await expect(
    page.getByRole('button', { name: 'Receive', exact: true }),
  ).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Mark received' }),
  ).toBeHidden();
  await expect(page.getByRole('button', { name: 'Cancel order' })).toBeHidden();
});

test('hides every write control from a viewer', async ({
  page,
  api,
  viewerApi,
}) => {
  await createPartner(api, { name: `E2E Readonly ${Date.now()}` });

  await signInAs(page, viewerApi);
  await page.goto('/orders');

  // Display only — the 403 is the actual control (ADR-016) — but a control
  // that always fails is worse than one that is absent. Asserted as a link:
  // against the wrong role this would pass with the control on screen.
  await expect(page.getByRole('link', { name: 'Raise an order' })).toBeHidden();
});
