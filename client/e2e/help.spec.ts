import { readFileSync } from 'node:fs';

import type { APIRequestContext } from '@playwright/test';

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
 * Help (ADR-079): the page's guide in a panel from the top bar, following
 * the person from page to page, and Learn more opening it at a section.
 *
 * Reads only, so the first runs in the shared organization; the second
 * needs Getting started, which only a new organization shows.
 */
test('Help on Orders, then Inventory’s guide on Inventory', async ({
  page,
}) => {
  await page.goto('/orders');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const button = page.getByRole('button', { name: 'Help', exact: true });
  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');

  const help = page.getByRole('complementary', { name: 'Help', exact: true });
  await expect(
    help.getByRole('heading', { level: 2, name: 'Orders', exact: true }),
  ).toBeFocused();
  await expect(
    help.getByRole('heading', {
      level: 3,
      name: 'Raise an order',
      exact: true,
    }),
  ).toBeVisible();

  // The page still works beside it: the rail takes the person on, and Help
  // follows with the next page's guide.
  await page
    .getByRole('navigation', { name: 'Main', exact: true })
    .getByRole('link', { name: 'Inventory', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Inventory', exact: true }),
  ).toBeVisible();
  await expect(
    help.getByRole('heading', { level: 2, name: 'Inventory', exact: true }),
  ).toBeVisible();

  // Esc from inside it shuts it, and focus is back on the button.
  await help.getByRole('heading', { level: 2 }).click();
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  await expect(button).toBeFocused();
  await expect(button).toHaveAttribute('aria-expanded', 'false');
});

test('Learn more on a Getting started step opens Help at its section', async ({
  page,
  freshOrg,
}) => {
  await signInAs(page, freshOrg.api);
  await page.goto('/');

  const step = page
    .getByRole('region', { name: 'Getting started', exact: true })
    .getByText('Where stock is kept', { exact: false });
  await step.getByRole('button', { name: 'Learn more', exact: true }).click();

  const help = page.getByRole('complementary', { name: 'Help', exact: true });
  await expect(
    help.getByRole('heading', { level: 2, name: 'Locations', exact: true }),
  ).toBeAttached();
  const section = help.getByRole('heading', {
    level: 3,
    name: 'Add a location',
    exact: true,
  });
  await expect(section).toBeFocused();
  await expect(section).toBeInViewport();

  // Closed, focus goes back to the Learn more that opened it.
  await help.getByRole('button', { name: 'Close help', exact: true }).click();
  await expect(
    step.getByRole('button', { name: 'Learn more', exact: true }),
  ).toBeFocused();
});

test('a dialog opened beside Help leaves Help readable above its dimming', async ({
  page,
}) => {
  await page.goto('/locations');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Help', exact: true }).click();

  // By id, not by role: while a dialog is open, MUI hides the page, Help
  // with it, from assistive technology, and roles go with it.
  const help = page.locator('#help-panel');
  const title = help.locator('h2');
  await expect(title).toHaveText('Locations');

  // Over the page at this width, Help covers its top right, where Add
  // location is; the keyboard still reaches it.
  await page.getByRole('button', { name: 'Add location', exact: true }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Help's words are on top, not under the dimming, and the dialog sits
  // beside Help rather than under it.
  await expect(title).toBeVisible();
  const box = (await title.boundingBox())!;
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const onTop = await page.evaluate(
    ({ x, y }) => !!document.elementFromPoint(x, y)?.closest('#help-panel'),
    point,
  );
  expect(onTop).toBe(true);
  const panel = (await help.boundingBox())!;
  const paper = (await dialog.boundingBox())!;
  expect(paper.x + paper.width).toBeLessThanOrEqual(panel.x);

  // It scrolls under the mouse, and the keyboard stays in the dialog.
  const scroller = help.locator('[data-help-scroller]');
  await page.mouse.move(point.x, point.y + 200);
  await page.mouse.wheel(0, 600);
  await expect
    .poll(() => scroller.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  expect(
    await dialog.evaluate((element) =>
      element.contains(document.activeElement),
    ),
  ).toBe(true);

  // Closed, the dialog leaves Help as it was, under the page's own menus.
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page
      .getByRole('complementary', { name: 'Help', exact: true })
      .getByRole('heading', { level: 2, name: 'Locations', exact: true }),
  ).toBeVisible();
  expect(
    await help.evaluate((element) => getComputedStyle(element).zIndex),
  ).toBe('1099');
});

/** The panel's id, as src/help/help-ids.ts names it. */
const HELP_PANEL_ID = 'help-panel';

/**
 * The router's own list, SIGNED_IN_ROUTES in src/routes.ts, read from its
 * source: importing it here would bring every page, which this project
 * does not compile.
 */
function signedInPaths(): string[] {
  const source = readFileSync(
    new URL('../src/routes.ts', import.meta.url),
    'utf8',
  );
  const list = source.slice(source.indexOf('SIGNED_IN_ROUTES'));
  const paths = [...list.matchAll(/\{ path: '([^']+)', page: \w+ \}/g)].map(
    ([, path]) => path,
  );
  if (paths.length < 30) throw new Error('SIGNED_IN_ROUTES not read');
  return paths;
}

/**
 * Every page with Help open on a small laptop, 1280 × 800 (ADR-079): the
 * rail folds and the page takes the width beside Help, so nothing scrolls
 * sideways, the title row's actions are in view and not under Help, and a
 * control focused in the page is never under it (WCAG 2.4.11). Each page
 * from the router's own list, so a page added later is walked too.
 */
test('every page keeps its width beside Help at 1280 × 800', async ({
  page,
  freshOrg,
}) => {
  test.setTimeout(240_000);
  const ids = await seedEveryPage(freshOrg.api);
  const urls: Record<string, string> = {
    '/people/:userId': `/people/${ids.userId}`,
    '/settings/price-lists/:id': `/settings/price-lists/${ids.priceListId}`,
    '/products/:id': `/products/${ids.productId}`,
    '/lots/:id': `/lots/${ids.lotId}`,
    '/partners/:id': `/partners/${ids.partnerId}`,
    '/orders/:id': `/orders/${ids.orderId}`,
    '/invoices/:id': `/invoices/${ids.invoiceId}`,
    '/credit-notes/:id': `/credit-notes/${ids.creditNoteId}`,
    '/return-authorizations/:id': `/return-authorizations/${ids.rmaId}`,
    '/production/:id': `/production/${ids.runId}`,
  };
  await signInAs(page, freshOrg.api);
  await page.setViewportSize({ width: 1280, height: 800 });

  const problems: string[] = [];
  for (const path of signedInPaths()) {
    const url = path.includes(':') ? urls[path] : path;
    if (!url) {
      problems.push(`${path}: no record to open it with`);
      continue;
    }
    await page.goto(url);
    await expect(page.getByRole('main').locator('h1')).toBeVisible();
    await page
      .getByRole('banner')
      .getByRole('button', { name: 'Help', exact: true })
      .click();
    await expect(
      page
        .getByRole('complementary', { name: 'Help', exact: true })
        .getByRole('heading', { level: 2 }),
    ).toBeVisible();
    // The rail folds and the page moves beside Help, a frame or two later.
    const beside = await page
      .waitForFunction(
        (id) => {
          const panel = document.getElementById(id)?.getBoundingClientRect();
          const main = document.querySelector('main')?.getBoundingClientRect();
          return !!panel && !!main && main.right <= panel.left + 1;
        },
        HELP_PANEL_ID,
        { timeout: 5_000 },
      )
      .then(() => true)
      .catch(() => false);
    if (!beside) problems.push(`${url}: Help over the page, not beside it`);
    problems.push(
      ...(await page.evaluate(besideHelp, HELP_PANEL_ID)).map(
        (problem) => `${url}: ${problem}`,
      ),
    );
  }

  expect(problems).toEqual([]);

  // The rail folded for Help, and comes back as it was once Help closes.
  await expect(
    page.getByRole('button', { name: 'Expand navigation', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close help', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Collapse navigation', exact: true }),
  ).toBeVisible();
});

/** What a page beside Help must hold, read in the page itself. */
function besideHelp(panelId: string): string[] {
  const problems: string[] = [];
  const panel = document.getElementById(panelId)!.getBoundingClientRect();
  const root = document.scrollingElement!;
  if (root.scrollWidth > root.clientWidth) {
    problems.push(
      `scrolls sideways, ${root.scrollWidth} in ${root.clientWidth}`,
    );
  }

  const name = (element: Element) =>
    `${element.tagName.toLowerCase()} "${(element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 40)}"`;
  const underHelp = (element: Element) => {
    const box = element.getBoundingClientRect();
    return (
      box.width > 0 &&
      box.height > 0 &&
      box.right > panel.left + 0.5 &&
      box.left < panel.right &&
      box.bottom > panel.top &&
      box.top < panel.bottom
    );
  };

  // The title row: from the page's heading up to the row as wide as the
  // page, with whatever it holds beside the title.
  const main = document.querySelector('main')!;
  const width = main.getBoundingClientRect().width * 0.85;
  let row: Element = main.querySelector('h1')!;
  while (
    row.parentElement &&
    row.parentElement !== main &&
    row.getBoundingClientRect().width < width
  ) {
    row = row.parentElement;
  }
  for (const action of row.querySelectorAll(
    'a[href], button, [role="button"], input, select',
  )) {
    const box = action.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) continue;
    if (box.left < 0 || box.right > window.innerWidth) {
      problems.push(`title row: ${name(action)} out of view`);
    }
    if (underHelp(action))
      problems.push(`title row: ${name(action)} under Help`);
    const top = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2,
    );
    if (top && !action.contains(top) && !top.contains(action)) {
      problems.push(`title row: ${name(action)} covered by ${name(top)}`);
    }
  }

  // Every control the page lets focus reach, focused in turn.
  for (const control of main.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])',
  )) {
    if (control.getClientRects().length === 0) continue;
    control.focus();
    if (document.activeElement !== control) continue;
    if (underHelp(control)) problems.push(`focus under Help: ${name(control)}`);
  }
  (document.activeElement as HTMLElement | null)?.blur();
  return problems;
}

