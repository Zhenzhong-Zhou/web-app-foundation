import type { APIRequestContext, Page } from '@playwright/test';

import { expect, test } from './fixtures';
import {
  created,
  createLocation,
  createPartner,
  createProduct,
  daysFromNow,
  inviteByLink,
  joinByLink,
  signInAs,
  uniqueEmail,
} from './support/api';
import { confirmEmailInDatabase } from './support/mail';

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
  // Skip only once the team step is the next.
  await expect(start.getByRole('button', { name: 'Skip' })).toHaveCount(0);
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

/**
 * Getting started at a phone's and a laptop's width (ADR-091): the next
 * step its one filled button with Learn more beside it, every other step
 * one link, its whole row, at least 44 px tall, nothing wider than the
 * window.
 */
for (const size of [
  { width: 390, height: 844 },
  { width: 1366, height: 768 },
]) {
  test(`Getting started at ${size.width} px: the next step its main action, each other step one link`, async ({
    page,
    freshOrg,
  }) => {
    await page.setViewportSize(size);
    await signInAs(page, freshOrg.api);
    await page.goto('/');

    const start = page.getByRole('region', { name: 'Getting started' });
    await expect(start.getByText(/^\d of 7 done$/)).toBeVisible();
    const steps = start.getByRole('listitem');
    await expect(steps).toHaveCount(7);

    // A new organization's next step is its profile.
    const next = steps.filter({ hasText: 'Address, tax number and currency' });
    await expect(
      next.getByRole('link', { name: 'Open settings', exact: true }),
    ).toHaveClass(/MuiButton-contained/);
    await expect(
      next.getByRole('button', { name: 'Learn more', exact: true }),
    ).toBeVisible();
    await expect(start.locator('.MuiButton-contained')).toHaveCount(1);

    await expect(
      start.getByRole('link', { name: /^Add a location/ }),
    ).toHaveAttribute('href', '/locations');
    for (const name of [
      /^Add a location/,
      /^Add a product/,
      /^Add a partner/,
      /^Receive stock/,
      /^Ship and invoice an order/,
      /^Invite your team/,
    ]) {
      const box = await start.getByRole('link', { name }).boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(size.width);
    }
  });
}

/**
 * Home's own targets on a touch phone (ADR-079): a fingertip, 44 px each
 * way, however small the icon or the words.
 */
test.describe('on a touch phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("Home's own targets are 44 px each way", async ({ page, freshOrg }) => {
    await signInAs(page, freshOrg.api);
    await page.goto('/');
    await expect(
      page.getByRole('region', { name: 'Getting started' }),
    ).toBeVisible();

    for (const target of [
      page.getByRole('main').getByRole('button', { name: 'Refresh' }),
      page
        .getByRole('region', { name: 'Getting started' })
        .getByRole('button', { name: 'Learn more', exact: true }),
    ]) {
      const box = await target.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  });

  // What a late button chose, a chip whose × takes it off: a fingertip
  // each way, the chip and its × (ADR-091's review).
  test("a late button's chip and its × are 44 px", async ({
    page,
    freshOrg,
  }) => {
    await signInAs(page, freshOrg.api);
    await page.goto('/orders?direction=sale&outstanding=1&late=1');
    const chip = page.locator('.MuiChip-deletable').filter({ hasText: 'Late' });
    await expect(chip).toBeVisible();

    for (const target of [chip, chip.locator('.MuiChip-deleteIcon')]) {
      const box = await target.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  });
});

/**
 * A member of the Owner's organization, signed in on its own: in a
 * built-in role, or in one made from a template of the same key.
 */
async function memberIn(
  owner: APIRequestContext,
  role: string,
  template?: string,
): Promise<APIRequestContext> {
  if (template) {
    const catalogue = (await (
      await owner.get('/v1/roles/catalogue')
    ).json()) as { templates: { key: string; permissions: string[] }[] };
    await created(
      await owner.post('/v1/roles', {
        data: {
          name: role,
          permissions: catalogue.templates.find((each) => each.key === template)
            ?.permissions,
        },
      }),
    );
  }
  const { token } = await inviteByLink(
    owner,
    uniqueEmail(role.toLowerCase()),
    role,
  );
  return joinByLink(token, `E2E ${role}`);
}

/**
 * Home's main action by role (ADR-091): the first the member may do of
 * Raise an order, Receive stock, Plan a run and Trace a lot, in the accent,
 * the others under More, a menu worked from the keyboard; a Viewer, who
 * may only trace a lot, has the line saying whom to ask instead. At a phone's width it runs the page's width under
 * the greeting; on a laptop it sits at the right of the greeting's row.
 */
