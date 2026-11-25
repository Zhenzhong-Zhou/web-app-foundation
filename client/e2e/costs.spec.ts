import type { APIRequestContext, APIResponse, Page } from '@playwright/test';

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
import { saidOn } from './support/said';
import { fiftyTwo, receive } from './support/stock';

/**
 * ADR-048 end to end in a browser: a priced purchase lands with a value, a
 * run consumes it and closes, and the batch shows what it cost; stock with
 * no price waits on the Stock value page until someone sets one; a rate is
 * entered on its own page.
 *
 * Seeded through the API, read and acted on through the UI, as the
 * production flow is. freshOrg, because the waiting list must start empty.
 */

async function ok(response: APIResponse) {
  expect(response.ok(), await response.text()).toBeTruthy();
}

/**
 * A blend at 38 a kilo and bottles at 0.10 bought on a purchase order, a
 * recipe of 30 kg and 1000 bottles, and a run for 1000 released, 980 made
 * and closed: 1240.00 of material, 1.2653 a bottle.
 */
async function seedClosedRun(api: APIRequestContext) {
  await ok(
    await api.patch('/v1/organization', { data: { baseCurrency: 'CAD' } }),
  );

  const { location: site } = await created<{ location: { id: string } }>(
    await api.post('/v1/locations', {
      data: { type: 'site', name: 'E2E Cost Plant' },
    }),
  );

  const bin = async (name: string, code: string) =>
    (
      await created<{ location: { id: string } }>(
        await api.post('/v1/locations', {
          data: { type: 'bin', name, code, parentId: site.id },
        }),
      )
    ).location.id;

  const shelf = await bin('E2E Cost Shelf', 'E2E-C-SHELF');
  const blending = await bin('E2E Cost Blending', 'E2E-C-BLEND');

  const variantOf = async (
    sku: string,
    type: string,
    unit: string,
    tracksLots: boolean,
  ) =>
    (
      await created<{ product: { variants: { id: string }[] } }>(
        await api.post('/v1/products', {
          data: {
            type,
            name: sku,
            variant: { sku, unitOfMeasure: unit, tracksLots },
          },
        }),
      )
    ).product.variants[0].id;

  const output = await variantOf('E2E-C-FOCUS', 'good', 'each', true);
  const blend = await variantOf('E2E-C-BLEND', 'material', 'kg', true);
  const bottle = await variantOf('E2E-C-BOTTLE', 'packaging', 'each', false);

  const { partner } = await created<{ partner: { id: string } }>(
    await api.post('/v1/partners', {
      data: { name: 'E2E Cost Supplier', code: 'E2E-C-SUP' },
    }),
  );

  const buy = async (
    variantId: string,
    quantity: string,
    unitPrice: string,
    lot?: { code: string },
  ) => {
    const { order } = await created<{
      order: { id: string; lines: { id: string }[] };
    }>(
      await api.post('/v1/orders', {
        data: {
          partnerId: partner.id,
          direction: 'purchase',
          lines: [
            {
              variantId,
              quantityOrdered: quantity,
              unitPrice,
              currency: 'CAD',
            },
          ],
        },
      }),
    );

    await ok(
      await api.patch(`/v1/orders/${order.id}`, {
        data: { status: 'confirmed' },
      }),
    );

    await created(
      await api.post(
        `/v1/orders/${order.id}/lines/${order.lines[0].id}/receipts`,
        { data: { toLocationId: shelf, quantity, lot } },
      ),
    );
  };

  await buy(blend, '50', '38', { code: 'E2E-C-BF' });
  await buy(bottle, '1000', '0.10');

  const { bom } = await created<{ bom: { id: string } }>(
    await api.post('/v1/boms', {
      data: {
        outputVariantId: output,
        outputQuantity: '1000',
        lines: [
          { componentVariantId: blend, quantity: '30' },
          { componentVariantId: bottle, quantity: '1000' },
        ],
      },
    }),
  );
  await ok(await api.post(`/v1/boms/${bom.id}/promote`));

  const { productionOrder: run } = await created<{
    productionOrder: { id: string };
  }>(
    await api.post('/v1/production-orders', {
      data: {
        outputVariantId: output,
        bomId: bom.id,
        locationId: blending,
        quantityPlanned: '1000',
      },
    }),
  );

  await ok(
    await api.post(`/v1/production-orders/${run.id}/release`, {
      data: { sourceLocationId: shelf },
    }),
  );
  await created(
    await api.post(`/v1/production-orders/${run.id}/output`, {
      data: { quantity: '980', lot: { code: 'E2E-C-FOC-1' } },
    }),
  );
  await ok(
    await api.post(`/v1/production-orders/${run.id}/close`, { data: {} }),
  );

  return { runId: run.id, shelf };
}

