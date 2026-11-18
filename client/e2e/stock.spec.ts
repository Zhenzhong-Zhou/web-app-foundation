import { readFile } from 'node:fs/promises';

import type { APIRequestContext, Page } from '@playwright/test';

import { expect, test } from './fixtures';
import {
  createLocation,
  createProduct,
  inviteByLink,
  joinByLink,
  signInAs,
  uniqueEmail,
} from './support/api';
import { confirmEmailInDatabase } from './support/mail';
import { orderOf, receive, reorderAt, stockScene } from './support/stock';

/**
 * Inventory's Stock tab (ADR-093), row by row: each row of the ADR's
 * Stock table is one test here, named by its words, "where, what you do:
 * what happens; Back", but Actions › Movements, Movements' branch's. Then
 * the five states where the ADR says they differ, and the button that
 * opens a row. Where it stands' own rows are in where-it-stands.spec.ts,
 * Reorder's in reorder.spec.ts, axe on each in accessibility.spec.ts.
 *
 * Each test makes its own organization, since it counts rows and reads
 * figures; setup goes through the API (support/stock.ts's scene).
 */

/** The code's row, by the item's name. */
const codeRow = (page: Page, name: string) =>
  page.getByRole('row', { name: new RegExp(name) });

/** The button that opens a code's row to its places. */
const placesOf = (page: Page, name: string) =>
  page.getByRole('button', {
    name: new RegExp(`: (show|hide) where ${name} is$`),
  });

/** The button that opens a place's row to its lots. */
const lotsAt = (page: Page, place: string) =>
  page.getByRole('button', {
    name: new RegExp(`: (show|hide) the lots at ${place}$`),
  });

/** Every lot's link on the page, top to bottom. */
const lotLinks = (page: Page) =>
  page.getByRole('main').getByRole('link', { name: /^VC-/ });

/**
 * The rows' item links, top to bottom: each name's, not its "20 left" or
 * "15 short", which open a part of the item's page.
 */
const itemLinks = (page: Page) =>
  page.getByRole('table').locator('tbody a[href^="/items/"]:not([href*="#"])');

/** A quick filter, by its word, with its count after it. */
const quick = (page: Page, word: string) =>
  page.getByRole('button', { name: new RegExp(`^${word}`) });

/**
 * A place in the Location filter, by its name: the place's own option, not
 * its warehouse's heading, which MUI's select also gives the option role.
 */
const placeOption = (page: Page, name: string) =>
  page
    .getByRole('option', { name, exact: true })
    .and(page.locator('[data-value]'));

/** Stock opened with Locations the page before it, for Back. */
async function stockFrom(page: Page, address = '/inventory') {
  await page.goto('/locations');
  await page.goto(address);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Inventory' }),
  ).toBeVisible();
}

/** Stock's by-code reads, as the page sends them through the proxy. */
const isByCode = (url: URL) => url.pathname === '/api/v1/stock/by-code';
const isPlaces = (url: URL) =>
  /^\/api\/v1\/stock\/by-code\/[0-9a-f-]+\/places$/.test(url.pathname);
const isCounts = (url: URL) => url.pathname === '/api/v1/stock/by-code/counts';

