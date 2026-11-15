import { readFile } from 'node:fs/promises';

import type {
  APIRequestContext,
  Locator,
  Page,
  Request,
} from '@playwright/test';

import { expect, test } from './fixtures';
import {
  created,
  createProduct,
  inviteByLink,
  joinByLink,
  signInAs,
  uniqueEmail,
} from './support/api';
import { asOrganizationFromBefore } from './support/database';
import { confirmEmailInDatabase } from './support/mail';
import { saidBy, saidOn, TEXT } from './support/said';

/**
 * The language items are named in (ADR-054, amended for #531), row by
 * row: each row of the amendment's interaction table is one test here,
 * named by its words, "where, what you do: what happens". Choosing the
 * language on the Documents tab and its confirmation, then the own name
 * as that language's name on the item's page, in Edit names, on an
 * invoice, in Add item and in the export.
 *
 * One row is the server's: "The confirmation, more than 500 rows". No
 * test hook lowers the limit, so server/test/product-name-language.e2e-spec.ts
 * holds it ("refuses more than 500 names to choose, naming how many"),
 * and the confirmation's unit test holds its refusal at the field
 * (client/src/settings/item-names-section.test.tsx).
 *
 * Each test makes its own organization, since each sets the language its
 * items are named in. One registered here is named in English, as a new
 * one takes the registering person's language; a test choosing the
 * language makes it one from before, not set, the case the confirmation
 * is for. Setup goes through the API; the UI is driven for the row alone.
 */

test.use({ locale: 'en-US' });

/** A screen's line, in English, read by its id (conventions.md, Tests). */
const say = (
  id: string,
  values?: Record<string, string | number | typeof TEXT>,
) => saidOn('en', id, values);

/** Chinese, as an English reader's screens name it. */
const CHINESE = 'Chinese';

async function ok(
  response: Awaited<ReturnType<APIRequestContext['patch']>>,
): Promise<void> {
  expect(response.ok(), await response.text()).toBeTruthy();
}

/** The organization made one from before: its items named in no language. */
async function fromBefore(api: APIRequestContext): Promise<void> {
  const { organization } = await created<{ organization: { id: string } }>(
    await api.get('/v1/organization'),
  );
  await asOrganizationFromBefore(organization.id);
}

/** Items named in a language, chosen with no name to choose. */
async function namedIn(api: APIRequestContext, language: string) {
  await created(
    await api.put('/v1/organization/product-name-language', {
      data: { language, choices: [] },
    }),
  );
}

/** The languages documents require an item's name in. */
async function requiring(api: APIRequestContext, languages: string[]) {
  await ok(
    await api.patch('/v1/organization', {
      data: { requiredNameLanguages: languages },
    }),
  );
}

/** Its names in other languages, replaced as a set, as Edit names saves. */
async function keepNames(
  api: APIRequestContext,
  productId: string,
  translations: { locale: string; name: string }[],
) {
  await ok(
    await api.put(`/v1/products/${productId}/translations`, {
      data: { translations },
    }),
  );
}

/**
 * An item by its own name, with the names kept for it in other languages,
 * and its variation's own name where it has one; its code from a Latin
 * name, else given.
 */
async function item(
  api: APIRequestContext,
  name: string,
  {
    sku = name.toUpperCase().replace(/\W+/g, '-'),
    variant,
    kept = [],
  }: {
    sku?: string;
    variant?: string;
    kept?: { locale: string; name: string }[];
  } = {},
) {
  const product = await createProduct(api, { name, sku, variantName: variant });
  if (kept.length > 0) await keepNames(api, product.id, kept);
  return product;
}

/** The Documents tab, open, in the browser of the organization's Owner. */
async function documentsTab(page: Page, api: APIRequestContext) {
  await signInAs(page, api);
  await page.goto('/settings/organization?tab=documents');
  await expect(
    page.getByRole('heading', { name: say('settings.itemNames.title') }),
  ).toBeVisible();
}

