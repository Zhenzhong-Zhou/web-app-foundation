import AxeBuilder from '@axe-core/playwright';
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
import { verifyEmail } from './support/mail';

/**
 * WCAG 2.2 AA on the main screens, in both colour modes (ADR-055, step 6).
 *
 * axe finds what a machine can: contrast, names, roles, landmarks, labels.
 * It cannot say whether a page makes sense read aloud, or whether focus goes
 * somewhere sensible after a dialog closes; those stay in manual-checks.md.
 * What it can find, it finds on every run, so a token change that drops a
 * chip's text below 4.5:1 fails here rather than on someone's screen.
 *
 * A new screen gets a line in SCREENS. A violation is fixed, not excluded:
 * the rules are on by default, and none is turned off.
 */
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * One row per screen: where it is, what says it has loaded, and what to
 * open on it first, if anything.
 */
interface Screen {
  name: string;
  path: (seed: Seed) => string;
  ready: (page: Page) => ReturnType<Page['getByRole']>;
  open?: (page: Page) => Promise<void>;
}

interface Seed {
  orderId: string;
  productId: string;
}

const heading = (page: Page) => page.getByRole('heading', { level: 1 });

const SCREENS: Screen[] = [
  { name: 'home', path: () => '/', ready: heading },
  { name: 'inventory', path: () => '/inventory', ready: heading },
  { name: 'movements', path: () => '/movements', ready: heading },
  { name: 'orders', path: () => '/orders', ready: heading },
  {
    // Over the page, which still reads beside it (ADR-079).
    name: 'Help, open on Orders',
    path: () => '/orders',
    open: (page) =>
      page.getByRole('button', { name: 'Help', exact: true }).click(),
    ready: (page) =>
      page
        .getByRole('complementary', { name: 'Help', exact: true })
        .getByRole('heading', { level: 2, name: 'Orders', exact: true }),
  },
  {
    name: 'an order',
    path: (seed) => `/orders/${seed.orderId}`,
    ready: (page) => page.getByRole('tab', { name: 'Items' }),
  },
  {
    name: "an order's history",
    path: (seed) => `/orders/${seed.orderId}?tab=history`,
    ready: (page) => page.getByRole('tab', { name: 'History' }),
  },
  { name: 'invoices', path: () => '/invoices', ready: heading },
  { name: 'credit notes', path: () => '/credit-notes', ready: heading },
  { name: 'returns', path: () => '/return-authorizations', ready: heading },
  { name: 'production', path: () => '/production', ready: heading },
  { name: 'products', path: () => '/products', ready: heading },
  {
    name: 'a product',
    path: (seed) => `/products/${seed.productId}`,
    ready: heading,
  },
  { name: 'partners', path: () => '/partners', ready: heading },
  { name: 'locations', path: () => '/locations', ready: heading },
  { name: 'stock value', path: () => '/costs', ready: heading },
  { name: 'audit log', path: () => '/audit', ready: heading },
  { name: 'account', path: () => '/account', ready: heading },
  {
    name: 'organization',
    path: () => '/settings/organization',
    ready: heading,
  },
  { name: 'members', path: () => '/members', ready: heading },
  {
    name: 'the Invite dialog',
    path: () => '/members?invite',
    ready: (page) => page.getByRole('dialog'),
  },
  { name: 'tax codes', path: () => '/settings/tax-codes', ready: heading },
  {
    name: 'exchange rates',
    path: () => '/settings/exchange-rates',
    ready: heading,
  },
  { name: 'price lists', path: () => '/settings/price-lists', ready: heading },
];

/**
 * Enough for each screen to draw what it draws when in use: a stock row
 * with a lot 20 days from expiry (a red chip), and a confirmed order with a
 * line, which opens in tabs beside its summary, expected on a day that has
 * passed, so its subtitle runs on past the partner's link and Home's To
 * receive is tinted late.
 */
