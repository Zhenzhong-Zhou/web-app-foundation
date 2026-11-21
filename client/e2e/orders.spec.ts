import type { APIRequestContext } from '@playwright/test';

import { expect, test } from './fixtures';
import {
  created,
  createLocation,
  createPartner,
  createProduct,
  type SeededLocation,
  type SeededPartner,
  type SeededProduct,
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
    page
      .getByRole('row', { name: /E2E-ORD-1/ })
      .getByRole('cell', { name: '15 each', exact: true })
      .first(),
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

// ---------------------------------------------------------------------------
// How much has come (#605; ADR-093's Orders table, row by row)
// ---------------------------------------------------------------------------

/** A confirmed purchase of 30, with `received` of it received on its line. */
async function purchaseOf(
  api: APIRequestContext,
  partner: SeededPartner,
  product: SeededProduct,
  dock: SeededLocation,
  received: string | null,
): Promise<{ id: string; number: string }> {
  const { order } = await created<{ order: { id: string; number: string } }>(
    await api.post('/v1/orders', {
      data: {
        partnerId: partner.id,
        direction: 'purchase',
        lines: [{ variantId: product.variantId, quantityOrdered: '30' }],
      },
    }),
  );
  const confirmed = await api.patch(`/v1/orders/${order.id}`, {
    data: { status: 'confirmed' },
  });
  expect(confirmed.ok(), await confirmed.text()).toBeTruthy();
  if (received) {
    const { lines } = (await (
      await api.get(`/v1/orders/${order.id}`)
    ).json()) as {
      lines: { id: string }[];
    };
    await created(
      await api.post(`/v1/orders/${order.id}/lines/${lines[0]!.id}/receipts`, {
        data: { toLocationId: dock.id, quantity: received },
      }),
    );
  }
  return order;
}

test('Orders, Receiving › Partly received: the list narrows to orders partly received; ?fulfillment=part; Back leaves Orders', async ({
  page,
  freshOrg,
}) => {
  const partner = await createPartner(freshOrg.api, { name: 'E2E Mill Co' });
  const product = await createProduct(freshOrg.api, { sku: 'E2E-ORD-605' });
  const dock = await createLocation(freshOrg.api, { name: 'E2E Dock' });
  const none = await purchaseOf(freshOrg.api, partner, product, dock, null);
  const part = await purchaseOf(freshOrg.api, partner, product, dock, '10');
  const all = await purchaseOf(freshOrg.api, partner, product, dock, '30');

  await signInAs(page, freshOrg.api);
  await page.goto('/locations');
  await page.goto('/orders?direction=purchase');
  const number = (order: { number: string }) =>
    page.getByRole('link', { name: order.number, exact: true });
  await expect(number(none)).toBeVisible();
  // Each beside its Status, in a purchase's words (92a).
  for (const [order, label] of [
    [none, 'Not received'],
    [part, 'Partly received'],
    [all, 'All received'],
  ] as const) {
    await expect(
      page.getByRole('row', { name: new RegExp(order.number) }),
    ).toContainText(label);
  }

  await page.getByRole('combobox', { name: 'Receiving' }).click();
  await page.getByRole('option', { name: 'Partly received' }).click();

  await expect(page).toHaveURL(/[?&]fulfillment=part(&|$)/);
  await expect(number(part)).toBeVisible();
  await expect(number(none)).toHaveCount(0);
  await expect(number(all)).toHaveCount(0);

  // A filter replaces the address (#341): Back leaves Orders.
  await page.goBack();
  await expect(page).toHaveURL(/\/locations$/);
});

test('An order’s page, Confirmed: received in part, Partly received; the rest received, All received beside Confirmed, with “Everything has arrived. Close the order?”; Close order closes it', async ({
  page,
  freshOrg,
}) => {
  const partner = await createPartner(freshOrg.api, { name: 'E2E Mill Co' });
  const product = await createProduct(freshOrg.api, { sku: 'E2E-ORD-606' });
  const dock = await createLocation(freshOrg.api, { name: 'E2E Dock' });
  const order = await purchaseOf(freshOrg.api, partner, product, dock, null);

  await signInAs(page, freshOrg.api);
  await page.goto(`/orders/${order.id}`);
  const main = page.getByRole('main');
  await expect(main.getByText('Not received', { exact: true })).toBeVisible();

  const receive = async (quantity: string) => {
    await page.getByRole('button', { name: 'Receive', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Into').click();
    await page.getByRole('option', { name: /E2E Dock/ }).click();
    await dialog.getByLabel('Quantity').fill(quantity);
    await dialog.getByRole('button', { name: 'Receive' }).click();
    await expect(dialog).toBeHidden();
  };

  await receive('10');
  await expect(
    main.getByText('Partly received', { exact: true }),
  ).toBeVisible();
  await expect(
    main.getByText('Everything has arrived. Close the order?'),
  ).toHaveCount(0);

  await receive('20');
  await expect(main.getByText('All received', { exact: true })).toBeVisible();
  await expect(main.getByText('Confirmed', { exact: true })).toBeVisible();
  const line = main.getByText('Everything has arrived. Close the order?');
  await expect(line).toBeVisible();
  // One Close order, the line's, which it describes.
  const close = page.getByRole('button', { name: 'Close order' });
  await expect(close).toHaveCount(1);
  await expect(close).toHaveAccessibleDescription(
    'Everything has arrived. Close the order?',
  );

  // Nothing outstanding, so it closes at once, as Close order always has
  // once everything is in.
  await close.click();
  await expect(line).toHaveCount(0);
  await expect(main.getByText('All received', { exact: true })).toHaveCount(0);
  await expect(close).toHaveCount(0);
});