/** "Items are named in" set to Chinese, then Save: the confirmation. */
async function chooseChinese(page: Page) {
  await page
    .getByRole('combobox', { name: say('settings.itemNames.language') })
    .click();
  await page.getByRole('option', { name: '简体中文' }).click();
  await page
    .getByRole('button', { name: say('settings.itemNames.save') })
    .click();
  const dialog = page.getByRole('dialog', {
    name: say('settings.itemNames.confirm.title', { language: CHINESE }),
  });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** The confirmation's main button. */
const nameItems = (dialog: Locator) =>
  dialog.getByRole('button', {
    name: say('settings.itemNames.confirm.action', { language: CHINESE }),
  });

/** Each choice the browser sends, so a test can say none was. */
function choicesSent(page: Page): Request[] {
  const sent: Request[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'PUT' &&
      new URL(request.url()).pathname ===
        '/api/v1/organization/product-name-language'
    ) {
      sent.push(request);
    }
  });
  return sent;
}

/** The organization's language, as the server keeps it. */
async function languageOf(api: APIRequestContext) {
  const { organization } = await created<{
    organization: { productNameLanguage: string | null };
  }>(await api.get('/v1/organization'));
  return organization.productNameLanguage;
}

// ---------------------------------------------------------------------------
// The interaction table, row by row
// ---------------------------------------------------------------------------

test('Organization → Documents, Item names, Chinese then Save: the confirmation says what it will do and the copies it removes; Cancel, nothing changed', async ({
  page,
  freshOrg,
}) => {
  const api = freshOrg.api;
  await fromBefore(api);
  // Its Chinese name the same as its own: a copy.
  const focus = await item(api, 'Focus', {
    kept: [{ locale: 'zh-Hans', name: 'Focus' }],
  });
  await item(api, 'Calm');
  await documentsTab(page, api);

  const dialog = await chooseChinese(page);
  await expect(
    dialog.getByText(
      say('settings.itemNames.confirm.lead', {
        items: 2,
        variants: 0,
        language: CHINESE,
        changing: 'no',
        from: '',
      }),
    ),
  ).toBeVisible();
  await expect(
    dialog.getByText(
      say('settings.itemNames.confirm.copies', { count: 1, language: CHINESE }),
    ),
  ).toBeVisible();

  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();

  // Nothing changed: still not set, and the copy still kept.
  expect(await languageOf(api)).toBeNull();
  const { translations } = await created<{
    translations: { locale: string; name: string }[];
  }>(await api.get(`/v1/products/${focus.id}`));
  expect(translations).toEqual([
    expect.objectContaining({ locale: 'zh-Hans', name: 'Focus' }),
  ]);
  await page.reload();
  await expect(
    page.getByRole('combobox', { name: say('settings.itemNames.language') }),
  ).toHaveText(say('settings.itemNames.notSetChoice'));
});

test('the confirmation, nothing differing, Name items in Chinese: saved, “Items are named in Chinese.”; Chinese met under the required languages', async ({
  page,
  freshOrg,
}) => {
  const api = freshOrg.api;
  await fromBefore(api);
  await requiring(api, ['zh-Hans']);
  await item(api, '专注胶囊', { sku: 'FOCUS-60CT' });
  await documentsTab(page, api);

  const dialog = await chooseChinese(page);
  await nameItems(dialog).click();

  await expect(
    page.getByText(say('settings.itemNames.saved', { language: CHINESE })),
  ).toBeVisible();
  await expect(dialog).toBeHidden();
  const chinese = page
    .getByRole('group', { name: say('settings.itemNames.required') })
    .getByRole('checkbox', { name: /^简体中文/ });
  await expect(chinese).toBeChecked();
  await expect(chinese).toBeDisabled();
  await expect(chinese).toHaveAccessibleDescription(
    say('settings.itemNames.met'),
  );
  // Set, so the line asking for it has gone.
  await expect(page.getByText(say('settings.itemNames.notSet'))).toHaveCount(0);
  expect(await languageOf(api)).toBe('zh-Hans');
});

