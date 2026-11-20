import { readFile } from 'node:fs/promises';

import type { APIRequestContext, Locator, Page } from '@playwright/test';

import { expect, test } from './fixtures';
import {
  created,
  createLocation,
  createProduct,
  daysFromNow,
  memberIn,
  signInAs,
} from './support/api';
import { confirmEmailInDatabase } from './support/mail';
import {
  orderOf,
  receive,
  type SeededOrder,
  type StockScene,
  stockScene,
} from './support/stock';

/**
 * Movements (ADR-093, Movements' branch), row by row: each row of the
 * amendment's Movements table and its Into Movements table is one test
 * here, named by its words, "where, what you do: what happens; Back",
 * every address by 95a's keys. Stock's lot's Actions › Movements is in
 * stock.spec.ts with Stock's rows. Then the states it names for
 * Movements, a phone's cards, and the readers 96a and the brief's rules
 * leave less: a Sales reader with no place, a reader without orders.view.
 *
 * Two of the table's words are not built, so not held here: Show 25
 * more's focus on the first new row, and an opening balance as the
 * table's last row, which the period line and the export carry instead.
 *
 * Each test makes its own organization, since it counts rows and reads
 * figures; setup goes through the API (support/stock.ts's scene).
 */

/**
 * Stock's scene, and what Movements reads besides: 4 of the vitamin's
 * VC-LATE shipped from A2, and a purchase of it received in part on its
 * order into B1, a new lot VC-NEW. The vitamin's ledger, oldest first:
 * VC-SOON 20 in, 5 of it moved A2 → B1, VC-LATE 30 in, VC-GONE 6 in,
 * 4 shipped, 10 received on the purchase: on hand 20, 20, 50, 56, 52, 62.
 * The magnesium's one receipt of 10 makes seven movements in all.
 */
interface MovementsScene extends StockScene {
  purchase: SeededOrder;
  newLot: string;
}

async function movementsScene(api: APIRequestContext): Promise<MovementsScene> {
  const scene = await stockScene(api);
  await created(
    await api.post('/v1/stock/movements', {
      data: {
        variantId: scene.vitamin.variantId,
        lotId: scene.lots.late,
        fromLocationId: scene.shelfA.id,
        quantity: '4',
        reason: 'shipment',
      },
    }),
  );
  const purchase = await orderOf(
    api,
    scene.partner,
    'purchase',
    scene.vitamin,
    '30',
  );
  const order = (await (await api.get(`/v1/orders/${purchase.id}`)).json()) as {
    lines: { id: string }[];
  };
  await created(
    await api.post(
      `/v1/orders/${purchase.id}/lines/${order.lines[0]!.id}/receipts`,
      {
        data: {
          toLocationId: scene.shelfB.id,
          quantity: '10',
          lot: { code: 'VC-NEW', expiresAt: daysFromNow(300) },
        },
      },
    ),
  );
  const lots = (await (
    await api.get(
      `/v1/stock/movements?variantId=${scene.vitamin.variantId}&limit=1`,
    )
  ).json()) as { entries: { lotId: string }[] };
  return { ...scene, purchase, newLot: lots.entries[0]!.lotId };
}

/** Movements' rows, its header row left out. */
const rows = (page: Page) =>
  page
    .getByRole('table')
    .getByRole('row')
    .filter({ has: page.getByRole('cell') });

/** A column's head by its words, whole. */
const head = (page: Page, name: string) =>
  page.getByRole('columnheader', { name, exact: true });

/** A row's whole cell holding exactly this text, such as "62 each". */
const cellOf = (row: Locator, text: string) =>
  row.getByRole('cell', { name: text, exact: true });

/**
 * A place in the Location filter, by its name: the place's own option, not
 * its warehouse's heading, which MUI's select also gives the option role.
 */
const placeOption = (page: Page, name: string) =>
  page
    .getByRole('option', { name, exact: true })
    .and(page.locator('[data-value]'));

