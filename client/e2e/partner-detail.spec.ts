import { expect, test } from './fixtures';
import { createPartner, signInAs } from './support/api';

/**
 * The screen where a partner stops being a name and becomes something you can
 * ship to. Addresses and contacts are reachable nowhere else.
 *
 * One happy path per write, plus the two rules a person can see but the form
 * cannot express: the default moves rather than duplicating, and retiring
 * leaves the row on the page rather than removing it.
 */

test('adds an address and shows it on the partner', async ({
  page,
  freshOrg,
}) => {
  const partner = await createPartner(freshOrg.api, { name: 'E2E Shipto Co' });

  await signInAs(page, freshOrg.api);
  await page.goto(`/partners/${partner.id}`);

  // Reachable only here, so the empty state is worth one assertion.
  await expect(page.getByText('No addresses yet')).toBeVisible();

  await page.getByRole('button', { name: 'Add address' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Label').fill('Head office');
  await dialog.getByLabel('Street address').fill('1 Example Way');
  await dialog.getByLabel('City').fill('Vancouver');
  await dialog.getByLabel('Province or state').fill('BC');
  await dialog.getByLabel('Postal code').fill('V6B 1A1');
  await dialog.getByRole('button', { name: 'Add address' }).click();

  await expect(page.getByText('Head office')).toBeVisible();
  await expect(page.getByText('1 Example Way, Vancouver, BC')).toBeVisible();
});

test('moves the default when a second address claims it', async ({
  page,
  freshOrg,
}) => {
  const partner = await createPartner(freshOrg.api, { name: 'E2E Two Docks' });

  await signInAs(page, freshOrg.api);
  await page.goto(`/partners/${partner.id}`);

  for (const [label, street] of [
    ['Head office', '1 Example Way'],
    ['Warehouse', '99 Dock Road'],
  ]) {
    await page.getByRole('button', { name: 'Add address' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Label').fill(label);
    await dialog.getByLabel('Street address').fill(street);
    await dialog.getByLabel('Use this one by default').check();
    await dialog.getByRole('button', { name: 'Add address' }).click();

    await expect(page.getByText(label)).toBeVisible();
  }

  /**
   * The point of the test. A partial unique index means the second default is
   * a constraint violation rather than an overwrite, so the server demotes the
   * first in the same transaction — if that ever regressed, this page would
   * show two Default chips or the second save would fail outright.
   */
  await expect(page.getByText('Default')).toHaveCount(1);

  const warehouse = page.locator('div').filter({ hasText: /^Warehouse/ });
  await expect(warehouse.first()).toContainText('Default');
});

test('keeps a retired contact on the page', async ({ page, freshOrg }) => {
  const partner = await createPartner(freshOrg.api, { name: 'E2E Staffed Co' });

  await signInAs(page, freshOrg.api);
  await page.goto(`/partners/${partner.id}`);

  await page.getByRole('button', { name: 'Add contact' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Dana Reed');
  await dialog.getByLabel('Role').fill('Accounts payable');
  await dialog.getByLabel('Email').fill('dana@example.com');
  await dialog.getByRole('button', { name: 'Add contact' }).click();

  await expect(page.getByText('Dana Reed')).toBeVisible();

  await page.getByRole('button', { name: 'Retire' }).click();

  /**
   * Still there, and that is the assertion. A contact may be named on an order
   * that already shipped, so retiring leaves the row — the Retire control is
   * what disappears, because a retired row has nothing left to retire.
   */
  await expect(page.getByText('Dana Reed')).toBeVisible();
  await expect(page.getByText('Retired')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retire' })).toBeHidden();
});

test('hides every write control from a viewer', async ({
  page,
  api,
  viewerApi,
}) => {
  const partner = await createPartner(api, {
    name: `E2E Readonly ${Date.now()}`,
  });

  await signInAs(page, viewerApi);
  await page.goto(`/partners/${partner.id}`);

  await expect(page.getByRole('heading', { name: partner.name })).toBeVisible();

  // Display only — the 403 is the actual control (ADR-016) — but a page
  // offering an Add address button that always fails is worse than one that
  // does not offer it.
  await expect(page.getByRole('button', { name: 'Add address' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Add contact' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Edit' })).toBeHidden();
});