async function seed(api: APIRequestContext, ownerEmail: string): Promise<Seed> {
  // Someone on Members' Invited (ADR-077), which needs a verified inviter.
  await verifyEmail(api, ownerEmail);
  await inviteByLink(api, uniqueEmail('a11y'));

  const product = await createProduct(api, { tracksLots: true });
  // A weight, so the variant's chevron is drawn and axe checks that it is
  // named (ADR-075): without one, the product page has no chevron at all.
  const weighed = await api.patch(
    `/v1/products/${product.id}/variants/${product.variantId}`,
    { data: { weightGrams: 250 } },
  );
  expect(weighed.ok(), await weighed.text()).toBeTruthy();
  const location = await createLocation(api);
  const partner = await createPartner(api);

  await created(
    await api.post('/v1/stock/movements', {
      data: {
        variantId: product.variantId,
        toLocationId: location.id,
        quantity: '24',
        reason: 'receipt',
        lot: { code: 'A11Y-LOT-1', expiresAt: daysFromNow(20) },
      },
    }),
  );

  const { order } = await created<{ order: { id: string } }>(
    await api.post('/v1/orders', {
      data: {
        partnerId: partner.id,
        direction: 'purchase',
        expectedAt: daysFromNow(-3),
        lines: [
          {
            variantId: product.variantId,
            quantityOrdered: '40',
            unitPrice: '12.50',
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

  return { orderId: order.id, productId: product.id };
}

/** Every violation, one line each, so a failure reads as a list to fix. */
async function violations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return results.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.nodes
        .map((node) => node.target.join(' '))
        .join(' | ')}`,
  );
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`accessibility, ${colorScheme}`, () => {
    // The app follows the system until someone chooses (defaultMode
    // "system"), so emulating the system's scheme is choosing the mode.
    test.use({ colorScheme });

    test('the main screens meet WCAG 2.2 AA', async ({ page, freshOrg }) => {
      // Twenty screens and an axe pass each: longer than one flow.
      test.setTimeout(120_000);

      const data = await seed(freshOrg.api, freshOrg.email);
      await signInAs(page, freshOrg.api);

      const found: Record<string, string[]> = {};

      for (const screen of SCREENS) {
        await page.goto(screen.path(data));
        if (screen.open) {
          await expect(heading(page)).toBeVisible();
          await screen.open(page);
        }
        await expect(screen.ready(page).first()).toBeVisible();
        // Lists fill after their request; axe should see what a person does.
        await page.waitForLoadState('networkidle');

        const list = await violations(page);
        if (list.length > 0) found[screen.name] = list;
      }

      // All screens at once, so one run reports everything to fix.
      expect(found).toEqual({});
    });

    test('a newcomer’s Home, with their welcome, meets WCAG 2.2 AA', async ({
      page,
      freshOrg,
    }) => {
      // A Viewer with a note and colleagues to ask (ADR-079), the card's
      // fullest state; the founder's is the Home row above.
      await verifyEmail(freshOrg.api, freshOrg.email);
      const { token } = await inviteByLink(
        freshOrg.api,
        uniqueEmail('a11y-welcome'),
        'Viewer',
        { note: 'Bring boots.\nAsk for Li Na.' },
      );
      const newcomer = await joinByLink(token, 'E2E Newcomer');
      await signInAs(page, newcomer);
      await page.goto('/');
      await expect(
        page.getByRole('region', { name: /^Welcome to / }),
      ).toBeVisible();
      await page.waitForLoadState('networkidle');

      expect(await violations(page)).toEqual([]);
      await newcomer.dispose();
    });

    test('the invitation page meets WCAG 2.2 AA, signed out', async ({
      browser,
      freshOrg,
    }) => {
      await verifyEmail(freshOrg.api, freshOrg.email);
      const { token } = await inviteByLink(
        freshOrg.api,
        uniqueEmail('a11y-page'),
        'Viewer',
        { note: 'Bring boots.' },
      );
      // The newcomer's own browser, with no session (ADR-077).
      const context = await browser.newContext({
        colorScheme,
        storageState: { cookies: [], origins: [] },
      });
      const page = await context.newPage();
      await page.goto(`/invitation?token=${token}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForLoadState('networkidle');

      expect(await violations(page)).toEqual([]);
      await context.close();
    });
  });
}