for (const size of [
  { width: 390, height: 844 },
  { width: 1366, height: 768 },
]) {
  test(`the main action by role at ${size.width} px, More's menu by the keyboard`, async ({
    page,
    freshOrg,
  }) => {
    test.slow();
    const owner = freshOrg.api;
    // An Owner invites once their own address is confirmed (ADR-077), and
    // Getting started's next step would be the page's main action.
    await confirmEmailInDatabase(freshOrg.email);
    await owner.post('/v1/home/getting-started/dismiss');
    const people = [
      {
        api: owner,
        main: 'Raise an order',
        more: ['Receive stock', 'Plan a run', 'Trace a lot'],
      },
      {
        api: await memberIn(owner, 'Warehouse', 'warehouse'),
        main: 'Receive stock',
        more: ['Trace a lot'],
      },
      {
        api: await memberIn(owner, 'Production', 'production'),
        main: 'Plan a run',
        more: ['Trace a lot'],
      },
    ];
    await page.setViewportSize(size);

    const viewer = await memberIn(owner, 'Viewer');
    await signInAs(page, viewer);
    await page.goto('/');
    await expect(
      page.getByText(/^Your role does not include raising orders/),
    ).toBeVisible();
    await expect(
      page.getByRole('main').getByRole('link', { name: 'Trace a lot' }),
    ).toHaveCount(0);

    for (const person of people) {
      await signInAs(page, person.api);
      await page.goto('/');
      const heading = page.getByRole('heading', { level: 1 });
      await expect(heading).toBeVisible();
      // The header's, before any of the welcome's links of the same name.
      const main = page
        .getByRole('main')
        .getByRole('link', { name: person.main, exact: true })
        .first();
      await expect(main).toHaveClass(/MuiButton-contained/);

      const greeting = (await heading.boundingBox())!;
      const button = (await main.boundingBox())!;
      if (size.width < 900) {
        expect(button.y).toBeGreaterThanOrEqual(greeting.y + greeting.height);
        expect(Math.abs(button.x - greeting.x)).toBeLessThanOrEqual(1);
      } else {
        expect(button.y).toBeLessThan(greeting.y + greeting.height);
        expect(button.x).toBeGreaterThan(greeting.x + greeting.width);
      }

      const more = page.getByRole('button', { name: 'More', exact: true });
      if (!person.more.length) {
        await expect(more).toHaveCount(0);
        if (size.width < 900) {
          expect(button.x + button.width).toBeGreaterThanOrEqual(
            size.width - 24,
          );
        }
        continue;
      }
      if (size.width < 900) {
        const last = (await more.boundingBox())!;
        expect(last.x + last.width).toBeGreaterThanOrEqual(size.width - 24);
      }

      // From the keyboard: Enter opens it on its first item, the arrows
      // move, Escape closes it and gives focus back to More.
      await more.focus();
      await page.keyboard.press('Enter');
      const menu = page.getByRole('menu');
      await expect(menu.getByRole('menuitem')).toHaveText(person.more);
      await expect(
        menu.getByRole('menuitem', { name: person.more[0] }),
      ).toBeFocused();
      if (person.more.length > 1) {
        await page.keyboard.press('ArrowDown');
        await expect(
          menu.getByRole('menuitem', { name: person.more[1] }),
        ).toBeFocused();
      }
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
      await expect(more).toBeFocused();
    }
  });
}

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
  const late = page.getByRole('region', { name: '1 thing needs you now' });
  await late.getByRole('link', { name: '1 late order to receive' }).click();
  await expect(page).toHaveURL(
    /\/orders\?direction=purchase&outstanding=1&late=1$/,
  );
  await expect(orderLinks(page)).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Late' })).toBeVisible();
});

/**
 * The drafts tile, once shown, opens Orders oldest first (ADR-091, amended
 * November 2026; ADR-057's amendment): Draft and Oldest first as chips,
 * the draft forgotten longest at the top. The chip removed lists them
 * newest first, and Back from a draft keeps either order.
 */
