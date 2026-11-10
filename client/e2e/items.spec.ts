import type { APIRequestContext, Page } from '@playwright/test';

import { expect, test } from './fixtures';
import {
  createCategory,
  created,
  createLocation,
  createProduct,
  type SeededProduct,
  signInAs,
} from './support/api';

/**
 * Items (ADR-092), row by row: each row of the ADR's interaction table is
 * one test here, named by its words, "where: what you do", where the screen
 * decides; where the server decides, its end-to-end test in `server/test/`.
 * Then the list's five states, the phone's cards and sheet, and the
 * keyboard on the tabs, a sort and the bar. Settings › Categories' row is
 * in categories.spec.ts, and axe on each in accessibility.spec.ts.
 *
 * Most tests make their own organization, since they count rows and tabs.
 * Setup goes through the API; the UI is driven only for the row under test.
 */

/** Items' own read, as the page sends it through the client's proxy. */
const isTheList = (url: URL) => url.pathname === '/api/v1/products';

const searchBox = (page: Page) =>
  page.getByRole('searchbox', { name: 'Search by name or code' });

/** The rows' item links, top to bottom, by the item's name. */
const rowNames = (page: Page) =>
  page.getByRole('table').locator('tbody a[href^="/items/"]');

/** A row of the table, by the item's name. */
const row = (page: Page, name: string) =>
  page.getByRole('row', { name: new RegExp(name) });

/** The bar over the ticked rows (ADR-092). */
const bar = (page: Page) =>
  page.getByRole('region', { name: 'Selected items' });

/** A row's check box, by the item. */
const tick = (page: Page, product: SeededProduct) =>
  page.getByRole('checkbox', {
    name: `Select ${product.name}, ${product.sku}`,
  });

/** Stock received at a new location of the organization's. */
async function receive(
  api: APIRequestContext,
  product: SeededProduct,
  quantity: string,
) {
  const location = await createLocation(api);
  await created(
    await api.post('/v1/stock/movements', {
      data: {
        variantId: product.variantId,
        toLocationId: location.id,
        quantity,
        reason: 'receipt',
      },
    }),
  );
}