/** Movements opened with Locations the page before it, for Back. */
async function movementsFrom(page: Page, address = '/movements') {
  await page.goto('/locations');
  await page.goto(address);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Movements' }),
  ).toBeVisible();
}

/** The period line's figures, as its terms and their values. */
const period = (page: Page) => ({
  terms: page.getByRole('main').locator('dl > div > dt'),
  values: page.getByRole('main').locator('dl > div > dd'),
});

// ---------------------------------------------------------------------------
// Movements' table, row by row
// ---------------------------------------------------------------------------

test('Movements, Item › E2E Vitamin C: In · Out · Balance replace Change; ?variantId=; Back leaves Movements', async ({
  page,
  freshOrg,
}) => {
  const scene = await movementsScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await movementsFrom(page);
  await expect(rows(page)).toHaveCount(7);
  await expect(head(page, 'Change')).toBeVisible();
  await expect(head(page, 'Item')).toBeVisible();

  await page.getByRole('combobox', { name: 'Item' }).fill('Vitamin');
  await page.getByRole('option', { name: /^E2E Vitamin C/ }).click();

  await expect(page).toHaveURL(
    new RegExp(`/movements\\?variantId=${scene.vitamin.variantId}$`),
  );
  await expect(rows(page)).toHaveCount(6);
  for (const name of ['In', 'Out', 'Balance']) {
    await expect(head(page, name)).toBeVisible();
  }
  // The Item field says which; no Change, and no Item column (81a).
  await expect(head(page, 'Change')).toHaveCount(0);
  await expect(head(page, 'Item')).toHaveCount(0);
  // Newest first: the receipt on the purchase, its balance today's 62.
  await expect(cellOf(rows(page).first(), '62 each')).toBeVisible();

  // A filter replaces the address (#341): Back leaves Movements.
  await page.goBack();
  await expect(page).toHaveURL(/\/locations$/);
});

test('Movements, one item, Location › Shelf A2: In, Out and Balance count A2 alone; a move out reads Out; Back leaves Movements', async ({
  page,
  freshOrg,
}) => {
  const scene = await movementsScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await movementsFrom(page, `/movements?variantId=${scene.vitamin.variantId}`);

  await page.getByRole('combobox', { name: 'Location' }).click();
  await placeOption(page, scene.shelfA.name).click();

  await expect(page).toHaveURL(
    new RegExp(
      `variantId=${scene.vitamin.variantId}&locationId=${scene.shelfA.id}$`,
    ),
  );
  await expect(
    page.getByText(`In, Out and Balance count ${scene.shelfA.name} alone.`),
  ).toBeVisible();
  // A2's own four: VC-SOON in, 5 moved out to B1, VC-LATE in, 4 shipped.
  await expect(rows(page)).toHaveCount(4);
  await expect(cellOf(rows(page).first(), '41 each')).toBeVisible();
  const moved = rows(page).filter({ hasText: 'transfer' });
  await expect(cellOf(moved, '5 each')).toBeVisible();
  await expect(cellOf(moved, '15 each')).toBeVisible();
  // Out, its In empty: the third cell after When is Out.
  await expect(moved.getByRole('cell').nth(1)).toHaveText('—');
  await expect(moved.getByRole('cell').nth(2)).toHaveText('5 each');

  await page.goBack();
  await expect(page).toHaveURL(/\/locations$/);
});

test('Movements, every filter in the address: a reload keeps each, and the rows', async ({
  page,
  freshOrg,
}) => {
  const scene = await movementsScene(freshOrg.api);
  const [from, until] = [daysFromNow(-30), daysFromNow(30)];
  await signInAs(page, freshOrg.api);
  await page.goto(
    `/movements?variantId=${scene.vitamin.variantId}&locationId=${scene.shelfA.id}&reason=receipt&from=${from}&until=${until}`,
  );
  // A2's two receipts, VC-SOON's and VC-LATE's.
  await expect(rows(page)).toHaveCount(2);

  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Item' })).toHaveValue(
    /^E2E Vitamin C/,
  );
  await expect(page.getByRole('combobox', { name: 'Location' })).toHaveText(
    scene.shelfA.name,
  );
  await expect(page.getByRole('combobox', { name: 'Reason' })).toHaveText(
    'receipt',
  );
  await expect(page.getByLabel('When from')).toHaveValue(from);
  await expect(page.getByLabel('When to')).toHaveValue(until);
  await expect(rows(page)).toHaveCount(2);
});

