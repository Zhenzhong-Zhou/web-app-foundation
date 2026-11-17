import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import { signInAs } from './support/api';
import { reorderScene } from './support/stock';

/**
 * Inventory's Reorder tab (ADR-093, R7), row by row: each row of the ADR's
 * Reorder table is one test here, named by its words. Its ways into Where
 * it stands are in where-it-stands.spec.ts; axe on it in
 * accessibility.spec.ts.
 *
 * Each test makes its own organization (support/stock.ts's scene):
 * vitamin C low, Buy 80; zinc low, Buy 15; focus made and out, Make
 * 1,000; copper low, its order in a draft already.
 */

/** A row of the table, by the item's name. */
const row = (page: Page, name: string) =>
  page.getByRole('row', { name: new RegExp(name) });

/** The bar over the ticked rows. */
const bar = (page: Page) =>
  page.getByRole('region', { name: 'Chosen to order' });

/**
 * The rows' item links, top to bottom: each name's, not its "20 left",
 * which opens a part of the item's page.
 */
const names = (page: Page) =>
  page.getByRole('table').locator('tbody a[href^="/items/"]:not([href*="#"])');

/** Reorder opened with Locations the page before it, for Back. */
async function reorderFrom(page: Page, address = '/inventory?tab=reorder') {
  await page.goto('/locations');
  await page.goto(address);
  await expect(names(page).first()).toBeVisible();
}

/** New order's quantities, line by line. */
const quantities = (page: Page) =>
  page.getByRole('textbox', { name: 'Quantity' });

// ---------------------------------------------------------------------------
// The interaction table, row by row
// ---------------------------------------------------------------------------

