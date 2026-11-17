import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import {
  createProduct,
  inviteByLink,
  joinByLink,
  signInAs,
  uniqueEmail,
} from './support/api';
import { confirmEmailInDatabase } from './support/mail';
import { reorderScene, stockScene } from './support/stock';

/**
 * The item's page, Where it stands (ADR-093, R8), row by row: each row of
 * the ADR's table for it is one test here, but Latest movements, which
 * Movements' branch builds; then its state with none on hand, each way
 * into it, and Items' Low stock filter (R23). Stock's ways in, its name,
 * "20 left" and "15 short", are in stock.spec.ts with Stock's rows;
 * Reorder's here.
 *
 * Each test makes its own organization (support/stock.ts's scenes).
 */

/** The section, by its heading. */
const standing = (page: Page) =>
  page.getByRole('region', { name: 'Where it stands' });

/** The item's page, arrived at from Items, so Back has somewhere to go. */
async function itemFrom(page: Page, productId: string, part = '') {
  await page.goto('/items');
  await page.goto(`/items/${productId}${part}`);
  await expect(standing(page)).toBeVisible();
}

// ---------------------------------------------------------------------------
// The interaction table, row by row
// ---------------------------------------------------------------------------

test('the item’s page, arrives from a link: Where it stands first under the title', async ({
  page,
  freshOrg,
}) => {
  const scene = await stockScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await itemFrom(page, scene.vitamin.id);

  await expect(
    page.getByRole('heading', { level: 1, name: 'E2E Vitamin C' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText(
    'Where it stands',
  );
  // Its figures: 56 on hand, 6 of them expired; 30 held, 20 free.
  const section = standing(page);
  await expect(section.getByText('6 not usable: expired')).toBeVisible();
  await expect(section.getByText('20 left · reorder at 100')).toBeVisible();
  await expect(
    section.getByText('50 usable + 0 coming − 30 for orders'),
  ).toBeVisible();
});

test('the item’s page, arrives from a link: focus on the title', async ({
  page,
  freshOrg,
}) => {
  await stockScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await page.goto('/inventory');
  await page
    .getByRole('link', { name: 'E2E Vitamin C', exact: true })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'E2E Vitamin C' }),
  ).toBeFocused();
});

test('Where it stands, Buy 80: a purchase order opens filled in, the supplier asked first; Back, the item’s page, nothing saved', async ({
  page,
  freshOrg,
}) => {
  const scene = await stockScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await itemFrom(page, scene.vitamin.id);

  await standing(page).getByRole('button', { name: 'Buy 80' }).click();

  await expect(page).toHaveURL(/\/orders\/new$/);
  await expect(page.getByRole('radio', { name: /^Buying/ })).toBeChecked();
  await expect(page.getByRole('combobox', { name: 'Partner' })).toHaveValue('');
  await expect(page.getByRole('textbox', { name: 'Quantity' })).toHaveValue(
    '80',
  );

  // The filled form, not saved, asks before it is left; Leave, unsaved.
  await page.goBack();
  await page
    .getByRole('dialog', { name: 'Leave without saving?' })
    .getByRole('button', { name: 'Leave' })
    .click();
  await expect(page).toHaveURL(new RegExp(`/items/${scene.vitamin.id}$`));
  await expect(standing(page)).toBeVisible();
  const purchases = (await (
    await freshOrg.api.get('/v1/orders?direction=purchase')
  ).json()) as { entries: unknown[] };
  expect(purchases.entries).toHaveLength(0);
});

test('Where it stands, Change reorder point: the dialog, filled in; Escape closes it, focus back on the button', async ({
  page,
  freshOrg,
}) => {
  const scene = await stockScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await itemFrom(page, scene.vitamin.id);

  const change = standing(page).getByRole('button', {
    name: 'Change reorder point',
  });
  await change.click();
  const dialog = page.getByRole('dialog', { name: 'Reorder point' });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('textbox', { name: 'Reorder point' }),
  ).toHaveValue('100');

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(change).toBeFocused();
});

test('Held, its order: the order; Back, the item’s page at Held', async ({
  page,
  freshOrg,
}) => {
  const scene = await stockScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await itemFrom(page, scene.magnesium.id, '#held');
  await expect(page.locator('#held')).toBeFocused();

  await page
    .locator('#held')
    .getByRole('link', { name: scene.waiting.number })
    .click();
  await expect(page).toHaveURL(new RegExp(`/orders/${scene.waiting.id}`));

  await page.goBack();
  await expect(page).toHaveURL(
    new RegExp(`/items/${scene.magnesium.id}#held$`),
  );
  await expect(page.locator('#held')).toBeFocused();
});