test('shows what a batch cost, and clears a receipt waiting for one', async ({
  page,
  freshOrg,
}) => {
  const { runId, shelf } = await seedClosedRun(freshOrg.api);
  await signInAs(page, freshOrg.api);

  // --- The batch -------------------------------------------------------------
  await page.goto(`/production/${runId}`);

  await expect(
    page.getByRole('heading', { name: 'Cost', exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/1,240\.00/).first()).toBeVisible();
  await expect(page.getByText(/1\.2653/)).toBeVisible();
  await expect(page.getByRole('table', { name: 'What it used' })).toContainText(
    'E2E-C-BF',
  );

  // --- Something received with no price -------------------------------------
  const lid = (
    await created<{ product: { variants: { id: string }[] } }>(
      await freshOrg.api.post('/v1/products', {
        data: {
          type: 'packaging',
          name: 'E2E-C-LID',
          variant: { sku: 'E2E-C-LID', unitOfMeasure: 'each' },
        },
      }),
    )
  ).product.variants[0].id;

  await created(
    await freshOrg.api.post('/v1/stock/movements', {
      data: {
        variantId: lid,
        toLocationId: shelf,
        quantity: '5',
        reason: 'receipt',
      },
    }),
  );

  await page.goto('/costs');

  const waitingRow = page.getByRole('row', { name: /E2E-C-LID/ }).first();
  await expect(waitingRow).toContainText('Received with no price');

  await waitingRow
    .getByRole('button', { name: 'Set cost', exact: true })
    .click();

  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('textbox', { name: 'Unit price', exact: true })
    .fill('2');

  const [saved] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        new URL(response.url()).pathname.includes('/v1/costs/valuations/'),
    ),
    dialog.getByRole('button', { name: 'Set cost', exact: true }).click(),
  ]);
  expect(saved.ok(), await saved.text()).toBeTruthy();

  await expect(page.getByText('Everything on hand has a cost.')).toBeVisible();

  // --- The batch's lot, from the valuation list ------------------------------
  await page.getByRole('link', { name: 'E2E-C-FOC-1', exact: true }).click();

  await expect(page.getByText('Batch cost at close')).toBeVisible();
  await expect(page.getByText(/1\.2653/)).toBeVisible();
});

test('enters an exchange rate', async ({ page, freshOrg }) => {
  await ok(
    await freshOrg.api.patch('/v1/organization', {
      data: { baseCurrency: 'CAD' },
    }),
  );
  await signInAs(page, freshOrg.api);

  await page.goto('/settings/exchange-rates');
  await page.getByRole('button', { name: 'Set a rate', exact: true }).click();

  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('textbox', { name: 'Currency', exact: true })
    .fill('usd');
  await dialog.getByRole('textbox', { name: 'Rate', exact: true }).fill('1.37');
  await dialog.getByRole('button', { name: 'Save rate', exact: true }).click();

  const row = page.getByRole('row', { name: /USD/ });
  await expect(row).toContainText('1.37');
  await expect(row).not.toContainText('1.37000000');
});

// ---------------------------------------------------------------------------
// ADR-094 amended, the branch after: Stock value by the page, row by row of
// its interaction table (R6, R16, R19), each in an organization of its own
// ---------------------------------------------------------------------------

/** A screen's line in English, by its id (support/said.ts). */
const said = (id: string, values?: Parameters<typeof saidOn>[2]) =>
  saidOn('en', id, values);

/** Bought on a purchase order and received at the place, at its price. */
async function bought(
  api: APIRequestContext,
  supplier: SeededPartner,
  product: SeededProduct,
  place: SeededLocation,
  quantity: string,
  unitPrice: string,
  lot?: { makeCode: true; expiry: 'unknown' },
): Promise<{ lotId: string | null; lotCode: string | null }> {
  const { order } = await created<{
    order: { id: string; lines: { id: string }[] };
  }>(
    await api.post('/v1/orders', {
      data: {
        partnerId: supplier.id,
        direction: 'purchase',
        lines: [
          {
            variantId: product.variantId,
            quantityOrdered: quantity,
            unitPrice,
            currency: 'CAD',
          },
        ],
      },
    }),
  );
  await ok(
    await api.patch(`/v1/orders/${order.id}`, {
      data: { status: 'confirmed' },
    }),
  );
  const { movement, lotCode } = await created<{
    movement: { lotId: string | null };
    lotCode: string | null;
  }>(
    await api.post(
      `/v1/orders/${order.id}/lines/${order.lines[0].id}/receipts`,
      { data: { toLocationId: place.id, quantity, lot } },
    ),
  );
  return { lotId: movement.lotId, lotCode };
}

