import { expect, test } from './fixtures';
import {
  created,
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

  // Asked first, neither chosen (#454): received against below, a purchase.
  await page.getByRole('radio', { name: /^Buying/ }).check();
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
  // Received and outstanding, read without padding zeros (ADR-055).
  const line = page.getByRole('row', { name: /E2E-ORD-1/ });
  await expect(
    line.getByRole('cell', { name: '15', exact: true }),
  ).toBeVisible();
  await expect(
    line.getByRole('cell', { name: '25', exact: true }),
  ).toBeVisible();

  /**
   * The point of the whole vertical: receiving wrote a movement and the stock
   * level moved, in the same transaction. One ledger, no receipts table.
   */
  await page.goto('/inventory');
  await expect(
    page.getByRole('row', { name: /E2E-ORD-1/ }).getByRole('cell', {
      name: '15 each',
      exact: true,
    }),
  ).toBeVisible();
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
  await page.getByRole('button', { name: 'Close order' }).click();

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

  await page.getByRole('button', { name: 'Close order' }).click();
  await page.getByRole('button', { name: 'Close it' }).click();

  /**
   * Terminal, so every control goes. Asserted through the buttons rather than
   * the status text, which collides with the Received column header and with
   * the dialog's own copy.
   */
  await expect(
    page.getByRole('button', { name: 'Receive', exact: true }),
  ).toBeHidden();
  await expect(page.getByRole('button', { name: 'Close order' })).toBeHidden();
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

/**
 * #221: at the 16 px text an order's items are wider than their place
 * beside the summary, and its Total ran under the row's actions. On a
 * computer the Total is held beside them, the other columns passing under
 * both, a shadow on its edge while they do; the phone holds only the
 * actions (#159).
 */
test('holds each line’s Total beside its actions on a computer', async ({
  page,
  freshOrg,
}) => {
  const partner = await createPartner(freshOrg.api, { name: 'E2E Total Co' });
  const product = await createProduct(freshOrg.api, {
    sku: 'E2E-TOTAL-1',
    name: 'E2E Focus capsules, sixty count, with lemon balm and chamomile',
  });
  const { order } = await created<{ order: { id: string } }>(
    await freshOrg.api.post('/v1/orders', {
      data: {
        partnerId: partner.id,
        direction: 'sale',
        lines: [
          {
            variantId: product.variantId,
            quantityOrdered: '500',
            unitPrice: '14.00',
            currency: 'CAD',
          },
        ],
      },
    }),
  );

  await page.setViewportSize({ width: 1440, height: 900 });
  await signInAs(page, freshOrg.api);
  await page.goto(`/orders/${order.id}`);

  const row = page.getByRole('row', { name: /E2E-TOTAL-1/ });
  const cells = row.getByRole('cell');
  await expect(cells.last()).toBeVisible();
  const count = await cells.count();
  const total = cells.nth(count - 2);
  const actions = cells.nth(count - 1);
  const frame = page.locator('.MuiTableContainer-root').filter({ has: row });
  await expect(total).toContainText('7,000.00');

  // The table is wider than its frame, as SO-DEMO-1's is at 1440.
  expect(await frame.evaluate((box) => box.scrollWidth > box.clientWidth)).toBe(
    true,
  );

  const totalBox = (await total.boundingBox())!;
  const actionsBox = (await actions.boundingBox())!;
  const frameBox = (await frame.boundingBox())!;
  expect(totalBox.x + totalBox.width).toBeLessThanOrEqual(actionsBox.x + 1);
  expect(totalBox.x).toBeGreaterThanOrEqual(frameBox.x);
  const shadow = () =>
    total.evaluate((cell) => getComputedStyle(cell).boxShadow);
  expect(await shadow()).not.toBe('none');

  // Scrolled to its end, nothing is under the Total, and no shadow says so.
  await frame.evaluate((box) => {
    box.scrollLeft = box.scrollWidth;
  });
  await expect.poll(shadow).toBe('none');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => total.evaluate((cell) => getComputedStyle(cell).position))
    .toBe('static');
});
