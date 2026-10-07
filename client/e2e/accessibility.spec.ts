import AxeBuilder from '@axe-core/playwright';
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

/** One row per screen: where it is, and what says it has loaded. */
interface Screen {
  name: string;
  path: (seed: Seed) => string;
  ready: (page: Page) => ReturnType<Page['getByRole']>;
}

interface Seed {
  orderId: string;
  productId: string;
}

const heading = (page: Page) => page.getByRole('heading', { level: 1 });

const SCREENS: Screen[] = [
  { name: 'inventory', path: () => '/inventory', ready: heading },
  { name: 'movements', path: () => '/movements', ready: heading },
  { name: 'orders', path: () => '/orders', ready: heading },
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
];

/**
 * Enough for each screen to draw what it draws when in use: a stock row
 * with a lot 20 days from expiry (a red chip), and an order with a line,
 * which opens in tabs beside its summary.
 */
async function seed(api: APIRequestContext): Promise<Seed> {
  const product = await createProduct(api, { tracksLots: true });
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
      // Fifteen screens and an axe pass each: longer than one flow.
      test.setTimeout(120_000);

      const data = await seed(freshOrg.api);
      await signInAs(page, freshOrg.api);

      const found: Record<string, string[]> = {};

      for (const screen of SCREENS) {
        await page.goto(screen.path(data));
        await expect(screen.ready(page).first()).toBeVisible();
        // Lists fill after their request; axe should see what a person does.
        await page.waitForLoadState('networkidle');

        const list = await violations(page);
        if (list.length > 0) found[screen.name] = list;
      }

      // All screens at once, so one run reports everything to fix.
      expect(found).toEqual({});
    });
  });
}