test('the confirmation, names that differ, Name items in Chinese with a row left: refused at the row, focus on it, nothing sent; each chosen, saved with its counts, the item renamed, its History saying so', async ({
  page,
  freshOrg,
}) => {
  const api = freshOrg.api;
  await fromBefore(api);
  const calm = await item(api, 'Calm 90ct', {
    kept: [{ locale: 'zh-Hans', name: '安神胶囊' }],
  });
  await item(api, 'Focus', { kept: [{ locale: 'zh-Hans', name: '专注' }] });
  await item(api, 'Sleep', { kept: [{ locale: 'zh-Hans', name: 'Sleep' }] });
  await documentsTab(page, api);
  const sent = choicesSent(page);

  const dialog = await chooseChinese(page);
  await expect(
    dialog.getByText(
      say('settings.itemNames.confirm.choose', { count: 2, language: CHINESE }),
    ),
  ).toBeVisible();
  // Focus keeps its own name; Calm 90ct is left.
  await dialog.getByRole('radio', { name: 'Focus', exact: true }).check();
  await nameItems(dialog).click();

  // Refused at the row, focus on its first choice, and nothing sent.
  const calmsOwn = dialog.getByRole('radio', {
    name: 'Calm 90ct',
    exact: true,
  });
  await expect(calmsOwn).toBeFocused();
  await expect(
    dialog.getByRole('alert').filter({
      hasText: say('settings.itemNames.left', { count: 1 }),
    }),
  ).toContainText('Calm 90ct');
  await expect(
    dialog
      .getByRole('row')
      .filter({ hasText: '安神胶囊' })
      .getByText(say('settings.itemNames.chooseOne')),
  ).toBeVisible();
  expect(sent).toHaveLength(0);

  // Only the row left, then its column's heading: the Chinese name.
  await dialog
    .getByRole('button', {
      name: new RegExp(`^${say('settings.itemNames.filter.left')}`),
    })
    .click();
  await expect(dialog.getByRole('row').filter({ hasText: '专注' })).toHaveCount(
    0,
  );
  await dialog
    .getByRole('button', {
      name: say('settings.itemNames.column.choose', {
        column: say('settings.itemNames.column.kept', { language: CHINESE }),
      }),
    })
    .click();
  await expect(
    dialog.getByRole('radio', { name: '安神胶囊', exact: true }),
  ).toBeChecked();
  await expect(
    dialog.getByText(
      say('settings.itemNames.chosenCount', { chosen: 2, total: 2 }),
    ),
  ).toBeVisible();

  await nameItems(dialog).click();
  await expect(
    page.getByText(
      say('settings.itemNames.savedWithCounts', {
        language: CHINESE,
        counts: new Intl.ListFormat('en', { type: 'conjunction' }).format([
          say('settings.itemNames.savedCopies', { count: 1 }),
          say('settings.itemNames.savedRenamed', { count: 1 }),
        ]),
      }),
    ),
  ).toBeVisible();
  await expect(dialog).toBeHidden();
  expect(sent).toHaveLength(1);

  // Renamed, as Edit renames, and its History says so.
  await page.goto(`/items/${calm.id}`);
  await expect(
    page.getByRole('heading', { level: 1, name: '安神胶囊' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'History' }).click();
  await expect(
    page.getByRole('presentation').filter({ hasText: 'History' }),
  ).toContainText('Calm 90ct → 安神胶囊');
});

test('the confirmation, a name changed meanwhile, Name items in Chinese: the names changed, the list read again, a row gone named, a new one marked New, each other choice kept', async ({
  page,
  freshOrg,
}) => {
  const api = freshOrg.api;
  await fromBefore(api);
  const calm = await item(api, 'Calm', {
    kept: [{ locale: 'zh-Hans', name: '安神' }],
  });
  await item(api, 'Focus', { kept: [{ locale: 'zh-Hans', name: '专注' }] });
  const sleep = await item(api, 'Sleep');
  await documentsTab(page, api);

  const dialog = await chooseChinese(page);
  await dialog.getByRole('radio', { name: 'Calm', exact: true }).check();
  await dialog.getByRole('radio', { name: '专注', exact: true }).check();

  // Meanwhile, someone else: Calm's Chinese name removed, and one kept
  // for Sleep that differs.
  await keepNames(api, calm.id, []);
  await keepNames(api, sleep.id, [{ locale: 'zh-Hans', name: '睡眠' }]);

  await nameItems(dialog).click();

  // The refusal, focused, saying nothing was saved, and the row gone.
  const refusal = dialog.getByRole('alert', { name: 'Error' });
  await expect(refusal).toContainText(saidBy('en', 'products.namesChanged'));
  await expect(refusal).toContainText(
    say('settings.itemNames.gone', { names: 'Calm' }),
  );
  await expect(page.locator(':focus')).toContainText(
    saidBy('en', 'products.namesChanged'),
  );
  // Read again: the new row marked New and not chosen, the other kept.
  const sleepsRow = dialog.getByRole('row').filter({ hasText: '睡眠' });
  await expect(sleepsRow).toContainText(say('settings.itemNames.new'));
  await expect(
    dialog.getByRole('radio', { name: '睡眠', exact: true }),
  ).not.toBeChecked();
  await expect(
    dialog.getByRole('radio', { name: '专注', exact: true }),
  ).toBeChecked();
  await expect(dialog.getByRole('row').filter({ hasText: '安神' })).toHaveCount(
    0,
  );
  await expect(
    dialog.getByText(
      say('settings.itemNames.chosenCount', { chosen: 1, total: 2 }),
    ),
  ).toBeVisible();
  expect(await languageOf(api)).toBeNull();
});

test('Item names, a required language ticked and none set, the Documents tab: the section’s line says to choose the language items are named in', async ({
  page,
  freshOrg,
}) => {
  const api = freshOrg.api;
  await fromBefore(api);
  await requiring(api, ['zh-Hans']);
  await documentsTab(page, api);

  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: say('settings.itemNames.notSet') }),
  ).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: say('settings.itemNames.language') }),
  ).toHaveText(say('settings.itemNames.notSetChoice'));
});