/** A reorder point (ADR-085): what makes a row Low stock or Out. */
async function reorderAt(
  api: APIRequestContext,
  product: SeededProduct,
  point: string,
) {
  const response = await api.post(
    `/v1/stock/reorder-points/${product.variantId}`,
    {
      data: {
        source: 'bought',
        reorderPoint: point,
        rule: 'fixed',
        fixedQuantity: point,
      },
    },
  );
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function discontinue(api: APIRequestContext, product: SeededProduct) {
  const response = await api.patch(`/v1/products/${product.id}`, {
    data: { isActive: false },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

/** Items opened from the menu, with Locations the page before it. */
async function itemsFromTheMenu(page: Page) {
  await page.goto('/locations');
  await page
    .getByRole('navigation', { name: 'Records' })
    .getByRole('link', { name: 'Items', exact: true })
    .click();
}

/**
 * Back after a tab, a search, a category or a sort: each replaces Items'
 * address rather than adding to the history, as on every list (#341's
 * rule; ADR-055, ADR-056, ADR-091), so Back leaves Items for the page
 * before it, Locations here, and Forward opens Items again from the
 * address, which kept them. The caller then checks the list is as it was.
 */
async function backThenForward(page: Page) {
  const items = page.url();
  await page.goBack();
  await expect(page).toHaveURL(/\/locations$/);
  await page.goForward();
  await expect(page).toHaveURL(items);
}

/** Fifty-two products, one more page's worth than the first fifty. */
async function fiftyTwo(api: APIRequestContext): Promise<void> {
  for (let start = 1; start <= 52; start += 13) {
    await Promise.all(
      Array.from({ length: 13 }, (_, index) =>
        createProduct(api, {
          name: `E2E Page ${String(start + index).padStart(2, '0')}`,
        }),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// The interaction table, row by row
// ---------------------------------------------------------------------------

test('the menu, Items: the list opens on Products, or the first type with items', async ({
  page,
  freshOrg,
}) => {
  await createProduct(freshOrg.api, { type: 'packaging', name: 'E2E Jar' });
  await createProduct(freshOrg.api, { type: 'material', name: 'E2E Kelp' });
  await signInAs(page, freshOrg.api);
  await page.goto('/locations');
  const items = page
    .getByRole('navigation', { name: 'Records' })
    .getByRole('link', { name: 'Items', exact: true });

  // No products yet: the first type it holds, in the tabs' order, and no
  // tab for a type it holds none of.
  await items.click();
  await expect(
    page.getByRole('tab', { name: 'Raw materials 1', selected: true }),
  ).toBeVisible();
  await expect(rowNames(page)).toHaveText(['E2E Kelp']);
  await expect(page.getByRole('tab', { name: /^Products/ })).toHaveCount(0);
  // Back: the page before.
  await page.goBack();
  await expect(page).toHaveURL(/\/locations$/);

  // With a product, Products.
  await createProduct(freshOrg.api, { name: 'E2E Tonic' });
  await items.click();
  await expect(
    page.getByRole('tab', { name: 'Products 1', selected: true }),
  ).toBeVisible();
  await expect(rowNames(page)).toHaveText(['E2E Tonic']);
});

test('the top bar, Show all in Items: the list opens on All with the search, discontinued included, a chip saying so', async ({
  page,
  freshOrg,
}) => {
  await createProduct(freshOrg.api, { name: 'E2E Quartz Tonic' });
  await createProduct(freshOrg.api, {
    type: 'material',
    name: 'E2E Quartz Powder',
  });
  await discontinue(
    freshOrg.api,
    await createProduct(freshOrg.api, { name: 'E2E Quartz Old' }),
  );
  await signInAs(page, freshOrg.api);
  await page.goto('/locations');

  await page
    .getByRole('combobox', { name: 'Search everything' })
    .fill('Quartz');
  await page.getByRole('option', { name: 'Show all in Items' }).click();

  await expect(page).toHaveURL(/\/items\?/);
  await expect(page).toHaveURL(/tab=all/);
  await expect(page).toHaveURL(/discontinued=include/);
  await expect(searchBox(page)).toHaveValue('Quartz');
  await expect(
    page.getByRole('tab', { name: /^All/, selected: true }),
  ).toBeVisible();
  // What the top bar found is on the list, the discontinued one too.
  await expect(rowNames(page)).toHaveCount(3);
  await expect(row(page, 'E2E Quartz Old')).toContainText('Discontinued');
  const chip = page.getByRole('button', { name: 'Discontinued included' });
  await expect(chip).toBeVisible();

  // Back: the page before.
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/locations$/);
});

test('Items, a tab: the list reads that type; the search, category and sort stay; Back, the page before; Forward, as it was', async ({
  page,
  freshOrg,
}) => {
  const vitamins = await createCategory(freshOrg.api, 'Vitamins');
  await createProduct(freshOrg.api, {
    name: 'E2E Alpha Tonic',
    categoryId: vitamins,
  });
  await createProduct(freshOrg.api, {
    type: 'material',
    name: 'E2E Alpha Powder',
    categoryId: vitamins,
  });
  await createProduct(freshOrg.api, {
    type: 'material',
    name: 'E2E Alpha Kelp',
    categoryId: vitamins,
  });
  await createProduct(freshOrg.api, {
    type: 'material',
    name: 'E2E Beta Powder',
    categoryId: vitamins,
  });
  await createProduct(freshOrg.api, {
    type: 'material',
    name: 'E2E Alpha Loose',
  });
  await signInAs(page, freshOrg.api);
  await page.goto('/locations');
  await page.goto(
    `/items?category=${vitamins}&search=Alpha&sort=name&order=desc`,
  );
  await expect(rowNames(page)).toHaveText(['E2E Alpha Tonic']);

  await page.getByRole('tab', { name: /^Raw materials/ }).click();

  const asItWas = async () => {
    await expect(
      page.getByRole('tab', { name: /^Raw materials/, selected: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/tab=material/);
    // Searched, in Vitamins, Z to A: neither Beta nor the uncategorised one.
    await expect(searchBox(page)).toHaveValue('Alpha');
    await expect(
      page.getByRole('button', { name: 'Vitamins', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('columnheader', { name: 'Name' }),
    ).toHaveAttribute('aria-sort', 'descending');
    await expect(rowNames(page)).toHaveText([
      'E2E Alpha Powder',
      'E2E Alpha Kelp',
    ]);
  };
  await asItWas();

  await backThenForward(page);
  await asItWas();
});

test('Items, a search then a pause: the list and every tab’s count follow; with none on this tab, it says where the matches are, with a button there; Back, the page before; Forward, as it was', async ({
  page,
  freshOrg,
}) => {
  await createProduct(freshOrg.api, { name: 'E2E Tonic A' });
  await createProduct(freshOrg.api, { name: 'E2E Tonic B' });
  await createProduct(freshOrg.api, { type: 'material', name: 'E2E Kelp' });
  await signInAs(page, freshOrg.api);
  await itemsFromTheMenu(page);
  await expect(page.getByRole('tab', { name: 'Products 2' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'All 3' })).toBeVisible();

  await searchBox(page).fill('Kelp');

  const asItWas = async () => {
    await expect(page).toHaveURL(/\/items\?search=Kelp$/);
    await expect(searchBox(page)).toHaveValue('Kelp');
    // Every tab keeps its place, its count following the search.
    await expect(
      page.getByRole('tab', { name: 'Products 0', selected: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('tab', { name: 'Raw materials 1' }),
    ).toBeVisible();
    await expect(page.getByRole('tab', { name: 'All 1' })).toBeVisible();
    await expect(
      page.getByText(
        'Nothing in Products matches “Kelp”. 1 item in Raw materials matches.',
      ),
    ).toBeVisible();
  };
  await asItWas();

  await backThenForward(page);
  await asItWas();

  await page.getByRole('button', { name: 'See in Raw materials' }).click();
  await expect(
    page.getByRole('tab', { name: 'Raw materials 1', selected: true }),
  ).toBeVisible();
  await expect(rowNames(page)).toHaveText(['E2E Kelp']);
});

test('Items, a category: the list holds it and those under it; a chip shows it, its × removes it; Back, the page before; Forward, as it was', async ({
  page,
  freshOrg,
}) => {
  const vitamins = await createCategory(freshOrg.api, 'Vitamins');
  const vitaminC = await createCategory(freshOrg.api, 'Vitamin C', vitamins);
  await createProduct(freshOrg.api, {
    name: 'E2E Multi',
    categoryId: vitamins,
  });
  await createProduct(freshOrg.api, {
    name: 'E2E Chewable C',
    categoryId: vitaminC,
  });
  await createProduct(freshOrg.api, { name: 'E2E Loose' });
  await signInAs(page, freshOrg.api);
  await itemsFromTheMenu(page);
  await expect(rowNames(page)).toHaveCount(3);

  await page.getByRole('combobox', { name: 'Category' }).click();
  // Each category with its count on the open tab, those under it included.
  await page.getByRole('option', { name: /^Vitamins\s*2$/ }).click();

  const chip = page.getByRole('button', { name: 'Vitamins', exact: true });
  const asItWas = async () => {
    await expect(page).toHaveURL(new RegExp(`/items\\?category=${vitamins}$`));
    await expect(rowNames(page)).toHaveText(['E2E Chewable C', 'E2E Multi']);
    await expect(row(page, 'E2E Chewable C')).toContainText(
      'Vitamins › Vitamin C',
    );
    await expect(chip).toBeVisible();
  };
  await asItWas();

  await backThenForward(page);
  await asItWas();

  await chip.locator('.MuiChip-deleteIcon').click();
  await expect(chip).toBeHidden();
  await expect(rowNames(page)).toHaveCount(3);
  await expect(page).not.toHaveURL(/category=/);
});

test('Items, a header: sorts by it, again reverses; focus stays on the header; the date column shows what it sorts; Back, the page before; Forward, as it was', async ({
  page,
  freshOrg,
}) => {
  const few = await createProduct(freshOrg.api, { name: 'E2E Bravo' });
  const many = await createProduct(freshOrg.api, { name: 'E2E Alpha' });
  await createProduct(freshOrg.api, { name: 'E2E Charlie' });
  await receive(freshOrg.api, few, '3');
  await receive(freshOrg.api, many, '30');
  await signInAs(page, freshOrg.api);
  await itemsFromTheMenu(page);
  await expect(rowNames(page)).toHaveText([
    'E2E Alpha',
    'E2E Bravo',
    'E2E Charlie',
  ]);

  // In stock, fewest first, then again the other way, from the keyboard.
  const stock = page.getByRole('button', { name: 'In stock' });
  const stockHeader = page.getByRole('columnheader', { name: 'In stock' });
  await stock.focus();
  await page.keyboard.press('Enter');
  await expect(stockHeader).toHaveAttribute('aria-sort', 'ascending');
  await expect(rowNames(page)).toHaveText([
    'E2E Charlie',
    'E2E Bravo',
    'E2E Alpha',
  ]);
  await expect(stock).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(stockHeader).toHaveAttribute('aria-sort', 'descending');
  await expect(rowNames(page)).toHaveText([
    'E2E Alpha',
    'E2E Bravo',
    'E2E Charlie',
  ]);
  await expect(stock).toBeFocused();
  await expect(page).toHaveURL(/sort=stock&order=desc/);

  // The date column switches to Date added, sorted by it, newest first.
  await page.getByRole('button', { name: 'Which date to show' }).click();
  await page.getByRole('menuitem', { name: 'Date added' }).click();
  const asItWas = async () => {
    await expect(
      page.getByRole('columnheader', { name: /^Date added/ }),
    ).toHaveAttribute('aria-sort', 'descending');
    await expect(
      page.getByRole('columnheader', { name: /^Last changed/ }),
    ).toHaveCount(0);
    await expect(page).toHaveURL(/\/items\?sort=added&order=desc$/);
    await expect(rowNames(page)).toHaveText([
      'E2E Charlie',
      'E2E Alpha',
      'E2E Bravo',
    ]);
  };
  await asItWas();

  await backThenForward(page);
  await asItWas();
});

test('Items, Show 50 more: the next fifty below; focus on the first new row', async ({
  page,
  freshOrg,
}) => {
  test.setTimeout(60_000);
  await fiftyTwo(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await page.goto('/items');
  await expect(rowNames(page)).toHaveCount(50);
  await expect(page.getByText('Showing 50 of 52')).toBeVisible();

  await page.getByRole('button', { name: 'Show 50 more' }).click();

  await expect(rowNames(page)).toHaveCount(52);
  await expect(rowNames(page).nth(50)).toHaveText('E2E Page 51');
  await expect(rowNames(page).nth(50)).toBeFocused();
  await expect(page.getByRole('button', { name: 'Show 50 more' })).toHaveCount(
    0,
  );
});

test('Items, a row, anywhere: the item’s page; Back, Items as it was', async ({
  page,
  freshOrg,
}) => {
  const vitamins = await createCategory(freshOrg.api, 'Vitamins');
  await createProduct(freshOrg.api, {
    name: 'E2E Row Tonic',
    categoryId: vitamins,
  });
  await createProduct(freshOrg.api, { name: 'E2E Row Elixir' });
  await createProduct(freshOrg.api, { name: 'E2E Other' });
  await signInAs(page, freshOrg.api);
  await page.goto('/items?search=Row&sort=name&order=desc');
  await expect(rowNames(page)).toHaveText(['E2E Row Tonic', 'E2E Row Elixir']);

  // Its category's cell, not its name: the whole row is the link.
  await row(page, 'E2E Row Tonic')
    .getByRole('cell', { name: 'Vitamins', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'E2E Row Tonic' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/items\/[0-9a-f-]{36}$/);

  await page.goBack();
  await expect(searchBox(page)).toHaveValue('Row');
  await expect(rowNames(page)).toHaveText(['E2E Row Tonic', 'E2E Row Elixir']);
  await expect(
    page.getByRole('columnheader', { name: 'Name' }),
  ).toHaveAttribute('aria-sort', 'descending');
});

test('Items, a row’s stock: Inventory, that item alone; Back, Items as it was', async ({
  page,
  freshOrg,
}) => {
  const tonic = await createProduct(freshOrg.api, { name: 'E2E Shelf Tonic' });
  const other = await createProduct(freshOrg.api, { name: 'E2E Shelf Other' });
  await receive(freshOrg.api, tonic, '24');
  await receive(freshOrg.api, tonic, '6');
  await receive(freshOrg.api, other, '9');
  await signInAs(page, freshOrg.api);
  await page.goto('/items?search=Shelf');

  await page
    .getByRole('link', { name: /^30\b.*, stock of E2E Shelf Tonic$/ })
    .click();

  await expect(page).toHaveURL(
    new RegExp(`/inventory\\?productId=${tonic.id}`),
  );
  await expect(
    page.getByRole('button', { name: 'Item: E2E Shelf Tonic' }),
  ).toBeVisible();
  // Its variants in every location, and nothing else's.
  await expect(page.getByRole('row', { name: /E2E Shelf Tonic/ })).toHaveCount(
    2,
  );
  await expect(page.getByRole('row', { name: /E2E Shelf Other/ })).toHaveCount(
    0,
  );

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/items\?search=Shelf$/);
  await expect(searchBox(page)).toHaveValue('Shelf');
  await expect(rowNames(page)).toHaveCount(2);
});

// On touch the stock's link was about 20 px tall, so a near miss opened
// the item (ADR-092's review, 3).
test.describe('on a touch tablet', () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true });

  test('Items, a row’s stock: a link 44 px tall', async ({
    page,
    freshOrg,
  }) => {
    const tonic = await createProduct(freshOrg.api, {
      name: 'E2E Touch Tonic',
    });
    await receive(freshOrg.api, tonic, '5');
    await signInAs(page, freshOrg.api);
    await page.goto('/items');

    const stock = page.getByRole('link', {
      name: /, stock of E2E Touch Tonic$/,
    });
    await expect(stock).toBeVisible();
    expect((await stock.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  });
});

test('Items, Add item: the dialog, its type chosen from the tab, none from All', async ({
  page,
  freshOrg,
}) => {
  await createProduct(freshOrg.api, { type: 'material', name: 'E2E Kelp' });
  await createProduct(freshOrg.api, { name: 'E2E Tonic' });
  await signInAs(page, freshOrg.api);
  await page.goto('/items?tab=material');
  await expect(rowNames(page)).toHaveText(['E2E Kelp']);

  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Add an item' });
  await expect(
    dialog.getByRole('radio', { name: /^Raw materials/ }),
  ).toBeChecked();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();

  // All open, as a person sees it, before Add item.
  await page.getByRole('tab', { name: /^All/ }).click();
  await expect(
    page.getByRole('tab', { name: /^All/, selected: true }),
  ).toBeVisible();
  await expect(rowNames(page)).toHaveCount(2);
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Add an item' });
  for (const radio of await dialog.getByRole('radio').all()) {
    await expect(radio).not.toBeChecked();
  }
  // None chosen: it says so under the types, and nothing is sent.
  await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('X');
  await dialog.getByRole('textbox', { name: 'Code' }).fill('E2E-NONE');
  await dialog.getByRole('button', { name: 'Add item' }).click();
  await expect(dialog.getByText('Choose what it is.')).toBeVisible();
  await expect(dialog).toBeVisible();
});

test('Add an item, Add item: saved, “Added …”; the new item’s page in the form’s place; Back, Items', async ({
  page,
}) => {
  // Its own each run: two repeats in parallel can share a millisecond, and
  // the second's code would then be refused as in use.
  const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const name = `E2E Form Widget ${unique}`;
  const sku = `SKU-${unique.toUpperCase()}`;

  await page.goto('/items');
  // The header's; an empty list has its own too.
  await page
    .getByRole('button', { name: 'Add item', exact: true })
    .first()
    .click();

  const dialog = page.getByRole('dialog');
  // What it is first; the Products tab has chosen it already (ADR-092).
  await expect(dialog.getByRole('radio', { name: /^Products/ })).toBeChecked();
  await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
  await dialog.getByRole('textbox', { name: 'Code' }).fill(sku);

  await dialog.getByRole('button', { name: 'Add item' }).click();

  /**
   * No waitForTimeout, and no waiting on the network response either. Web-first
   * assertions retry until the page appears, which is both faster than a fixed
   * sleep and a stronger claim: the data round-tripped *and* rendered.
   *
   * The new item's page takes the form's place, so Back returns to Items,
   * searched for there, so it is on the first fifty (ADR-092).
   */
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(page.getByText(`Added “${name}”.`)).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/items$/);
  await searchBox(page).fill(name);
  await expect(row(page, name)).toBeVisible();
});

test('Add an item, Add item with the code in use: refused under Code, with the item that has it', async ({
  page,
  freshOrg,
}) => {
  const holder = await createProduct(freshOrg.api, {
    name: 'E2E Holder',
    sku: 'E2E-TAKEN',
  });
  await signInAs(page, freshOrg.api);
  await page.goto('/items');
  await page.getByRole('button', { name: 'Add item', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Add an item' });
  await dialog
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('E2E Second');
  const code = dialog.getByRole('textbox', { name: 'Code' });
  await code.fill('E2E-TAKEN');
  await dialog.getByRole('button', { name: 'Add item' }).click();

  await expect(code).toHaveAccessibleDescription(
    /Code E2E-TAKEN is already used by E2E Holder\. Choose another code\./,
  );
  await expect(code).toHaveAttribute('aria-invalid', 'true');
  await expect(
    dialog.getByRole('link', { name: 'Open the item that has it' }),
  ).toHaveAttribute('href', `/items/${holder.id}`);
  await expect(dialog).toBeVisible();
});

test('Items, ticks rows: the bar, how many, Set category, Discontinue, Clear', async ({
  page,
  freshOrg,
}) => {
  const first = await createProduct(freshOrg.api, { name: 'E2E One' });
  const second = await createProduct(freshOrg.api, { name: 'E2E Two' });
  await signInAs(page, freshOrg.api);
  await page.goto('/items');
  await expect(bar(page)).toHaveCount(0);

  // From the keyboard: Space on a row's box.
  await tick(page, first).focus();
  await page.keyboard.press('Space');
  await expect(bar(page)).toContainText('1 selected');
  await tick(page, second).check();

  await expect(bar(page)).toContainText('2 selected');
  await expect(
    bar(page).getByRole('button', { name: 'Set category' }),
  ).toBeVisible();
  await expect(
    bar(page).getByRole('button', { name: 'Discontinue' }),
  ).toBeVisible();

  // The bar's buttons from the keyboard: Set category's dialog, and Escape
  // back to it.
  const setCategory = bar(page).getByRole('button', { name: 'Set category' });
  await setCategory.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('dialog', { name: 'Set the category of 2 items' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(setCategory).toBeFocused();

  await bar(page).getByRole('button', { name: 'Clear' }).click();
  await expect(bar(page)).toHaveCount(0);
  await expect(tick(page, first)).not.toBeChecked();
});

test('the bar, Set category then Move: the list reads again; “Moved 3 items to …”, with Undo', async ({
  page,
  freshOrg,
}) => {
  await createCategory(freshOrg.api, 'Vitamins');
  const products = [
    await createProduct(freshOrg.api, { name: 'E2E Move A' }),
    await createProduct(freshOrg.api, { name: 'E2E Move B' }),
    await createProduct(freshOrg.api, { name: 'E2E Move C' }),
  ];
  await signInAs(page, freshOrg.api);
  await page.goto('/items');
  for (const product of products) await tick(page, product).check();

  await bar(page).getByRole('button', { name: 'Set category' }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Set the category of 3 items',
  });
  await dialog.getByRole('combobox', { name: 'Category' }).click();
  await page.getByRole('option', { name: 'Vitamins', exact: true }).click();
  await dialog.getByRole('button', { name: 'Move' }).click();

  await expect(page.getByText('Moved 3 items to Vitamins.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeFocused();
  for (const product of products) {
    await expect(row(page, product.name)).toContainText('Vitamins');
  }
  await expect(bar(page)).toHaveCount(0);
});

test('the bar, Discontinue: at once; “Discontinued 3 items”, with Undo', async ({
  page,
  freshOrg,
}) => {
  const products = [
    await createProduct(freshOrg.api, { name: 'E2E Stop A' }),
    await createProduct(freshOrg.api, { name: 'E2E Stop B' }),
    await createProduct(freshOrg.api, { name: 'E2E Stop C' }),
  ];
  await createProduct(freshOrg.api, { name: 'E2E Keep' });
  await signInAs(page, freshOrg.api);
  await page.goto('/items');
  for (const product of products) await tick(page, product).check();

  await bar(page).getByRole('button', { name: 'Discontinue' }).click();

  // Nothing asked first: it can be undone.
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Discontinued 3 items.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeFocused();
  await expect(rowNames(page)).toHaveText(['E2E Keep']);
  await expect(
    page.getByRole('button', { name: /^Discontinued\s*3$/ }),
  ).toBeVisible();
});

test('a message, Undo: back as they were, recorded in History', async ({
  page,
  freshOrg,
}) => {
  const products = [
    await createProduct(freshOrg.api, { name: 'E2E Undo A' }),
    await createProduct(freshOrg.api, { name: 'E2E Undo B' }),
  ];
  await signInAs(page, freshOrg.api);
  await page.goto('/items');
  for (const product of products) await tick(page, product).check();
  await bar(page).getByRole('button', { name: 'Discontinue' }).click();
  await expect(rowNames(page)).toHaveCount(0);

  await page.getByRole('button', { name: 'Undo' }).click();

  await expect(page.getByText('2 items are back as before.')).toBeVisible();
  await expect(rowNames(page)).toHaveText(['E2E Undo A', 'E2E Undo B']);

  // Each change in the item's History: discontinued, then back.
  await row(page, 'E2E Undo A').getByRole('link').first().click();
  await page.getByRole('button', { name: 'History' }).click();
  const history = page.getByRole('presentation').filter({ hasText: 'History' });
  await expect(history.getByText('Item updated')).toHaveCount(2);
});

test('Items, another tab or search with ticks: the ticks clear', async ({
  page,
  freshOrg,
}) => {
  const tonic = await createProduct(freshOrg.api, { name: 'E2E Tonic' });
  await createProduct(freshOrg.api, { type: 'material', name: 'E2E Kelp' });
  await signInAs(page, freshOrg.api);
  await page.goto('/items');

  await tick(page, tonic).check();
  await expect(bar(page)).toContainText('1 selected');
  await page.getByRole('tab', { name: /^All/ }).click();
  await expect(bar(page)).toHaveCount(0);
  await expect(tick(page, tonic)).not.toBeChecked();

  await tick(page, tonic).check();
  await expect(bar(page)).toContainText('1 selected');
  await searchBox(page).fill('Tonic');
  await expect(bar(page)).toHaveCount(0);
  await expect(tick(page, tonic)).not.toBeChecked();
});

test('the item’s page, Edit then Save: saved; a new type moves it to that tab', async ({
  page,
  freshOrg,
}) => {
  const tonic = await createProduct(freshOrg.api, { name: 'E2E Retype' });
  await createProduct(freshOrg.api, { name: 'E2E Stays' });
  await createProduct(freshOrg.api, { type: 'material', name: 'E2E Kelp' });
  await signInAs(page, freshOrg.api);
  await page.goto('/items');
  await row(page, 'E2E Retype').getByRole('link').first().click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'E2E Retype' }),
  ).toBeVisible();

  // The item's Edit, in its header, before each variant's.
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Edit the item' });
  await dialog.getByRole('combobox', { name: 'Type' }).click();
  await page.getByRole('option', { name: 'Raw materials' }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText('Item saved')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/items/${tonic.id}$`));
  // Its type and category under its name.
  await expect(page.getByText(/^Raw materials · /)).toBeVisible();

  // Back: Items, where it has moved to Raw materials.
  await page.goBack();
  await expect(rowNames(page)).toHaveText(['E2E Stays']);
  await page.getByRole('tab', { name: /^Raw materials/ }).click();
  await expect(rowNames(page)).toHaveText(['E2E Kelp', 'E2E Retype']);
});

test('the filter, Manage categories: Settings › Categories; Back, Items', async ({
  page,
  freshOrg,
}) => {
  await createCategory(freshOrg.api, 'Vitamins');
  await createProduct(freshOrg.api, { name: 'E2E Tonic' });
  await signInAs(page, freshOrg.api);
  await page.goto('/items?search=Tonic');

  await page.getByRole('combobox', { name: 'Category' }).click();
  await page.getByRole('option', { name: 'Manage categories' }).click();

  await expect(page).toHaveURL(/\/settings\/categories$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Categories' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/items\?search=Tonic$/);
  await expect(rowNames(page)).toHaveText(['E2E Tonic']);
});

// ---------------------------------------------------------------------------
// The five states (ADR-092, the board "Items: loading and failed")
// ---------------------------------------------------------------------------

test('as it should be: each row its type’s icon, name, code, category, stock and status', async ({
  page,
  freshOrg,
}) => {
  const vitamins = await createCategory(freshOrg.api, 'Vitamins');
  const low = await createProduct(freshOrg.api, {
    name: 'E2E Low',
    sku: 'E2E-LOW',
    categoryId: vitamins,
  });
  const out = await createProduct(freshOrg.api, {
    name: 'E2E Out',
    sku: 'E2E-OUT',
  });
  await receive(freshOrg.api, low, '5');
  await reorderAt(freshOrg.api, low, '100');
  await reorderAt(freshOrg.api, out, '10');
  await signInAs(page, freshOrg.api);
  await page.goto('/items');

  const lowRow = row(page, 'E2E Low');
  await expect(lowRow).toContainText('E2E-LOW');
  await expect(lowRow).toContainText('Vitamins');
  await expect(lowRow).toContainText('Low stock');
  await expect(
    lowRow.getByRole('link', { name: /^5\b.*, stock of E2E Low$/ }),
  ).toBeVisible();
  const outRow = row(page, 'E2E Out');
  await expect(outRow).toContainText('Uncategorised');
  await expect(outRow).toContainText('Out');
});

test('empty: no items yet, saying what to add first, with Add item', async ({
  page,
  freshOrg,
}) => {
  await signInAs(page, freshOrg.api);
  await page.goto('/items');

  await expect(
    page.getByText(
      'No items yet. Add what you sell first, or the raw materials you make it from.',
    ),
  ).toBeVisible();
  // One in the header and one in the empty list.
  await expect(
    page.getByRole('button', { name: 'Add item', exact: true }),
  ).toHaveCount(2);
});

test('for a Viewer: a line in Add item’s place, and no check boxes', async ({
  page,
  api,
  viewerApi,
}) => {
  // In the Viewer's organization, so there is a row it could have ticked.
  const product = await createProduct(api, {
    name: `E2E Viewed ${Date.now().toString(36)}`,
  });
  await signInAs(page, viewerApi);
  await page.goto(`/items?search=${encodeURIComponent(product.name)}`);

  await expect(
    page.getByText(/^Your role does not include adding items\./),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Add item', exact: true }),
  ).toHaveCount(0);
  await expect(rowNames(page).first()).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(0);
});

test('loading: placeholder rows past 250 ms, the header, tabs and filters kept', async ({
  page,
  freshOrg,
}) => {
  await createProduct(freshOrg.api, { name: 'E2E Slow' });
  await signInAs(page, freshOrg.api);
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(isTheList, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/items');

  await expect(page.getByText('Loading items…')).toBeAttached();
  await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible();
  await expect(searchBox(page)).toBeVisible();
  await expect(page.getByRole('tab', { name: /^Products/ })).toBeVisible();
  await expect(
    page.getByRole('table').locator('tbody .MuiSkeleton-root').first(),
  ).toBeVisible();

  release();
  await expect(rowNames(page)).toHaveText(['E2E Slow']);
  await expect(page.getByText('Loading items…')).toHaveCount(0);
});

test('failed: the list’s part alone says so, with Try again, the tabs’ counts “—”', async ({
  page,
  freshOrg,
}) => {
  await createProduct(freshOrg.api, { name: 'E2E Back Again' });
  await signInAs(page, freshOrg.api);
  // A dropped connection, not an answer made up.
  await page.route(isTheList, (route) => route.abort('internetdisconnected'));
  await page.goto('/items');

  const again = page.getByRole('button', { name: 'Try again' });
  await expect(again).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Products —' })).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(searchBox(page)).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Items' }),
  ).toBeVisible();

  await page.unroute(isTheList);
  await again.click();
  await expect(rowNames(page)).toHaveText(['E2E Back Again']);
  await expect(page.getByRole('tab', { name: 'Products 1' })).toBeVisible();
});

test('partial: Show 50 more failing keeps the rows shown, with Try again', async ({
  page,
  freshOrg,
}) => {
  test.setTimeout(60_000);
  await fiftyTwo(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await page.goto('/items');
  await expect(rowNames(page)).toHaveCount(50);

  const next = (url: URL) => isTheList(url) && url.searchParams.has('cursor');
  await page.route(next, (route) => route.abort('internetdisconnected'));
  await page.getByRole('button', { name: 'Show 50 more' }).click();

  await expect(
    page.getByText('The next 50 could not be loaded.'),
  ).toBeVisible();
  await expect(rowNames(page)).toHaveCount(50);

  await page.unroute(next);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(rowNames(page)).toHaveCount(52);
  await expect(rowNames(page).nth(50)).toBeFocused();
});

// ---------------------------------------------------------------------------
// A phone: the cards and the sheet; the keyboard on the tabs
// ---------------------------------------------------------------------------

test('on a phone: cards with the stock and its status, the type as one select, and the filters and sort in a sheet', async ({
  page,
  freshOrg,
}) => {
  const few = await createProduct(freshOrg.api, { name: 'E2E Bravo' });
  const many = await createProduct(freshOrg.api, { name: 'E2E Alpha' });
  await createProduct(freshOrg.api, { type: 'material', name: 'E2E Kelp' });
  await receive(freshOrg.api, few, '3');
  await receive(freshOrg.api, many, '30');
  await reorderAt(freshOrg.api, few, '10');
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAs(page, freshOrg.api);
  await page.goto('/items');

  const cards = page.getByRole('list').getByRole('listitem');
  await expect(cards).toHaveCount(2);
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(cards.first()).toContainText('E2E Alpha');
  await expect(cards.nth(1)).toContainText('Low stock');
  // Each card's two links, the item's and its stock's, a fingertip tall.
  for (const link of await page.getByRole('list').getByRole('link').all()) {
    expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }

  // The tabs as one select, with their counts.
  const type = page.getByRole('combobox', { name: 'Type' });
  await expect(type).toHaveText('Products (2)');
  await expect(page.getByRole('tab')).toHaveCount(0);

  // The sheet from the bottom: Sort, fewest first.
  await page.getByRole('button', { name: 'Filters' }).click();
  const sheet = page.getByRole('presentation').filter({
    has: page.getByRole('heading', { name: 'Filters and sort' }),
  });
  await sheet.getByRole('combobox', { name: 'Sort' }).click();
  await page.getByRole('option', { name: 'In stock, fewest first' }).click();
  await sheet.getByRole('button', { name: 'Show 2' }).click();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/sort=stock&order=asc/);
  await expect(cards.first()).toContainText('E2E Bravo');

  await type.click();
  await page.getByRole('option', { name: 'Raw materials (1)' }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('E2E Kelp');
});

// Nothing on a phone opened an item's stock (ADR-092's review, 2).
test('on a phone, a card’s stock: Inventory, that item alone; Back, Items as it was', async ({
  page,
  freshOrg,
}) => {
  const tonic = await createProduct(freshOrg.api, { name: 'E2E Card Tonic' });
  await receive(freshOrg.api, tonic, '12');
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAs(page, freshOrg.api);
  await page.goto('/items?search=Card');

  await page
    .getByRole('link', { name: /^12\b.*, stock of E2E Card Tonic$/ })
    .click();

  await expect(page).toHaveURL(
    new RegExp(`/inventory\\?productId=${tonic.id}`),
  );
  await expect(
    page.getByRole('button', { name: 'Item: E2E Card Tonic' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/items\?search=Card$/);
  await expect(page.getByRole('list').getByRole('listitem')).toHaveCount(1);
});

test('the keyboard on the tabs: the arrows move between them, Enter opens one', async ({
  page,
  freshOrg,
}) => {
  await createProduct(freshOrg.api, { name: 'E2E Tonic' });
  await createProduct(freshOrg.api, { type: 'material', name: 'E2E Kelp' });
  await signInAs(page, freshOrg.api);
  await page.goto('/items');

  const products = page.getByRole('tab', { name: 'Products 1' });
  await expect(products).toHaveAttribute('aria-selected', 'true');
  await products.focus();
  await page.keyboard.press('ArrowRight');
  const materials = page.getByRole('tab', { name: 'Raw materials 1' });
  await expect(materials).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(materials).toHaveAttribute('aria-selected', 'true');
  await expect(rowNames(page)).toHaveText(['E2E Kelp']);
  await expect(materials).toBeFocused();
});

// ---------------------------------------------------------------------------
// The shared organization, and tenancy
// ---------------------------------------------------------------------------

test('shows a product that already exists in the organisation', async ({
  page,
  api,
}) => {
  // Its own name each run, so the suite run again, or --repeat-each, finds
  // one row rather than every run's.
  const product = await createProduct(api, {
    name: `E2E Seeded Widget ${Date.now().toString(36)}`,
  });

  // Searched, so it is on the first fifty however many runs have added
  // before it (ADR-092).
  await page.goto(`/items?search=${encodeURIComponent(product.name)}`);

  /**
   * Scope the assertion to the row, not the page. `getByText(product.name)`
   * would also match a toast, a heading, or a search box that echoes the
   * query — all of which pass while the table is empty.
   */
  const seeded = row(page, product.name);

  await expect(seeded).toBeVisible();
  // Its code in grey under its name, and on the Products tab, its type's.
  await expect(seeded).toContainText(product.sku);
  await expect(
    page.getByRole('tab', { name: /^Products/, selected: true }),
  ).toBeVisible();
});

test("does not show another organisation's products", async ({
  page,
  freshOrg,
}) => {
  const foreign = await createProduct(freshOrg.api, {
    name: 'E2E Foreign Widget',
  });

  // `page` is still the shared owner from global-setup, so this navigates as a
  // different tenant than the one that just created the product.
  await page.goto(`/items?tab=all&search=${encodeURIComponent(foreign.name)}`);

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(row(page, foreign.name)).toHaveCount(0);
});
