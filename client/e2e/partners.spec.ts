import { expect, test } from './fixtures';
import { createPartner, signInAs } from './support/api';

/**
 * The directory of everyone the organization trades with (ADR-026).
 *
 * The assertions here are mostly about a retired partner *staying visible*.
 * That is the decision the screen encodes — a directory that hides rows is
 * harder to explain than one showing them as inactive — and it is the first
 * thing a well-meaning refactor would "fix" by filtering the list.
 */

test('adds a partner and lists it', async ({ page, freshOrg }) => {
  await signInAs(page, freshOrg.api);

  await page.goto('/partners');

  // A fresh organization has none, so the empty state is reachable here and
  // nowhere else. Worth one assertion: it is the only copy telling someone
  // why the screen exists before they have used it.
  await expect(page.getByText('No partners yet')).toBeVisible();

  await page.getByRole('button', { name: 'Add partner' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('E2E Acme Supplies');
  await dialog.getByLabel('Code').fill('E2E-ACME');
  await dialog.getByLabel('Tax ID').fill('123456789RT0001');
  // Scoped to the dialog: the trigger behind it carries the same name.
  await dialog.getByRole('button', { name: 'Add partner' }).click();

  const row = page.getByRole('row', { name: /E2E Acme Supplies/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText('E2E-ACME');
  await expect(row).toContainText('Active');
});

test('keeps a retired partner in the list', async ({ page, freshOrg }) => {
  const partner = await createPartner(freshOrg.api, {
    name: 'E2E Retired Co',
  });

  await signInAs(page, freshOrg.api);

  await page.goto('/partners');

  const row = page.getByRole('row', { name: new RegExp(partner.name) });
  await row.getByRole('button', { name: 'Edit' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('In use').uncheck();

  const response = page.waitForResponse(
    (res) =>
      res.url().includes('/partners/') && res.request().method() === 'PATCH',
  );
  await dialog.getByRole('button', { name: 'Save' }).click();

  expect((await response).status()).toBe(204);

  /**
   * The point of the test. Retiring is an update, not a delete — an order
   * referencing this partner is history that cannot be given a hole in it — so
   * the row stays and changes how it reads. A list that filtered on isActive
   * would pass every other assertion in this file.
   */
  await expect(row).toBeVisible();
  await expect(row).toContainText('Retired');
});

test('refuses a duplicate code', async ({ page, freshOrg }) => {
  await createPartner(freshOrg.api, {
    name: 'E2E First Holder',
    code: 'E2E-DUPE',
  });

  await signInAs(page, freshOrg.api);

  await page.goto('/partners');
  await page.getByRole('button', { name: 'Add partner' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('E2E Second Holder');
  await dialog.getByLabel('Code').fill('E2E-DUPE');
  await dialog.getByRole('button', { name: 'Add partner' }).click();

  // Codes are unique per organization; names deliberately are not, because two
  // branches of one company are two partners. This is the only constraint the
  // form can trip, and the 409 has to arrive as a readable line rather than a
  // dialog that silently does nothing.
  await expect(dialog.getByRole('alert', { name: 'Error' })).toContainText(
    /already used/i,
  );

  await expect(
    page.getByRole('row', { name: /E2E Second Holder/ }),
  ).toBeHidden();
});

test('hides the create and edit controls from a viewer', async ({
  page,
  api,
  viewerApi,
}) => {
  // Seeded by the owner, read by the viewer: a Viewer holds partners.view and
  // nothing else, so it cannot create the row it needs to look at.
  const partner = await createPartner(api, {
    name: `E2E Readonly ${Date.now()}`,
  });

  await signInAs(page, viewerApi);

  await page.goto('/partners');

  await expect(
    page.getByRole('row', { name: new RegExp(partner.name) }),
  ).toBeVisible();

  /**
   * Display only — the 403 is the actual control (ADR-016). Asserted anyway
   * because a header promising an Edit column with nothing under it is the
   * failure mode the conditional column exists to prevent.
   */
  await expect(page.getByRole('button', { name: 'Add partner' })).toBeHidden();
  await expect(page.getByRole('columnheader', { name: 'Edit' })).toHaveCount(0);
});