/**
 * Stock value's scene, in CAD: three items bought at 10.00, 50.00 and
 * 30.00 by their names' order, Alpha, Bravo, Charlie; and Delta, tracked
 * by lot, 20.00 in a lot whose made code was corrected to DL-0909.
 * 110.00 on hand.
 */
async function valueScene(api: APIRequestContext) {
  await ok(
    await api.patch('/v1/organization', { data: { baseCurrency: 'CAD' } }),
  );
  const [shelf, supplier] = await Promise.all([
    createLocation(api, { name: 'E2E Value Shelf' }),
    createPartner(api, { name: 'E2E Value Supplier' }),
  ]);
  const [alpha, bravo, charlie, delta] = await Promise.all([
    createProduct(api, { name: 'E2E Alpha', sku: 'E2E-ALPHA' }),
    createProduct(api, { name: 'E2E Bravo', sku: 'E2E-BRAVO' }),
    createProduct(api, { name: 'E2E Charlie', sku: 'E2E-CHARLIE' }),
    createProduct(api, {
      name: 'E2E Delta',
      sku: 'E2E-DELTA',
      tracksLots: true,
    }),
  ]);
  await bought(api, supplier, alpha, shelf, '10', '1.00');
  await bought(api, supplier, bravo, shelf, '10', '5.00');
  await bought(api, supplier, charlie, shelf, '10', '3.00');
  const lot = await bought(api, supplier, delta, shelf, '10', '2.00', {
    makeCode: true,
    expiry: 'unknown',
  });
  await ok(
    await api.patch(`/v1/stock/lots/${lot.lotId}`, {
      data: { code: 'DL-0909', reason: 'E2E typed from a smudged label' },
    }),
  );
  return { was: lot.lotCode! };
}

/** The list's table, its rows' item links top to bottom, its total. */
const pools = (page: Page) =>
  page.getByRole('table', { name: 'By item and lot' });
const poolNames = (page: Page) =>
  pools(page).locator('tbody a[href^="/items/"]');
const onHand = (page: Page) =>
  page
    .getByRole('heading', { name: 'On hand', exact: true })
    .locator('xpath=following-sibling::*[1]');

test('Stock value, Find an item or a lot, type: the pools that match and how many, a lot found by its former code saying “was”; the total as it was; the find in the address; Clear the search', async ({
  page,
  freshOrg,
}) => {
  const { was } = await valueScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await page.goto('/costs');

  await expect(poolNames(page)).toHaveText([
    /^E2E Alpha/,
    /^E2E Bravo/,
    /^E2E Charlie/,
    /^E2E Delta/,
  ]);
  await expect(onHand(page)).toContainText('110.00');
  const total = await onHand(page).innerText();

  // A lot's code it no longer has finds it (R10), and says it (R9).
  const find = page.getByRole('searchbox', { name: 'Find an item or a lot' });
  await find.fill(was);
  await expect(page).toHaveURL(new RegExp(`[?&]search=${was}`));
  await expect(poolNames(page)).toHaveText([/^E2E Delta/]);
  await expect(
    pools(page).getByRole('link', { name: 'DL-0909', exact: true }),
  ).toBeVisible();
  await expect(
    pools(page).getByText(said('inventory.movements.was', { code: was })),
  ).toBeVisible();
  await expect(
    page.getByText(said('costs.findMatches', { count: 1, pools: 4 })),
  ).toBeVisible();
  await expect(onHand(page)).toHaveText(total);

  // Nothing matches: said so, with Clear the search, the total kept.
  await find.fill('E2E-NOTHING');
  await expect(
    page.getByText(said('costs.noMatch', { search: 'E2E-NOTHING' })),
  ).toBeVisible();
  await expect(onHand(page)).toHaveText(total);
  await page.getByRole('button', { name: 'Clear the search' }).click();
  await expect(find).toHaveValue('');
  await expect(page).not.toHaveURL(/search=/);
  await expect(poolNames(page)).toHaveCount(4);
});