test('Movements, a row, the item’s name: the item’s page, focus on its title; Back, Movements as it was, focus on the row', async ({
  page,
  freshOrg,
}) => {
  const scene = await movementsScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await movementsFrom(page, '/movements?reason=receipt');
  await expect(rows(page)).toHaveCount(5);

  const magnesium = rows(page).filter({ hasText: 'E2E Magnesium' });
  await magnesium.getByRole('link', { name: 'E2E Magnesium' }).click();
  await expect(page).toHaveURL(new RegExp(`/items/${scene.magnesium.id}$`));
  await expect(
    page.getByRole('heading', { level: 1, name: 'E2E Magnesium' }),
  ).toBeFocused();

  await page.goBack();
  await expect(page).toHaveURL(/\/movements\?reason=receipt$/);
  await expect(rows(page)).toHaveCount(5);
  await expect(
    magnesium.getByRole('link', { name: 'E2E Magnesium' }),
  ).toBeFocused();
});

test('Movements, a row, a lot or a document: the lot’s trace, or the order; Back, Movements as it was', async ({
  page,
  freshOrg,
}) => {
  const scene = await movementsScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await movementsFrom(page, '/movements?reason=receipt');

  const received = rows(page).first();
  await received.getByRole('link', { name: 'VC-NEW' }).click();
  await expect(page).toHaveURL(new RegExp(`/lots/${scene.newLot}$`));
  await expect(page.getByRole('heading', { level: 1 })).toContainText('VC-NEW');
  await page.goBack();
  await expect(page).toHaveURL(/\/movements\?reason=receipt$/);

  await received.getByRole('link', { name: scene.purchase.number }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${scene.purchase.id}$`));
  await page.goBack();
  await expect(page).toHaveURL(/\/movements\?reason=receipt$/);
  await expect(rows(page)).toHaveCount(5);
});

test('Movements, one item, When › This month: ?from= and ?until= in the organization’s days; the period line, Opening, In, Out and Closing; Back leaves Movements', async ({
  page,
  freshOrg,
}) => {
  const scene = await movementsScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await movementsFrom(page, `/movements?variantId=${scene.vitamin.variantId}`);
  await expect(period(page).values).toHaveCount(0);

  await page.getByRole('button', { name: 'Period' }).click();
  await page.getByRole('menuitem', { name: 'This month' }).click();

  await expect(page).toHaveURL(/[?&]from=\d{4}-\d{2}-01(&|$)/);
  await expect(page).toHaveURL(/[?&]until=\d{4}-\d{2}-\d{2}(&|$)/);
  // Everything moved today: nothing before the month, In and Out across
  // every place, a move between them neither; Closing today's on hand.
  await expect(period(page).terms).toHaveText([
    /^Opening, /,
    'In',
    'Out',
    /^Closing, /,
  ]);
  await expect(period(page).values).toHaveText([
    '0 each',
    '66 each',
    '4 each',
    '62 each',
  ]);

  await page.goBack();
  await expect(page).toHaveURL(/\/locations$/);
});

test('Movements, one item, Reason › shipment: Balance, Opening and Closing go; In and Out stay, with “Balance counts every reason” and Clear Reason', async ({
  page,
  freshOrg,
}) => {
  const scene = await movementsScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await movementsFrom(
    page,
    `/movements?variantId=${scene.vitamin.variantId}&from=${daysFromNow(-40)}`,
  );
  await expect(head(page, 'Balance')).toBeVisible();

  await page.getByRole('combobox', { name: 'Reason' }).click();
  await page.getByRole('option', { name: 'shipment' }).click();

  await expect(page).toHaveURL(/[?&]reason=shipment(&|$)/);
  await expect(rows(page)).toHaveCount(1);
  await expect(head(page, 'Balance')).toHaveCount(0);
  await expect(head(page, 'In')).toBeVisible();
  await expect(head(page, 'Out')).toBeVisible();
  await expect(period(page).terms).toHaveText(['In', 'Out']);
  await expect(period(page).values).toHaveText(['0 each', '4 each']);
  await expect(
    page.getByText('Balance counts every reason. Clear Reason to see it.'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Clear Reason' }).click();
  await expect(page).not.toHaveURL(/reason=/);
  await expect(head(page, 'Balance')).toBeVisible();
  await expect(period(page).terms).toHaveText([
    /^Opening, /,
    'In',
    'Out',
    /^Closing, /,
  ]);
});

test('Movements, press When: oldest first, ?order=asc; with one item, its first row the first receipt’s balance', async ({
  page,
  freshOrg,
}) => {
  const scene = await movementsScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await movementsFrom(page, `/movements?variantId=${scene.vitamin.variantId}`);
  const when = page.getByRole('columnheader', { name: 'When' });
  await expect(when).toHaveAttribute('aria-sort', 'descending');

  await when.getByRole('button', { name: 'When' }).click();

  await expect(page).toHaveURL(/[?&]order=asc(&|$)/);
  await expect(when).toHaveAttribute('aria-sort', 'ascending');
  await expect(cellOf(rows(page).first(), '20 each').first()).toBeVisible();
  await expect(
    rows(page).first().getByRole('link', { name: 'VC-SOON' }),
  ).toBeVisible();
  await expect(cellOf(rows(page).last(), '62 each')).toBeVisible();
});

test('Movements, Show 25 more: the next movements below; failing, the rows kept with Try again; Back from a row past the first page, those pages read again, focus on its row', async ({
  page,
  freshOrg,
}) => {
  test.setTimeout(90_000);
  const shelf = await createLocation(freshOrg.api);
  const product = await createProduct(freshOrg.api, { name: 'E2E Bulk' });
  for (let start = 0; start < 27; start += 9) {
    await Promise.all(
      Array.from({ length: 9 }, () =>
        receive(freshOrg.api, product, shelf, '1'),
      ),
    );
  }
  await signInAs(page, freshOrg.api);
  await movementsFrom(page);
  await expect(rows(page)).toHaveCount(25);

  const next = (url: URL) =>
    url.pathname === '/api/v1/stock/movements' &&
    url.searchParams.has('before');
  await page.route(next, (route) => route.abort('internetdisconnected'));
  await page.getByRole('button', { name: 'Show 25 more' }).click();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(rows(page)).toHaveCount(25);

  await page.unroute(next);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(rows(page)).toHaveCount(27);
  await expect(page.getByRole('button', { name: 'Show 25 more' })).toHaveCount(
    0,
  );

  // The 26th row's item, then Back: both pages read again, its link
  // focused (P2a).
  const twentySixth = rows(page).nth(25);
  await twentySixth.getByRole('link', { name: 'E2E Bulk' }).click();
  await expect(page).toHaveURL(new RegExp(`/items/${product.id}$`));
  await page.goBack();
  await expect(rows(page)).toHaveCount(27);
  await expect(
    rows(page).nth(25).getByRole('link', { name: 'E2E Bulk' }),
  ).toBeFocused();
});

test('Movements, a filter on, Show all movements: every filter and chip cleared in one address write; Back leaves Movements', async ({
  page,
  freshOrg,
}) => {
  const scene = await movementsScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await movementsFrom(
    page,
    `/movements?variantId=${scene.vitamin.variantId}&lotId=${scene.lots.late}&reason=shipment&from=${daysFromNow(-40)}&sort=when&order=asc`,
  );
  await expect(page.getByText('Lot: VC-LATE')).toBeVisible();
  await expect(rows(page)).toHaveCount(1);

  await page.getByRole('button', { name: 'Show all movements' }).click();

  // The sort is the reader's own, and stays.
  await expect(page).toHaveURL(/\/movements\?sort=when&order=asc$/);
  await expect(page.getByText('Lot: VC-LATE')).toHaveCount(0);
  await expect(rows(page)).toHaveCount(7);
  await page.goBack();
  await expect(page).toHaveURL(/\/locations$/);
});

test('Movements, too wide beside Help at 1366 px: the name pinned, When under it as the box scrolls; When reached by Tab, scrolled clear of it; a long name at two lines, whole in a tooltip', async ({
  page,
  freshOrg,
}) => {
  const scene = await movementsScene(freshOrg.api);
  const long = await createProduct(freshOrg.api, {
    name: 'E2E Rosehip and acerola vitamin C chewable tablets for children, orange flavour, sugar free, in a bottle of sixty, the family size',
  });
  await receive(freshOrg.api, long, scene.shelfA, '3');
  await page.setViewportSize({ width: 1366, height: 900 });
  await signInAs(page, freshOrg.api);
  await page.goto('/movements');
  await expect(rows(page)).toHaveCount(8);
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Help', exact: true })
    .click();
  await expect(
    page
      .getByRole('complementary', { name: 'Help', exact: true })
      .getByRole('heading', { level: 2 }),
  ).toBeVisible();

  const box = page.getByRole('main').locator('.MuiTableContainer-root');
  await expect(box).not.toHaveAttribute('data-fits');
  const item = head(page, 'Item');
  const when = page.getByRole('columnheader', { name: 'When' });

  // Scrolled to its end: the name at the box's start, When under it.
  await box.evaluate((frame) => {
    frame.scrollLeft = frame.scrollWidth;
  });
  await expect(box).toHaveAttribute('data-under-start');
  const [frame, name, under] = await Promise.all([
    box.boundingBox(),
    item.boundingBox(),
    when.boundingBox(),
  ]);
  expect(Math.abs(name!.x - frame!.x)).toBeLessThanOrEqual(1);
  expect(under!.x).toBeLessThan(name!.x);

  // When by the keyboard, from Period before the table, past the box,
  // which scrolls by the keys: brought whole beside the name, not left
  // under it.
  await page.getByRole('button', { name: 'Period' }).focus();
  await page.keyboard.press('Tab');
  await expect(box).toBeFocused();
  await page.keyboard.press('Tab');
  const sort = when.getByRole('button', { name: 'When' });
  await expect(sort).toBeFocused();
  await expect
    .poll(async () => {
      const [label, pinned] = await Promise.all([
        sort.boundingBox(),
        item.boundingBox(),
      ]);
      return label!.x + label!.width <= pinned!.x + 0.5;
    })
    .toBe(true);

  // The long name at two lines, "…" at its end, whole on hover (83a).
  const cut = rows(page)
    .first()
    .getByRole('link', { name: long.name, exact: true });
  expect(
    await cut.evaluate((link) => {
      const shown = getComputedStyle(link);
      return {
        clamp: shown.webkitLineClamp,
        cut: link.scrollHeight > link.clientHeight + 1,
      };
    }),
  ).toEqual({ clamp: '2', cut: true });
  await cut.hover();
  await expect(page.getByRole('tooltip')).toHaveText(long.name);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// The log read whole: a reason, and a move found from either end
// ---------------------------------------------------------------------------

test('Movements, Reason › transfer: the move alone, From → to naming each end on a line of its own, its change as its whole cell', async ({
  page,
  freshOrg,
}) => {
  const scene = await movementsScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await page.goto('/movements');
  // Unfiltered is recent everything, not an empty screen asking for one.
  await expect(rows(page)).toHaveCount(7);

  await page.getByRole('combobox', { name: 'Reason' }).click();
  await page.getByRole('option', { name: 'transfer' }).click();

  /**
   * Direction is which location is set, not a column (ADR-023): a
   * transfer is the only movement with both, its From → to naming each
   * on a line of its own (ADR-093, 82a).
   */
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText(scene.shelfA.name);
  await expect(rows(page).first()).toContainText(scene.shelfB.name);
  // Without padding zeros, with its unit (displayQuantity, #256).
  await expect(cellOf(rows(page).first(), '5 each')).toBeVisible();
});

test('Movements, Location › Shelf B1, every item: a move found from the end it went to', async ({
  page,
  freshOrg,
}) => {
  const scene = await movementsScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await page.goto('/movements');

  /**
   * B1 had nothing until the move into it, so finding the move there
   * proves the OR on both location columns: a move between two shelves
   * is as much a fact about the one as the other, and a filter matching
   * one end would hide half of every move.
   */
  await page.getByRole('combobox', { name: 'Location' }).click();
  await placeOption(page, scene.shelfB.name).click();

  await expect(rows(page)).toHaveCount(3);
  await expect(rows(page).filter({ hasText: 'transfer' })).toHaveCount(1);
});

// ---------------------------------------------------------------------------
// Into Movements, row by row (a lot's Actions › Movements in stock.spec.ts)
// ---------------------------------------------------------------------------

/** Stock opened with Locations the page before it, for Back. */
async function stockFrom(page: Page, address = '/inventory') {
  await page.goto('/locations');
  await page.goto(address);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Inventory' }),
  ).toBeVisible();
}

test('Stock, an item’s Actions › Movements: ?variantId=, Movements, one item; Back, Stock as it was', async ({
  page,
  freshOrg,
}) => {
  const scene = await movementsScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await stockFrom(page, '/inventory?search=E2E');

  await page.getByRole('button', { name: 'Actions for E2E Vitamin C' }).click();
  await page.getByRole('menuitem', { name: 'Movements', exact: true }).click();

  await expect(page).toHaveURL(
    new RegExp(`/movements\\?variantId=${scene.vitamin.variantId}$`),
  );
  await expect(head(page, 'Balance')).toBeVisible();
  await expect(rows(page)).toHaveCount(6);

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/inventory\?search=E2E$/);
  await expect(
    page.getByRole('searchbox', { name: 'Search items, codes or lots' }),
  ).toHaveValue('E2E');
});

test('Stock, a place row, Movements: ?variantId=&locationId=, Movements on that place; Back, Stock as it was, the row open', async ({
  page,
  freshOrg,
}) => {
  const scene = await movementsScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await stockFrom(page);

  const places = page.getByRole('button', {
    name: /: (show|hide) where E2E Vitamin C is$/,
  });
  await places.click();
  await page
    .getByRole('link', {
      name: `Movements of E2E Vitamin C at ${scene.shelfB.name}`,
    })
    .click();

  await expect(page).toHaveURL(
    new RegExp(
      `/movements\\?variantId=${scene.vitamin.variantId}&locationId=${scene.shelfB.id}$`,
    ),
  );
  await expect(
    page.getByText(`In, Out and Balance count ${scene.shelfB.name} alone.`),
  ).toBeVisible();
  // B1's own: 5 moved in, VC-GONE in, 10 received on the purchase.
  await expect(rows(page)).toHaveCount(3);
  await expect(cellOf(rows(page).first(), '21 each')).toBeVisible();

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(
    new RegExp(`/inventory\\?open=${scene.vitamin.variantId}$`),
  );
  await expect(places).toHaveAttribute('aria-expanded', 'true');
});

test('The item’s page, Latest movements, All movements of E2E-VITC: ?variantId=, Movements, one item; Back, the item’s page', async ({
  page,
  freshOrg,
}) => {
  const scene = await movementsScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await page.goto('/items');
  await page.goto(`/items/${scene.vitamin.id}`);

  const latest = page.getByRole('region', { name: 'Where it stands' });
  // The five newest, as Movements lists them.
  await expect(
    latest.getByRole('link', { name: 'All movements of E2E-VITC' }),
  ).toBeVisible();
  await latest.getByRole('link', { name: 'All movements of E2E-VITC' }).click();

  await expect(page).toHaveURL(
    new RegExp(`/movements\\?variantId=${scene.vitamin.variantId}$`),
  );
  await expect(head(page, 'Balance')).toBeVisible();
  await expect(rows(page)).toHaveCount(6);

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(new RegExp(`/items/${scene.vitamin.id}$`));
});

test('The order’s page, Receipts, All movements of PO-…: ?orderId=, a chip; In and Out, no balance; Back, the order’s page', async ({
  page,
  freshOrg,
}) => {
  const scene = await movementsScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await page.goto('/orders');
  await page.goto(`/orders/${scene.purchase.id}`);

  await page.getByRole('tab', { name: 'Receipts' }).click();
  const receipts = page.getByRole('tabpanel');
  await expect(receipts.getByRole('link', { name: 'VC-NEW' })).toBeVisible();
  await receipts
    .getByRole('link', { name: `All movements of ${scene.purchase.number}` })
    .click();

  await expect(page).toHaveURL(
    new RegExp(`/movements\\?orderId=${scene.purchase.id}$`),
  );
  await expect(page.getByText(`Order: ${scene.purchase.number}`)).toBeVisible();
  await expect(rows(page)).toHaveCount(1);
  await expect(head(page, 'In')).toBeVisible();
  await expect(head(page, 'Out')).toBeVisible();
  await expect(head(page, 'Balance')).toHaveCount(0);

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(
    new RegExp(`/orders/${scene.purchase.id}(\\?tab=receipts)?$`),
  );
});

// ---------------------------------------------------------------------------
// The states, where ADR-093 says Movements' differ
// ---------------------------------------------------------------------------

test('first use: “Nothing has moved yet.” with Receive stock', async ({
  page,
  freshOrg,
}) => {
  await createLocation(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await page.goto('/movements');

  await expect(
    page.getByText(
      'Nothing has moved yet. Receiving stock is what puts the first row here.',
    ),
  ).toBeVisible();
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Receive stock' })
    .click();
  await expect(
    page.getByRole('dialog', { name: 'Receive stock' }),
  ).toBeVisible();
});

test('first use, for a Viewer: no Receive stock, its line saying whom to ask', async ({
  page,
  freshOrg,
}) => {
  await confirmEmailInDatabase(freshOrg.email);
  const viewer = await memberIn(freshOrg.api, 'Viewer');
  await signInAs(page, viewer);
  await page.goto('/movements');

  await expect(
    page.getByText('Nothing has moved yet.', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole('main').getByRole('button', { name: 'Receive stock' }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole('main')
      .getByText(
        /^Your role does not include receiving stock\. To do more, ask .+\.$/,
      ),
  ).toBeVisible();
  await viewer.dispose();
});

test('no results: the filters on named, with Show all movements', async ({
  page,
  freshOrg,
}) => {
  const scene = await movementsScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await page.goto(
    `/movements?variantId=${scene.magnesium.variantId}&reason=sample`,
  );

  await expect(
    page.getByText('No movements match: E2E Magnesium and sample.'),
  ).toBeVisible();
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Show all movements' })
    .last()
    .click();
  await expect(page).toHaveURL(/\/movements$/);
  await expect(rows(page)).toHaveCount(7);
});

test('the balance hint: several items listed at a place, “Choose one item to see In, Out and Balance.”; one chosen, its Balance', async ({
  page,
  freshOrg,
}) => {
  const scene = await movementsScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await page.goto(`/movements?locationId=${scene.shelfA.id}`);

  const hint = page.getByText('Choose one item to see In, Out and Balance.');
  await expect(hint).toBeVisible();
  await expect(head(page, 'Change')).toBeVisible();
  await expect(rows(page)).toHaveCount(5);

  await page.getByRole('combobox', { name: 'Item' }).fill('Magnesium');
  await page.getByRole('option', { name: /^E2E Magnesium/ }).click();
  await expect(hint).toHaveCount(0);
  await expect(head(page, 'Balance')).toBeVisible();
  await expect(cellOf(rows(page).first(), '10 each').first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// A phone: cards, the filters behind one button
// ---------------------------------------------------------------------------

test('on a phone: a card per movement, the filters and the sort behind one Filters button', async ({
  page,
  freshOrg,
}) => {
  const scene = await movementsScene(freshOrg.api);
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAs(page, freshOrg.api);
  await page.goto(`/movements?variantId=${scene.vitamin.variantId}`);

  await expect(page.getByRole('table')).toHaveCount(0);
  const cards = page.getByRole('main').getByRole('listitem');
  await expect(cards).toHaveCount(6);
  await expect(cards.first()).toContainText('Balance');
  await expect(cards.first()).toContainText('62 each');
  await expect(page.getByRole('combobox', { name: 'Reason' })).toBeHidden();

  await page.getByRole('button', { name: /^Filters/ }).click();
  await expect(page.getByRole('combobox', { name: 'Reason' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Sort' })).toBeVisible();
});

// ---------------------------------------------------------------------------
// Readers with less: no place (96a), no order (the brief's rule)
// ---------------------------------------------------------------------------

test('a Sales reader: no From → to and no place named; a link with ?locationId= reads Everywhere; the export without From and To; a lot’s page with no shelf', async ({
  page,
  freshOrg,
}) => {
  const scene = await movementsScene(freshOrg.api);
  await confirmEmailInDatabase(freshOrg.email);
  const sales = await memberIn(freshOrg.api, 'Sales', 'sales');
  await signInAs(page, sales);

  // The place ignored, as Stock's address is: every movement.
  await page.goto(`/movements?locationId=${scene.shelfA.id}`);
  await expect(rows(page)).toHaveCount(7);
  await expect(head(page, 'From → to')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Location' })).toHaveCount(0);
  await expect(page.getByRole('main')).not.toContainText('E2E Shelf');
  // A move between places still listed, its reason saying so.
  await expect(rows(page).filter({ hasText: 'transfer' })).toHaveCount(1);

  const saved = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  const text = await readFile(await (await saved).path(), 'utf8');
  const [header, ...lines] = text
    .replace(/^\uFEFF/, '')
    .trim()
    .split(/\r?\n/);
  const columns = header!.split(',');
  expect(columns).not.toContain('From');
  expect(columns).not.toContain('To');
  expect(columns).toEqual(expect.arrayContaining(['When', 'Reason', 'Lot']));
  expect(lines).toHaveLength(7);
  expect(text).not.toContain('E2E Shelf');

  await page.goto(`/lots/${scene.lots.soon}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'VC-SOON',
  );
  await expect(page.getByText('Where it is now')).toBeVisible();
  await expect(page.getByText('Usable', { exact: true })).toBeVisible();
  await expect(page.getByText('Not usable', { exact: true })).toBeVisible();
  await expect(page.getByText('Location', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('main')).not.toContainText('E2E Shelf');
  await sales.dispose();
});

test('a reader without orders.view: a link with ?orderId= reads every movement, with no chip', async ({
  page,
  freshOrg,
}) => {
  const scene = await movementsScene(freshOrg.api);
  await confirmEmailInDatabase(freshOrg.email);
  const lookup = await memberIn(freshOrg.api, 'Lookup', 'stock_lookup');
  await signInAs(page, lookup);

  await page.goto(`/movements?orderId=${scene.purchase.id}`);
  await expect(rows(page)).toHaveCount(7);
  await expect(page.getByText(/^Order: /)).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Show all movements' }),
  ).toHaveCount(0);
  await lookup.dispose();
});