test('Home, Low stock: Reorder opens with Low stock chosen, the tile’s word; Back, Home', async ({
  page,
  freshOrg,
}) => {
  await reorderScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await page.goto('/');

  const tile = page.getByRole('link', { name: /^Low stock, 4\b/ });
  await tile.click();

  await expect(page).toHaveURL(/\/inventory\?tab=reorder&status=low$/);
  await expect(
    page.getByRole('button', { name: /^Low stock/ }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(names(page)).toHaveCount(4);

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(tile).toBeVisible();
});

// Not built: Back to Home puts focus on its top, not on the tile it left
// by (ADR-093's Reorder table: "Home, focus on the tile"). For step 22's
// review.
test.fixme('Home, Low stock, then Back: focus on the tile', async ({
  page,
  freshOrg,
}) => {
  await reorderScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await page.goto('/');

  const tile = page.getByRole('link', { name: /^Low stock, 4\b/ });
  await tile.click();
  await expect(page).toHaveURL(/\/inventory\?tab=reorder&status=low$/);
  await page.goBack();
  await expect(tile).toBeFocused();
});

test('Reorder, a row, Buy 80: a purchase order filled in with this item and 80, nothing saved; Back, Reorder as it was', async ({
  page,
  freshOrg,
}) => {
  await reorderScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await reorderFrom(page, '/inventory?tab=reorder&status=low');

  await row(page, 'E2E Vitamin C')
    .getByRole('button', { name: 'Buy 80 of E2E Vitamin C' })
    .click();

  await expect(page).toHaveURL(/\/orders\/new$/);
  await expect(page.getByRole('radio', { name: /^Buying/ })).toBeChecked();
  await expect(page.getByRole('combobox', { name: 'Partner' })).toHaveValue('');
  await expect(quantities(page)).toHaveValue('80');

  await page.goBack();
  await page
    .getByRole('dialog', { name: 'Leave without saving?' })
    .getByRole('button', { name: 'Leave' })
    .click();
  await expect(page).toHaveURL(/\/inventory\?tab=reorder&status=low$/);
  await expect(
    page.getByRole('button', { name: /^Low stock/ }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(names(page)).toHaveCount(4);
});

test('Reorder, a row, Make 1,000: Plan a run, filled in, nothing saved until Plan run; then its draft in the row', async ({
  page,
  freshOrg,
}) => {
  await reorderScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await reorderFrom(page);

  await row(page, 'E2E Focus')
    .getByRole('button', { name: 'Make 1,000 of E2E Focus' })
    .click();

  const dialog = page.getByRole('dialog', { name: 'Plan a run' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/^Filled from Reorder: 1,000/)).toBeVisible();
  await expect(
    dialog.getByRole('textbox', { name: 'Quantity to make' }),
  ).toHaveValue('1000');

  const runs = async () =>
    (
      (await (await freshOrg.api.get('/v1/production-orders')).json()) as {
        entries: unknown[];
      }
    ).entries.length;
  expect(await runs()).toBe(0);

  await dialog.getByRole('combobox', { name: 'Made at' }).click();
  await page
    .getByRole('option', { name: 'E2E Shelf A2', exact: true })
    .and(page.locator('[data-value]'))
    .click();
  await dialog.getByRole('button', { name: 'Plan run' }).click();
  await expect(dialog).toBeHidden();
  await expect(row(page, 'E2E Focus')).toContainText(/Drafted in .* · 1,000/);
  expect(await runs()).toBe(1);
});

test('Reorder, ticks two rows: the bar names them and their quantities, with Buy 2 on one purchase order; Clear, the ticks gone', async ({
  page,
  freshOrg,
}) => {
  await reorderScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await reorderFrom(page);

  await page.getByRole('checkbox', { name: 'Choose E2E Vitamin C' }).check();
  await page.getByRole('checkbox', { name: 'Choose E2E Zinc' }).check();

  await expect(bar(page)).toContainText('E2E Vitamin C · 80');
  await expect(bar(page)).toContainText('E2E Zinc · 15');
  await expect(
    bar(page).getByRole('button', { name: 'Buy 2 on one purchase order' }),
  ).toBeVisible();

  // The copper's box greyed, its reason beside it, its draft in its cell.
  const copper = row(page, 'E2E Copper');
  await expect(
    copper.getByRole('checkbox', { name: 'Choose E2E Copper' }),
  ).toBeDisabled();
  await expect(copper.getByText('In a draft already')).toBeVisible();

  await bar(page).getByRole('button', { name: 'Clear' }).click();
  await expect(bar(page)).toBeHidden();
  await expect(
    page.getByRole('checkbox', { name: 'Choose E2E Vitamin C' }),
  ).not.toBeChecked();
});

test('Reorder, the bar, Buy 2 on one purchase order: one purchase order, both lines filled in', async ({
  page,
  freshOrg,
}) => {
  await reorderScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await reorderFrom(page);

  await page.getByRole('checkbox', { name: 'Choose E2E Vitamin C' }).check();
  await page.getByRole('checkbox', { name: 'Choose E2E Zinc' }).check();
  await bar(page)
    .getByRole('button', { name: 'Buy 2 on one purchase order' })
    .click();

  await expect(page).toHaveURL(/\/orders\/new$/);
  await expect(page.getByRole('radio', { name: /^Buying/ })).toBeChecked();
  await expect(quantities(page)).toHaveCount(2);
  await expect
    .poll(async () =>
      (
        await quantities(page).evaluateAll((boxes) =>
          boxes.map((box) => (box as HTMLInputElement).value),
        )
      ).sort(),
    )
    .toEqual(['15', '80']);
});

// Not built: Back from New order after Buy 2 finds the ticks gone, since
// they are the tab's own state (ADR-093's Reorder table: "Reorder, ticks
// kept"). For step 22's review.
test.fixme('Reorder, the bar, Buy 2 on one purchase order: Back, Reorder, ticks kept', async ({
  page,
  freshOrg,
}) => {
  await reorderScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await reorderFrom(page);

  await page.getByRole('checkbox', { name: 'Choose E2E Vitamin C' }).check();
  await page.getByRole('checkbox', { name: 'Choose E2E Zinc' }).check();
  await bar(page)
    .getByRole('button', { name: 'Buy 2 on one purchase order' })
    .click();
  await expect(quantities(page)).toHaveCount(2);

  await page.goBack();
  await page
    .getByRole('dialog', { name: 'Leave without saving?' })
    .getByRole('button', { name: 'Leave' })
    .click();
  await expect(bar(page)).toContainText('E2E Zinc · 15');
});

test('A new purchase order from Reorder, raised as a draft: its page in the form’s place; Back, Reorder, the row “Drafted in …”, ticks cleared', async ({
  page,
  freshOrg,
}) => {
  const scene = await reorderScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await reorderFrom(page);

  await page.getByRole('checkbox', { name: 'Choose E2E Zinc' }).check();
  await row(page, 'E2E Zinc')
    .getByRole('button', { name: 'Buy 15 of E2E Zinc' })
    .click();
  await expect(quantities(page)).toHaveValue('15');

  await page.getByRole('combobox', { name: 'Partner' }).click();
  await page
    .getByRole('option', { name: new RegExp(scene.partner.name) })
    .click();
  await page.getByRole('button', { name: 'Raise as draft' }).click();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/inventory\?tab=reorder$/);
  await expect(row(page, 'E2E Zinc')).toContainText(/Drafted in .* · 15/);
  await expect(
    page.getByRole('checkbox', { name: 'Choose E2E Zinc' }),
  ).toBeDisabled();
  await expect(bar(page)).toBeHidden();
});

// Not built: the message on New order's save, "Draft saved. Confirm it to
// send." (ADR-093's Reorder table). For step 22's review.
test.fixme('A new purchase order from Reorder, raised as a draft: “Draft saved. Confirm it to send.”', async ({
  page,
  freshOrg,
}) => {
  const scene = await reorderScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await reorderFrom(page);

  await row(page, 'E2E Zinc')
    .getByRole('button', { name: 'Buy 15 of E2E Zinc' })
    .click();
  await page.getByRole('combobox', { name: 'Partner' }).click();
  await page
    .getByRole('option', { name: new RegExp(scene.partner.name) })
    .click();
  await page.getByRole('button', { name: 'Raise as draft' }).click();
  await expect(
    page.getByText('Draft saved. Confirm it to send.'),
  ).toBeVisible();
});

test('Reorder, a row, Drafted in its draft · 60: the draft; Back, Reorder as it was', async ({
  page,
  freshOrg,
}) => {
  const scene = await reorderScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await reorderFrom(page, '/inventory?tab=reorder&status=low');

  const copper = row(page, 'E2E Copper');
  await expect(copper).toContainText(/Drafted in .* · 60/);
  await copper
    .getByRole('link', { name: /^(PO-\d+|Draft purchase order)$/ })
    .click();
  await expect(page).toHaveURL(new RegExp(`/orders/${scene.draft.id}$`));

  await page.goBack();
  await expect(page).toHaveURL(/\/inventory\?tab=reorder&status=low$/);
  await expect(names(page)).toHaveCount(4);
});

test('Reorder, Sort › Suggested order: most to order first; ?sort=suggested; again, least first', async ({
  page,
  freshOrg,
}) => {
  await reorderScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await reorderFrom(page, '/inventory?tab=reorder&status=low');

  await page.getByRole('button', { name: 'Suggested order' }).click();
  await expect(page).toHaveURL(/sort=suggested&order=desc/);
  await expect(names(page).first()).toHaveText('E2E Focus');
  await expect(
    page.getByRole('columnheader', { name: 'Suggested order' }),
  ).toHaveAttribute('aria-sort', 'descending');

  await page.getByRole('button', { name: 'Suggested order' }).click();
  await expect(page).toHaveURL(/sort=suggested&order=asc/);
  await expect(names(page).first()).not.toHaveText('E2E Focus');
  await expect(names(page).last()).toHaveText('E2E Focus');
});

// ---------------------------------------------------------------------------
// A phone: cards, the sort behind one Filters button
// ---------------------------------------------------------------------------

test('on a phone: cards with Buy and Make, the sort behind one Filters button', async ({
  page,
  freshOrg,
}) => {
  await reorderScene(freshOrg.api);
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAs(page, freshOrg.api);
  await page.goto('/inventory?tab=reorder');

  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Buy 80 of E2E Vitamin C' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Make 1,000 of E2E Focus' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Filters' }).click();
  await expect(page.getByRole('combobox', { name: 'Sort' })).toBeVisible();
});
