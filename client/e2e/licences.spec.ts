import { expect, test } from './fixtures';
import { daysFromNow, signInAs } from './support/api';

/**
 * The licence registry through the browser: reached from Products, added,
 * corrected, and the correction readable in its History. Plus the one status
 * a person never sets by hand — Expires in N days — to prove the page derives
 * it from the date.
 *
 * freshOrg, because the table is asserted row by row.
 */

test('adds a licence, corrects its number, and shows the correction in History', async ({
  page,
  freshOrg,
}) => {
  await signInAs(page, freshOrg.api);

  // Reached from the catalogue rather than the top nav.
  await page.goto('/products');
  await page.getByRole('link', { name: 'Licences' }).click();
  await expect(page).toHaveURL(/\/licences$/);

  await page.getByRole('button', { name: 'Add licence' }).click();

  const add = page.getByRole('dialog');
  await add.getByLabel('Number').fill('80012344');
  await add.getByLabel('Issued by').fill('Health Canada');
  await add.getByRole('button', { name: 'Save' }).click();
  await expect(add).toBeHidden();

  const row = page.getByRole('row', { name: /Health Canada/ });
  await expect(row).toContainText('80012344');
  // No expiry is the NPN's real shape, and it reads as Current.
  await expect(row).toContainText('Current');

  // A typo caught later: the number is identity, so it is corrected in place.
  await row.getByRole('button', { name: 'Edit' }).click();

  const edit = page.getByRole('dialog');
  await edit.getByLabel('Number').fill('80012345');
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(edit).toBeHidden();

  await expect(row).toContainText('80012345');

  // The correction is the change people come looking for.
  await row.getByRole('button', { name: 'History' }).click();

  const drawer = page.getByRole('presentation').filter({ hasText: 'History' });
  await expect(drawer).toContainText('80012344');
  await expect(drawer).toContainText('80012345');
});

test('shows a licence nearing expiry without anyone flagging it', async ({
  page,
  freshOrg,
}) => {
  const created = await freshOrg.api.post('/v1/product-licences', {
    data: {
      number: 'EXP-E2E-1',
      authority: 'CFIA export certificate',
      expiresAt: daysFromNow(30),
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();

  await signInAs(page, freshOrg.api);
  await page.goto('/licences');

  // Derived from the date: nobody set a status.
  await expect(page.getByRole('row', { name: /EXP-E2E-1/ })).toContainText(
    /Expires in 30 days/,
  );
});