/** Fifty-two codes with stock, one more page's worth than the first fifty. */
async function fiftyTwo(api: APIRequestContext): Promise<void> {
  const shelf = await createLocation(api, { name: 'E2E Bulk' });
  for (let start = 1; start <= 52; start += 13) {
    await Promise.all(
      Array.from({ length: 13 }, async (_, index) => {
        const product = await createProduct(api, {
          name: `E2E Page ${String(start + index).padStart(2, '0')}`,
        });
        await receive(api, product, shelf, '3');
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// The interaction table, row by row
// ---------------------------------------------------------------------------

test('Stock, by item, Low stock 1: the list narrows to it, the count kept; ?low=1; Back, the page before; Forward, as it was', async ({
  page,
  freshOrg,
}) => {
  await stockScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await stockFrom(page);
  await expect(itemLinks(page)).toHaveText(['E2E Magnesium', 'E2E Vitamin C']);

  await quick(page, 'Low stock').click();

  await expect(page).toHaveURL(/[?&]low=1/);
  await expect(quick(page, 'Low stock')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(quick(page, 'Low stock')).toContainText('1');
  await expect(itemLinks(page)).toHaveText(['E2E Vitamin C']);

  // A filter replaces the address (#341's rule, as every list's): Back
  // leaves Stock, and Forward opens it again as the address kept it.
  await page.goBack();
  await expect(page).toHaveURL(/\/locations$/);
  await page.goForward();
  await expect(quick(page, 'Low stock')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(itemLinks(page)).toHaveText(['E2E Vitamin C']);
});

test('Stock, every filter in the address: a reload keeps them, and the list', async ({
  page,
  freshOrg,
}) => {
  const scene = await stockScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await page.goto(
    `/inventory?low=1&type=good&locationId=${scene.shelfB.id}&search=E2E`,
  );
  await expect(itemLinks(page)).toHaveText(['E2E Vitamin C']);

  await page.reload();
  await expect(quick(page, 'Low stock')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('combobox', { name: 'Location' })).toHaveText(
    scene.shelfB.name,
  );
  await expect(page.getByRole('combobox', { name: 'Type' })).not.toHaveText(
    'All types',
  );
  await expect(
    page.getByRole('searchbox', { name: 'Search items, codes or lots' }),
  ).toHaveValue('E2E');
  await expect(itemLinks(page)).toHaveText(['E2E Vitamin C']);
});

test('Stock, a row, 2 places: its places open below it; the button reads Hide, focus kept; again, the row closed', async ({
  page,
  freshOrg,
}) => {
  const scene = await stockScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await stockFrom(page);

  const button = placesOf(page, 'E2E Vitamin C');
  await expect(button).toHaveText('2 places');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await button.click();

  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(button).toHaveAccessibleName(
    '2 places: hide where E2E Vitamin C is',
  );
  await expect(button).toBeFocused();
  await expect(lotsAt(page, scene.shelfA.name)).toBeVisible();
  await expect(lotsAt(page, scene.shelfB.name)).toBeVisible();
  // What it opened is what it names.
  const opened = await button.getAttribute('aria-controls');
  await expect(page.locator(`[id="${opened}"]`)).toBeVisible();

  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(lotsAt(page, scene.shelfA.name)).toHaveCount(0);
  await expect(button).toBeFocused();
});

test('Stock, a place, 2 lots: its lots open, soonest first, the expired on top; “Reading…” on the button past 250 ms', async ({
  page,
  freshOrg,
}) => {
  const scene = await stockScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await stockFrom(page);

  // The places read held past the wait, so the button says it reads.
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(isPlaces, async (route) => {
    await held;
    await route.continue();
  });
  const button = placesOf(page, 'E2E Vitamin C');
  await button.click();
  await expect(button).toHaveText('Reading…');
  await expect(button).toHaveAttribute('aria-busy', 'true');
  await expect(button).toBeFocused();
  release();
  await expect(button).toHaveText('2 places');
  await expect(button).not.toHaveAttribute('aria-busy');

  // B1 holds the expired lot and part of the soonest.
  const lots = lotsAt(page, scene.shelfB.name);
  await expect(lots).toHaveText('2 lots');
  await lots.click();
  await expect(lots).toHaveAttribute('aria-expanded', 'true');
  await expect(lotLinks(page)).toHaveText(['VC-GONE', 'VC-SOON']);

  // A2's, the soonest before the latest.
  await lots.click();
  await lotsAt(page, scene.shelfA.name).click();
  await expect(lotLinks(page)).toHaveText(['VC-SOON', 'VC-LATE']);
});

test('Stock, a row, its name: the item’s page; Back, Stock as it was; elsewhere on the row, nothing', async ({
  page,
  freshOrg,
}) => {
  const scene = await stockScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await stockFrom(page, '/inventory?search=E2E');

  await codeRow(page, 'E2E Magnesium')
    .getByRole('link', { name: 'E2E Magnesium', exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/items/${scene.magnesium.id}$`));
  await expect(
    page.getByRole('heading', { level: 1, name: 'E2E Magnesium' }),
  ).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/inventory\?search=E2E$/);
  await expect(
    page.getByRole('searchbox', { name: 'Search items, codes or lots' }),
  ).toHaveValue('E2E');

  // Elsewhere: its Coming cell, which holds no link, opens nothing, and
  // the pointer over it is an arrow (ADR-093 v3).
  const coming = codeRow(page, 'E2E Magnesium').getByRole('cell').nth(5);
  await expect(coming).not.toHaveCSS('cursor', 'pointer');
  await coming.click();
  await expect(page).toHaveURL(/\/inventory\?search=E2E$/);
});

test('Stock, a row, 20 left · reorder at 100: Where it stands; Back, Stock as it was', async ({
  page,
  freshOrg,
}) => {
  const scene = await stockScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await stockFrom(page, '/inventory?low=1');

  await codeRow(page, 'E2E Vitamin C')
    .getByRole('link', { name: '20 left · reorder at 100' })
    .click();

  await expect(page).toHaveURL(new RegExp(`/items/${scene.vitamin.id}#stock$`));
  await expect(
    page.getByRole('heading', { level: 2, name: 'Where it stands' }),
  ).toBeFocused();

  await page.goBack();
  await expect(page).toHaveURL(/\/inventory\?low=1$/);
  await expect(itemLinks(page)).toHaveText(['E2E Vitamin C']);
});

test('Stock, Free, 15 short: the item’s page at Held, focus on it, the waiting orders listed; Back, Stock as it was', async ({
  page,
  freshOrg,
}) => {
  const scene = await stockScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await stockFrom(page);

  await codeRow(page, 'E2E Magnesium')
    .getByRole('link', { name: '15 short' })
    .click();

  await expect(page).toHaveURL(
    new RegExp(`/items/${scene.magnesium.id}#held$`),
  );
  const held = page.locator('#held');
  await expect(held).toBeFocused();
  await expect(held).toContainText('Held');
  await expect(
    held.getByRole('link', { name: scene.waiting.number }),
  ).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/inventory$/);
  await expect(itemLinks(page)).toHaveCount(2);
});

test('Stock, a lot, its code: the lot’s trace; Back, Stock', async ({
  page,
  freshOrg,
}) => {
  const scene = await stockScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await stockFrom(page, '/inventory?search=E2E-VITC');

  await placesOf(page, 'E2E Vitamin C').click();
  await lotsAt(page, scene.shelfA.name).click();
  await page.getByRole('link', { name: 'VC-LATE' }).click();

  await expect(page).toHaveURL(/\/lots\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'VC-LATE',
  );

  // Stock as it was, the row open, as the address keeps it.
  await page.goBack();
  await expect(page).toHaveURL(
    new RegExp(`/inventory\\?search=E2E-VITC&open=${scene.vitamin.variantId}$`),
  );
  await expect(itemLinks(page)).toHaveText(['E2E Vitamin C']);
  await expect(placesOf(page, 'E2E Vitamin C')).toHaveAttribute(
    'aria-expanded',
    'true',
  );
});

/** A row's Actions opened, and the words of what its menu offers. */
async function offers(page: Page, name: string | RegExp): Promise<string[]> {
  await page.getByRole('button', { name }).click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  const words = await menu.getByRole('menuitem').allTextContents();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  return words;
}

test('Stock, any row, Actions: an item’s, a lot’s and a place’s link, each in words; an item’s Move on its one lot straight, or its lots opened to choose one', async ({
  page,
  freshOrg,
}) => {
  const scene = await stockScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await stockFrom(page);

  // An item's, in three groups (ADR-093 v3): what changes its stock,
  // Receive stock, then Movements and its reorder point.
  const magnesium = page.getByRole('button', {
    name: 'Actions for E2E Magnesium',
  });
  await expect(magnesium).toHaveText('Actions');
  expect(await offers(page, 'Actions for E2E Magnesium')).toEqual([
    'Move…',
    'Ship out…',
    'Send sample…',
    'Correct the count…',
    'Receive stock…',
    'Movements',
    'Set a reorder point…',
  ]);
  expect(await offers(page, 'Actions for E2E Vitamin C')).toContain(
    'Change reorder point…',
  );

  // One pile, 10 on A2 with no lot: Move opens on it straight.
  await magnesium.click();
  await page.getByRole('menuitem', { name: 'Move…', exact: true }).click();
  const move = page.getByRole('dialog', { name: /Move to another location/ });
  await expect(move).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(move).toHaveCount(0);

  // Three lots in two places: the menu says a lot comes next; the row
  // opens to them under "Choose the lot to move", focus on the first
  // lot's Actions.
  await page.getByRole('button', { name: 'Actions for E2E Vitamin C' }).click();
  await expect(page.getByRole('menu')).toHaveAccessibleDescription(
    '3 lots in 2 places: you choose the lot next',
  );
  await page.getByRole('menuitem', { name: 'Move…', exact: true }).click();
  await expect(page.getByText('Choose the lot to move')).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: `Actions for lot VC-SOON at ${scene.shelfA.name}`,
    }),
  ).toBeFocused();
  await expect(lotLinks(page)).toHaveText([
    'VC-SOON',
    'VC-LATE',
    'VC-GONE',
    'VC-SOON',
  ]);

  // A lot's: what changes it, the lot itself, and its Movements.
  expect(
    await offers(page, `Actions for lot VC-LATE at ${scene.shelfA.name}`),
  ).toEqual([
    'Move…',
    'Ship out…',
    'Send sample…',
    'Correct the count…',
    'Edit lot details…',
    'Trace lot',
    'Movements',
  ]);

  // A place's: a plain Movements link, its Movements there.
  await page
    .getByRole('button', {
      name: `Movements of E2E Vitamin C at ${scene.shelfB.name}`,
    })
    .click();
  await expect(
    page.getByRole('dialog', {
      name: new RegExp(`at ${scene.shelfB.name}$`),
    }),
  ).toBeVisible();
});

test('Stock, an item with nothing on hand, Actions: what needs stock greyed with why, Correct the count opening its emptied place; never stocked, greyed too', async ({
  page,
  freshOrg,
}) => {
  const scene = await stockScene(freshOrg.api);
  // The magnesium's 10 counted away: an emptied place.
  const counted = await freshOrg.api.post('/v1/stock/movements', {
    data: {
      variantId: scene.magnesium.variantId,
      fromLocationId: scene.shelfA.id,
      quantity: '10',
      reason: 'adjustment',
      reasonDetail: 'damaged',
      note: 'E2E broken in the move',
    },
  });
  expect(counted.ok(), await counted.text()).toBeTruthy();
  // An item never stocked, low under its point.
  const never = await createProduct(freshOrg.api, { name: 'E2E Never' });
  await reorderAt(freshOrg.api, never, '5');
  await signInAs(page, freshOrg.api);
  await stockFrom(page, '/inventory?includeEmpty=1');

  await page.getByRole('button', { name: 'Actions for E2E Magnesium' }).click();
  const menu = page.getByRole('menu');
  const moveChoice = menu.getByRole('menuitem', { name: /^Move…/ });
  await expect(moveChoice).toHaveAttribute('aria-disabled', 'true');
  await expect(moveChoice).toContainText('Nothing on hand to move');
  await menu
    .getByRole('menuitem', { name: 'Correct the count…', exact: true })
    .click();
  await expect(page.getByText('Choose the place to correct')).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: `Actions for E2E Magnesium at ${scene.shelfA.name}`,
    }),
  ).toBeFocused();

  await page.getByRole('button', { name: 'Actions for E2E Never' }).click();
  const correct = page
    .getByRole('menu')
    .getByRole('menuitem', { name: /^Correct the count…/ });
  await expect(correct).toHaveAttribute('aria-disabled', 'true');
  await expect(correct).toContainText('Never stocked here: receive it first');
});

// ADR-093, v3: ordered stock is received on its order, never beside it,
// which would leave the order open and count the stock twice.
test('Stock, an item still to come: Receive stock… asks which delivery; received on its order, Coming falls and the line is fulfilled', async ({
  page,
  freshOrg,
}) => {
  const scene = await stockScene(freshOrg.api);
  const purchase = await orderOf(
    freshOrg.api,
    scene.partner,
    'purchase',
    scene.magnesium,
    '40',
  );
  const coming = async () => {
    const answer = await freshOrg.api.get('/v1/stock/by-code?search=E2E-MAG');
    const { entries } = (await answer.json()) as {
      entries: { sku: string; coming: string }[];
    };
    return entries.find((row) => row.sku === 'E2E-MAG')?.coming;
  };
  expect(await coming()).toBe('40.0000');
  await signInAs(page, freshOrg.api);
  await page.goto('/inventory');

  await page.getByRole('button', { name: 'Actions for E2E Magnesium' }).click();
  await page.getByRole('menuitem', { name: 'Receive stock…' }).click();
  const free = page.getByRole('dialog', { name: 'Receive stock' });
  await expect(
    free.getByRole('radio', { name: new RegExp(purchase.number) }),
  ).toBeChecked();
  await free.getByRole('button', { name: 'Continue' }).click();

  const onOrder = page.getByRole('dialog', {
    name: `Receive E2E-MAG on ${purchase.number}`,
  });
  await expect(onOrder).toContainText(
    'From E2E Corner Pharmacy: 40 each still to come',
  );
  await expect(onOrder.getByRole('textbox', { name: 'Quantity' })).toHaveValue(
    '40.0000',
  );
  await onOrder.getByRole('combobox', { name: 'Into' }).click();
  await page.getByRole('option', { name: /E2E Shelf A2/ }).click();
  await onOrder.getByRole('button', { name: 'Receive' }).click();
  await expect(onOrder).toBeHidden();
  // What happened, with Open the order (55a).
  await expect(page.getByRole('status')).toHaveText(
    new RegExp(`^Received 40 each of E2E-MAG on ${purchase.number}`),
  );

  await expect.poll(coming).toBe('0.0000');
  const order = await freshOrg.api.get(`/v1/orders/${purchase.id}`);
  const { lines } = (await order.json()) as {
    lines: { quantityFulfilled: string }[];
  };
  expect(lines[0]!.quantityFulfilled).toBe('40.0000');

  await page.getByRole('button', { name: 'Open the order' }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${purchase.id}$`));
});

test('Stock, any row, Actions for a Viewer: Movements and Trace lot, nothing that changes stock', async ({
  page,
  freshOrg,
}) => {
  await stockScene(freshOrg.api);
  await confirmEmailInDatabase(freshOrg.email);
  const { token } = await inviteByLink(
    freshOrg.api,
    uniqueEmail('stock-actions-viewer'),
  );
  const viewer = await joinByLink(token, 'E2E Viewer');
  await signInAs(page, viewer);
  await stockFrom(page);

  // Nothing that changes stock, nor Receive stock: the role cannot.
  expect(await offers(page, 'Actions for E2E Magnesium')).toEqual([
    'Movements',
  ]);
  await placesOf(page, 'E2E Vitamin C').click();
  await lotsAt(page, 'E2E Shelf A2').click();
  expect(await offers(page, 'Actions for lot VC-LATE at E2E Shelf A2')).toEqual(
    ['Trace lot', 'Movements'],
  );
  await viewer.dispose();
});

test('Stock, a row, 2 places: `?open=` gains its code; Back from the item’s page, the row still open, focus on that row', async ({
  page,
  freshOrg,
}) => {
  const scene = await stockScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await stockFrom(page);

  await placesOf(page, 'E2E Vitamin C').click();
  await expect(page).toHaveURL(/[?&]open=/);
  await codeRow(page, 'E2E Vitamin C')
    .getByRole('link', { name: 'E2E Vitamin C', exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/items/${scene.vitamin.id}$`));

  await page.goBack();
  await expect(placesOf(page, 'E2E Vitamin C')).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(
    codeRow(page, 'E2E Vitamin C').getByRole('link', {
      name: 'E2E Vitamin C',
      exact: true,
    }),
  ).toBeFocused();
});

test('Stock, Group by › Lot: one row per lot at each place, soonest first, the expired on top; the filters kept; ?group=lot; Item, by item again', async ({
  page,
  freshOrg,
}) => {
  await stockScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await stockFrom(page, '/inventory?search=E2E-VITC');

  await page.getByRole('button', { name: 'Lot', exact: true }).click();

  await expect(page).toHaveURL(/group=lot/);
  await expect(page).toHaveURL(/search=E2E-VITC/);
  await expect(
    page.getByText('Soonest first, the expired on top.'),
  ).toBeVisible();
  // VC-SOON in two places, a row at each, together, each saying so.
  await expect(lotLinks(page)).toHaveText([
    'VC-GONE',
    'VC-SOON',
    'VC-SOON',
    'VC-LATE',
  ]);
  await expect(page.getByText('1 of 2 places')).toBeVisible();
  await expect(page.getByText('2 of 2 places')).toBeVisible();

  await page
    .getByRole('group', { name: 'Group by' })
    .getByRole('button', { name: 'Item' })
    .click();
  await expect(page).not.toHaveURL(/group=lot/);
  await expect(itemLinks(page)).toHaveText(['E2E Vitamin C']);
});

test('Home, Expiring soon: the Lot view, a row per lot at each place, the expired on top', async ({
  page,
  freshOrg,
}) => {
  await stockScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await page.goto('/');

  // VC-GONE on B1, VC-SOON on A2 and on B1: three rows, the tile's three.
  await page.getByRole('link', { name: /^Expiring soon, 3\b/ }).click();

  await expect(page).toHaveURL(/\/inventory\?group=lot&expiring=1$/);
  await expect(lotLinks(page)).toHaveText(['VC-GONE', 'VC-SOON', 'VC-SOON']);
  await expect(lotLinks(page).first()).toBeVisible();
});

test('Stock, Location › Shelf B1: only what is on B1, “here” in each header; Free and Held the whole item’s; Everywhere, every row', async ({
  page,
  freshOrg,
}) => {
  const scene = await stockScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await stockFrom(page);
  await expect(itemLinks(page)).toHaveCount(2);

  await page.getByRole('combobox', { name: 'Location' }).click();
  await placeOption(page, scene.shelfB.name).click();

  await expect(page).toHaveURL(new RegExp(`locationId=${scene.shelfB.id}`));
  await expect(itemLinks(page)).toHaveText(['E2E Vitamin C']);
  for (const header of [
    'On hand here',
    'Free, every place',
    'Expires first here',
  ]) {
    await expect(
      page.getByRole('columnheader', { name: header }),
    ).toBeVisible();
  }
  await expect(
    page.getByText(
      `Showing what is on ${scene.shelfB.name}. Free and Held count every place, since a sale is not held on a shelf.`,
    ),
  ).toBeVisible();
  // On hand here, 11 of its 56; Free, the whole item's 20.
  const row = codeRow(page, 'E2E Vitamin C');
  await expect(
    row.getByRole('cell', { name: '11 each', exact: true }),
  ).toBeVisible();
  await expect(
    row.getByRole('cell', { name: '20 each', exact: true }),
  ).toBeVisible();

  await page.getByRole('combobox', { name: 'Location' }).click();
  await page.getByRole('option', { name: 'Everywhere' }).click();
  await expect(page).not.toHaveURL(/locationId=/);
  await expect(itemLinks(page)).toHaveCount(2);
});

test('Stock, Show 50 more: the next codes below; failing, the rows kept with Try again', async ({
  page,
  freshOrg,
}) => {
  test.setTimeout(90_000);
  await fiftyTwo(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await stockFrom(page);
  await expect(itemLinks(page)).toHaveCount(50);

  // The next page failing: the fifty kept, said beside them.
  const next = (url: URL) =>
    isByCode(url) &&
    (url.searchParams.has('before') || url.searchParams.has('cursor'));
  await page.route(next, (route) => route.abort('internetdisconnected'));
  await page.getByRole('button', { name: 'Show 50 more' }).click();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(itemLinks(page)).toHaveCount(50);

  await page.unroute(next);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(itemLinks(page)).toHaveCount(52);
  await expect(itemLinks(page).nth(50)).toHaveText('E2E Page 51');
  await expect(page.getByRole('button', { name: 'Show 50 more' })).toHaveCount(
    0,
  );
});

test('Stock, Show 50 more: focus on the first new row', async ({
  page,
  freshOrg,
}) => {
  test.setTimeout(90_000);
  await fiftyTwo(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await stockFrom(page);
  await expect(itemLinks(page)).toHaveCount(50);

  await page.getByRole('button', { name: 'Show 50 more' }).click();
  await expect(itemLinks(page)).toHaveCount(52);
  await expect(itemLinks(page).nth(50)).toBeFocused();
});

test('Stock, Export: every row the filters match, in the screen’s words', async ({
  page,
  freshOrg,
}) => {
  await stockScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await stockFrom(page, '/inventory?low=1');
  await expect(itemLinks(page)).toHaveText(['E2E Vitamin C']);

  const saved = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  const text = await readFile(await (await saved).path(), 'utf8');
  const [header, ...rows] = text.trim().split(/\r?\n/);

  for (const column of ['On hand', 'Not usable', 'Free', 'Held', 'Short']) {
    expect(header).toContain(column);
  }
  // Low stock's one row, the magnesium left out.
  expect(rows).toHaveLength(1);
  expect(rows[0]).toContain('E2E-VITC');
});

// ---------------------------------------------------------------------------
// The five states, where ADR-093 says Stock's differ
// ---------------------------------------------------------------------------

test('first use: “No stock yet.” with Receive stock', async ({
  page,
  freshOrg,
}) => {
  await createLocation(freshOrg.api, { name: 'E2E Empty Shelf' });
  await signInAs(page, freshOrg.api);
  await page.goto('/inventory');

  const main = page.getByRole('main');
  await expect(
    main.getByText(
      'No stock yet. Receive what you have, and it shows here, one row per item.',
    ),
  ).toBeVisible();
  await main.getByRole('button', { name: 'Receive stock' }).last().click();
  await expect(
    page.getByRole('dialog', { name: 'Receive stock' }),
  ).toBeVisible();
});

test('first use, for a Viewer: no Receive stock to press, its line saying whom to ask', async ({
  page,
  freshOrg,
}) => {
  await confirmEmailInDatabase(freshOrg.email);
  const { token } = await inviteByLink(
    freshOrg.api,
    uniqueEmail('stock-viewer'),
  );
  const viewer = await joinByLink(token, 'E2E Viewer');
  await signInAs(page, viewer);
  await page.goto('/inventory');

  await expect(
    page.getByText(
      'No stock yet. Receive what you have, and it shows here, one row per item.',
    ),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Receive stock' })).toHaveCount(
    0,
  );
  // Where it would be, who can and whom to ask (ADR-093's states).
  await expect(
    page
      .getByRole('main')
      .getByText(
        /^Your role does not include receiving stock\. To do more, ask .+\.$/,
      ),
  ).toBeVisible();
  await viewer.dispose();
});

test('no results: the filters on named by their chips, one button clearing them', async ({
  page,
  freshOrg,
}) => {
  await stockScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await page.goto('/inventory?search=E2E-MAG&expired=1');

  await expect(page.getByText('No items match these filters.')).toBeVisible();
  await page.getByRole('button', { name: 'Show all stock' }).click();

  await expect(page).toHaveURL(/\/inventory$/);
  await expect(itemLinks(page)).toHaveCount(2);
});

test('done: Low stock at 0 says “Nothing is low.”, naming the items with no reorder point', async ({
  page,
  freshOrg,
}) => {
  const shelf = await createLocation(freshOrg.api);
  const product = await createProduct(freshOrg.api, { name: 'E2E Plenty' });
  await receive(freshOrg.api, product, shelf, '12');
  await signInAs(page, freshOrg.api);
  await page.goto('/inventory?low=1');

  await expect(
    page.getByText(
      'Nothing is low. An item with no reorder point is never low: set one on Reorder.',
    ),
  ).toBeVisible();
  await expect(quick(page, 'Low stock')).toContainText('0');
});

test('loading: the header kept and placeholder rows past 250 ms', async ({
  page,
  freshOrg,
}) => {
  await stockScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(isByCode, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/inventory');

  await expect(
    page.getByRole('columnheader', { name: 'On hand' }),
  ).toBeVisible();
  await expect(
    page.getByRole('table').locator('tbody .MuiSkeleton-root').first(),
  ).toBeVisible();

  release();
  await expect(itemLinks(page)).toHaveCount(2);
  await expect(
    page.getByRole('table').locator('tbody .MuiSkeleton-root'),
  ).toHaveCount(0);
});

test('failed: never an empty list, the filters kept without their counts until a read answers, with Try again', async ({
  page,
  freshOrg,
}) => {
  await stockScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  // A dropped connection, not an answer made up.
  await page.route(isByCode, (route) => route.abort('internetdisconnected'));
  await page.route(isCounts, (route) => route.abort('internetdisconnected'));
  await page.goto('/inventory');

  const again = page.getByRole('button', { name: 'Try again' });
  await expect(again).toBeVisible();
  await expect(page.getByText('No stock yet.', { exact: false })).toHaveCount(
    0,
  );
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(quick(page, 'Low stock')).toHaveAccessibleName('Low stock');

  await page.unroute(isByCode);
  await page.unroute(isCounts);
  await again.click();
  await expect(itemLinks(page)).toHaveCount(2);
});

test('partial: an opened row’s places not read, said beside them with Try again', async ({
  page,
  freshOrg,
}) => {
  const scene = await stockScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await page.goto('/inventory');

  await page.route(isPlaces, (route) => route.abort('internetdisconnected'));
  await placesOf(page, 'E2E Vitamin C').click();
  await expect(page.getByText('Its places could not be read.')).toBeVisible();
  await expect(itemLinks(page)).toHaveCount(2);

  await page.unroute(isPlaces);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(lotsAt(page, scene.shelfA.name)).toBeVisible();
});

// ---------------------------------------------------------------------------
// The button that opens a row, on touch
// ---------------------------------------------------------------------------

test.describe('on a touch tablet', () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true });

  test('the button that opens a row is 44 px tall, closed and open', async ({
    page,
    freshOrg,
  }) => {
    await stockScene(freshOrg.api);
    await signInAs(page, freshOrg.api);
    await page.goto('/inventory');

    const button = placesOf(page, 'E2E Vitamin C');
    await expect(button).toBeVisible();
    expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  });
});

// ---------------------------------------------------------------------------
// A phone: cards with On hand and Free, the filters behind one button
// ---------------------------------------------------------------------------

test('on a phone: cards with On hand and Free, the filters behind one Filters button', async ({
  page,
  freshOrg,
}) => {
  await stockScene(freshOrg.api);
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAs(page, freshOrg.api);
  await page.goto('/inventory');

  await expect(page.getByRole('table')).toHaveCount(0);
  const cards = page.getByRole('main').getByRole('listitem');
  await expect(cards.filter({ hasText: 'E2E Vitamin C' })).toBeVisible();
  await expect(cards.filter({ hasText: 'E2E Vitamin C' })).toContainText(
    '56 each',
  );
  await expect(page.getByRole('combobox', { name: 'Location' })).toBeHidden();

  await page.getByRole('button', { name: 'Filters' }).click();
  await expect(page.getByRole('combobox', { name: 'Location' })).toBeVisible();
});

// A place written as its path, the warehouse first (57a): on a phone the
// path is cut from the left, the place itself kept, and whole on hover
// and on focus.
test('on a phone, a place deep in its warehouse: its path cut from the left, whole on hover and on focus', async ({
  page,
  freshOrg,
}) => {
  const main = await createLocation(freshOrg.api, {
    name: 'E2E Main warehouse',
  });
  const zone = await createLocation(freshOrg.api, {
    name: 'E2E Zone A by the loading dock',
    type: 'zone',
    parentId: main.id,
  });
  const shelf = await createLocation(freshOrg.api, {
    name: 'E2E Shelf A2',
    type: 'shelf',
    parentId: zone.id,
  });
  const product = await createProduct(freshOrg.api, {
    name: 'E2E Rosehip',
  });
  await receive(freshOrg.api, product, shelf, '12');
  const whole =
    'E2E Main warehouse › E2E Zone A by the loading dock › E2E Shelf A2';

  await page.setViewportSize({ width: 390, height: 844 });
  await signInAs(page, freshOrg.api);
  await page.goto('/inventory');
  await placesOf(page, 'E2E Rosehip').click();

  const path = page.getByRole('main').getByText(whole, { exact: true });
  await expect(path).toBeVisible();
  // Cut, and from the left: what shows ends with the place itself.
  expect(
    await path.evaluate((inner) => {
      const outer = inner.parentElement!;
      return {
        cut: outer.scrollWidth > outer.clientWidth,
        direction: getComputedStyle(outer).direction,
        overflow: getComputedStyle(outer).textOverflow,
      };
    }),
  ).toEqual({ cut: true, direction: 'rtl', overflow: 'ellipsis' });

  await path.hover();
  await expect(page.getByRole('tooltip')).toHaveText(whole);
  await page.mouse.move(0, 0);
  await expect(page.getByRole('tooltip')).toHaveCount(0);

  // By the keyboard, as a person reaches it: the places button, then Tab
  // until the path, which takes focus because it is cut.
  await placesOf(page, 'E2E Rosehip').focus();
  const box = path.locator('..');
  for (let presses = 0; presses < 10; presses += 1) {
    if (await box.evaluate((element) => element === document.activeElement))
      break;
    await page.keyboard.press('Tab');
  }
  await expect(box).toBeFocused();
  await expect(page.getByRole('tooltip')).toHaveText(whole);
});
