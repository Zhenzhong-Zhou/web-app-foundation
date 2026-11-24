import AxeBuilder from '@axe-core/playwright';
import type {
  APIRequestContext,
  Locator,
  Page,
  Request,
} from '@playwright/test';

import { expect, test } from './fixtures';
import {
  createCategory,
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
import { shownCards } from './support/customise-home';
import { dragByKeyboard } from './support/drag';
import { confirmEmailInDatabase } from './support/mail';
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
  /** The rail folded on this device, as a person may keep it. */
  folded?: boolean;
  /**
   * What this screen alone needs, beside the seed, so the other screens
   * draw as they did: its ids, as `Seed.more`.
   */
  more?: (api: APIRequestContext, seed: Seed) => Promise<More>;
}

/** What a screen's `more` added. */
interface More {
  productId?: string;
  orderId?: string;
}

interface Seed {
  orderId: string;
  productId: string;
  variantId: string;
  /** The product's lot, A11Y-LOT-1. */
  lotId: string;
  /** An item with nothing on hand, coming or needed, and no point. */
  bareProductId: string;
  /** Where the product's lot is. */
  locationId: string;
  /** Who the seed's purchase is from. */
  partnerId: string;
  /** A role made from the Warehouse template, held by nobody. */
  roleId: string;
  viewerId: string;
  /** What the screen's `more` added, if anything. */
  more: More;
}

const heading = (page: Page) => page.getByRole('heading', { level: 1 });

/** A laptop's window, which the rail's links outgrow. */
const LAPTOP = { width: 1280, height: 800 };

/** Whether the links fade into the rail's foot, as they do while more run on under it. */
const fades = (foot: Locator) =>
  foot.evaluate(
    (line) =>
      getComputedStyle(line.parentElement!, '::before').backgroundImage !==
      'none',
  );

const help = (page: Page) =>
  page.getByRole('complementary', { name: 'Help', exact: true });

