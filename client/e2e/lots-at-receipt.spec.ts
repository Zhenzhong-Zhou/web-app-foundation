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
import { saidOn } from './support/said';
import { orderOf } from './support/stock';

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

test('The item’s page, a code not tracked, Start tracking lots…: the question, its places listed, Supplier’s lot and Expires optional; Escape or Cancel, focus on the button, and Cancel changes nothing', async ({
  page,
  freshOrg,
}) => {
  const scene = await lotsScene(freshOrg.api);
  const code = await firstCodeToday(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await itemFrom(page, scene.zinc);

  const start = page.getByRole('button', {
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
  // Both optional, Expires with none chosen, saying what that means.
  const supplierLot = dialog.getByRole('textbox', { name: 'Supplier’s lot' });
  await expect(supplierLot).not.toHaveAttribute('required');
  const expires = dialog.getByRole('radiogroup', { name: 'Expires' });
  await expect(expires.getByRole('radio', { checked: true })).toHaveCount(0);
  await expect(expires).toHaveAccessibleDescription(
    said('products.startTracking.expiry.help'),
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

  await page
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
  await dialog.getByRole('textbox', { name: 'Supplier’s lot' }).fill('SUP-1');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(dialog).toBeHidden();
  await expect(message(page)).toContainText(said('inventory.lot.saved'));
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
  // It says where it came from: the first lot, a link back to it.
  await expect(
    page.getByRole('main').getByRole('link', { name: 'FO-0101', exact: true }),
  ).toBeVisible();

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