test('an item’s page, Names in other languages, the Chinese column: the own name, marked as the item’s own, never Missing', async ({
  page,
  freshOrg,
}) => {
  const api = freshOrg.api;
  await namedIn(api, 'zh-Hans');
  // English too, which no name is kept in: Missing there, as before.
  await requiring(api, ['zh-Hans', 'en']);
  const focus = await item(api, '专注胶囊', {
    sku: 'FOCUS-60CT',
    variant: '60粒',
  });
  await signInAs(page, api);
  await page.goto(`/items/${focus.id}`);

  const table = page.getByRole('table', {
    name: say('products.translations.title'),
  });
  // The items' own language first.
  await expect(table.getByRole('columnheader').nth(1)).toContainText(
    '简体中文',
  );
  const [itemRow, variantRow] = [
    table.getByRole('row').nth(1),
    table.getByRole('row').nth(2),
  ];
  for (const [row, own, kind] of [
    [itemRow, '专注胶囊', 'item'],
    [variantRow, '60粒', 'variant'],
  ] as const) {
    const chinese = row.getByRole('cell').first();
    await expect(chinese.locator('[lang="zh-Hans"]')).toHaveText(own);
    await expect(chinese).toContainText(say('products.names.own', { kind }));
    await expect(chinese).not.toContainText(say('products.names.missing'));
    // English, required and kept for neither, is Missing.
    await expect(row.getByRole('cell').nth(1)).toContainText(
      say('products.names.missing'),
    );
  }
  // The line above names the English ones alone.
  const which = (row: string) =>
    say('products.names.which', { language: 'English', row });
  await expect(
    page.getByRole('alert').filter({
      hasText: say('products.names.missingLine', {
        count: 2,
        names: new Intl.ListFormat('en', { type: 'conjunction' }).format([
          which(say('products.names.row.item')),
          which(say('products.names.row.variant', { sku: 'FOCUS-60CT' })),
        ]),
      }),
    }),
  ).toBeVisible();
});