test('the drafts tile opens Orders oldest first, its chip removable, Back keeping the order', async ({
  page,
  freshOrg,
}) => {
  const product = await createProduct(freshOrg.api);
  const partner = await createPartner(freshOrg.api);
  const made: string[] = [];
  for (let count = 0; count < 3; count += 1) {
    const { order } = await created<{ order: { number: string } }>(
      await freshOrg.api.post('/v1/orders', {
        data: {
          partnerId: partner.id,
          direction: 'purchase',
          lines: [{ variantId: product.variantId, quantityOrdered: '10' }],
        },
      }),
    );
    made.push(order.number);
  }
  // Drafts shown, as Customise Home's Show leaves it; the kinds the layout
  // leaves out take their default places.
  const shown = await freshOrg.api.put('/v1/home/layout', {
    data: { order: ['drafts'], hidden: [], recent: true },
  });
  expect(shown.status(), await shown.text()).toBe(204);
  const newestFirst = [...made].reverse();

  await signInAs(page, freshOrg.api);
  await page.goto('/');
  await page.getByRole('link', { name: 'Orders · Draft, 3' }).click();

  await expect(page).toHaveURL(/\/orders\?status=draft&order=asc$/);
  await expect(
    page.getByRole('button', { name: 'Draft', exact: true }),
  ).toBeVisible();
  const oldest = page.getByRole('button', { name: 'Oldest first' });
  await expect(oldest).toBeVisible();
  await expect(orderLinks(page)).toHaveText(made);

  await orderLinks(page).first().click();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+$/);
  await page.goBack();
  await expect(oldest).toBeVisible();
  await expect(orderLinks(page)).toHaveText(made);

  await oldest.focus();
  await page.keyboard.press('Delete');
  await expect(page).toHaveURL(/\/orders\?status=draft$/);
  await expect(oldest).toBeHidden();
  await expect(orderLinks(page)).toHaveText(newestFirst);

  await orderLinks(page).first().click();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/orders\?status=draft$/);
  await expect(orderLinks(page)).toHaveText(newestFirst);
  await expect(oldest).toBeHidden();
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