/**
 * A record for each page that opens one: an order, invoiced, issued,
 * credited and returned; a lot; a run; a price list; and the Owner on People.
 */
async function seedEveryPage(api: APIRequestContext) {
  const { user } = await created<{ user: { id: string } }>(
    await api.get('/v1/auth/me'),
  );
  const product = await createProduct(api, { tracksLots: true });
  const location = await createLocation(api);
  const partner = await createPartner(api);
  // What issuing an invoice asks for: where the seller is, and where the
  // customer is billed.
  for (const response of [
    await api.put('/v1/organization/address', {
      data: { line1: '100 Main St', city: 'Vancouver', country: 'CA' },
    }),
    await api.post(`/v1/partners/${partner.id}/addresses`, {
      data: {
        line1: '9 Harbour Rd',
        country: 'CA',
        isBilling: true,
        isShipping: true,
      },
    }),
  ]) {
    expect(response.ok(), await response.text()).toBeTruthy();
  }

  const { movement } = await created<{ movement: { lotId: string } }>(
    await api.post('/v1/stock/movements', {
      data: {
        variantId: product.variantId,
        toLocationId: location.id,
        quantity: '24',
        reason: 'receipt',
        lot: { code: 'BESIDE-1', expiresAt: daysFromNow(200) },
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
  const { taxCode } = await created<{ taxCode: { id: string } }>(
    await api.post('/v1/tax-codes', {
      data: { name: 'Exempt', components: [] },
    }),
  );
  const { shipment } = await created<{ shipment: { id: string } }>(
    await api.post(`/v1/orders/${order.id}/shipments`, {
      data: {
        fromLocationId: location.id,
        lines: [{ lineId: order.lines[0].id, quantity: '6' }],
      },
    }),
  );
  const { invoice } = await created<{
    invoice: { id: string; lines: { id: string; orderLineId: string }[] };
  }>(
    await api.post('/v1/invoices', {
      data: { shipmentId: shipment.id, taxCodeId: taxCode.id },
    }),
  );
  await created(
    await api.post(`/v1/invoices/${invoice.id}/issue`, {
      data: { invoiceDate: daysFromNow(0) },
    }),
  );
  const { creditNote } = await created<{ creditNote: { id: string } }>(
    await api.post(`/v1/invoices/${invoice.id}/credit-notes`, {
      data: {
        lines: [{ invoiceLineId: invoice.lines[0].id, quantity: '1' }],
        reason: 'One arrived cracked',
        creditDate: daysFromNow(0),
      },
    }),
  );
  const { returnAuthorization } = await created<{
    returnAuthorization: { id: string };
  }>(
    await api.post('/v1/return-authorizations', {
      data: {
        orderId: order.id,
        invoiceId: invoice.id,
        reason: 'Cracked in transit',
        expectsGoods: false,
        lines: [
          {
            lineId: invoice.lines[0].orderLineId,
            quantity: '1',
            resolution: 'credit',
          },
        ],
      },
    }),
  );

  const { productionOrder } = await created<{
    productionOrder: { id: string };
  }>(
    await api.post('/v1/production-orders', {
      data: {
        outputVariantId: product.variantId,
        locationId: location.id,
        quantityPlanned: '50',
        reference: 'BESIDE-RUN',
      },
    }),
  );
  const { priceList } = await created<{ priceList: { id: string } }>(
    await api.post('/v1/price-lists', {
      data: { name: 'Retail', direction: 'sale', currency: 'CAD' },
    }),
  );

  return {
    userId: user.id,
    productId: product.id,
    lotId: movement.lotId,
    partnerId: partner.id,
    orderId: order.id,
    invoiceId: invoice.id,
    creditNoteId: creditNote.id,
    rmaId: returnAuthorization.id,
    runId: productionOrder.id,
    priceListId: priceList.id,
  };
}