test('an item’s page, the items’ language not set, for whoever may choose it: each own name labelled, and the table’s description says why, its link landing on Item names, the heading focused', async ({
  page,
  freshOrg,
}) => {
  const api = freshOrg.api;
  await fromBefore(api);
  const focus = await item(api, 'Focus', { sku: 'FOC-60', variant: '60ct' });
  await signInAs(page, api);
  await page.goto(`/items/${focus.id}`);

  const table = page.getByRole('table', {
    name: say('products.translations.title'),
  });
  await expect(table.getByRole('rowheader', { name: /Focus/ })).toContainText(
    say('products.names.own', { kind: 'item' }),
  );
  await expect(table.getByRole('rowheader', { name: /60ct/ })).toContainText(
    say('products.names.own', { kind: 'variant' }),
  );
  // A screen reader hears the line with the table, not only before it.
  await expect(table).toHaveAccessibleDescription(
    say('products.names.notSet.choose', { link: TEXT }),
  );

  await page.getByRole('link', { name: 'Organization → Documents' }).click();
  await expect(page).toHaveURL(
    /\/settings\/organization\?tab=documents#item-names$/,
  );
  const heading = page.getByRole('heading', {
    name: say('settings.itemNames.title'),
  });
  await expect(heading).toBeFocused();
  await expect(heading).toBeInViewport();
});

test('an item’s page, the items’ language not set, for a Viewer: the line says who can choose it, with no link', async ({
  page,
  freshOrg,
}) => {
  const api = freshOrg.api;
  await fromBefore(api);
  const focus = await item(api, 'Focus', {
    sku: 'FOC-60',
    kept: [{ locale: 'zh-Hans', name: '专注' }],
  });
  // An Owner invites only once their own address is confirmed (ADR-077).
  await confirmEmailInDatabase(freshOrg.email);
  const { token } = await inviteByLink(api, uniqueEmail('names-viewer'));
  const viewer = await joinByLink(token, 'E2E Viewer');
  await signInAs(page, viewer);
  await page.goto(`/items/${focus.id}`);

  const table = page.getByRole('table', {
    name: say('products.translations.title'),
  });
  await expect(table).toHaveAccessibleDescription(
    say('products.names.notSet.ask'),
  );
  await expect(
    page.getByRole('link', { name: 'Organization → Documents' }),
  ).toHaveCount(0);
  await viewer.dispose();
});

test('Edit names, open it: no Chinese field; a line says the item’s own name is its Chinese name, changed with Edit', async ({
  page,
  freshOrg,
}) => {
  const api = freshOrg.api;
  await namedIn(api, 'zh-Hans');
  await requiring(api, ['zh-Hans']);
  const focus = await item(api, '专注胶囊', { sku: 'FOCUS-60CT' });
  await signInAs(page, api);
  await page.goto(`/items/${focus.id}`);

  await page
    .getByRole('button', { name: say('products.translations.edit') })
    .click();
  const dialog = page.getByRole('dialog', {
    name: say('products.translations.title'),
  });
  await expect(
    dialog.getByText(
      say('products.translations.ownLanguage', {
        language: CHINESE,
        name: '专注胶囊',
      }),
    ),
  ).toBeVisible();
  for (const field of [
    'products.translations.name',
    'products.translations.description',
  ]) {
    await expect(
      dialog.getByRole('textbox', { name: say(field, { language: CHINESE }) }),
    ).toHaveCount(0);
  }
  // The other languages keep their fields.
  await expect(
    dialog.getByRole('textbox', {
      name: say('products.translations.name', { language: 'English' }),
    }),
  ).toBeVisible();

  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
});

/**
 * A draft invoice for a customer whose documents print in Chinese, its one
 * line an item named only by its own name: everything issuing needs, as
 * invoicing.spec.ts seeds it, with one tax code, Exempt.
 */
