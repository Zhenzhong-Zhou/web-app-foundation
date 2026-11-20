import type { Page } from '@playwright/test';

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
import { receive, reorderScene, stockScene } from './support/stock';

/**
 * The item's page, Where it stands (ADR-093, R8), row by row: each row of
 * the ADR's table for it is one test here, but Latest movements' All
 * movements, which is with Movements' own in movements-page.spec.ts; then
 * its state with none on hand, each way into it, and Items' Low stock
 * filter (R23). Stock's ways in, its name,
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

  await standing(page)
    .getByRole('button', { name: 'Buy 80 each', exact: true })
    .click();

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

  await expect(standing(page).getByText('By place and lot')).toBeVisible();
  // Its table, the first: Latest movements' after it names lots too.
  const byPlace = standing(page).getByRole('table').first();
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
  await expect(
    section.getByRole('button', { name: 'Buy 80 each', exact: true }),
  ).toHaveCount(0);
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

  await page.getByRole('button', { name: 'Actions for E2E Vitamin C' }).click();
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
    .getByRole('link', { name: 'Low: where E2E Vitamin C stands' })
    .click();
  await expect(page).toHaveURL(new RegExp(`/items/${scene.vitamin.id}#stock$`));
  await expect(standing(page).getByText('Low', { exact: true })).toBeVisible();
});

// v2's board (Bob's fourth message): the five figures as tiles, five to a
// row at a laptop's width, fewer narrower, a list on a phone; each lot's
// actions its Actions menu, as on Stock.
test('Where it stands, its figures: five tiles in a row at 1366 px, fewer at 820, a list at 390; each lot its Actions menu', async ({
  page,
  freshOrg,
}) => {
  const scene = await stockScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  const figures = standing(page).locator('dl').first().locator('> div');
  /** How many tiles share the first one's row. */
  const firstRow = () =>
    figures.evaluateAll((tiles) => {
      const top = tiles[0].getBoundingClientRect().top;
      return tiles.filter(
        (tile) => Math.abs(tile.getBoundingClientRect().top - top) < 2,
      ).length;
    });

  await page.setViewportSize({ width: 1366, height: 900 });
  await itemFrom(page, scene.vitamin.id);
  await expect(figures).toHaveCount(5);
  expect(await firstRow()).toBe(5);

  await page.setViewportSize({ width: 820, height: 1000 });
  await expect.poll(firstRow).toBe(2);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(firstRow).toBe(1);

  await page.setViewportSize({ width: 1366, height: 900 });
  const section = standing(page);
  await section
    .getByRole('button', { name: /^Actions for lot VC-SOON at / })
    .first()
    .click();
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: /^Move…/ })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Trace lot' })).toBeVisible();
  await expect(section.getByRole('button', { name: /^Move / })).toHaveCount(0);
});

// A place written as its path (57a), as on Stock: whole where it fits;
// cut in its middle where it does not, the warehouse and the place whole
// (93a, #639).
test('Where it stands, By place and lot: a place’s whole path where it fits, cut in its middle on a phone, the warehouse and the place whole', async ({
  page,
  freshOrg,
}) => {
  const names = [
    'E2E Main warehouse on the river',
    'E2E Zone A by the loading dock',
    'E2E Shelf A2',
  ];
  let parentId: string | undefined;
  let place: { id: string; name: string } | undefined;
  for (const [depth, name] of names.entries()) {
    place = await createLocation(freshOrg.api, {
      name,
      type: ['site', 'zone', 'shelf'][depth],
      parentId,
    });
    parentId = place.id;
  }
  const product = await createProduct(freshOrg.api, { name: 'E2E Rosehip' });
  await receive(freshOrg.api, product, place!, '12');
  const whole = names.join(' › ');
  const drawn = () =>
    standing(page)
      .locator(`[data-whole="${whole}"]`)
      .first()
      .evaluate((path) => {
        // The span drawn, then its cut text where it is cut.
        const box = path.querySelector(':scope > span:not([aria-hidden])')!;
        const shown = box.querySelector('[aria-hidden="true"]');
        return (shown ?? box).textContent;
      });

  await page.setViewportSize({ width: 1920, height: 1080 });
  await signInAs(page, freshOrg.api);
  await itemFrom(page, product.id);
  await expect.poll(drawn).toBe(whole);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(drawn)
    .toBe('E2E Main warehouse on the river › … › E2E Shelf A2');
});

// Review 22, S16: on a phone, a place's path in Latest movements stays on
// its card: cut in its middle as PlacePath cuts, whole on a tap, or
// wrapped; never clipped at the card's edge with no sign.
test('Latest movements on a phone: a long path stays on its card, never clipped with no sign', async ({
  page,
  freshOrg,
}) => {
  const site = (await (
    await freshOrg.api.post('/v1/locations', {
      data: { type: 'site', name: 'Richmond warehouse' },
    })
  ).json()) as { location: { id: string } };
  const quarantine = (await (
    await freshOrg.api.post('/v1/locations', {
      data: {
        type: 'zone',
        name: 'Quarantine',
        code: 'QUAR',
        parentId: site.location.id,
      },
    })
  ).json()) as { location: { id: string } };
  const product = await createProduct(freshOrg.api, {
    name: 'E2E Vitamin C 500 mg',
  });
  await receive(
    freshOrg.api,
    product,
    { id: quarantine.location.id, name: 'Quarantine' },
    '12',
  );
  // As the panel's senior walked it: Larger text.
  await page.addInitScript(() => localStorage.setItem('textSize', 'larger'));
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAs(page, freshOrg.api);
  await itemFrom(page, product.id);

  const latest = standing(page)
    .getByRole('listitem')
    .filter({ hasText: 'Richmond' })
    .first();
  await expect(latest).toBeVisible();
  const path = latest.locator('[data-whole]');
  await expect(path).toHaveAttribute(
    'data-whole',
    'Richmond warehouse › Quarantine (QUAR)',
  );
  // Its box within its card and the screen, and no text run past it.
  const card = (await latest.boundingBox())!;
  const box = (await path.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(card.x + card.width + 0.5);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  const shown = path.locator('> span').first();
  expect(
    await shown.evaluate((span) => span.scrollWidth <= span.clientWidth + 1),
  ).toBe(true);
});
