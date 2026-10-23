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
  roleIdNamed,
  signInAs,
  uniqueEmail,
} from './support/api';
import { verifyEmail } from './support/mail';
import { deploy } from './support/version';

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
  /** A new version out before the screen loads (ADR-081). */
  version?: 'newer' | 'urgent';
  /**
   * A page's chunk that will not load while version.json still names this
   * build: a real failure, so the crash page (ADR-081). Both are the static
   * host's files, never the API's.
   */
  broken?: string;
}

interface Seed {
  orderId: string;
  productId: string;
  /** A role made from the Warehouse template, held by nobody. */
  roleId: string;
  viewerId: string;
}

const heading = (page: Page) => page.getByRole('heading', { level: 1 });

/**
 * The entry the keyboard is on, in a menu or a list. MUI tints it, and on
 * that tint muted text falls below AA, so the theme draws it in the main
 * text colour there (#196); these rows let axe measure it.
 */
const keyboardOn = (page: Page) => page.locator('.Mui-focusVisible');

const joined = (page: Page) =>
  page.getByRole('menuitem', { name: /E2E Joiner joined/ });

const SCREENS: Screen[] = [
  { name: 'home', path: () => '/', ready: heading },
  {
    name: 'the bell’s menu, the keyboard on an entry',
    path: () => '/',
    open: async (page) => {
      await page.getByRole('button', { name: /^Notifications/ }).focus();
      await page.keyboard.press('Enter');
      await expect(joined(page)).toBeVisible();
      await page.keyboard.press('ArrowDown');
      await expect(joined(page)).toBeFocused();
    },
    ready: (page) => joined(page).and(keyboardOn(page)),
  },
  { name: 'inventory', path: () => '/inventory', ready: heading },
  {
    name: 'the lookup, the keyboard on a result',
    path: () => '/inventory',
    open: async (page) => {
      const box = page.getByRole('combobox', { name: 'Search everything' });
      await box.fill('A11Y-LOT');
      await expect(
        page.getByRole('option', { name: /A11Y-LOT-1/ }),
      ).toBeVisible();
      // The first result is highlighted already, though not by the
      // keyboard; down to Show all and back up puts the keyboard on it.
      await box.press('ArrowDown');
      await box.press('ArrowUp');
    },
    ready: (page) =>
      page.getByRole('option', { name: /A11Y-LOT-1/ }).and(keyboardOn(page)),
  },
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
    // The top bar's button and its note (ADR-081).
    name: 'a new version, its note open',
    version: 'newer',
    path: () => '/orders',
    open: async (page) => {
      await page
        .getByRole('button', { name: 'New version', exact: true })
        .click();
      // It grows in: axe measures its colours once it has.
      await expect(page.getByRole('dialog', { name: 'New version' })).toHaveCSS(
        'opacity',
        '1',
      );
    },
    ready: (page) => page.getByRole('dialog', { name: 'New version' }),
  },
  {
    name: 'a new version whose saves would be refused, the amber banner',
    version: 'urgent',
    path: () => '/orders',
    ready: (page) =>
      page.getByRole('status').filter({ hasText: 'can no longer save' }),
  },
  {
    name: 'the crash page',
    broken: '**/src/inventory/inventory-page.tsx*',
    path: () => '/inventory',
    ready: (page) =>
      page.getByRole('heading', { level: 1, name: 'Something went wrong' }),
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
  {
    // On the chosen zone: chosen and under the keyboard is the darkest of
    // MUI's tints (tokens.test.ts).
    name: 'the time zone’s list, the keyboard on the chosen zone',
    path: () => '/settings/organization',
    open: async (page) => {
      const zone = page.getByRole('combobox', { name: 'Time zone' });
      await zone.focus();
      // It opens with the chosen zone highlighted; down and back up puts
      // the keyboard on it.
      await zone.press('ArrowDown');
      await expect(page.getByRole('option', { selected: true })).toBeVisible();
      await zone.press('ArrowDown');
      await zone.press('ArrowUp');
    },
    ready: (page) =>
      page.getByRole('option', { selected: true }).and(keyboardOn(page)),
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
  { name: 'roles', path: () => '/settings/roles', ready: heading },
  {
    name: 'a made role',
    path: (seed) => `/settings/roles/${seed.roleId}`,
    ready: heading,
  },
  {
    name: 'a built-in role',
    path: (seed) => `/settings/roles/${seed.viewerId}`,
    ready: (page) => page.getByRole('note'),
  },
  {
    // From a template, so the summary and the boxes are drawn filled.
    name: 'the role editor',
    path: () => '/settings/roles/new',
    open: (page) => page.getByRole('radio', { name: /^Warehouse/ }).check(),
    ready: (page) =>
      page.getByRole('complementary', { name: 'What Warehouse can do' }),
  },
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
  // Someone who has joined, so the bell has an entry, with its time.
  const { token } = await inviteByLink(api, uniqueEmail('a11y-joined'));
  await (await joinByLink(token, 'E2E Joiner')).dispose();

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

  const catalogue = (await (await api.get('/v1/roles/catalogue')).json()) as {
    templates: { key: string; permissions: string[] }[];
  };
  const role = await created<{ id: string }>(
    await api.post('/v1/roles', {
      data: {
        name: 'Dock crew',
        description: 'Receives and ships, and keeps the shelves straight.',
        permissions: catalogue.templates.find(
          (each) => each.key === 'warehouse',
        )?.permissions,
      },
    }),
  );

  return {
    orderId: order.id,
    productId: product.id,
    roleId: role.id,
    viewerId: await roleIdNamed(api, 'Viewer'),
  };
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
        if (screen.version) {
          await deploy(page, { urgent: screen.version === 'urgent' });
        }
        if (screen.broken) {
          await page.route(screen.broken, (route) => route.abort('failed'));
        }
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
        if (screen.version) await page.unroute('**/version.json?*');
        if (screen.broken) await page.unroute(screen.broken);
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