async function seedChineseDraft(api: APIRequestContext): Promise<string> {
  await ok(
    await api.put('/v1/organization/address', {
      data: { line1: '100 Main St', city: 'Vancouver', country: 'CA' },
    }),
  );
  const { partner } = await created<{ partner: { id: string } }>(
    await api.post('/v1/partners', {
      data: {
        name: 'Pacific Herbal Trading',
        code: 'PHT',
        documentLanguage: 'zh-Hans',
      },
    }),
  );
  await created(
    await api.post(`/v1/partners/${partner.id}/addresses`, {
      data: {
        line1: '9 Harbour Rd',
        country: 'CA',
        isBilling: true,
        isDefault: true,
      },
    }),
  );
  const { variantId } = await item(api, '专注胶囊', { sku: 'FOCUS-60CT' });
  const { location } = await created<{ location: { id: string } }>(
    await api.post('/v1/locations', { data: { type: 'site', name: 'Shelf' } }),
  );
  await created(
    await api.post('/v1/stock/movements', {
      data: {
        variantId,
        toLocationId: location.id,
        quantity: '10',
        reason: 'receipt',
      },
    }),
  );
  const { taxCode } = await created<{ taxCode: { id: string } }>(
    await api.post('/v1/tax-codes', {
      data: { name: 'Exempt', components: [] },
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
            variantId,
            quantityOrdered: '6',
            unitPrice: '12.50',
            currency: 'CAD',
          },
        ],
      },
    }),
  );
  await ok(
    await api.patch(`/v1/orders/${order.id}`, {
      data: { status: 'confirmed' },
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
  const { invoice } = await created<{ invoice: { id: string } }>(
    await api.post('/v1/invoices', {
      data: { shipmentId: shipment.id, taxCodeId: taxCode.id },
    }),
  );
  return invoice.id;
}

test('an invoice in Chinese, required, Issue with its items named only by their own names: issued', async ({
  page,
  freshOrg,
}) => {
  const api = freshOrg.api;
  await namedIn(api, 'zh-Hans');
  await requiring(api, ['zh-Hans']);
  const invoiceId = await seedChineseDraft(api);
  await signInAs(page, api);
  await page.goto(`/invoices/${invoiceId}`);

  await page.getByRole('button', { name: 'Issue' }).click();
  const issue = page.getByRole('dialog');
  await issue.getByRole('button', { name: 'Issue' }).click();
  await expect(issue).toBeHidden();

  await expect(page.getByRole('heading', { name: 'INV-000001' })).toBeVisible();
});

test('Add item, type the name: the field says “In Chinese”', async ({
  page,
  freshOrg,
}) => {
  const api = freshOrg.api;
  await namedIn(api, 'zh-Hans');
  await signInAs(page, api);
  await page.goto('/items');

  // The header's; an empty list has its own too.
  await page
    .getByRole('button', { name: 'Add item', exact: true })
    .first()
    .click();
  const dialog = page.getByRole('dialog', {
    name: say('products.create.title'),
  });
  const name = dialog.getByRole('textbox', { name: 'Name', exact: true });
  await name.fill('专注胶囊');
  await expect(name).toHaveAccessibleDescription(
    say('products.name.typedIn', { language: CHINESE }),
  );

  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
});

test('Items, Export: “Name in Chinese” holds the own names, the variants’ too', async ({
  page,
  freshOrg,
}) => {
  const api = freshOrg.api;
  await namedIn(api, 'zh-Hans');
  await item(api, '专注胶囊', {
    sku: 'FOCUS-60CT',
    variant: '60粒',
    kept: [{ locale: 'en', name: 'Focus capsules' }],
  });
  await signInAs(page, api);
  await page.goto('/items');
  // An English reader's list names it in English, its kept name.
  await expect(
    page.getByRole('link', { name: 'Focus capsules', exact: true }),
  ).toBeVisible();

  const saved = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  const download = await saved;
  const text = await readFile(await download.path(), 'utf8');

  // No field here holds a comma or a quote, so a comma splits a line.
  const [header, ...rows] = text
    .replace(/^\uFEFF/, '')
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(','));
  const column = (id: string) => {
    const index = header.indexOf(saidBy('en', id));
    expect(index, id).toBeGreaterThanOrEqual(0);
    return index;
  };
  const row = rows.find((cells) => cells[0] === 'FOCUS-60CT')!;
  expect(row).toBeDefined();
  expect(row[column('exports.column.nameChinese')]).toBe('专注胶囊');
  expect(row[column('exports.column.variantChinese')]).toBe('60粒');
  expect(row[column('exports.column.nameEnglish')]).toBe('Focus capsules');
});