// Stock value holds its whole valuation; the tile opens it at the list of
// what waits, under the bar, its heading taking focus (#505's 8). A short
// window, so the list starts below the fold.
test('Waiting for a cost opens Stock value at its list of what waits', async ({
  page,
  freshOrg,
}) => {
  const product = await createProduct(freshOrg.api);
  const location = await createLocation(freshOrg.api);
  await created(
    await freshOrg.api.post('/v1/stock/movements', {
      data: {
        variantId: product.variantId,
        toLocationId: location.id,
        quantity: '5',
        reason: 'receipt',
      },
    }),
  );

  await page.setViewportSize({ width: 390, height: 480 });
  await signInAs(page, freshOrg.api);
  await page.goto('/');
  await page
    .getByRole('link', { name: 'Stock value · Waiting for a cost, 1' })
    .click();

  await expect(page).toHaveURL(/\/costs#costs$/);
  const heading = page.getByRole('heading', { name: 'Waiting for a cost' });
  await expect(heading).toBeFocused();
  await expect(heading).toBeInViewport();
  const bar = await page.getByRole('banner').boundingBox();
  const top = await heading.boundingBox();
  expect(top!.y).toBeGreaterThanOrEqual(bar!.y + bar!.height);
  await expect(
    page.getByRole('row', { name: new RegExp(product.sku) }).first(),
  ).toBeInViewport();
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

  // The date and the time, under the greeting's row, with no seconds.
  const now = page
    .getByRole('main')
    .locator('p')
    .filter({ hasText: /\d:\d\d/ })
    .first();
  await page.clock.pauseAt(new Date('2026-11-05T15:41:40Z'));
  const before = await now.textContent();
  expect(before).not.toMatch(/\d:\d\d:\d\d/);
  // Neither a live region nor inside one, which a screen reader would read
  // out every minute (ADR-091).
  expect(
    await now.evaluate(
      (line) =>
        line.closest(
          '[aria-live]:not([aria-live="off"]), [role="status"], [role="log"], [role="alert"]',
        ) !== null,
    ),
  ).toBe(false);

  await page.clock.runFor(10_000);
  await expect(now).toHaveText(before ?? '');
  await page.clock.runFor(15_000);
  await expect(now).not.toHaveText(before ?? '');
});

/**
 * Customise Home by buttons (ADR-091, amended November 2026; the design
 * language, Arranging your own screen): in place of the tiles, each a card
 * with Up, Down and Hide, the hidden below with Show, saved by Done.
 */
const customising = (page: Page) =>
  page.getByRole('region', { name: 'Customise Home' });

/** A tile's card in Customise Home, by its name. */
const card = (page: Page, name: string) =>
  customising(page).getByRole('listitem', { name, exact: true });

/** Home's tiles, each its link, in the order Home shows them. */
const homeTiles = (page: Page) =>
  page.getByRole('region', { name: 'What needs you today' }).getByRole('link');

/** Waits for Done's write to the layout, PUT or DELETE. */
const layoutWrite = (page: Page) =>
  page.waitForRequest(
    (request) =>
      request.url().endsWith('/v1/home/layout') && request.method() !== 'GET',
  );

test('Customise Home by buttons: moved, hidden and shown, kept by Done, on reload and on another device', async ({
  page,
  browser,
  freshOrg,
}) => {
  test.slow();
  await freshOrg.api.post('/v1/home/getting-started/dismiss');
  await signInAs(page, freshOrg.api);
  await page.goto('/');

  const open = page.getByRole('button', { name: 'Customise Home' });
  await open.click();
  const panel = customising(page);
  await expect(
    panel.getByRole('heading', { name: 'Customise Home' }),
  ).toBeFocused();
  // What may not move stays in view, saying so.
  await expect(page.getByText('Fixed, cannot move').first()).toBeVisible();

  const tiles = panel.getByRole('list').first().getByRole('listitem');
  await expect(tiles).toHaveCount(9);
  await expect(tiles.first()).toHaveAccessibleName('To ship');

  // Up: To receive first, focus still on its Up, the new place said.
  const up = card(page, 'To receive').getByRole('button', { name: 'Up' });
  await up.click();
  await expect(tiles.first()).toHaveAccessibleName('To receive');
  await expect(up).toBeFocused();
  await expect(panel.getByRole('status')).toHaveText('To receive, 1 of 9');
  // At the top it goes no further, and keeps focus.
  await expect(up).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Enter');
  await expect(tiles.first()).toHaveAccessibleName('To receive');
  await expect(up).toBeFocused();

  const down = card(page, 'To receive').getByRole('button', { name: 'Down' });
  await down.click();
  await expect(tiles.nth(1)).toHaveAccessibleName('To receive');
  await expect(down).toBeFocused();
  await expect(panel.getByRole('status')).toHaveText('To receive, 2 of 9');

  // Hide: To ship waits below with Show, focus on the next tile.
  await card(page, 'To ship').getByRole('button', { name: 'Hide' }).click();
  await expect(tiles).toHaveCount(8);
  await expect(
    card(page, 'To receive').getByRole('button', { name: 'Hide' }),
  ).toBeFocused();
  const hidden = panel.getByRole('region', { name: 'Hidden tiles' });
  await expect(hidden.getByRole('listitem')).toHaveText([
    /To ship/,
    /Orders · Draft/,
  ]);

  // The drafts shown, in their place after To receive.
  await card(page, 'Orders · Draft')
    .getByRole('button', { name: 'Show' })
    .click();
  await expect(tiles.nth(1)).toHaveAccessibleName('Orders · Draft');
  await expect(panel.getByRole('status')).toHaveText('Orders · Draft, 2 of 9');

  const saved = layoutWrite(page);
  await panel.getByRole('button', { name: 'Done' }).click();
  const write = await saved;
  expect(write.method()).toBe('PUT');
  expect(write.postDataJSON()).toMatchObject({
    hidden: ['toShip'],
    recent: true,
  });
  await expect(panel).toBeHidden();
  await expect(open).toBeFocused();

  const order = [/^To receive, /, /^Orders · Draft, /, /^Low stock, /];
  const inOrder = async (where: Page) => {
    for (const [index, name] of order.entries()) {
      await expect(homeTiles(where).nth(index)).toHaveAccessibleName(name);
    }
    await expect(homeTiles(where).filter({ hasText: /^To ship/ })).toHaveCount(
      0,
    );
  };
  await inOrder(page);
  await page.reload();
  await inOrder(page);

  // Another device: a phone, signed in on its own.
  const phone = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const other = await phone.newPage();
  await other.goto('/login');
  await other.getByLabel(/^email/i).fill(freshOrg.email);
  await other.getByLabel(/^password/i).fill(freshOrg.password);
  await other.getByRole('button', { name: 'Sign in' }).click();
  await inOrder(other);
  await phone.close();
});

test('Reset to default and Done clear the layout, and Done untouched by a role of its own keeps none', async ({
  page,
  freshOrg,
}) => {
  test.slow();
  const owner = freshOrg.api;
  await owner.post('/v1/home/getting-started/dismiss');
  const shown = await owner.put('/v1/home/layout', {
    data: { order: ['licences', 'toShip'], hidden: ['toShip'], recent: false },
  });
  expect(shown.status(), await shown.text()).toBe(204);
  await signInAs(page, owner);
  await page.goto('/');
  await expect(homeTiles(page).first()).toHaveAccessibleName(/^Licences/);

  await page.getByRole('button', { name: 'Customise Home' }).click();
  const panel = customising(page);
  const recent = panel.getByRole('switch', {
    name: 'Show Recently opened on Home',
  });
  await expect(recent).not.toBeChecked();
  await panel.getByRole('button', { name: 'Reset to default' }).click();
  await expect(panel.getByRole('status')).toHaveText(
    'Back to the default order, not saved yet',
  );
  await expect(
    panel.getByRole('list').first().getByRole('listitem').first(),
  ).toHaveAccessibleName('To ship');
  await expect(recent).toBeChecked();

  const cleared = layoutWrite(page);
  await panel.getByRole('button', { name: 'Done' }).click();
  expect((await cleared).method()).toBe('DELETE');
  await expect(homeTiles(page).first()).toHaveAccessibleName(/^To ship, /);

  // A role whose default leads differently: Done with nothing changed
  // finds the client's default the server's, so it saves no layout.
  await confirmEmailInDatabase(freshOrg.email);
  const warehouse = await memberIn(owner, 'Warehouse', 'warehouse');
  await signInAs(page, warehouse);
  await page.goto('/');
  await page.getByRole('button', { name: 'Customise Home' }).click();
  const untouched = layoutWrite(page);
  await customising(page).getByRole('button', { name: 'Done' }).click();
  expect((await untouched).method()).toBe('DELETE');
});

test('leaving Customise Home with changes not saved asks first', async ({
  page,
  freshOrg,
}) => {
  await freshOrg.api.post('/v1/home/getting-started/dismiss');
  await signInAs(page, freshOrg.api);
  await page.goto('/');
  await page.getByRole('button', { name: 'Customise Home' }).click();
  await card(page, 'To receive').getByRole('button', { name: 'Up' }).click();

  const orders = page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Orders' });
  await orders.click();
  const dialog = page.getByRole('dialog', { name: 'Leave without saving?' });
  await expect(dialog).toContainText('Your changes to Home aren’t saved yet.');
  await dialog.getByRole('button', { name: 'Stay' }).click();
  await expect(
    customising(page).getByRole('list').first().getByRole('listitem').first(),
  ).toHaveAccessibleName('To receive');

  await orders.click();
  await page
    .getByRole('dialog', { name: 'Leave without saving?' })
    .getByRole('button', { name: 'Leave' })
    .click();
  await expect(page).toHaveURL(/\/orders$/);
  // Nothing was saved: Home is as it was.
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Home' })
    .click();
  await expect(homeTiles(page).first()).toHaveAccessibleName(/^To ship, /);
});

test('Recently opened switched off in Customise Home is neither shown nor read', async ({
  page,
  freshOrg,
}) => {
  await freshOrg.api.post('/v1/home/getting-started/dismiss');
  // Home's own read, its six rows; the search box reads five of its own.
  const reads: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/v1/recent?limit=6')) reads.push(request.url());
  });
  await signInAs(page, freshOrg.api);
  await page.goto('/');
  await expect.poll(() => reads.length).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Customise Home' }).click();
  await customising(page)
    .getByRole('switch', { name: 'Show Recently opened on Home' })
    .uncheck();
  const saved = layoutWrite(page);
  await customising(page).getByRole('button', { name: 'Done' }).click();
  expect((await saved).postDataJSON()).toMatchObject({ recent: false });

  reads.length = 0;
  await page.reload();
  await expect(homeTiles(page).first()).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Recently opened' }),
  ).toHaveCount(0);
  expect(reads).toEqual([]);
});

