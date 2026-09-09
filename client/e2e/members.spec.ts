import { expect, test } from './fixtures';

/**
 * One write path. The interesting behaviour here — an Admin may not assign the
 * Owner role, a Viewer may not reach this screen at all — is enforced server
 * side and covered by users.e2e-spec.ts, where it costs milliseconds.
 *
 * What only a browser can prove is that the role picker sends an id the server
 * recognises. That is the seam between two modules and the thing a mocked API
 * would agree with itself about.
 */

test('adds a member and shows them in the table', async ({
  page,
  freshOrg,
}) => {
  /**
   * A fresh organisation rather than the shared owner: this test counts on the
   * new member being findable by email, and the shared org accumulates members
   * from every other run in the file.
   */
  const email = `member-${Date.now().toString(36)}@example.test`;

  await page.context().addCookies((await freshOrg.api.storageState()).cookies);

  await page.goto('/members');
  await page.getByRole('button', { name: 'Add member' }).click();

  const dialog = page.getByRole('dialog');

  await dialog.getByLabel('Name').fill('E2E Member');
  await dialog.getByLabel('Email').fill(email);
  await dialog.getByLabel('Temporary password').fill('e2e-password-123');

  // MUI renders a select as a button opening a listbox, so the role is two
  // steps rather than a fill.
  await dialog.getByLabel('Role').click();
  await page.getByRole('option', { name: 'Viewer' }).click();

  await dialog.getByRole('button', { name: 'Add member' }).click();

  const row = page.getByRole('row', { name: new RegExp(email) });

  await expect(row).toBeVisible();
  await expect(row).toContainText('Viewer');
});
