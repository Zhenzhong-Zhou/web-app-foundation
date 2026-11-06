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
  // The date and the time, under the greeting's row.
  const now = page
    .getByRole('main')
    .locator('p')
    .filter({ hasText: /\d:\d\d/ })
    .first();
  await page.clock.pauseAt(new Date('2026-11-05T15:41:40Z'));
  const before = await now.textContent();
  expect(before).not.toMatch(/\d:\d\d:\d\d/);

  await page.clock.runFor(10_000);
  await expect(now).toHaveText(before ?? '');
  await page.clock.runFor(15_000);
  await expect(now).not.toHaveText(before ?? '');
});
