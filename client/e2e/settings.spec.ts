import { expect, test } from './fixtures';
import { signInAs } from './support/api';

/**
 * What invoicing needs before anything can be issued (ADR-046): the
 * organization's registered address and tax number, and a tax code. Both
 * reached from the account menu, since they are set up once rather than
 * visited daily.
 *
 * freshOrg, because the address starts empty and the table is asserted row
 * by row.
 */
test('sets the registered address and tax number', async ({
  page,
  freshOrg,
}) => {
  await signInAs(page, freshOrg.api);
  await page.goto('/settings/organization');

  // Empty to begin with, and the page says why that matters.
  await expect(page.getByText(/none can be issued until it is/)).toBeVisible();

  await page.getByLabel('Tax registration number').fill('123456789 RT0001');
  await page.getByRole('button', { name: 'Save tax number' }).click();
  await expect(page.getByText('Tax number saved')).toBeVisible();

  await page.getByLabel('Address line 1').fill('100 Main St');
  await page.getByLabel('City').fill('Vancouver');
  await page.getByLabel('Province or state').fill('BC');
  await page.getByLabel('Country').fill('ca');
  await page.getByRole('button', { name: 'Save address' }).click();
  await expect(page.getByText('Registered address saved')).toBeVisible();

  // Read back from the server, uppercased as partner addresses are.
  await page.reload();
  await expect(page.getByLabel('Address line 1')).toHaveValue('100 Main St');
  await expect(page.getByLabel('Country')).toHaveValue('CA');
  await expect(page.getByLabel('Tax registration number')).toHaveValue(
    '123456789 RT0001',
  );
});

/**
 * The Organization page in tabs (ADR-061): each opens at its own address,
 * so a link can mean one, and the name can change from Profile.
 */
test('opens a tab by its address, and renames the organization', async ({
  page,
  freshOrg,
}) => {
  await signInAs(page, freshOrg.api);
  await page.goto('/settings/organization?tab=stock');

  await expect(page.getByRole('tab', { name: 'Stock' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(
    page.getByRole('button', { name: 'Save licence policy' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save address' })).toBeHidden();

  // Profile is the first tab, so its address is the page's own.
  await page.getByRole('tab', { name: 'Profile' }).click();
  await expect(page).toHaveURL(/\/settings\/organization$/);

  await page.getByLabel('Organization name').fill('Renamed Naturals');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByText('Name saved')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Renamed Naturals' }),
  ).toBeVisible();
});

/**
 * Branding (ADR-060): a preset becomes the whole app's colour at once, a
 * pale colour is shown as the shade that will be saved, and the expiry
 * days are the organization's.
 */
test('brands the organization and sets its expiry days', async ({
  page,
  freshOrg,
}) => {
  await signInAs(page, freshOrg.api);
  await page.goto('/settings/organization?tab=branding');

  await page.getByLabel('Your own colour', { exact: true }).check();
  await page.getByLabel('Your own colour, as #RRGGBB').fill('#5BB8F0');
  await expect(page.getByText(/#127EB3, the same colour/)).toBeVisible();

  await page.getByLabel('Teal').check();
  await page.getByRole('button', { name: 'Save branding' }).click();
  await expect(page.getByText('Branding saved')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--mui-palette-primary-main')
          .trim()
          .toUpperCase(),
      ),
    )
    .toBe('#0F6E6E');

  await page.getByRole('tab', { name: 'Stock' }).click();
  await page.getByLabel('Expiring soon, within days').fill('180');
  await page.getByLabel('Urgent, within days').fill('60');
  await page.getByRole('button', { name: 'Save expiry' }).click();
  await expect(page.getByText('Expiry saved')).toBeVisible();
});

test('adds a two-tax code, changes a rate, and retires it', async ({
  page,
  freshOrg,
}) => {
  await signInAs(page, freshOrg.api);
  await page.goto('/settings/tax-codes');

  await page.getByRole('button', { name: 'Add tax code' }).click();

  const add = page.getByRole('dialog');
  // By role and exact name: getByLabel matches part of a label, and the
  // remove button beside an empty row is labelled "Remove this tax".
  const taxName = add.getByRole('textbox', { name: 'Tax', exact: true });
  const taxRate = add.getByRole('textbox', { name: 'Rate %', exact: true });

  await add
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('GST + PST (BC)');
  await taxName.fill('GST');
  await taxRate.fill('5');
  await add.getByRole('button', { name: 'Add a tax' }).click();
  await taxName.nth(1).fill('PST');
  await taxRate.nth(1).fill('7');
  await add.getByRole('button', { name: 'Save' }).click();
  await expect(add).toBeHidden();

  const row = page.getByRole('row', { name: /GST \+ PST \(BC\)/ });
  await expect(row).toContainText('GST 5% + PST 7%');
  await expect(row).toContainText('In use');

  // A rate that changes by law: edited as a set, sent whole.
  await row.getByRole('button', { name: 'Edit' }).click();

  const edit = page.getByRole('dialog');
  const editRate = edit.getByRole('textbox', { name: 'Rate %', exact: true });

  await expect(editRate.nth(1)).toHaveValue('7');
  await editRate.nth(1).fill('8');
  await edit.getByLabel(/In use/).uncheck();
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(edit).toBeHidden();

  await expect(row).toContainText('GST 5% + PST 8%');
  await expect(row).toContainText('Retired');
});
