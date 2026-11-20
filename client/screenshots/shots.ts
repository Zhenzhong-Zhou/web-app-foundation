import { expect, type Locator, type Page } from '@playwright/test';

import type { Targets } from './targets';

export type Width =
  | 'wide'
  | 'desktop'
  | 'laptop'
  | 'tablet'
  | 'duo-open'
  | 'duo-closed'
  | 'phone'
  // The page frame's two extra sizes, taken only with FRAME_SIZES=1.
  | 'laptop-1366'
  | 'wide-2560';

/** A message in the language being pictured, by its catalogue id. */
export type Words = (id: string) => string;

export interface Shot {
  /** The start of the file name, numbered by how much the page matters. */
  name: string;
  /**
   * Where the page is, in the language pictured, or null when this demo
   * has no such record.
   */
  path: (targets: Targets, language: string) => string | null;
  /** Every width class's size but the laptop's, unless listed. */
  widths?: Width[];
  /** Before the picture: open a dialog, choose a filter. */
  prepare?: (page: Page, words: Words) => Promise<void>;
  /** The window only, not the whole page: a dialog, the top bar. */
  windowOnly?: boolean;
  /**
   * The browser's clock fixed at this moment, for a page that shows the
   * date, the time or a greeting, so its picture is the same on any day.
   */
  clock?: Date;
  /** Signed out, for the sign-in page. */
  signedOut?: boolean;
  /** Signed in as the account in no organization, for its Home. */
  noOrganization?: boolean;
  /**
   * As a deployment where accounts start from an invitation, as production
   * is (ADR-078): the pictures' API is open, as development is.
   */
  byInvitation?: boolean;
}

function at(id: string | null, path: (id: string) => string): string | null {
  return id === null ? null : path(id);
}

/**
 * A quick filter on the filter row (ADR-055), by its words: a button, so a
 * click, then a wait for the list the filter asked for. Its count, when it
 * has one, is part of the button's name, so the match is not exact.
 */
async function press(page: Page, filter: string) {
  // Wait for the list's answer, not for the network to go quiet:
  // Playwright's "network idle" counts only the first page load, so after a
  // filter it passed at once and the picture caught the list still loading.
  const answered = page.waitForResponse((response) =>
    response.url().includes('/api/v1/'),
  );
  await page.getByRole('button', { name: filter }).first().click();
  await answered;
}

/**
 * A list page's own table, by its name in the language pictured, and the
 * box the shared table draws round it: a region once it scrolls sideways.
 */
function listTable(page: Page, name: string): { table: Locator; box: Locator } {
  const table = page.getByRole('table', { name, exact: true });
  return { table, box: table.locator('xpath=..') };
}

/** Home's date, time and greeting: three in the afternoon in Vancouver. */
const HOME_CLOCK = new Date('2026-11-06T15:00:00-07:00');

/**
 * Most-used and most-telling first, so the lowest numbers are the ones to
 * look at. Each is a route rather than a click through the app, so a
 * redesign that moves a link does not move the picture.
 */
