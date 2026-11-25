import type { APIRequestContext, Locator, Page } from '@playwright/test';

import { expect, test } from './fixtures';
import {
  created,
  createLocation,
  createPartner,
  createProduct,
  memberIn,
  type SeededLocation,
  type SeededPartner,
  type SeededProduct,
  signInAs,
} from './support/api';
import { confirmEmailInDatabase } from './support/mail';
import { saidBy, saidOn } from './support/said';
import { orderOf, releasedRun } from './support/stock';

/**
 * ADR-094's interaction table, row by row: each row is one test here,
 * named by its words, "where, what you do: what happens; Back". Then the
 * R that asks a browser test of its own beside them: R5, a delivery with
 * no lot on the box whose supplier's lot is added later. The two new
 * dialogs, Start tracking lots and Move to another lot, open and close
 * by the keyboard as keyboard.spec.ts checks a dialog (#310): Cancel and
 * Escape give focus back to what opened them, and Enter there opens them
 * again.
 *
 * Each test makes its own organization, since a made code is the
 * organization's next and the lists count rows; setup goes through the
 * API. A screen's lines are read through the catalogue (support/said.ts);
 * a control's name is typed, as the other specs type theirs.
 */

/** A lot, as a receipt or a move gives it. */
interface SeededLot {
  id: string;
  code: string;
}

/** A receipt's lot, as `MovementLotDto` takes it. */
interface LotGiven {
  code?: string;
  makeCode?: boolean;
  supplierLot?: string;
  expiry?: 'date' | 'unknown' | 'none';
  expiresAt?: string;
}

/** Stock received with no order, into the lot given. */
async function receiveInto(
  api: APIRequestContext,
  product: SeededProduct,
  place: SeededLocation,
  quantity: string,
  lot?: LotGiven,
): Promise<SeededLot> {
  const { movement, lotCode } = await created<{
    movement: { lotId: string | null };
    lotCode: string | null;
  }>(
    await api.post('/v1/stock/movements', {
      data: {
        variantId: product.variantId,
        toLocationId: place.id,
        quantity,
        reason: 'receipt',
        reasonDetail: 'opening',
        lot,
      },
    }),
  );
  return { id: movement.lotId ?? '', code: lotCode ?? '' };
}

/** Part of a lot at a place moved into a new lot typed as printed (R20). */
async function moveToNewLot(
  api: APIRequestContext,
  from: SeededLot,
  place: SeededLocation,
  quantity: string,
  code: string,
): Promise<SeededLot> {
  const { toLot } = await created<{ toLot: SeededLot }>(
    await api.post(`/v1/stock/lots/${from.id}/lot-changes`, {
      data: {
        locationId: place.id,
        quantity,
        note: 'E2E two runs in one delivery',
        lot: { code },
      },
    }),
  );
  return toLot;
}

/** Sold to a customer and shipped from the one lot given. */
async function shipFrom(
  api: APIRequestContext,
  customer: SeededPartner,
  product: SeededProduct,
  lot: SeededLot,
  place: SeededLocation,
  quantity: string,
): Promise<void> {
  const sale = await orderOf(api, customer, 'sale', product, quantity);
  const { lines } = (await (await api.get(`/v1/orders/${sale.id}`)).json()) as {
    lines: { id: string }[];
  };
  await created(
    await api.post(`/v1/orders/${sale.id}/shipments`, {
      data: {
        fromLocationId: place.id,
        lines: [
          {
            lineId: lines[0]!.id,
            quantity,
            lots: [{ lotId: lot.id, quantity }],
          },
        ],
      },
    }),
  );
}

/**
 * The code Make a code for us gives first today, by the default format
 * (ADR-094, R1): `L-2026-11-22-1`, the day the organization's own.
 */
async function firstCodeToday(api: APIRequestContext): Promise<string> {
  const { numbering } = (await (
    await api.get('/v1/organization/numbering')
  ).json()) as { numbering: { today: string } };
  return `L-${numbering.today}-1`;
}

/** Far off, so no screen reads it as expiring: "Mar 15, 2031". */
const FAR_OFF = '2031-03-15';

/** The lots' scene: two shelves, an item tracked by lot and one not. */
interface LotsScene {
  shelf: SeededLocation;
  other: SeededLocation;
  /**
   * Lot-tracked: FO-0101, typed as printed, 20 each on the shelf,
   * expiring on FAR_OFF, received with no price, so waiting for a cost.
   */
  fishOil: SeededProduct;
  first: SeededLot;
  /** Not tracked: 30 each on the shelf and 12 on the other. */
  zinc: SeededProduct;
}

async function lotsScene(api: APIRequestContext): Promise<LotsScene> {
  const [shelf, other] = await Promise.all([
    createLocation(api, { name: 'E2E Shelf L1' }),
    createLocation(api, { name: 'E2E Shelf L2' }),
  ]);
  const [fishOil, zinc] = await Promise.all([
    createProduct(api, {
      name: 'E2E Fish Oil',
      sku: 'E2E-FISH',
      tracksLots: true,
    }),
    createProduct(api, { name: 'E2E Zinc', sku: 'E2E-ZINC' }),
  ]);
  const first = await receiveInto(api, fishOil, shelf, '20', {
    code: 'FO-0101',
    expiry: 'date',
    expiresAt: FAR_OFF,
  });
  await receiveInto(api, zinc, shelf, '30');
  await receiveInto(api, zinc, other, '12');
  return { shelf, other, fishOil, first, zinc };
}

/** A screen's line in English, by its id (support/said.ts). */
const said = (id: string, values?: Parameters<typeof saidOn>[2]) =>
  saidOn('en', id, values);

/** Stock opened with Locations the page before it, for Back. */
async function stockFrom(page: Page, address = '/inventory') {
  await page.goto('/locations');
  await page.goto(address);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Inventory' }),
  ).toBeVisible();
}

/** The button that opens a code's row to its places. */
const placesOf = (page: Page, name: string) =>
  page.getByRole('button', {
    name: new RegExp(`: (show|hide) where ${name} is$`),
  });

/** The button that opens a place's row to its lots. */
const lotsAt = (page: Page, place: string) =>
  page.getByRole('button', {
    name: new RegExp(`: (show|hide) the lots at ${place}$`),
  });

/** A lot's row at a place on Stock, by its code. */
const lotRow = (page: Page, code: string) =>
  page.getByRole('row').filter({
    has: page.getByRole('link', { name: code, exact: true }),
  });

/** Stock with the fish oil's row open at the shelf, its lots shown. */
async function lotsOnStock(page: Page, scene: LotsScene) {
  await stockFrom(page, '/inventory?search=E2E-FISH');
  await placesOf(page, 'E2E Fish Oil').click();
  await lotsAt(page, scene.shelf.name).click();
}

