import type { Page } from '@playwright/test';

import type { Targets } from './targets';

export type Width = 'desktop' | 'laptop' | 'phone';

/** A message in the language being pictured, by its catalogue id. */
export type Words = (id: string) => string;

export interface Shot {
  /** The start of the file name, numbered by how much the page matters. */
  name: string;
  /** Where the page is, or null when this demo has no such record. */
  path: (targets: Targets) => string | null;
  /** Desktop and phone unless listed. */
  widths?: Width[];
  /** Every language unless listed. */
  languages?: string[];
  /** Before the picture: open a dialog, choose a filter. */
  prepare?: (page: Page, words: Words) => Promise<void>;
  /** The window only, not the whole page: a dialog, the top bar. */
  windowOnly?: boolean;
  /** As a printer sees it: the print styles on, the app's chrome hidden. */
  print?: boolean;
  /** Signed out, for the sign-in page. */
  signedOut?: boolean;
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
    // The demo cancels no run, so this filter shows the empty state.
    name: '10-empty-list',
    path: () => '/production',
    prepare: (page, words) => press(page, words('orders.status.cancelled')),
  },
  { name: '11-products', path: () => '/products' },
  {
    name: '12-product-detail',
    path: (targets) => at(targets.recipeProductId, (id) => `/products/${id}`),
  },
  { name: '13-stock-value', path: () => '/costs' },
  { name: '14-sign-in', path: () => '/login', signedOut: true },
  {
    // Paper is the customer's language, not the reader's, so one reader
    // language is enough; both modes, to show the screen's dark mode never
    // reaches the printer.
    name: '15-printed-invoice',
    path: (targets) =>
      at(targets.issuedInvoiceId, (id) => `/invoices/${id}/print`),
    widths: ['desktop'],
    languages: ['en'],
    print: true,
  },
  {
    name: '16-printed-bilingual',
    path: (targets) =>
      at(targets.bilingualInvoiceId, (id) => `/invoices/${id}/print`),
    widths: ['desktop'],
    languages: ['en'],
    print: true,
  },
];