test('Stock value, the Value header, press: largest first; again, smallest first; the sort in the address; the Item header, the order before; Back, the page before, as every list’s sort', async ({
  page,
  freshOrg,
}) => {
  await valueScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await page.goto('/locations');
  await page.goto('/costs');
  await expect(poolNames(page)).toHaveCount(4);

  const value = pools(page).getByRole('button', { name: 'Value', exact: true });
  await value.click();
  await expect(page).toHaveURL(/[?&]sort=value&order=desc/);
  await expect(poolNames(page)).toHaveText([
    /^E2E Bravo/,
    /^E2E Charlie/,
    /^E2E Delta/,
    /^E2E Alpha/,
  ]);
  await expect(
    pools(page).getByRole('columnheader', { name: 'Value' }),
  ).toHaveAttribute('aria-sort', 'descending');

  await value.click();
  await expect(page).toHaveURL(/[?&]sort=value&order=asc/);
  await expect(poolNames(page)).toHaveText([
    /^E2E Alpha/,
    /^E2E Delta/,
    /^E2E Charlie/,
    /^E2E Bravo/,
  ]);

  // The item's order is the list's own: its header puts it back.
  await pools(page).getByRole('button', { name: 'Item', exact: true }).click();
  await expect(page).not.toHaveURL(/sort=/);
  await expect(poolNames(page)).toHaveText([
    /^E2E Alpha/,
    /^E2E Bravo/,
    /^E2E Charlie/,
    /^E2E Delta/,
  ]);

  // A sort replaces the address (#341's rule): Back leaves the page.
  await page.goBack();
  await expect(page).toHaveURL(/\/locations$/);
});

test('Stock value, Show 50 more: the next page, focus on its first new row; a failed page says so, with Try again; Back from a lot, the row left', async ({
  page,
  freshOrg,
}) => {
  test.setTimeout(90_000);
  await ok(
    await freshOrg.api.patch('/v1/organization', {
      data: { baseCurrency: 'CAD' },
    }),
  );
  // E2E Page 01 to 52, then a lot of E2E Zed's: 53 pools by the item.
  await fiftyTwo(freshOrg.api);
  const zed = await createProduct(freshOrg.api, {
    name: 'E2E Zed',
    sku: 'E2E-ZED',
    tracksLots: true,
  });
  const shelf = await createLocation(freshOrg.api, { name: 'E2E Zed Shelf' });
  await receive(freshOrg.api, zed, shelf, '4', { code: 'ZED-0101' });
  await signInAs(page, freshOrg.api);
  await page.goto('/costs');
  await expect(poolNames(page)).toHaveCount(50);

  // A dropped connection on the next page alone: the rows stay.
  const isNext = (url: URL) =>
    url.pathname === '/api/v1/costs/valuation' &&
    url.searchParams.has('cursor');
  await page.route(isNext, (route) => route.abort('internetdisconnected'));
  await page.getByRole('button', { name: 'Show 50 more' }).click();
  await expect(
    page.getByText('The next 50 could not be loaded.'),
  ).toBeVisible();
  await expect(poolNames(page)).toHaveCount(50);

  await page.unroute(isNext);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(poolNames(page)).toHaveCount(53);
  await expect(poolNames(page).nth(50)).toBeFocused();

  // Into a lot on the second page, and Back: that row, focus on its link.
  const lot = pools(page).getByRole('link', { name: 'ZED-0101', exact: true });
  await lot.click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'ZED-0101',
  );
  await page.goBack();
  await expect(poolNames(page)).toHaveCount(53);
  await expect(lot).toBeFocused();
});

test('Stock value, a return with no shipped cost that waits, Set cost: saved, “Cost set”; nothing left waiting (R16)', async ({
  page,
  freshOrg,
}) => {
  await ok(
    await freshOrg.api.patch('/v1/organization', {
      data: { baseCurrency: 'CAD' },
    }),
  );
  const [product, shelf, customer] = await Promise.all([
    createProduct(freshOrg.api, {
      name: 'E2E Returned Tea',
      sku: 'E2E-RTEA',
      tracksLots: true,
    }),
    createLocation(freshOrg.api, { name: 'E2E Return Shelf' }),
    createPartner(freshOrg.api, { name: 'E2E Corner Cafe' }),
  ]);
  // Returned with no order into a new lot: no shipment to come back at,
  // no average to land at, so it waits and takes a cost of its own.
  await created(
    await freshOrg.api.post('/v1/stock/movements', {
      data: {
        variantId: product.variantId,
        toLocationId: shelf.id,
        quantity: '3',
        reason: 'receipt',
        reasonDetail: 'returned',
        recipientPartnerId: customer.id,
        lot: { code: 'RT-0101', expiry: 'unknown' },
      },
    }),
  );
  await signInAs(page, freshOrg.api);
  await page.goto('/costs');

  const waiting = page.getByRole('row', { name: /E2E-RTEA/ }).first();
  await expect(waiting).toContainText('RT-0101');
  await waiting.getByRole('button', { name: 'Set cost', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('textbox', { name: 'Unit price', exact: true })
    .fill('2');
  await dialog.getByRole('button', { name: 'Set cost', exact: true }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText(said('costs.set.done'))).toBeVisible();
  await expect(page.getByText(said('costs.allCosted'))).toBeVisible();
});