export const SHOTS: Shot[] = [
  { name: '01-inventory', path: () => '/inventory' },
  {
    name: '02-order-detail',
    path: (targets) => at(targets.saleOrderId, (id) => `/orders/${id}`),
  },
  {
    // Whether the links still fit on one line, in each language.
    name: '03-top-bar',
    path: () => '/orders',
    widths: ['laptop'],
    windowOnly: true,
  },
  {
    name: '04-receive-dialog',
    path: () => '/inventory',
    windowOnly: true,
    prepare: async (page, words) => {
      const receive = words('inventory.receive');
      await page.getByRole('button', { name: receive, exact: true }).click();
      await page.getByRole('dialog').waitFor();
    },
  },
  {
    // Every status, so every chip colour is on one screen.
    name: '05-orders-list',
    path: () => '/orders',
    prepare: (page, words) => press(page, words('orders.filter.all')),
  },
  {
    name: '06-invoice',
    path: (targets) => at(targets.issuedInvoiceId, (id) => `/invoices/${id}`),
  },
  {
    name: '07-run-in-progress',
    path: (targets) => at(targets.runInProgressId, (id) => `/production/${id}`),
  },
  {
    name: '08-invoice-draft',
    path: (targets) => at(targets.draftInvoiceId, (id) => `/invoices/${id}`),
  },
  {
    name: '09-lot-trace',
    path: (targets) => at(targets.batchLotId, (id) => `/lots/${id}`),
  },
  {
    // A search no run's reference contains, so the empty state is pictured
    // however full the demo is; a status filter emptied only until the demo
    // cancelled a run. From the address, as the lookup's Show all opens it.
    name: '10-empty-list',
    path: () => '/production?search=ZZZ-000',
  },
  { name: '11-products', path: () => '/items' },
  {
    name: '12-product-detail',
    path: (targets) => at(targets.recipeProductId, (id) => `/items/${id}`),
  },
  { name: '13-stock-value', path: () => '/costs' },
  { name: '14-sign-in', path: () => '/login', signedOut: true },
  {
    // The two logos side by side on a computer, stacked on a phone, and the
    // line under the square logo.
    name: '15-branding',
    path: () => '/settings/organization?tab=branding',
  },
  {
    // The rail folded to its plate, which shows the demo's square logo. The
    // window only: the page beside it is 01's.
    name: '16-rail-folded',
    path: () => '/inventory',
    widths: ['desktop'],
    windowOnly: true,
    prepare: async (page, words) => {
      const collapse = page.getByRole('button', {
        name: words('layout.collapseNavigation'),
        exact: true,
      });
      await collapse.click();
      await collapse.waitFor({ state: 'detached' });
    },
  },
  // The pages a person outside the demo sees, their icons' corners among
  // what the type scale's tokens moved (ADR-091).
  {
    // Its ways in, each with its icon, where the form is closed.
    name: '17-register',
    path: () => '/register',
    signedOut: true,
    byInvitation: true,
  },
  { name: '18-no-organization', path: () => '/', noOrganization: true },
  {
    name: '19-organization-invitation',
    path: (targets, language) => targets.organizationInvitationPaths[language],
    signedOut: true,
  },
  // Home, the demo Owner's, and Customise Home open over it (ADR-091), the
  // clock fixed so the date, the time and the greeting do not move.
  { name: '20-home', path: () => '/', clock: HOME_CLOCK },
  {
    name: '21-home-customise',
    path: () => '/',
    clock: HOME_CLOCK,
    prepare: async (page, words) => {
      const customise = words('home.customise.open');
      await page.getByRole('button', { name: customise, exact: true }).click();
      await page.getByRole('region', { name: customise }).waitFor();
    },
  },
  // The language items are named in (ADR-054, amended for #531): where it
  // is chosen, and the dialogs that name an item.
  {
    name: '22-documents',
    path: () => '/settings/organization?tab=documents',
  },
  {
    name: '23-edit-names',
    path: (targets) => at(targets.recipeProductId, (id) => `/items/${id}`),
    windowOnly: true,
    prepare: async (page, words) => {
      const edit = words('products.translations.edit');
      await page.getByRole('button', { name: edit, exact: true }).click();
      await page.getByRole('dialog').waitFor();
    },
  },
  {
    name: '24-add-item',
    path: () => '/items',
    windowOnly: true,
    prepare: async (page, words) => {
      const add = words('products.add');
      await page
        .getByRole('button', { name: add, exact: true })
        .first()
        .click();
      await page.getByRole('dialog').waitFor();
    },
  },
  // The page frame and a list's header (#632): Reorder's list, with its
  // tick boxes, and Your account in the narrower frame Home has.
  { name: '25-reorder', path: () => '/inventory?tab=reorder' },
  { name: '26-your-account', path: () => '/account' },
  {
    // Stock's header stuck under the top bar, its line and shadow shown:
    // the window scrolled until the list's fourth row meets the bar.
    name: '27-stuck-header',
    path: () => '/inventory',
    widths: ['wide'],
    windowOnly: true,
    prepare: async (page, words) => {
      const { table, box } = listTable(page, words('inventory.tab.stock'));
      await table.evaluate((element: HTMLTableElement) => {
        const bar = document
          .querySelector('header.MuiAppBar-root')!
          .getBoundingClientRect().bottom;
        const row = element.tBodies[0].rows[3].getBoundingClientRect();
        window.scrollBy(0, row.top - bar);
      });
      await expect(box).toHaveAttribute('data-stuck', 'true');
    },
  },
  {
    // Help beside Reorder on a laptop takes the table's room: it scrolls
    // sideways, here to its end, the tick box and the name pinned at the
    // start with their edge; its Actions pinned too only while the two
    // sides take no more than half the box (E12a). Only in a run with
    // FRAME_SIZES=1, which adds the size.
    name: '28-table-beside-help',
    path: () => '/inventory?tab=reorder',
    widths: ['laptop-1366'],
    windowOnly: true,
    prepare: async (page, words) => {
      await page
        .getByRole('banner')
        .getByRole('button', { name: words('help.title'), exact: true })
        .click();
      const { box } = listTable(page, words('inventory.tab.reorder'));
      await expect(box).toHaveAttribute('role', 'region');
      await box.evaluate((element) => {
        element.scrollLeft = element.scrollWidth;
      });
      await expect(box).toHaveAttribute('data-under-start', 'true');
    },
  },
  // Movements (ADR-093's branch), taken before it changes so the after
  // pictures have something to compare with: every item, one item with a
  // date range in the address, and a purchase order received in part, the
  // page #605's label goes on. Each at every size the other lists take.
  { name: '29-movements', path: () => '/movements' },
  {
    // The range as calendar days around the item's own movements, written
    // by the keys ADR-093's amendment names; the page reads none of them
    // from the address until its Movements step.
    name: '30-movements-one-item',
    path: (targets) =>
      targets.movementsVariantId && targets.movementsRange
        ? `/movements?variantId=${targets.movementsVariantId}` +
          `&from=${targets.movementsRange.from}` +
          `&until=${targets.movementsRange.until}`
        : null,
  },
  {
    name: '31-order-partly-received',
    path: (targets) =>
      at(targets.partlyReceivedOrderId, (id) => `/orders/${id}`),
  },
];