/** WCAG's relative luminance of a colour as the browser computes it. */
function luminance(colour: string): number {
  const rgb = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(colour);
  if (!rgb) throw new Error(`Translucent, or not rgb(): ${colour}`);
  const [r, g, b] = rgb.slice(1).map((channel) => {
    const value = Number(channel) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Each rail's own colour in each mode, as the browser computes it: tokens.ts's
 * RAILS[rail][mode].bg, written out since no spec imports from src.
 */
const RAIL_GROUND = {
  dark: { light: 'rgb(28, 34, 48)', dark: 'rgb(16, 19, 24)' },
  light: { light: 'rgb(255, 255, 255)', dark: 'rgb(30, 35, 44)' },
} as const;

/**
 * The keyboard on a button of the rail's, and its ring at 3 : 1 or more
 * against what the ring is drawn on, as WCAG 2.2's 1.4.11 asks: the ring
 * stands off the button, so on the nearest box with a colour of its own,
 * the rail or the menu drawer (#246). axe does not measure a ring.
 *
 * Measured once that box is the chosen rail's own colour: the organization's
 * rail arrives with the session, and Linux WebKit once read the light rail's
 * ring on the dark rail's ground, the page still changing.
 */
async function expectRingOnRail(button: Locator, railGround: string) {
  await expect(button).toBeFocused();
  await expect(button).toHaveClass(/Mui-focusVisible/);
  const read = () =>
    button.evaluate((element) => {
      let box = element.parentElement;
      while (
        box &&
        getComputedStyle(box).backgroundColor === 'rgba(0, 0, 0, 0)'
      ) {
        box = box.parentElement;
      }
      return {
        style: getComputedStyle(element).outlineStyle,
        ring: getComputedStyle(element).outlineColor,
        ground: getComputedStyle(box ?? document.body).backgroundColor,
      };
    });
  await expect.poll(async () => (await read()).ground).toBe(railGround);
  const { style, ring, ground } = await read();
  expect(style).toBe('solid');
  const [light, dark] = [luminance(ring), luminance(ground)].sort(
    (x, y) => y - x,
  );
  expect(
    (light + 0.05) / (dark + 0.05),
    `${ring} on ${ground}`,
  ).toBeGreaterThanOrEqual(3);
}

/**
 * The screens before sign-in, the product's own (ADR-082): its mark and
 * name above, the © line below.
 */
const SIGNED_OUT: {
  name: string;
  path: string;
  title: string;
  /**
   * A page's module, served as one whose page throws as it draws: its code
   * broken in this build (#244). The screens before sign-in load with the
   * app, not split, so they cannot fail to load as `broken` makes a
   * signed-in page's chunk do: the whole app would not start.
   */
  broken?: { module: string; page: string };
}[] = [
  { name: 'sign-in', path: '/login', title: 'Sign in' },
  {
    name: 'a status page, signed out',
    path: '/no-such-page',
    title: 'Page not found',
  },
  {
    name: 'the crash page before sign-in',
    path: '/login',
    title: 'Something went wrong',
    broken: { module: '**/src/auth/login-page.tsx*', page: 'LoginPage' },
  },
];

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
  {
    // The bar's bell at a phone's width, its word above an unread count:
    // its name holds the words it shows, in order (WCAG 2.5.3).
    name: 'home at 390 px, the bell with an unread notice',
    path: () => '/',
    open: (page) => page.setViewportSize({ width: 390, height: 844 }),
    ready: (page) =>
      page.getByRole('button', { name: /^Notifications, \d+ unread$/ }),
  },
  {
    // Getting started dismissed, so Home has its main action and More.
    name: 'Home’s More menu, the keyboard on an entry',
    path: () => '/',
    open: async (page) => {
      await page
        .getByRole('region', { name: 'Getting started' })
        .getByRole('button', { name: 'Dismiss' })
        .click();
      // Tabbed to from the main action, as a keyboard user reaches it.
      // Firefox rings an element focused by script only if focus last
      // moved by the keyboard, and a key that moves nothing, the Enter
      // here, does not count: focused by script after the click on
      // Dismiss, More and then the item MUI focuses had no ring.
      const more = page.getByRole('button', { name: 'More', exact: true });
      await expect(more).toBeVisible();
      await page
        .getByRole('link', { name: 'Raise an order', exact: true })
        .focus();
      await page.keyboard.press('Tab');
      await expect(more).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('menu', { name: 'More' })).toBeVisible();
    },
    ready: (page) =>
      page.getByRole('menu', { name: 'More' }).locator('.Mui-focusVisible'),
  },
  {
    // Customise Home, a tile moved by the keyboard (ADR-091, amended
    // November 2026): tabbed to its handle, Space, an arrow, Space, so each
    // engine drags by the keyboard and the dropped tile keeps the keyboard.
    name: 'Customise Home, a tile moved by the keyboard',
    path: () => '/',
    open: async (page) => {
      await page.getByRole('button', { name: 'Customise Home' }).click();
      const panel = page.getByRole('region', { name: 'Customise Home' });
      const tiles = shownCards(panel);
      await expect(tiles.first()).toHaveAccessibleName('To ship');
      await tiles.first().getByRole('button', { name: 'Hide' }).focus();
      await page.keyboard.press('Tab');
      const handle = panel.getByRole('button', {
        name: 'Drag To receive',
        exact: true,
      });
      await expect(handle).toBeFocused();
      await dragByKeyboard(page, handle, ['ArrowLeft']);
      await expect(tiles.first()).toHaveAccessibleName('To receive');
      await expect(handle).toBeFocused();
    },
    ready: (page) =>
      page.getByRole('button', { name: 'Drag To receive', exact: true }),
  },
  { name: 'inventory', path: () => '/inventory', ready: heading },
  // The Lot view (ADR-093, R4).
  {
    name: 'inventory, by lot',
    path: () => '/inventory?group=lot',
    ready: heading,
  },
  {
    // A row opened to its place, the place to its lot: the opening
    // button open, in the accent, and the rows it opened (ADR-093, R2).
    name: 'inventory, a row opened to its places and lots',
    path: () => '/inventory',
    open: async (page) => {
      await page.getByRole('button', { name: /^1 place: show where / }).click();
      await page
        .getByRole('button', { name: /^1 lot: show the lots at / })
        .click();
    },
    ready: (page) => page.getByRole('link', { name: 'A11Y-LOT-1' }),
  },
  {
    // An item still to come on the seed's purchase: Receive stock… asks
    // which delivery it is, its one order chosen (ADR-093, v3).
    name: 'inventory, Receive stock… asking which delivery it is',
    path: () => '/inventory',
    open: async (page) => {
      await page
        .getByRole('button', { name: /^Actions for E2E Widget / })
        .first()
        .click();
      await page.getByRole('menuitem', { name: 'Receive stock…' }).click();
    },
    ready: (page) =>
      page.getByRole('radiogroup', { name: 'Which delivery is this?' }),
  },
  {
    // One place chosen: each header "here", the line saying Free and Held
    // count every place (ADR-093, 20a).
    name: 'inventory, one place chosen',
    path: (seed) => `/inventory?locationId=${seed.locationId}`,
    ready: (page) => page.getByRole('columnheader', { name: 'On hand here' }),
  },
  {
    // Out in the Lot view: its empty state, with Group by Item (31a).
    name: 'inventory, by lot with Out on',
    path: () => '/inventory?group=lot&out=1',
    ready: (page) => page.getByText('Items that are out have no lots.'),
  },
  {
    // A low row opened and chosen: its four boxes and the floating bar
    // (ADR-085).
    name: 'reorder points, a row opened and chosen',
    path: () => '/inventory?tab=reorder',
    open: async (page) => {
      await page.getByRole('button', { name: /^Who waits · .+ for / }).click();
      await page
        .getByRole('checkbox', { name: /^Choose / })
        .first()
        .check();
      await expect(
        page.getByRole('region', { name: 'Chosen to order' }),
      ).toBeVisible();
    },
    ready: (page) => page.getByText('+ Coming', { exact: true }),
  },
  {
    // Edit from a row's menu: the rule's cards and Today (ADR-085).
    name: 'reorder points, the Edit dialog',
    path: () => '/inventory?tab=reorder',
    open: async (page) => {
      await page
        .getByRole('button', { name: /^Actions for / })
        .first()
        .click();
      await page.getByRole('menuitem', { name: 'Edit reorder point' }).click();
    },
    ready: (page) =>
      page.getByRole('dialog').getByText(/^Below .* now, so it would suggest/),
  },
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
  {
    // One item over a range: In, Out and Balance, and the period line
    // above them (ADR-093, R21, R34).
    name: 'movements, one item with a date range',
    path: (seed) =>
      `/movements?variantId=${seed.variantId}&from=${daysFromNow(-30)}`,
    ready: (page) => page.getByText(/^Opening, /),
  },
  {
    // An order's way in: its chip, nothing received on it yet (R24).
    name: 'movements, one order, its chip',
    path: (seed) => `/movements?orderId=${seed.orderId}`,
    ready: (page) => page.getByText(/^No movements match: PO-/),
  },
  {
    // A lot's trace, each place by its whole path (#639).
    name: 'a lot',
    path: (seed) => `/lots/${seed.lotId}`,
    ready: (page) => page.getByText('Where it is now'),
  },
  {
    // Move to another lot (ADR-094, R20), from the lot's Actions.
    name: 'inventory, Move to another lot…',
    path: () => '/inventory',
    open: async (page) => {
      await page.getByRole('button', { name: /^1 place: show where / }).click();
      await page
        .getByRole('button', { name: /^1 lot: show the lots at / })
        .click();
      await page
        .getByRole('button', { name: /^Actions for lot A11Y-LOT-1 at / })
        .click();
      await page
        .getByRole('menuitem', { name: 'Move to another lot…', exact: true })
        .click();
    },
    ready: (page) =>
      page
        .getByRole('dialog', { name: 'Move to another lot' })
        .getByRole('textbox', { name: 'Note' }),
  },
  {
    // A new lot whose code is made for us (ADR-094, R3): Supplier's lot
    // shown, Expires on Not known yet.
    name: 'inventory, Receive stock, Make a code for us',
    path: () => '/inventory',
    open: async (page) => {
      await page
        .getByRole('button', { name: /^Actions for E2E Widget / })
        .first()
        .click();
      await page.getByRole('menuitem', { name: 'Receive stock…' }).click();
      const dialog = page.getByRole('dialog', { name: 'Receive stock' });
      await dialog.getByRole('radio', { name: 'Not on an order' }).check();
      await dialog.getByRole('button', { name: 'Continue' }).click();
      await dialog.getByRole('button', { name: 'Make a code for us' }).click();
    },
    ready: (page) =>
      page
        .getByRole('dialog', { name: 'Receive stock' })
        .getByRole('textbox', { name: 'Supplier’s lot' }),
  },
  {
    // Edit lot details for a code made here (ADR-094, R5, R7): its code
    // open to correct, Supplier's lot to add, Expires' three choices.
    name: 'inventory, Edit lot details…, a code made here',
    path: () => '/inventory?group=lot',
    more: async (api, seed) => {
      await madeLot(api, seed);
      return {};
    },
    open: async (page) => {
      await page.getByRole('button', { name: /^Actions for lot L-/ }).click();
      await page
        .getByRole('menuitem', { name: 'Edit lot details…', exact: true })
        .click();
    },
    ready: (page) =>
      page
        .getByRole('dialog', { name: /^Lot L-/ })
        .getByRole('radiogroup', { name: 'Expires' }),
  },
  {
    // Found stock (#628): Correct the count with a place and Which lot,
    // neither chosen.
    name: 'inventory, Count it in…',
    path: () => '/inventory',
    open: async (page) => {
      await page.getByRole('button', { name: /^1 place: show where / }).click();
      await page.getByRole('button', { name: /^Count it in .+…$/ }).click();
    },
    ready: (page) =>
      page
        .getByRole('dialog', { name: 'Correct the count' })
        .getByRole('radiogroup', { name: 'Which lot' }),
  },
  { name: 'orders', path: () => '/orders', ready: heading },
  {
    // Beside the page at this run's 1280 px, the page keeping its room
    // (ADR-079; ADR-091).
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
    // Its foot names the product, and the © line follows (ADR-082).
    name: 'Help’s foot',
    path: () => '/orders',
    open: async (page) => {
      await page.getByRole('button', { name: 'Help', exact: true }).click();
      await help(page)
        .getByText(/ · Version /)
        .scrollIntoViewIfNeeded();
    },
    ready: (page) => help(page).getByText(/ · Version /),
  },
  {
    // A modal side sheet over the dimmed page, where the window leaves it
    // less than 720 px beside Help (ADR-091, #272).
    name: 'Help as a sheet, at 1024 × 768',
    path: () => '/orders',
    open: async (page) => {
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.getByRole('button', { name: 'Help', exact: true }).click();
    },
    ready: (page) =>
      page
        .getByRole('dialog', { name: 'Help · Orders', exact: true })
        .getByRole('heading', { level: 2, name: 'Orders', exact: true }),
  },
  {
    // A MacBook's window, 1440 × 900: every link above the rail's foot,
    // with nothing fading into it, under the build's own name too, as CI
    // has it, which takes the foot to two lines. At a laptop's 1280 × 800
    // the foot is pinned in view without scrolling the rail, and the links
    // run on under it, fading into it, until the rail is scrolled to their
    // end (ADR-082).
    name: 'the rail at 1440 × 900, every link above its foot',
    path: () => '/orders',
    open: async (page) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      const foot = page.getByText(/^Powered by /);
      const last = page
        .getByRole('navigation', { name: 'Settings' })
        .getByRole('link')
        .last();
      await expect(last).toBeInViewport({ ratio: 1 });
      const [link, line] = await Promise.all([
        last.boundingBox(),
        foot.boundingBox(),
      ]);
      expect(link!.y + link!.height).toBeLessThanOrEqual(line!.y);
      await expect.poll(() => fades(foot)).toBe(false);

      await page.setViewportSize(LAPTOP);
      await expect(foot).toBeInViewport({ ratio: 1 });
      await expect.poll(() => fades(foot)).toBe(true);
      await last.scrollIntoViewIfNeeded();
      await expect.poll(() => fades(foot)).toBe(false);
    },
    ready: (page) => page.getByText(/^Powered by /),
  },
  {
    // Its top the organization's plate, initials on the accent with no
    // logo, and the product's mark at its foot, pinned in view at a
    // laptop's height, named in a tooltip (ADR-082).
    name: 'the rail folded, its initials plate and its foot’s tooltip',
    folded: true,
    path: () => '/orders',
    open: async (page) => {
      await page.setViewportSize(LAPTOP);
      const mark = page.getByRole('img', { name: /^Powered by / });
      await expect(mark).toBeInViewport({ ratio: 1 });
      await mark.hover();
    },
    ready: (page) => page.getByRole('tooltip', { name: /^Powered by / }),
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
  {
    // A purchase's receipts, none yet, and All movements of PO-… (R25).
    name: "an order's receipts",
    path: (seed) => `/orders/${seed.orderId}?tab=receipts`,
    ready: (page) =>
      page.getByText('Nothing has been received on this order yet.'),
  },
  {
    // Ship a lot whose expiry is to add (ADR-094, D2): the amber line
    // naming it, measured in both modes.
    name: 'an order, Ship with a lot whose expiry is to add',
    path: (seed) => `/orders/${seed.more.orderId}`,
    more: async (api, seed) => {
      const oil = await createProduct(api, {
        name: 'E2E Made Oil',
        tracksLots: true,
      });
      await madeLot(api, seed, oil.variantId);
      const { order } = await created<{ order: { id: string } }>(
        await api.post('/v1/orders', {
          data: {
            partnerId: seed.partnerId,
            direction: 'sale',
            lines: [
              {
                variantId: oil.variantId,
                quantityOrdered: '2',
                unitPrice: '9.50',
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
      return { orderId: order.id };
    },
    open: async (page) => {
      await page.getByRole('button', { name: 'Ship', exact: true }).click();
      await page.getByRole('dialog').getByLabel('Ship from').click();
      await page.getByRole('option').first().click();
    },
    ready: (page) =>
      page.getByRole('dialog').getByText(/expiry has not been entered\./),
  },
  { name: 'invoices', path: () => '/invoices', ready: heading },
  { name: 'credit notes', path: () => '/credit-notes', ready: heading },
  { name: 'returns', path: () => '/return-authorizations', ready: heading },
  { name: 'production', path: () => '/production', ready: heading },
  { name: 'items', path: () => '/items', ready: heading },
  {
    name: 'items, a row ticked and the bar over it',
    path: () => '/items',
    open: async (page) => {
      // The first of its two items, the bare one among them.
      await page
        .getByRole('checkbox', { name: /^Select (?!every)/ })
        .first()
        .check();
    },
    ready: (page) => page.getByRole('region', { name: 'Selected items' }),
  },
  {
    name: 'items, Set category',
    path: () => '/items',
    open: async (page) => {
      // The first of its two items, the bare one among them.
      await page
        .getByRole('checkbox', { name: /^Select (?!every)/ })
        .first()
        .check();
      await page.getByRole('button', { name: 'Set category' }).click();
    },
    ready: (page) =>
      page.getByRole('dialog', { name: 'Set the category of 1 item' }),
  },
  {
    name: 'items, Add item',
    path: () => '/items',
    open: (page) =>
      page.getByRole('button', { name: 'Add item', exact: true }).click(),
    ready: (page) => page.getByRole('dialog', { name: 'Add an item' }),
  },
  {
    name: 'items at 390 px, the filters and sort in their sheet',
    path: () => '/items',
    open: async (page) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole('button', { name: 'Filters' }).click();
    },
    ready: (page) => page.getByRole('heading', { name: 'Filters and sort' }),
  },
  {
    name: 'an item',
    path: (seed) => `/items/${seed.productId}`,
    ready: heading,
  },
  {
    // At a phone's width its variants table is cut, and scrolls: the
    // keyboard reaches it (axe's scrollable-region-focusable).
    name: 'an item at 390 px, its variants table',
    path: (seed) => `/items/${seed.productId}`,
    open: (page) => page.setViewportSize({ width: 390, height: 844 }),
    ready: (page) => page.getByRole('region', { name: /Variants/ }),
  },
  {
    // None on hand and no reorder point: the next step (ADR-093's states).
    name: 'an item with none on hand, Where it stands',
    path: (seed) => `/items/${seed.bareProductId}`,
    ready: (page) => page.getByRole('button', { name: 'Set a reorder point' }),
  },
  {
    // Start tracking lots (ADR-094, R14) for a code with stock, a day
    // already past chosen: the amber line that it will read as expired.
    name: 'an item, Start tracking lots… with a day already past',
    path: (seed) => `/items/${seed.more.productId}`,
    more: async (api, seed) => {
      const tea = await createProduct(api, { name: 'E2E Loose Tea' });
      await receive(api, seed, tea.variantId, '10');
      return { productId: tea.id };
    },
    open: async (page) => {
      // The Variants table's, one of the item's page's two doors. A click
      // that opens no dialog, as Firefox on CI showed (#685), is tried
      // again until the dialog is open.
      const door = page
        .getByRole('region', { name: /Variants/ })
        .getByRole('button', { name: /^Start tracking lots for .+…$/ });
      const dialog = page.getByRole('dialog', {
        name: /^Start tracking lots for /,
      });
      await expect(async () => {
        if (!(await dialog.isVisible())) await door.click();
        await expect(dialog).toBeVisible({ timeout: 2_000 });
      }).toPass();
      await dialog.getByRole('radio', { name: 'On a date' }).check();
      await dialog
        .getByRole('textbox', { name: 'The day it expires' })
        .fill(daysFromNow(-10));
    },
    ready: (page) =>
      page
        .getByRole('dialog', { name: /^Start tracking lots for / })
        .getByText(/^That day has passed: /),
  },
  {
    name: 'an item, Edit',
    path: (seed) => `/items/${seed.productId}`,
    // The item's Edit item, in its header, named apart from a variant's.
    open: (page) => page.getByRole('button', { name: 'Edit item' }).click(),
    ready: (page) => page.getByRole('dialog', { name: 'Edit the item' }),
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
  {
    // The two logos' rows side by side on a computer, and the line under
    // the square logo naming the initials the folded plate shows, in the
    // plate's colours (ADR-060, amended).
    name: 'Branding, the two logos side by side',
    path: () => '/settings/organization?tab=branding',
    open: async (page) => {
      const [logo, square] = await Promise.all([
        page.getByRole('group', { name: 'Logo', exact: true }).boundingBox(),
        page.getByRole('group', { name: 'Square logo' }).boundingBox(),
      ]);
      expect(square!.x).toBeGreaterThanOrEqual(logo!.x + logo!.width);
      expect(square!.y).toBeCloseTo(logo!.y, 0);
    },
    ready: (page) =>
      page
        .getByRole('group', { name: 'Square logo' })
        .getByText(/^Without one, the initials \S+ show there\.$/),
  },
  {
    // The room line's amber (ADR-094, S5): a 16-character prefix that
    // never starts again leaves room for 9,999 codes in all, too few.
    name: 'Organization › Documents, Lot codes with little room, its amber line',
    path: () => '/settings/organization?tab=documents',
    open: async (page) => {
      const row = page.getByRole('row', { name: /^Lot codes/ });
      await row
        .getByRole('combobox', { name: 'Lot codes: Starts again' })
        .click();
      await page.getByRole('option', { name: 'Never', exact: true }).click();
      await row
        .getByRole('textbox', { name: 'Lot codes: Prefix' })
        .fill('ABCDEFGHIJKLMNO-');
      // Typing scrolled the section's heading, and its Learn more, under
      // the top bar, which axe reads as a target too small; the section
      // whole below the bar, as a person reads it, its amber line in view.
      await page
        .getByRole('heading', { level: 2, name: 'Numbering' })
        .evaluate((heading) => {
          heading.scrollIntoView({ block: 'start' });
          window.scrollBy(0, -96);
        });
    },
    ready: (page) =>
      page.getByText('Room for 9,999 codes in all within 20 characters', {
        exact: true,
      }),
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
  { name: 'categories', path: () => '/settings/categories', ready: heading },
  {
    name: 'categories, a delete refused at its row',
    path: () => '/settings/categories',
    open: async (page) => {
      await page.getByRole('button', { name: 'Actions for Vitamins' }).click();
      await page.getByRole('menuitem', { name: 'Delete' }).click();
    },
    ready: (page) => page.getByRole('alert').filter({ hasText: 'still holds' }),
  },
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
  // Someone on Members' Invited (ADR-077), which needs a confirmed inviter,
  // confirmed in the database: no email waited for in setup (#248).
  await confirmEmailInDatabase(ownerEmail);
  await inviteByLink(api, uniqueEmail('a11y'));
  // Someone who has joined, so the bell has an entry, with its time.
  const { token } = await inviteByLink(api, uniqueEmail('a11y-joined'));
  await (await joinByLink(token, 'E2E Joiner')).dispose();

  // In a category, so Items' rows show its path and Settings › Categories
  // has one that holds an item (ADR-092).
  const product = await createProduct(api, {
    tracksLots: true,
    categoryId: await createCategory(api, 'Vitamins'),
  });
  // A weight, so the variant's chevron is drawn and axe checks that it is
  // named (ADR-075): without one, the product page has no chevron at all.
  const weighed = await api.patch(
    `/v1/products/${product.id}/variants/${product.variantId}`,
    { data: { weightGrams: 250 } },
  );
  expect(weighed.ok(), await weighed.text()).toBeTruthy();
  const location = await createLocation(api);
  const partner = await createPartner(api);

  const { movement } = await created<{ movement: { lotId: string } }>(
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

  // Low: 24 on the shelf and 40 coming, under a point of 100 (ADR-085).
  const pointed = await api.post(
    `/v1/stock/reorder-points/${product.variantId}`,
    {
      data: {
        source: 'bought',
        reorderPoint: '100',
        rule: 'fixed',
        fixedQuantity: '48',
      },
    },
  );
  expect(pointed.ok(), await pointed.text()).toBeTruthy();

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

  const bare = await createProduct(api, { name: 'E2E Bare Widget' });

  return {
    orderId: order.id,
    productId: product.id,
    variantId: product.variantId,
    lotId: movement.lotId,
    bareProductId: bare.id,
    locationId: location.id,
    partnerId: partner.id,
    roleId: role.id,
    viewerId: await roleIdNamed(api, 'Viewer'),
    more: {},
  };
}

/** Received into the seed's place with no order, as opening stock. */
async function receive(
  api: APIRequestContext,
  seed: Seed,
  variantId: string,
  quantity: string,
  lot?: { makeCode: true; expiry: 'unknown' },
): Promise<void> {
  await created(
    await api.post('/v1/stock/movements', {
      data: {
        variantId,
        toLocationId: seed.locationId,
        quantity,
        reason: 'receipt',
        reasonDetail: 'opening',
        lot,
      },
    }),
  );
}

/**
 * A lot made here with nothing known yet, no supplier's lot and its
 * expiry to add (ADR-094, R5, R9): of the seed's item, or of a new one.
 */
async function madeLot(
  api: APIRequestContext,
  seed: Seed,
  variantId = seed.variantId,
): Promise<void> {
  await receive(api, seed, variantId, '6', {
    makeCode: true,
    expiry: 'unknown',
  });
}

/** A page's requests in flight, and when the last one began or ended. */
interface Traffic {
  open: Set<Request>;
  last: number;
}

const traffic = new WeakMap<Page, Traffic>();

/** As Playwright's networkidle: no request open for half a second. */
const QUIET_MS = 500;

/** Counts a page's requests; called before the page first navigates. */
function watch(page: Page): void {
  const seen: Traffic = { open: new Set(), last: Date.now() };
  const ended = (request: Request) => {
    seen.open.delete(request);
    seen.last = Date.now();
  };
  page.on('request', (request) => {
    seen.open.add(request);
    seen.last = Date.now();
  });
  page.on('requestfinished', ended);
  page.on('requestfailed', ended);
  traffic.set(page, seen);
}

// Every test's own page; a page a test opens itself is watched there.
test.beforeEach(({ page }) => watch(page));

/** Every violation, one line each, so a failure reads as a list to fix. */
async function violations(page: Page): Promise<string[]> {
  // The screen loaded first, so axe sees what a person does (#445).
  // networkidle fires once per page, at its first quiet half-second: on a
  // slow runner that came while React drew the shell, before the screen
  // asked for its lists, so waiting for it returned at once, and axe
  // measured Inventory's Refresh and Receive stock as the lists arrived
  // and enabled them. Quiet is counted here instead, from now.
  const seen = traffic.get(page);
  if (!seen) throw new Error('watch(page) before it navigates (#445)');
  await expect
    .poll(() => !seen.open.size && Date.now() - seen.last >= QUIET_MS, {
      message: 'no request open for half a second before axe',
    })
    .toBe(true);
  // Then two frames (#232). Less motion shortens a transition to 0.01ms
  // but still starts it, and Linux WebKit reports its first colours until
  // a frame has run: axe, which reads the styles at once, measured a
  // button just enabled after its list loaded in its disabled grey.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return results.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.nodes
        .map((node) => node.target.join(' '))
        .join(' | ')}`,
  );
}

// Less motion, as a person may ask for (ADR-075): transitions end at once,
// so axe measures a dialog or a menu once it has appeared, never halfway.
test.use({ reducedMotion: 'reduce' });

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`accessibility, ${colorScheme}`, () => {
    // The app follows the system until someone chooses (defaultMode
    // "system"), so emulating the system's scheme is choosing the mode.
    test.use({ colorScheme });

    // Each screen its own test, so a slow screen or browser times out only
    // itself, and a retry reruns one screen; the report still lists every
    // screen to fix in one run.
    test.describe('the main screens meet WCAG 2.2 AA', () => {
      for (const screen of SCREENS) {
        test(screen.name, async ({ page, freshOrg }) => {
          // A seed, a screen and an axe pass: longer than one flow.
          test.setTimeout(60_000);

          const seeded = await seed(freshOrg.api, freshOrg.email);
          const data = {
            ...seeded,
            more: (await screen.more?.(freshOrg.api, seeded)) ?? {},
          };
          await signInAs(page, freshOrg.api);

          if (screen.version) {
            await deploy(page, { urgent: screen.version === 'urgent' });
          }
          if (screen.broken) {
            await page.route(screen.broken, (route) => route.abort('failed'));
          }
          if (screen.folded) {
            await page.addInitScript(() =>
              localStorage.setItem('nav.folded', 'true'),
            );
          }
          await page.goto(screen.path(data));
          if (screen.open) {
            await expect(heading(page)).toBeVisible();
            await screen.open(page);
          }
          await expect(screen.ready(page).first()).toBeVisible();

          const list = await violations(page);
          if (screen.version) await page.unroute('**/version.json?*');
          if (screen.broken) await page.unroute(screen.broken);
          expect(list).toEqual([]);
        });
      }
    });

    // The rail's own buttons, tabbed to as a keyboard user reaches them, on
    // each shade of the rail (ADR-060): the theme's ring, the accent, was
    // 2.24 : 1 on the dark rail, and they take the rail's own (#246).
    test.describe('the rail’s buttons have a ring at 3 : 1 on it', () => {
      for (const rail of ['dark', 'light'] as const) {
        test(`the ${rail} rail`, async ({ page, freshOrg }) => {
          const branded = await freshOrg.api.patch('/v1/organization', {
            data: { rail },
          });
          expect(branded.ok(), await branded.text()).toBeTruthy();
          await signInAs(page, freshOrg.api);
          await page.goto('/orders');
          await expect(heading(page)).toBeVisible();
          // The session read and its rail drawn before anything is measured.
          await page.waitForLoadState('networkidle');

          // The fold button, next after the organization's link.
          await page
            .getByRole('link', { name: freshOrg.organizationName, exact: true })
            .focus();
          await page.keyboard.press('Tab');
          await expectRingOnRail(
            page.getByRole('button', {
              name: 'Collapse navigation',
              exact: true,
            }),
            RAIL_GROUND[rail][colorScheme],
          );

          // Below 1200 px, the menu drawer's Close, its first stop.
          await page.setViewportSize({ width: 1024, height: 768 });
          await page.getByRole('button', { name: 'Menu', exact: true }).focus();
          await page.keyboard.press('Enter');
          const close = page.getByRole('button', {
            name: 'Close navigation',
            exact: true,
          });
          await expect(close).toBeVisible();
          await page.keyboard.press('Tab');
          await expectRingOnRail(close, RAIL_GROUND[rail][colorScheme]);
        });
      }
    });

    test.describe('the screens before sign-in meet WCAG 2.2 AA', () => {
      test.use({ storageState: { cookies: [], origins: [] } });

      for (const screen of SIGNED_OUT) {
        test(screen.name, async ({ page }) => {
          const { broken } = screen;
          if (broken) {
            await page.route(broken.module, (route) =>
              route.fulfill({
                contentType: 'text/javascript',
                body: `export function ${broken.page}() { throw new Error('${broken.page} broken in this build'); }`,
              }),
            );
          }
          await page.goto(screen.path);
          await expect(
            page.getByRole('heading', { level: 1, name: screen.title }),
          ).toBeVisible();
          // The © line the e2e server is built with (playwright.config.ts).
          await expect(page.getByRole('contentinfo')).toBeVisible();

          expect(await violations(page)).toEqual([]);
        });
      }
    });

    test('a newcomer’s Home, with their welcome, meets WCAG 2.2 AA', async ({
      page,
      freshOrg,
    }) => {
      // A Viewer with a note and colleagues to ask (ADR-079), the card's
      // fullest state; the founder's is the Home row above.
      await confirmEmailInDatabase(freshOrg.email);
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

      expect(await violations(page)).toEqual([]);
      await newcomer.dispose();
    });

    test('an order with a voided shipment meets WCAG 2.2 AA', async ({
      page,
      freshOrg,
    }) => {
      // What it carried stays listed, struck through, for the slip someone
      // may hold (ADR-041); faded, its text fell below 4.5 : 1 (#214).
      const { api } = freshOrg;
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
            lot: { code: 'A11Y-VOID-1', expiresAt: daysFromNow(200) },
          },
        }),
      );
      const { order } = await created<{
        order: { id: string; lines: { id: string }[] };
      }>(
        await api.post('/v1/orders', {
          data: {
            partnerId: partner.id,
            direction: 'sale',
            lines: [
              {
                variantId: product.variantId,
                quantityOrdered: '10',
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
      const { shipment } = await created<{ shipment: { id: string } }>(
        await api.post(`/v1/orders/${order.id}/shipments`, {
          data: {
            fromLocationId: location.id,
            lines: [{ lineId: order.lines[0].id, quantity: '6' }],
          },
        }),
      );
      const voided = await api.post(
        `/v1/orders/${order.id}/shipments/${shipment.id}/void`,
        { data: { reason: 'Packed the wrong box' } },
      );
      expect(voided.ok(), await voided.text()).toBeTruthy();

      await signInAs(page, api);
      await page.goto(`/orders/${order.id}?tab=shipments`);
      await expect(page.getByText(/Packed the wrong box/)).toBeVisible();
      await expect(
        page.getByRole('link', { name: 'A11Y-VOID-1' }),
      ).toBeVisible();

      expect(await violations(page)).toEqual([]);
    });

    test('the invitation page meets WCAG 2.2 AA, signed out', async ({
      browser,
      freshOrg,
    }) => {
      await confirmEmailInDatabase(freshOrg.email);
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
      watch(page);
      await page.goto(`/invitation?token=${token}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      expect(await violations(page)).toEqual([]);
      await context.close();
    });
  });
}