/** Receive stock opened on Stock, the item, why and place chosen. */
async function receiveStock(page: Page, scene: LotsScene): Promise<Locator> {
  await page.getByRole('button', { name: 'Receive stock' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Receive stock' });
  await dialog.getByLabel('Item').click();
  await page.getByRole('option', { name: /E2E-FISH/ }).click();
  await dialog.getByLabel('Why is there no order?').click();
  await page.getByRole('option', { name: 'Opening stock' }).click();
  await dialog.getByLabel('Into').click();
  await page.getByRole('option', { name: scene.shelf.name }).click();
  await dialog.getByRole('textbox', { name: 'Quantity' }).fill('12');
  return dialog;
}

/** The message after a write, and its buttons. */
const message = (page: Page) => page.getByRole('status');

// ---------------------------------------------------------------------------
// The interaction table, row by row
// ---------------------------------------------------------------------------

test('Receive stock, Lot number, Make a code for us: the field reads “Made when you save, like L-…”, Supplier’s lot shows, Expires starts on Not known yet; Type one instead, the field empties, focus in it', async ({
  page,
  freshOrg,
}) => {
  const scene = await lotsScene(freshOrg.api);
  const code = await firstCodeToday(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await stockFrom(page);
  const dialog = await receiveStock(page, scene);

  // Before the choice: typed as printed, Expires as the item's last lot
  // had it (R8), no supplier's lot to give.
  const lotNumber = dialog.getByRole('combobox', { name: 'Lot number' });
  await expect(lotNumber).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'On a date' })).toBeChecked();
  await expect(
    dialog.getByRole('textbox', { name: 'Supplier’s lot' }),
  ).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Make a code for us' }).click();

  const made = dialog.getByRole('textbox', { name: 'Lot number' });
  await expect(made).toHaveValue(
    said('inventory.lot.madeWhenSaved', { example: code }),
  );
  await expect(made).toHaveAttribute('readonly');
  await expect(
    dialog.getByRole('textbox', { name: 'Supplier’s lot' }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('radio', { name: 'Not known yet' }),
  ).toBeChecked();

  // Back to a typed code: empty, focus in it, Expires the last lot's again.
  await dialog.getByRole('button', { name: 'Type one instead' }).click();
  await expect(lotNumber).toHaveValue('');
  await expect(lotNumber).toBeFocused();
  await expect(dialog.getByRole('radio', { name: 'On a date' })).toBeChecked();
  await expect(
    dialog.getByRole('textbox', { name: 'Supplier’s lot' }),
  ).toHaveCount(0);
});

test('Receive stock, Lot number, Type a code: under it an existing lot, which this adds to, with its expiry and what is where; or a new lot', async ({
  page,
  freshOrg,
}) => {
  const scene = await lotsScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await stockFrom(page);
  const dialog = await receiveStock(page, scene);
  const lotNumber = dialog.getByRole('combobox', { name: 'Lot number' });

  // As the server matches it, trimmed and in capitals (R10).
  await lotNumber.fill('fo-0101');
  await expect(lotNumber).toHaveAccessibleDescription(
    // Its two lines, the second after a line break.
    `${said('inventory.lot.isExisting')} ${said('inventory.lot.expiresOn', {
      day: 'Mar 15, 2031',
    })} · ${said('inventory.lot.atPlace', {
      quantity: '20 each',
      place: scene.shelf.name,
    })}`,
  );
  // An existing lot keeps its own expiry: none is asked.
  await expect(dialog.getByRole('radiogroup', { name: 'Expires' })).toHaveCount(
    0,
  );

  await lotNumber.fill('FO-0202');
  await expect(lotNumber).toHaveAccessibleDescription(
    said('inventory.lot.isNew'),
  );
  await expect(
    dialog.getByRole('radiogroup', { name: 'Expires' }),
  ).toBeVisible();
});

test('Receive stock, Why is there no order?, Found in a count: Count it in… opens with the item and place; Escape, Receive stock, focus on the reason', async ({
  page,
  freshOrg,
}) => {
  const scene = await lotsScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await stockFrom(page);

  await page.getByRole('button', { name: 'Receive stock' }).first().click();
  const receive = page.getByRole('dialog', { name: 'Receive stock' });
  await receive.getByLabel('Item').click();
  await page.getByRole('option', { name: /E2E-FISH/ }).click();
  await receive.getByLabel('Into').click();
  await page.getByRole('option', { name: scene.shelf.name }).click();

  const why = receive.getByRole('combobox', { name: 'Why is there no order?' });
  await why.click();
  await page.getByRole('option', { name: 'Found in a count' }).click();

  // No receipt: found stock is a correction (R12), the item and the
  // place kept.
  const count = page.getByRole('dialog', { name: 'Correct the count' });
  await expect(count).toBeVisible();
  await expect(
    count.getByText(said('inventory.countIn.what', { sku: 'E2E-FISH' })),
  ).toBeVisible();
  await expect(count.getByRole('combobox', { name: 'Location' })).toHaveText(
    scene.shelf.name,
  );

  await page.keyboard.press('Escape');
  await expect(count).toBeHidden();
  await expect(receive).toBeVisible();
  await expect(why).toBeFocused();
});

test('Receive stock, Receive: saved; the message names the new lot, with Copy code and Open the lot; Stock, the row open at its lot', async ({
  page,
  freshOrg,
}) => {
  const scene = await lotsScene(freshOrg.api);
  const code = await firstCodeToday(freshOrg.api);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await signInAs(page, freshOrg.api);
  await stockFrom(page);
  const dialog = await receiveStock(page, scene);
  await dialog.getByRole('button', { name: 'Make a code for us' }).click();
  await dialog
    .getByRole('textbox', { name: 'Supplier’s lot' })
    .fill('SUP-7781');

  await dialog.getByRole('button', { name: 'Receive', exact: true }).click();

  // Its number taken as it was saved (R3), to be written on the delivery;
  // received with no price, so waiting for a cost.
  await expect(dialog).toBeHidden();
  await expect(message(page)).toContainText(
    said('inventory.receivedOffOrder.done', {
      lot: 'made',
      quantity: '12 each',
      code: 'E2E-FISH',
      lotCode: code,
      waits: 'true',
    }),
  );

  // Landed on Stock, the row open at the shelf and its lots: the new one.
  await expect(placesOf(page, 'E2E Fish Oil')).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(lotsAt(page, scene.shelf.name)).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(
    lotRow(page, code)
      .getByRole('cell', { name: '12 each', exact: true })
      .first(),
  ).toBeVisible();
  await expect(
    lotRow(page, code).getByText(
      said('inventory.lot.supplierLotIs', { code: 'SUP-7781' }),
    ),
  ).toBeVisible();

  await message(page).getByRole('button', { name: 'Copy code' }).click();
  await expect(message(page)).toContainText(
    said('inventory.lot.copied', { code }),
  );
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);

  await message(page).getByRole('button', { name: 'Open the lot' }).click();
  await expect(page).toHaveURL(/\/lots\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(code);
});

test('Receive stock, Found in a count, a code already listed: counted in, Stock opens its row at the place, the new lot shown', async ({
  page,
  freshOrg,
}) => {
  const scene = await lotsScene(freshOrg.api);
  const code = await firstCodeToday(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await stockFrom(page);
  // Listed, its row closed.
  await expect(placesOf(page, 'E2E Fish Oil')).toHaveAttribute(
    'aria-expanded',
    'false',
  );

  await page.getByRole('button', { name: 'Receive stock' }).first().click();
  const receive = page.getByRole('dialog', { name: 'Receive stock' });
  await receive.getByLabel('Item').click();
  await page.getByRole('option', { name: /E2E-FISH/ }).click();
  await receive.getByLabel('Into').click();
  await page.getByRole('option', { name: scene.shelf.name }).click();
  await receive.getByLabel('Why is there no order?').click();
  await page.getByRole('option', { name: 'Found in a count' }).click();

  const count = page.getByRole('dialog', { name: 'Correct the count' });
  await count.getByRole('textbox', { name: 'Quantity' }).fill('3');
  await count
    .getByRole('textbox', { name: 'What happened' })
    .fill('E2E found on the top shelf');
  await count.getByRole('radio', { name: 'A new lot' }).check();
  await count.getByRole('button', { name: 'Make a code for us' }).click();
  await count.getByRole('button', { name: 'Save correction' }).click();

  // No receipt is left to make: both close (R12).
  await expect(count).toBeHidden();
  await expect(receive).toBeHidden();
  await expect(message(page)).toContainText(
    said('inventory.countIn.done', {
      lot: 'made',
      amount: '3 each',
      sku: 'E2E-FISH',
      place: scene.shelf.name,
      code,
    }),
  );

  // The row the address now names, open at the shelf and its lots (S1).
  await expect(placesOf(page, 'E2E Fish Oil')).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(lotsAt(page, scene.shelf.name)).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(
    lotRow(page, code)
      .getByRole('cell', { name: '3 each', exact: true })
      .first(),
  ).toBeVisible();
  await expect(
    lotRow(page, 'FO-0101')
      .getByRole('cell', { name: '20 each', exact: true })
      .first(),
  ).toBeVisible();
});

test('An order’s Receive, the same lot fields: Make a code for us as Receive stock’s; Escape, focus on Receive; received, the message names the new lot with Copy code and Open the lot', async ({
  page,
  freshOrg,
}) => {
  const scene = await lotsScene(freshOrg.api);
  const code = await firstCodeToday(freshOrg.api);
  const supplier = await createPartner(freshOrg.api, {
    name: 'E2E Ocean Supply',
  });
  const purchase = await orderOf(
    freshOrg.api,
    supplier,
    'purchase',
    scene.fishOil,
    '50',
  );
  await signInAs(page, freshOrg.api);
  await page.goto(`/orders/${purchase.id}`);

  const receive = page.getByRole('button', { name: 'Receive', exact: true });
  await receive.click();
  const dialog = page.getByRole('dialog', { name: 'Receive E2E-FISH' });
  await dialog.getByRole('button', { name: 'Make a code for us' }).click();
  await expect(dialog.getByRole('textbox', { name: 'Lot number' })).toHaveValue(
    said('inventory.lot.madeWhenSaved', { example: code }),
  );
  await expect(
    dialog.getByRole('textbox', { name: 'Supplier’s lot' }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('radio', { name: 'Not known yet' }),
  ).toBeChecked();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(receive).toBeFocused();

  // Opened again from where Escape left it, afresh: received with a
  // made code (R3, the order's dialog).
  await page.keyboard.press('Enter');
  await dialog.getByRole('button', { name: 'Make a code for us' }).click();
  await dialog.getByLabel('Into').click();
  await page.getByRole('option', { name: scene.shelf.name }).click();
  await dialog.getByRole('textbox', { name: 'Quantity' }).fill('15');
  await dialog.getByRole('button', { name: 'Receive', exact: true }).click();

  await expect(dialog).toBeHidden();
  await expect(message(page)).toContainText(
    said('orders.receivedOn.done', {
      lot: 'made',
      quantity: '15 each',
      code: 'E2E-FISH',
      order: purchase.number,
      lotCode: code,
      waits: 'false',
    }),
  );
  await expect(
    message(page).getByRole('button', { name: 'Copy code' }),
  ).toBeVisible();
  await message(page).getByRole('button', { name: 'Open the lot' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(code);
});

test('Count it in…, the same lot fields: A new lot, Make a code for us as Receive stock’s; Escape, focus on Count it in…; counted in, the message names the new lot with Copy code and Open the lot', async ({
  page,
  freshOrg,
}) => {
  const scene = await lotsScene(freshOrg.api);
  const code = await firstCodeToday(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await stockFrom(page, '/inventory?search=E2E-FISH');
  await placesOf(page, 'E2E Fish Oil').click();

  const button = page.getByRole('button', { name: 'Count it in E2E-FISH…' });
  await button.click();
  const dialog = page.getByRole('dialog', { name: 'Correct the count' });
  await dialog.getByRole('radio', { name: 'A new lot' }).check();
  await dialog.getByRole('button', { name: 'Make a code for us' }).click();
  await expect(dialog.getByRole('textbox', { name: 'Lot number' })).toHaveValue(
    said('inventory.lot.madeWhenSaved', { example: code }),
  );
  await expect(
    dialog.getByRole('textbox', { name: 'Supplier’s lot' }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('radio', { name: 'Not known yet' }),
  ).toBeChecked();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(button).toBeFocused();

  // Counted in with a made code (R3, Count it in's dialog).
  await button.click();
  await dialog.getByRole('combobox', { name: 'Location' }).click();
  await page.getByRole('option', { name: scene.other.name }).click();
  await dialog.getByRole('textbox', { name: 'Quantity' }).fill('4');
  await dialog
    .getByRole('textbox', { name: 'What happened' })
    .fill('E2E found behind the pallet');
  await dialog.getByRole('radio', { name: 'A new lot' }).check();
  await dialog.getByRole('button', { name: 'Make a code for us' }).click();
  await dialog.getByRole('button', { name: 'Save correction' }).click();

  await expect(dialog).toBeHidden();
  await expect(message(page)).toContainText(
    said('inventory.countIn.done', {
      lot: 'made',
      amount: '4 each',
      sku: 'E2E-FISH',
      place: scene.other.name,
      code,
    }),
  );
  await expect(
    message(page).getByRole('button', { name: 'Copy code' }),
  ).toBeVisible();
  await message(page).getByRole('button', { name: 'Open the lot' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(code);
});

/** The item's page, arrived at from Items, so Back has somewhere to go. */
async function itemFrom(page: Page, product: SeededProduct) {
  await page.goto('/items');
  await page.goto(`/items/${product.id}`);
  await expect(
    page.getByRole('heading', { level: 1, name: product.name }),
  ).toBeVisible();
}

/**
 * The item's Variants table, whose Lots column is one door to Start
 * tracking lots; Where it stands, above it, is another (ADR-094, T3).
 */
const variantsOf = (page: Page) =>
  page.getByRole('region', { name: 'Variants' });

test('The item’s page, a code not tracked, Start tracking lots…: the question, its places listed, Supplier’s lot optional and Expires on Not known yet; Escape or Cancel, focus on the button, and Cancel changes nothing', async ({
  page,
  freshOrg,
}) => {
  const scene = await lotsScene(freshOrg.api);
  const code = await firstCodeToday(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await itemFrom(page, scene.zinc);

  const start = variantsOf(page).getByRole('button', {
    name: 'Start tracking lots for E2E-ZINC…',
  });
  await start.click();
  const dialog = page.getByRole('dialog', {
    name: 'Start tracking lots for E2E-ZINC',
  });

  // Each line the question says (R14): how much, into one lot whose
  // code is made when it starts, at which places, that it is one way.
  await expect(
    dialog.getByText(
      said('products.startTracking.onHand', {
        quantity: '42 each',
        example: code,
      }),
    ),
  ).toBeVisible();
  await expect(dialog.getByRole('listitem')).toHaveText([
    said('inventory.lot.atPlace', {
      quantity: '30 each',
      place: scene.shelf.name,
    }),
    said('inventory.lot.atPlace', {
      quantity: '12 each',
      place: scene.other.name,
    }),
  ]);
  await expect(
    dialog.getByText(said('products.startTracking.oneWay')),
  ).toBeVisible();
  // The supplier's lot optional; Expires on Not known yet, shown chosen,
  // saying what the lot is then, never an unseen Doesn't expire (S6).
  const supplierLot = dialog.getByRole('textbox', { name: 'Supplier’s lot' });
  await expect(supplierLot).not.toHaveAttribute('required');
  const expires = dialog.getByRole('radiogroup', { name: 'Expires' });
  await expect(expires.getByRole('radio', { checked: true })).toHaveCount(1);
  await expect(
    expires.getByRole('radio', { name: said('inventory.lot.expiry.unknown') }),
  ).toBeChecked();
  await expect(expires).toHaveAccessibleDescription(
    said('products.startTracking.expiry.unknownHelp'),
  );

  await supplierLot.fill('ZN-SUP-1');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(start).toBeFocused();

  // From the keyboard alone, from where Cancel left it (keyboard.spec.ts).
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  // Cancelled, nothing was kept, nor written.
  await expect(supplierLot).toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(start).toBeFocused();

  const product = (await (
    await freshOrg.api.get(`/v1/products/${scene.zinc.id}`)
  ).json()) as { variants: { tracksLots: boolean }[] };
  expect(product.variants[0]!.tracksLots).toBe(false);
});

test('The question, Start tracking lots: one write; the message names the lot, with Open the lot; the item’s page, the code reading Tracked', async ({
  page,
  freshOrg,
}) => {
  const scene = await lotsScene(freshOrg.api);
  const code = await firstCodeToday(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await itemFrom(page, scene.zinc);

  await variantsOf(page)
    .getByRole('button', { name: 'Start tracking lots for E2E-ZINC…' })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'Start tracking lots for E2E-ZINC',
  });
  await dialog
    .getByRole('textbox', { name: 'Supplier’s lot' })
    .fill('ZN-SUP-1');
  await dialog.getByRole('button', { name: 'Start tracking lots' }).click();

  await expect(dialog).toBeHidden();
  await expect(message(page)).toContainText(
    said('products.startTracking.done', { sku: 'E2E-ZINC', lot: code }),
  );
  // Its stock on the shelves already: Open the lot, no Copy code.
  await expect(
    message(page).getByRole('button', { name: 'Copy code' }),
  ).toHaveCount(0);
  const variant = page.getByRole('row', { name: /E2E-ZINC/ });
  await expect(variant.getByRole('cell', { name: 'Tracked' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Start tracking lots for E2E-ZINC…' }),
  ).toHaveCount(0);

  // The lot holds the stock on hand at both places, from the start (R15).
  await message(page).getByRole('button', { name: 'Open the lot' }).click();
  await expect(page).toHaveURL(/\/lots\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(code);
  await expect(
    page.getByText(said('inventory.trace.trackingStarted')).first(),
  ).toBeVisible();
  await expect(
    page.getByText(said('inventory.lot.supplierLotIs', { code: 'ZN-SUP-1' })),
  ).toBeVisible();
});

test('Stock, a code not tracked, its row’s Actions, Start tracking lots…: the question for the code; Escape or Cancel, focus on Actions; started, Stock still, the code’s row open at its lot at each place', async ({
  page,
  freshOrg,
}) => {
  const scene = await lotsScene(freshOrg.api);
  const code = await firstCodeToday(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await stockFrom(page, '/inventory?search=E2E-ZINC');

  // The code's row's Actions, its last choice (ADR-094, T2).
  const actions = page.getByRole('button', { name: 'Actions for E2E Zinc' });
  await actions.click();
  const choice = page.getByRole('menuitem', {
    name: 'Start tracking lots…',
    exact: true,
  });
  await expect(page.getByRole('menuitem').last()).toHaveText(
    'Start tracking lots…',
  );
  await choice.click();
  const dialog = page.getByRole('dialog', {
    name: 'Start tracking lots for E2E-ZINC',
  });
  await expect(
    dialog.getByText(
      said('products.startTracking.onHand', {
        quantity: '42 each',
        example: code,
      }),
    ),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(actions).toBeFocused();

  // From the keyboard alone, from where Cancel left it: the menu, End to
  // its last choice.
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem').first()).toBeFocused();
  await page.keyboard.press('End');
  await expect(choice).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(actions).toBeFocused();

  await actions.click();
  await choice.click();
  await dialog.getByRole('button', { name: 'Start tracking lots' }).click();

  // The message as the item's page gives it; Stock still, the code's row
  // open at both places, the lot at each.
  await expect(dialog).toBeHidden();
  await expect(message(page)).toContainText(
    said('products.startTracking.done', { sku: 'E2E-ZINC', lot: code }),
  );
  await expect(page).toHaveURL(/\/inventory\?/);
  for (const place of [scene.shelf, scene.other]) {
    await expect(lotsAt(page, place.name)).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  }
  await expect(lotRow(page, code)).toHaveCount(2);
});

test('The item’s page, By place and lot, a code not tracked: its line’s Start tracking lots… opens the question; Escape or Cancel, focus on it; started, the line gone and the lot listed at each place', async ({
  page,
  freshOrg,
}) => {
  const scene = await lotsScene(freshOrg.api);
  const code = await firstCodeToday(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await itemFrom(page, scene.zinc);

  // Under By place and lot, where "Lot: —" raises it (ADR-094, T3).
  const standing = page.getByRole('region', { name: 'Where it stands' });
  const line = standing.getByText(
    said('products.stock.notTracked', {
      sku: 'E2E-ZINC',
      start: said('products.variant.startTracking'),
    }),
  );
  await expect(line).toBeVisible();
  const start = line.getByRole('button', {
    name: 'Start tracking lots for E2E-ZINC…',
  });
  await start.click();
  const dialog = page.getByRole('dialog', {
    name: 'Start tracking lots for E2E-ZINC',
  });
  await expect(dialog.getByRole('listitem')).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(start).toBeFocused();

  // From the keyboard alone, from where Cancel left it.
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(start).toBeFocused();

  await start.click();
  await dialog.getByRole('button', { name: 'Start tracking lots' }).click();

  // The item's page still: the line gone, the lot at each place.
  await expect(dialog).toBeHidden();
  await expect(message(page)).toContainText(
    said('products.startTracking.done', { sku: 'E2E-ZINC', lot: code }),
  );
  await expect(page).toHaveURL(new RegExp(`/items/${scene.zinc.id}$`));
  await expect(line).toHaveCount(0);
  const byPlace = standing.getByRole('table').filter({
    has: page.getByRole('columnheader', { name: 'Expires' }),
  });
  for (const place of [scene.shelf, scene.other]) {
    await expect(
      byPlace
        .getByRole('row')
        .filter({ hasText: place.name })
        .getByRole('link', { name: code, exact: true }),
    ).toBeVisible();
  }
});

test('Stock, a lot’s Actions, Move to another lot…: Quantity, the lot it goes to, Expires as the lot’s, a note; Escape or Cancel, focus on Actions', async ({
  page,
  freshOrg,
}) => {
  const scene = await lotsScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await lotsOnStock(page, scene);

  const actions = page.getByRole('button', {
    name: `Actions for lot FO-0101 at ${scene.shelf.name}`,
  });
  await actions.click();
  await page
    .getByRole('menuitem', { name: 'Move to another lot…', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Move to another lot' });

  // From which lot and place, shown; the stock stays where it is.
  await expect(
    dialog.getByText(
      said('inventory.move.pileWithLot', {
        sku: 'E2E-FISH',
        lot: 'FO-0101',
        location: scene.shelf.name,
        amount: '20 each',
      }),
    ),
  ).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Quantity' })).toBeVisible();
  await expect(
    dialog.getByRole('combobox', { name: 'Lot number' }),
  ).toHaveValue('');
  // A new lot starts as the first lot is (E7).
  await expect(dialog.getByRole('radio', { name: 'On a date' })).toBeChecked();
  await expect(
    dialog.getByRole('textbox', { name: 'The day it expires' }),
  ).toHaveValue(FAR_OFF);
  await expect(dialog.getByRole('textbox', { name: 'Note' })).toHaveAttribute(
    'required',
  );

  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(actions).toBeFocused();

  // From the keyboard alone, from where Cancel left it: the menu, down to
  // Move to another lot…, its sixth choice (stock.spec.ts lists them).
  await page.keyboard.press('Enter');
  const choice = page.getByRole('menuitem', {
    name: 'Move to another lot…',
    exact: true,
  });
  await expect(page.getByRole('menuitem').first()).toBeFocused();
  for (let step = 0; step < 5; step += 1) {
    await page.keyboard.press('ArrowDown');
  }
  await expect(choice).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(actions).toBeFocused();
});

test('Move to another lot, Move to lot: one write; the message names both lots, and that the new one waits for a cost; Stock, both lots open', async ({
  page,
  freshOrg,
}) => {
  const scene = await lotsScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await lotsOnStock(page, scene);

  await page
    .getByRole('button', {
      name: `Actions for lot FO-0101 at ${scene.shelf.name}`,
    })
    .click();
  await page
    .getByRole('menuitem', { name: 'Move to another lot…', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Move to another lot' });
  await dialog.getByRole('textbox', { name: 'Quantity' }).fill('5');
  await dialog.getByRole('combobox', { name: 'Lot number' }).fill('FO-0101-B');
  await expect(
    dialog.getByRole('combobox', { name: 'Lot number' }),
  ).toHaveAccessibleDescription(said('inventory.lot.isNew'));
  await dialog
    .getByRole('textbox', { name: 'Note' })
    .fill('E2E two runs in one delivery');
  await dialog.getByRole('button', { name: 'Move to lot' }).click();

  // FO-0101 was received with no price: the moved stock waits too (3a).
  await expect(dialog).toBeHidden();
  await expect(message(page)).toContainText(
    said('inventory.moveLot.doneWaiting', {
      quantity: '5 each',
      from: 'FO-0101',
      to: 'FO-0101-B',
    }),
  );

  // Stock, the row open at the shelf, both lots there.
  await expect(lotsAt(page, scene.shelf.name)).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(
    lotRow(page, 'FO-0101')
      .getByRole('cell', { name: '15 each', exact: true })
      .first(),
  ).toBeVisible();
  await expect(
    lotRow(page, 'FO-0101-B')
      .getByRole('cell', { name: '5 each', exact: true })
      .first(),
  ).toBeVisible();
});

test('The Lot view, a lot’s Actions, Move to another lot…: moved; Group by Item, the row open at the lot’s place, both lots there', async ({
  page,
  freshOrg,
}) => {
  const scene = await lotsScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  // On the Lot view, so no place's row is open on Stock.
  await stockFrom(page, '/inventory?group=lot&search=E2E-FISH');

  await page
    .getByRole('button', {
      name: `Actions for lot FO-0101 at ${scene.shelf.name}`,
    })
    .click();
  await page
    .getByRole('menuitem', { name: 'Move to another lot…', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Move to another lot' });
  await dialog.getByRole('textbox', { name: 'Quantity' }).fill('6');
  await dialog.getByRole('combobox', { name: 'Lot number' }).fill('FO-0101-C');
  await dialog
    .getByRole('textbox', { name: 'Note' })
    .fill('E2E relabelled on arrival');
  await dialog.getByRole('button', { name: 'Move to lot' }).click();

  await expect(dialog).toBeHidden();
  await expect(message(page)).toContainText(
    said('inventory.moveLot.doneWaiting', {
      quantity: '6 each',
      from: 'FO-0101',
      to: 'FO-0101-C',
    }),
  );

  // Grouped by item: the code's row open at the shelf, both lots there.
  await page
    .getByRole('group', { name: 'Group by' })
    .getByRole('button', { name: 'Item' })
    .click();
  await expect(placesOf(page, 'E2E Fish Oil')).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(lotsAt(page, scene.shelf.name)).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(
    lotRow(page, 'FO-0101')
      .getByRole('cell', { name: '14 each', exact: true })
      .first(),
  ).toBeVisible();
  await expect(
    lotRow(page, 'FO-0101-C')
      .getByRole('cell', { name: '6 each', exact: true })
      .first(),
  ).toBeVisible();
});

test('The Lot view, Details to add: the lots with a supplier’s lot or an expiry to add, ?detailsToAdd=1; pressed again, the Lot view as it was; Back, the page before, as every list’s filter', async ({
  page,
  freshOrg,
}) => {
  const scene = await lotsScene(freshOrg.api);
  // Made here with no supplier's lot yet; typed, its expiry not known.
  const made = await receiveInto(
    freshOrg.api,
    scene.fishOil,
    scene.shelf,
    '6',
    {
      makeCode: true,
      expiry: 'date',
      expiresAt: '2031-06-01',
    },
  );
  await receiveInto(freshOrg.api, scene.fishOil, scene.other, '8', {
    code: 'FO-0303',
    expiry: 'unknown',
  });
  await signInAs(page, freshOrg.api);
  await stockFrom(page, '/inventory?group=lot');
  const lots = page.getByRole('main').getByRole('link', { name: /^(FO-|L-)/ });
  await expect(lots).toHaveText(['FO-0101', made.code, 'FO-0303']);

  const filter = page.getByRole('button', { name: /^Details to add/ });
  await expect(filter).toHaveAccessibleName('Details to add · 2 lots');
  await filter.click();

  await expect(page).toHaveURL(/[?&]detailsToAdd=1/);
  await expect(filter).toHaveAttribute('aria-pressed', 'true');
  await expect(lots).toHaveText([made.code, 'FO-0303']);
  await expect(
    lotRow(page, made.code).getByText(said('inventory.lot.supplierLotToAdd')),
  ).toBeVisible();
  await expect(
    lotRow(page, 'FO-0303').getByText(said('inventory.lot.expiryToAdd')),
  ).toBeVisible();

  // Pressed again, every lot as before; the filter replaced the address,
  // so Back leaves Stock and Forward brings it back (#341's rule).
  await filter.click();
  await expect(page).not.toHaveURL(/detailsToAdd/);
  await expect(lots).toHaveText(['FO-0101', made.code, 'FO-0303']);
  await filter.click();
  await expect(lots).toHaveText([made.code, 'FO-0303']);
  await page.goBack();
  await expect(page).toHaveURL(/\/locations$/);
  await page.goForward();
  await expect(filter).toHaveAttribute('aria-pressed', 'true');
  await expect(lots).toHaveText([made.code, 'FO-0303']);
});

test('A lot’s Actions, Edit lot details…: for a code made here, Supplier’s lot and Expires’ three choices; Escape, focus on Actions', async ({
  page,
  freshOrg,
}) => {
  const scene = await lotsScene(freshOrg.api);
  const made = await receiveInto(
    freshOrg.api,
    scene.fishOil,
    scene.shelf,
    '6',
    {
      makeCode: true,
      expiry: 'unknown',
    },
  );
  await signInAs(page, freshOrg.api);
  await lotsOnStock(page, scene);

  const actions = page.getByRole('button', {
    name: `Actions for lot ${made.code} at ${scene.shelf.name}`,
  });
  await actions.click();
  await page
    .getByRole('menuitem', { name: 'Edit lot details…', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: `Lot ${made.code}` });

  // Nothing printed its code: it may be corrected, its supplier's lot
  // added; its expiry one of three, as it stands now.
  await expect(
    dialog.getByRole('textbox', { name: 'Lot number' }),
  ).toBeEnabled();
  await expect(
    dialog.getByRole('textbox', { name: 'Supplier’s lot' }),
  ).toHaveValue('');
  const expires = dialog.getByRole('radiogroup', { name: 'Expires' });
  await expect(expires.getByRole('radio')).toHaveCount(3);
  await expect(
    expires.getByRole('radio', { name: 'Not known yet' }),
  ).toBeChecked();
  // Made here already: no mark to give.
  await expect(
    dialog.getByRole('checkbox', {
      name: 'We made this code up; nothing printed it',
    }),
  ).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(actions).toBeFocused();
});

test('A lot’s Actions, Edit lot details…, an older code typed up here: the check box, with the permission, lets its code be corrected; an Admin, without it, sees none', async ({
  page,
  freshOrg,
}) => {
  const scene = await lotsScene(freshOrg.api);
  await confirmEmailInDatabase(freshOrg.email);
  const admin = await memberIn(freshOrg.api, 'Admin');
  const editLot = async () => {
    await lotsOnStock(page, scene);
    await page
      .getByRole('button', {
        name: `Actions for lot FO-0101 at ${scene.shelf.name}`,
      })
      .click();
    await page
      .getByRole('menuitem', { name: 'Edit lot details…', exact: true })
      .click();
    return page.getByRole('dialog', { name: 'Lot FO-0101' });
  };
  const mark = (dialog: Locator) =>
    dialog.getByRole('checkbox', {
      name: 'We made this code up; nothing printed it',
    });

  // An Admin: the code printed, the way out a move (R7, the Owner's alone
  // at first).
  await signInAs(page, admin);
  let dialog = await editLot();
  await expect(mark(dialog)).toHaveCount(0);
  await expect(
    dialog.getByRole('textbox', { name: 'Lot number' }),
  ).toHaveAccessibleDescription(said('inventory.lot.codePrinted'));
  await page.keyboard.press('Escape');

  // The Owner: pointed to the box, which unlocks the code and the
  // supplier's lot in the same save.
  await signInAs(page, freshOrg.api);
  dialog = await editLot();
  const lotNumber = dialog.getByRole('textbox', { name: 'Lot number' });
  await expect(lotNumber).toBeDisabled();
  await expect(lotNumber).toHaveAccessibleDescription(
    said('inventory.lot.codePrintedOrMark'),
  );
  await mark(dialog).check();
  await expect(lotNumber).toBeEnabled();
  await lotNumber.fill('FO-0101-R');
  // A changed code asks why (ADR-094 amended, R8, E2a).
  await dialog
    .getByRole('textbox', { name: 'Why is the code changing?' })
    .fill('Typed up from a smudged label.');
  await dialog.getByRole('textbox', { name: 'Supplier’s lot' }).fill('SUP-1');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(dialog).toBeHidden();
  await expect(message(page)).toContainText(
    said('inventory.lot.savedWas', { code: 'FO-0101-R', was: 'FO-0101' }),
  );
  await expect(
    lotRow(page, 'FO-0101-R').getByText(
      said('inventory.lot.supplierLotIs', { code: 'SUP-1' }),
    ),
  ).toBeVisible();
  await admin.dispose();
});

test('A lot’s page, Who received it, the lot a row came through: that lot’s page; Back, the first lot’s page, focus on its row', async ({
  page,
  freshOrg,
}) => {
  const scene = await lotsScene(freshOrg.api);
  const second = await moveToNewLot(
    freshOrg.api,
    scene.first,
    scene.shelf,
    '8',
    'FO-0101-B',
  );
  const customer = await createPartner(freshOrg.api, {
    name: 'E2E Westend Clinic',
  });
  await shipFrom(
    freshOrg.api,
    customer,
    scene.fishOil,
    second,
    scene.shelf,
    '3',
  );
  await signInAs(page, freshOrg.api);
  await page.goto('/inventory');
  await page.goto(`/lots/${scene.first.id}`);

  // A customer who received only the second lot is on the first lot's
  // recall list, with the lot it came through (R21).
  const recipients = page.getByRole('table', { name: 'Who received it' });
  const row = recipients.getByRole('row', { name: /E2E Westend Clinic/ });
  const through = row.getByRole('link', { name: 'FO-0101-B', exact: true });
  await through.click();

  await expect(page).toHaveURL(new RegExp(`/lots/${second.id}$`));
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'FO-0101-B',
  );
  // It says where it came from, the first lot a link back to it, and so
  // does its cost history's lot change (review 34): each opens that lot.
  const firstLot = page
    .getByRole('main')
    .getByRole('link', { name: 'FO-0101', exact: true });
  await expect(firstLot).toHaveCount(2);
  for (const link of await firstLot.all()) {
    await expect(link).toHaveAttribute('href', `/lots/${scene.first.id}`);
  }

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/lots/${scene.first.id}$`));
  await expect(through).toBeFocused();
});

test('Organization › Documents, Lot codes, change the format and Save: the next code as typed; a format past 20 characters refused at its field', async ({
  page,
  freshOrg,
}) => {
  const first = await firstCodeToday(freshOrg.api);
  // The prefix as printed today, its number after it.
  const day = first.slice(0, -1);
  await signInAs(page, freshOrg.api);
  await page.goto('/settings/organization?tab=documents');

  const row = page.getByRole('row', { name: /^Lot codes/ });
  await expect(row.getByText(first, { exact: true })).toBeVisible();
  const prefix = row.getByRole('textbox', { name: 'Lot codes: Prefix' });
  const digits = row.getByRole('spinbutton', { name: 'Lot codes: Digits' });
  const save = page.getByRole('button', { name: 'Save numbering' });

  // L-2026-11-22- prints 13 characters: 8 digits make 21 (R2).
  await digits.fill('8');
  await expect(prefix).toHaveAccessibleDescription(
    said('settings.numbering.problem.tooLongWithDigits'),
  );
  await expect(save).toHaveAttribute('aria-disabled', 'true');

  await digits.fill('4');
  await expect(prefix).not.toHaveAccessibleDescription(
    said('settings.numbering.problem.tooLongWithDigits'),
  );
  await expect(row.getByText(`${day}0001`, { exact: true })).toBeVisible();
  await save.click();
  await page
    .getByRole('dialog', { name: 'Change the numbering?' })
    .getByRole('button', { name: 'Change numbering' })
    .click();

  await expect(message(page)).toContainText(said('settings.numbering.saved'));
  await expect(row.getByText(`${day}0001`, { exact: true })).toBeVisible();
  // The code the screen showed is the one the next lot made takes (R1).
  const fishOil = await createProduct(freshOrg.api, {
    name: 'E2E Fish Oil',
    sku: 'E2E-FISH',
    tracksLots: true,
  });
  const shelf = await createLocation(freshOrg.api, { name: 'E2E Shelf L1' });
  const made = await receiveInto(freshOrg.api, fishOil, shelf, '1', {
    makeCode: true,
    expiry: 'unknown',
  });
  expect(made.code).toBe(`${day}0001`);
});

// ---------------------------------------------------------------------------
// R5: a delivery with no lot on the box, its supplier's lot added later
// ---------------------------------------------------------------------------

test('Receive stock with a code made for us and no supplier’s lot: its lot reads “Supplier’s lot to add” and “Expiry to add” until Edit lot details adds them, and both marks go (R5)', async ({
  page,
  freshOrg,
}) => {
  const scene = await lotsScene(freshOrg.api);
  const code = await firstCodeToday(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await stockFrom(page);
  const dialog = await receiveStock(page, scene);
  await dialog.getByRole('button', { name: 'Make a code for us' }).click();
  await dialog.getByRole('button', { name: 'Receive', exact: true }).click();
  await expect(dialog).toBeHidden();

  // Its lot on Stock: both marks, until someone reads the box.
  await lotsOnStock(page, scene);
  const lot = lotRow(page, code);
  await expect(
    lot.getByText(said('inventory.lot.supplierLotToAdd')),
  ).toBeVisible();
  await expect(lot.getByText(said('inventory.lot.expiryToAdd'))).toBeVisible();

  await page
    .getByRole('button', {
      name: `Actions for lot ${code} at ${scene.shelf.name}`,
    })
    .click();
  await page
    .getByRole('menuitem', { name: 'Edit lot details…', exact: true })
    .click();
  const edit = page.getByRole('dialog', { name: `Lot ${code}` });
  await edit.getByRole('textbox', { name: 'Supplier’s lot' }).fill('SUP-7781');
  await edit.getByRole('radio', { name: 'On a date' }).check();
  await edit.getByRole('textbox', { name: 'The day it expires' }).fill(FAR_OFF);
  await edit.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(edit).toBeHidden();
  await expect(
    lot.getByText(said('inventory.lot.supplierLotIs', { code: 'SUP-7781' })),
  ).toBeVisible();
  await expect(lot.getByText('Mar 15, 2031')).toBeVisible();
  await expect(
    lot.getByText(said('inventory.lot.supplierLotToAdd')),
  ).toHaveCount(0);
  await expect(lot.getByText(said('inventory.lot.expiryToAdd'))).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// ADR-094 amended, the branch after: a lot's former codes, row by row of
// its interaction table (R9, R11), each with a lot of its own whose made
// code was corrected
// ---------------------------------------------------------------------------

/** A lot whose code was made, then corrected; `was` its code before. */
interface CorrectedLot extends SeededLot {
  was: string;
}

/**
 * Received into a code made for us, then corrected by Edit lot details'
 * route with its reason (R8): the made code is the lot's former code.
 */
async function correctedLot(
  api: APIRequestContext,
  product: SeededProduct,
  place: SeededLocation,
  code: string,
): Promise<CorrectedLot> {
  const made = await receiveInto(api, product, place, '6', {
    makeCode: true,
    expiry: 'unknown',
  });
  const corrected = await api.patch(`/v1/stock/lots/${made.id}`, {
    data: { code, reason: 'E2E typed from a smudged label' },
  });
  expect(corrected.ok(), await corrected.text()).toBeTruthy();
  return { id: made.id, code, was: made.code };
}

/** Text that starts with these words, read as they are. */
const startingWith = (words: string) =>
  new RegExp(`^${words.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);

/** A lot's grey line under its code, "was {code}". */
const wasLine = (code: string) => said('inventory.movements.was', { code });

/** Edit lot details opened from a lot's Actions on Stock. */
async function editLotDetails(page: Page, code: string, place: string) {
  await page
    .getByRole('button', { name: `Actions for lot ${code} at ${place}` })
    .click();
  await page
    .getByRole('menuitem', { name: 'Edit lot details…', exact: true })
    .click();
  return page.getByRole('dialog', { name: `Lot ${code}` });
}

test('Edit lot details, Lot number, change the code: “Why is the code changing?” shows, and is required; put the code back, the question goes', async ({
  page,
  freshOrg,
}) => {
  const scene = await lotsScene(freshOrg.api);
  const made = await receiveInto(
    freshOrg.api,
    scene.fishOil,
    scene.shelf,
    '6',
    {
      makeCode: true,
      expiry: 'unknown',
    },
  );
  await signInAs(page, freshOrg.api);
  await lotsOnStock(page, scene);
  const dialog = await editLotDetails(page, made.code, scene.shelf.name);

  const lotNumber = dialog.getByRole('textbox', { name: 'Lot number' });
  const why = dialog.getByRole('textbox', {
    name: 'Why is the code changing?',
  });
  // Asked only when the code changes (E2a).
  await expect(lotNumber).toHaveValue(made.code);
  await expect(why).toHaveCount(0);

  await lotNumber.fill('FO-0909');
  await expect(why).toBeVisible();
  await expect(why).toHaveAttribute('required');

  // Saved with no reason: refused at its field, focus there, nothing sent.
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(why).toHaveAccessibleDescription(
    said('inventory.lot.reasonMissing'),
  );
  await expect(why).toBeFocused();
  await expect(dialog).toBeVisible();

  // The lot's own code again, as the server compares it: no question.
  await lotNumber.fill(made.code.toLowerCase());
  await expect(why).toHaveCount(0);
});

test('Edit lot details, Save, the code changed: one write; the message names both codes, with Open the lot; Stock, the lot reading “was”; its page, “was” by its title, Former codes and “shipped as” in Who received it (R9)', async ({
  page,
  freshOrg,
}) => {
  const scene = await lotsScene(freshOrg.api);
  const made = await receiveInto(
    freshOrg.api,
    scene.fishOil,
    scene.shelf,
    '6',
    {
      makeCode: true,
      expiry: 'unknown',
    },
  );
  const customer = await createPartner(freshOrg.api, {
    name: 'E2E Harbour Clinic',
  });
  // Shipped under the made code, before it was corrected (E3a).
  await shipFrom(freshOrg.api, customer, scene.fishOil, made, scene.shelf, '2');
  await signInAs(page, freshOrg.api);
  await lotsOnStock(page, scene);
  const dialog = await editLotDetails(page, made.code, scene.shelf.name);

  await dialog.getByRole('textbox', { name: 'Lot number' }).fill('FO-0909');
  await dialog
    .getByRole('textbox', { name: 'Why is the code changing?' })
    .fill('E2E typed from a smudged label');
  const [saved] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        new URL(response.url()).pathname === `/api/v1/stock/lots/${made.id}`,
    ),
    dialog.getByRole('button', { name: 'Save', exact: true }).click(),
  ]);
  // Read before the screen moves on, which takes its body with it.
  expect(saved.ok()).toBe(true);

  // Where it was opened: Stock, the lot under its new code, the old one
  // a grey line under it.
  await expect(dialog).toBeHidden();
  await expect(message(page)).toContainText(
    said('inventory.lot.savedWas', { code: 'FO-0909', was: made.code }),
  );
  await expect(
    lotRow(page, 'FO-0909').getByText(wasLine(made.code)),
  ).toBeVisible();

  await message(page).getByRole('button', { name: 'Open the lot' }).click();
  await expect(page).toHaveURL(new RegExp(`/lots/${made.id}$`));
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'FO-0909',
  );
  const main = page.getByRole('main');
  await expect(
    main.getByText(wasLine(made.code), { exact: true }),
  ).toBeVisible();
  await expect(
    main.getByRole('heading', { name: 'Former codes', exact: true }),
  ).toBeVisible();
  await expect(main.getByText('E2E typed from a smudged label')).toBeVisible();
  // The boxes the clinic holds carry the old code.
  await expect(
    page
      .getByRole('table', { name: 'Who received it' })
      .getByRole('row', { name: /E2E Harbour Clinic/ }),
  ).toContainText(said('inventory.trace.shippedAs', { code: made.code }));
});

test('Receive stock, an order’s Receive, Count it in…, Move to another lot; Lot number, another lot’s former code: refused at the field, naming that lot, with Use; Use, the field takes it, what else was typed kept', async ({
  page,
  freshOrg,
}) => {
  test.setTimeout(60_000);
  const scene = await lotsScene(freshOrg.api);
  const lot = await correctedLot(
    freshOrg.api,
    scene.fishOil,
    scene.shelf,
    'FO-0909',
  );
  const refusal = said('inventory.lot.formerCode', {
    code: lot.was,
    lot: lot.code,
  });
  const use = (dialog: Locator) =>
    dialog.getByRole('button', { name: `Use ${lot.code}`, exact: true });
  await signInAs(page, freshOrg.api);

  // Receive stock: refused as it is typed (4a); Use, the lot it names,
  // which this adds to, the quantity kept.
  await stockFrom(page);
  let dialog = await receiveStock(page, scene);
  let lotNumber = dialog.getByRole('combobox', { name: 'Lot number' });
  await lotNumber.fill(lot.was);
  await expect(lotNumber).toHaveAccessibleDescription(refusal);
  await use(dialog).click();
  await expect(lotNumber).toHaveValue(lot.code);
  await expect(lotNumber).toHaveAccessibleDescription(
    startingWith(said('inventory.lot.isExisting')),
  );
  await expect(use(dialog)).toHaveCount(0);
  await expect(dialog.getByRole('textbox', { name: 'Quantity' })).toHaveValue(
    '12',
  );
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // An order's Receive, the same field; the order made only now, since
  // Receive stock would first ask whether this is its delivery.
  const supplier = await createPartner(freshOrg.api, {
    name: 'E2E Ocean Supply',
  });
  const purchase = await orderOf(
    freshOrg.api,
    supplier,
    'purchase',
    scene.fishOil,
    '50',
  );
  await page.goto(`/orders/${purchase.id}`);
  await page.getByRole('button', { name: 'Receive', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Receive E2E-FISH' });
  await dialog.getByRole('textbox', { name: 'Quantity' }).fill('15');
  lotNumber = dialog.getByRole('combobox', { name: 'Lot number' });
  await lotNumber.fill(lot.was);
  await expect(lotNumber).toHaveAccessibleDescription(refusal);
  await use(dialog).click();
  await expect(lotNumber).toHaveValue(lot.code);
  await expect(dialog.getByRole('textbox', { name: 'Quantity' })).toHaveValue(
    '15',
  );
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // Count it in…, A new lot: Use takes the lot as One of its lots, since
  // a new lot must be new.
  await stockFrom(page, '/inventory?search=E2E-FISH');
  await placesOf(page, 'E2E Fish Oil').click();
  await page.getByRole('button', { name: 'Count it in E2E-FISH…' }).click();
  dialog = page.getByRole('dialog', { name: 'Correct the count' });
  await dialog
    .getByRole('textbox', { name: 'What happened' })
    .fill('E2E found behind the pallet');
  await dialog.getByRole('radio', { name: 'A new lot' }).check();
  lotNumber = dialog.getByRole('textbox', { name: 'Lot number' });
  await lotNumber.fill(lot.was);
  await expect(lotNumber).toHaveAccessibleDescription(refusal);
  await use(dialog).click();
  const itsLots = dialog.getByRole('radio', { name: 'One of its lots' });
  await expect(itsLots).toBeChecked();
  await expect(itsLots).toBeFocused();
  await expect(dialog.getByRole('combobox', { name: 'Lot' })).toContainText(
    lot.code,
  );
  await expect(
    dialog.getByRole('textbox', { name: 'What happened' }),
  ).toHaveValue('E2E found behind the pallet');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // Move to another lot: Use, the stock goes into that lot.
  await lotsOnStock(page, scene);
  await page
    .getByRole('button', {
      name: `Actions for lot FO-0101 at ${scene.shelf.name}`,
    })
    .click();
  await page
    .getByRole('menuitem', { name: 'Move to another lot…', exact: true })
    .click();
  dialog = page.getByRole('dialog', { name: 'Move to another lot' });
  await dialog.getByRole('textbox', { name: 'Quantity' }).fill('5');
  lotNumber = dialog.getByRole('combobox', { name: 'Lot number' });
  await lotNumber.fill(lot.was);
  await expect(lotNumber).toHaveAccessibleDescription(refusal);
  await use(dialog).click();
  await expect(lotNumber).toHaveValue(lot.code);
  await expect(dialog.getByRole('textbox', { name: 'Quantity' })).toHaveValue(
    '5',
  );
});

test('Stock, the Lot view, the top bar, Movements’ find box, Trace a lot; type a former code: the lot, saying “was” (R9, R10)', async ({
  page,
  freshOrg,
}) => {
  test.setTimeout(60_000);
  const scene = await lotsScene(freshOrg.api);
  const lot = await correctedLot(
    freshOrg.api,
    scene.fishOil,
    scene.shelf,
    'FO-0909',
  );
  const was = wasLine(lot.was);
  await signInAs(page, freshOrg.api);

  // Stock: the item found, its lot under today's code.
  await stockFrom(page, `/inventory?search=${lot.was}`);
  await placesOf(page, 'E2E Fish Oil').click();
  await lotsAt(page, scene.shelf.name).click();
  await expect(lotRow(page, lot.code).getByText(was)).toBeVisible();

  // The Lot view: that lot alone.
  await page.goto(`/inventory?group=lot&search=${lot.was}`);
  const lots = page.getByRole('main').getByRole('link', { name: /^(FO-|L-)/ });
  await expect(lots).toHaveText([lot.code]);
  await expect(lotRow(page, lot.code).getByText(was)).toBeVisible();

  // The top bar: the lot, its title today's code; Enter opens it.
  const box = page.getByRole('combobox', { name: 'Search everything' });
  await box.fill(lot.was);
  await expect(
    page.getByRole('option', { name: new RegExp(`^${lot.code} · ${was}`) }),
  ).toBeVisible();
  await box.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/lots/${lot.id}$`));

  // Movements' find box: the lot found by its whole former code, offered.
  await page.goto('/movements');
  await page
    .getByRole('combobox', { name: 'Find an item, lot or order' })
    .fill(lot.was);
  await expect(
    page.getByRole('option', {
      name: new RegExp(`^Lot ${lot.code} · ${was} · `),
    }),
  ).toBeVisible();

  // Trace a lot: no lot has the code today, so a list, the lot in it.
  await page.goto(`/lots?code=${lot.was}`);
  const found = page.getByRole('table', { name: 'Trace a lot' });
  await expect(found.getByRole('link', { name: lot.code })).toBeVisible();
  await expect(found.getByText(was)).toBeVisible();
});

/** A day as the server's messages write it in English: "Nov 25, 2026". */
const dayInEnglish = (day: string) =>
  new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));

test('A run’s Record output, Batch number, another lot’s former code, Record: refused at the field, naming that lot, with no button; another code, recorded', async ({
  page,
  freshOrg,
}) => {
  const scene = await lotsScene(freshOrg.api);
  const lot = await correctedLot(
    freshOrg.api,
    scene.fishOil,
    scene.shelf,
    'FO-0909',
  );
  const runId = await releasedRun(freshOrg.api, scene.fishOil, scene.shelf);
  // The day the code stopped being the lot's, the organization's today.
  const today = lot.was.slice('L-'.length, 'L-YYYY-MM-DD'.length);
  await signInAs(page, freshOrg.api);
  await page.goto(`/production/${runId}`);

  await page
    .getByRole('button', { name: 'Record output', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Record output' });
  await dialog.getByRole('textbox', { name: 'Finished this time' }).fill('4');
  const batch = dialog.getByRole('textbox', { name: 'Batch number' });
  await batch.fill(lot.was);
  await dialog.getByRole('button', { name: 'Record', exact: true }).click();

  // The server's refusal under the field, focus there, what was typed
  // kept; another lot being made, so no Use (8a).
  await expect(batch).toHaveAccessibleDescription(
    saidBy('en', 'stock.lotCodeFormer', {
      code: lot.was,
      lot: lot.code,
      day: dayInEnglish(today),
    }),
  );
  await expect(batch).toBeFocused();
  await expect(batch).toHaveValue(lot.was);
  await expect(dialog.getByRole('button', { name: /^Use / })).toHaveCount(0);

  await batch.fill('FO-1001');
  await expect(batch).not.toHaveAccessibleDescription(/never given/);
  await dialog.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByText(said('production.output.recorded')),
  ).toBeVisible();
});