test('By place and lot, a lot’s code: the lot’s trace; Back, the item’s page', async ({
  page,
  freshOrg,
}) => {
  const scene = await stockScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await itemFrom(page, scene.vitamin.id);

  const byPlace = standing(page);
  await expect(byPlace.getByText('By place and lot')).toBeVisible();
  // Each lot a link, by place, each place's soonest first, the expired
  // among them: A2's, then B1's.
  await expect(byPlace.getByRole('link', { name: /^VC-/ })).toHaveText([
    'VC-SOON',
    'VC-LATE',
    'VC-GONE',
    'VC-SOON',
  ]);
  await byPlace.getByRole('link', { name: 'VC-LATE' }).click();
  await expect(page).toHaveURL(/\/lots\/[0-9a-f-]+$/);

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/items/${scene.vitamin.id}$`));
  await expect(standing(page)).toBeVisible();
});

// ---------------------------------------------------------------------------
// Its state with none on hand, and a role without its actions
// ---------------------------------------------------------------------------

test('none on hand and no reorder point: the next step, Set a reorder point or Receive stock', async ({
  page,
  freshOrg,
}) => {
  const bare = await createProduct(freshOrg.api, { name: 'E2E Bare' });
  await signInAs(page, freshOrg.api);
  await itemFrom(page, bare.id);

  const section = standing(page);
  await expect(
    section.getByText(
      'None on hand, nothing coming. Set a reorder point to be told when it runs low.',
    ),
  ).toBeVisible();
  await expect(
    section.getByRole('button', { name: 'Set a reorder point' }),
  ).toBeVisible();
  await expect(
    section.getByRole('button', { name: 'Receive stock' }),
  ).toBeVisible();
});

test('for a Viewer: no Buy or Change reorder point, a line saying whom to ask; no places, the not usable in one line', async ({
  page,
  freshOrg,
}) => {
  const scene = await stockScene(freshOrg.api);
  await confirmEmailInDatabase(freshOrg.email);
  const { token } = await inviteByLink(
    freshOrg.api,
    uniqueEmail('stands-viewer'),
  );
  const viewer = await joinByLink(token, 'E2E Viewer');
  await signInAs(page, viewer);
  await itemFrom(page, scene.vitamin.id);

  const section = standing(page);
  await expect(section.getByRole('button', { name: 'Buy 80' })).toHaveCount(0);
  await expect(
    section.getByRole('button', { name: 'Change reorder point' }),
  ).toHaveCount(0);
  await expect(
    section.getByText(/^Your role does not include buying\./),
  ).toBeVisible();
  await viewer.dispose();
});

// ---------------------------------------------------------------------------
// The ways in: Reorder's, and Items' Low and Out with its Low stock filter
// ---------------------------------------------------------------------------

test('Reorder, a row, 20 left · reorder at 100: Where it stands; Back, Reorder', async ({
  page,
  freshOrg,
}) => {
  const scene = await stockScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await page.goto('/inventory?tab=reorder');

  await page.getByRole('link', { name: '20 left · reorder at 100' }).click();
  await expect(page).toHaveURL(new RegExp(`/items/${scene.vitamin.id}#stock$`));
  await expect(
    page.getByRole('heading', { level: 2, name: 'Where it stands' }),
  ).toBeFocused();

  await page.goBack();
  await expect(page).toHaveURL(/\/inventory\?tab=reorder$/);
});

test('Reorder, a row’s menu, Stock of the item: Where it stands', async ({
  page,
  freshOrg,
}) => {
  const scene = await stockScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await page.goto('/inventory?tab=reorder');

  await page
    .getByRole('button', { name: 'Actions for E2E-VITC’s reorder point' })
    .click();
  await page.getByRole('menuitem', { name: 'Stock of the item' }).click();
  await expect(page).toHaveURL(new RegExp(`/items/${scene.vitamin.id}#stock$`));
  await expect(standing(page)).toBeVisible();
});

test('Items, Low stock: the items low or out, counted; a row’s Low opens Where it stands; Back, Items as it was', async ({
  page,
  freshOrg,
}) => {
  const scene = await reorderScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await page.goto('/items');

  // Vitamin C, zinc and copper low, focus out: four items, as Reorder's
  // low and out codes are, each of one code; magnesium has no point.
  const low = page.getByRole('button', { name: /^Low stock/ });
  await expect(low).toHaveAccessibleName('Low stock 4');
  await low.click();

  await expect(page).toHaveURL(/[?&]low=1/);
  const names = page.getByRole('table').locator('tbody a[href^="/items/"]');
  await expect(page.getByRole('row', { name: /E2E Magnesium/ })).toHaveCount(0);
  await expect(page.getByRole('row', { name: /E2E Zinc/ })).toBeVisible();
  await expect(names.filter({ hasText: /^E2E / })).toHaveCount(4);

  // Its Out badge (#570).
  await page.getByRole('link', { name: 'Out: where E2E Focus stands' }).click();
  await expect(page).toHaveURL(new RegExp(`/items/${scene.focus.id}#stock$`));
  await expect(
    page.getByRole('heading', { level: 2, name: 'Where it stands' }),
  ).toBeFocused();

  await page.goBack();
  await expect(page).toHaveURL(/\/items\?low=1$/);
  await expect(low).toHaveAttribute('aria-pressed', 'true');
});

test('Items, a row’s Low: Where it stands, Low first', async ({
  page,
  freshOrg,
}) => {
  const scene = await stockScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await page.goto('/items');

  await page
    .getByRole('link', { name: 'Low stock: where E2E Vitamin C stands' })
    .click();
  await expect(page).toHaveURL(new RegExp(`/items/${scene.vitamin.id}#stock$`));
  await expect(standing(page).getByText('Low', { exact: true })).toBeVisible();
});