test.describe('Customise Home on a touch phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('its controls are 44 px each way, and Done stays in reach as the page scrolls', async ({
    page,
    freshOrg,
  }) => {
    await freshOrg.api.post('/v1/home/getting-started/dismiss');
    await signInAs(page, freshOrg.api);
    await page.goto('/');
    const open = page.getByRole('button', { name: 'Customise Home' });
    const openBox = await open.boundingBox();
    expect(openBox?.height).toBeGreaterThanOrEqual(44);
    await open.click();

    const panel = customising(page);
    const first = card(page, 'To ship');
    for (const target of [
      panel.getByRole('button', { name: 'Reset to default' }),
      panel.getByRole('button', { name: 'Done' }),
      first.getByRole('button', { name: 'Up' }),
      first.getByRole('button', { name: 'Down' }),
      first.getByRole('button', { name: 'Hide' }),
      card(page, 'Orders · Draft').getByRole('button', { name: 'Show' }),
      panel
        .locator('label')
        .filter({ hasText: 'Show Recently opened on Home' }),
    ]) {
      const box = await target.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }

    await panel
      .getByRole('region', { name: 'Hidden tiles' })
      .scrollIntoViewIfNeeded();
    await expect(panel.getByRole('button', { name: 'Done' })).toBeInViewport();
  });
});
