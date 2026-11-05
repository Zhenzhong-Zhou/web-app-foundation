import type { APIRequestContext, Page } from '@playwright/test';

import { expect, test } from './fixtures';
import {
  created,
  createLocation,
  createPartner,
  createProduct,
  daysFromNow,
  signInAs,
} from './support/api';

/**
 * Home (ADR-058; ADR-091): signing in lands on it, Home leads the rail, a
 * new organization is led by Getting started, and each tile opens its list
 * with as many rows as it counts, a late button just the late ones.
 */
test('a new organization lands on Home, led by Getting started', async ({
  page,
  freshOrg,
}) => {
  await signInAs(page, freshOrg.api);
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    /^Good (morning|afternoon|evening), /,
  );
  await expect(
    page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Home' }),
  ).toBeVisible();

  const start = page.getByRole('region', { name: 'Getting started' });
  await expect(start).toBeVisible();
  await expect(start.getByRole('button', { name: 'Skip' })).toHaveCount(1);
  // Nothing to do yet: said in one line, the tiles quiet in their places.
  await expect(page.getByText('Nothing needs you today.')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'To ship, No orders to ship' }),
  ).toBeVisible();

  // Dismissed, it stays out of the way, and comes back on request.
  await start.getByRole('button', { name: 'Dismiss' }).click();
  await expect(start).toBeHidden();
  await page.getByRole('button', { name: 'Show Getting started' }).click();
  await expect(
    page.getByRole('region', { name: 'Getting started' }),
  ).toBeVisible();
});

/** A confirmed purchase of 10, still to receive, expected `days` from now. */
async function purchase(
  api: APIRequestContext,
  ids: { partnerId: string; variantId: string },
  days: number,
): Promise<void> {
  const { order } = await created<{ order: { id: string } }>(
    await api.post('/v1/orders', {
      data: {
        partnerId: ids.partnerId,
        direction: 'purchase',
        expectedAt: daysFromNow(days),
        lines: [
          {
            variantId: ids.variantId,
            quantityOrdered: '10',
            unitPrice: '2.50',
            currency: 'CAD',
          },
        ],
      },
    }),
  );
  const confirmed = await api.patch(`/v1/orders/${order.id}`, {
    data: { status: 'confirmed' },
  });
  expect(confirmed.ok(), await confirmed.text()).toBeTruthy();
}

/** The orders a list shows, by their numbers, each its row's link. */
const orderLinks = (page: Page) =>
  page.getByRole('main').getByRole('link', { name: /^PO-\d+$/ });

test('each tile opens its list with its count’s rows, a late button just the late ones', async ({
  page,
  freshOrg,
}) => {
  const product = await createProduct(freshOrg.api);
  const partner = await createPartner(freshOrg.api);
  const ids = { partnerId: partner.id, variantId: product.variantId };
  await purchase(freshOrg.api, ids, -3);
  await purchase(freshOrg.api, ids, 5);

  await signInAs(page, freshOrg.api);
  await page.goto('/');

  // The tile opens all of its kind, the late first.
  await page.getByRole('link', { name: 'To receive, 2, 1 late' }).click();
  await expect(page).toHaveURL(/\/orders\?direction=purchase&outstanding=1$/);
  await expect(orderLinks(page)).toHaveCount(2);
  await page.getByRole('button', { name: 'Back' }).click();

  // The late button, just the late one, with Late chosen.
  const late = page.getByRole('region', { name: '1 thing is late' });
  await late.getByRole('link', { name: '1 order to receive' }).click();
  await expect(page).toHaveURL(
    /\/orders\?direction=purchase&outstanding=1&late=1$/,
  );
  await expect(orderLinks(page)).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Late' })).toBeVisible();
});

test('Expiring soon opens Inventory’s expiring lots, and nothing late is one calm line', async ({
  page,
  freshOrg,
}) => {
  // Its own data, so the tile's count is known: one lot expiring in 10 days.
  const product = await createProduct(freshOrg.api, { tracksLots: true });
  const location = await createLocation(freshOrg.api);
  await created(
    await freshOrg.api.post('/v1/stock/movements', {
      data: {
        variantId: product.variantId,
        toLocationId: location.id,
        quantity: '5',
        reason: 'receipt',
        lot: { code: 'E2E-SOON', expiresAt: daysFromNow(10) },
      },
    }),
  );

  await signInAs(page, freshOrg.api);
  await page.goto('/');

  await expect(page.getByText('Nothing is late today.')).toBeVisible();
  await page.getByRole('link', { name: 'Expiring soon, 1' }).click();

  await expect(page).toHaveURL(/\/inventory\?expiring=1$/);
  await expect(
    page.getByRole('button', { name: /^Expiring soon/ }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('E2E-SOON').first()).toBeVisible();
});

/** The tab hidden or shown again, as switching to another tab does. */
async function showTab(page: Page, state: 'hidden' | 'visible') {
  await page.evaluate((to) => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => to,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

test('reads its counts again when the tab is back after a minute away', async ({
  page,
  freshOrg,
}) => {
  const product = await createProduct(freshOrg.api);
  const partner = await createPartner(freshOrg.api);
  const ids = { partnerId: partner.id, variantId: product.variantId };
  await purchase(freshOrg.api, ids, 5);

  await page.clock.install();
  await signInAs(page, freshOrg.api);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'To receive, 1' })).toBeVisible();

  // Another order raised meanwhile, by someone else.
  await purchase(freshOrg.api, ids, 6);
  await showTab(page, 'hidden');
  await page.clock.fastForward(61_000);
  await showTab(page, 'visible');

  await expect(page.getByRole('link', { name: 'To receive, 2' })).toBeVisible();
});

test('moves its time on at the minute, by itself', async ({
  page,
  freshOrg,
}) => {
  await page.clock.install({ time: new Date('2026-11-05T15:41:00Z') });
  await signInAs(page, freshOrg.api);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // The line under the greeting: the day and the time, no seconds.
  const now = page.locator('h1 + p');
  await page.clock.pauseAt(new Date('2026-11-05T15:41:40Z'));
  const before = await now.textContent();
  expect(before).not.toMatch(/\d:\d\d:\d\d/);

  await page.clock.runFor(10_000);
  await expect(now).toHaveText(before ?? '');
  await page.clock.runFor(15_000);
  await expect(now).not.toHaveText(before ?? '');
});
