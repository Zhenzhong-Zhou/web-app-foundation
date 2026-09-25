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
