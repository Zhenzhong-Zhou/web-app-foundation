import { expect, test } from './fixtures';
import { created, signInAs } from './support/api';

/**
 * ADR-049 in a browser: a list is made and priced, a customer is pointed at
 * it, and an item added to their order without a price takes the list's —
 * and says where it came from.
 *
 * freshOrg: the organization's lists and default must start empty.
 */

test('prices an added item from the customer’s list', async ({
  page,
  freshOrg,
}) => {
  const api = freshOrg.api;

  const variantOf = async (sku: string) =>
    (
      await created<{ product: { variants: { id: string }[] } }>(
        await api.post('/v1/products', {
          data: { type: 'good', name: sku, variant: { sku } },
        }),
      )
    ).product.variants[0].id;

  // Created for the browser to pick by SKU; its id is never needed here.
  await variantOf('E2E-PL-FOCUS');
  const calm = await variantOf('E2E-PL-CALM');

  const { partner: customer } = await created<{ partner: { id: string } }>(
    await api.post('/v1/partners', {
      data: { name: 'E2E List Pharmacy', code: 'E2E-PL-CUST' },
    }),
  );

  // A draft sale already carrying one priced line, in CAD.
  const { order } = await created<{ order: { id: string } }>(
    await api.post('/v1/orders', {
      data: {
        partnerId: customer.id,
        direction: 'sale',
        lines: [
          {
            variantId: calm,
            quantityOrdered: '1',
            unitPrice: '5',
            currency: 'CAD',
          },
        ],
      },
    }),
  );
  await signInAs(page, api);

  // --- Make the list, and price one item on it -------------------------------
  await page.goto('/settings/price-lists');
  await page
    .getByRole('button', { name: 'New price list', exact: true })
    .click();

  const create = page.getByRole('dialog');
  await create
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('E2E Wholesale');
  await create
    .getByRole('textbox', { name: 'Currency', exact: true })
    .fill('CAD');
  await create.getByRole('button', { name: 'Create', exact: true }).click();

  await expect(
    page.getByRole('heading', { name: 'E2E Wholesale' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Add a price', exact: true }).click();

  const price = page.getByRole('dialog');
  await price.getByLabel('Item').click();
  await page.getByRole('option', { name: /E2E-PL-FOCUS/ }).click();
  await price
    .getByRole('textbox', { name: 'Unit price (CAD)', exact: true })
    .fill('18.5');
  await price.getByRole('button', { name: 'Save price', exact: true }).click();

  await expect(
    page.getByRole('table', { name: 'Prices' }).getByRole('row', {
      name: /E2E-PL-FOCUS/,
    }),
  ).toContainText('18.50');

  // --- Point the customer at it ---------------------------------------------
  await page.goto(`/partners/${customer.id}`);
  await page.getByRole('combobox', { name: 'Sales to them' }).click();
  await page.getByRole('option', { name: /E2E Wholesale/ }).click();
  await page
    .getByRole('button', { name: 'Save price lists', exact: true })
    .click();
  await expect(page.getByText('Price lists saved')).toBeVisible();

  // --- Add the item to their order without a price ---------------------------
  await page.goto(`/orders/${order.id}`);
  await page.getByRole('button', { name: 'Add item', exact: true }).click();

  const add = page.getByRole('dialog');
  await add.getByLabel('Item').click();
  await page.getByRole('option', { name: /E2E-PL-FOCUS/ }).click();
  await add.getByRole('textbox', { name: 'Quantity', exact: true }).fill('12');
  await add.getByRole('button', { name: 'Add item', exact: true }).click();

  const row = page.getByRole('row', { name: /E2E-PL-FOCUS/ });
  await expect(row).toContainText('18.50');
  await expect(row).toContainText('from E2E Wholesale');
});
