import { expect, test } from './fixtures';
import { createApiContext, E2E_PASSWORD, signInAs } from './support/api';

/**
 * Every test here provisions its own organisation, because these change the
 * account they run as. The shared owner from global-setup backs every other
 * spec's storageState — renaming it or rotating its password would fail tests
 * in files that never touched it, and the failure would point at the wrong
 * screen entirely.
 */

/** Whether these credentials still open a session. */
async function canSignIn(email: string, password: string): Promise<boolean> {
  const api = await createApiContext();

  try {
    const response = await api.post('/v1/auth/login', {
      data: { email, password },
    });
    return response.ok();
  } finally {
    await api.dispose();
  }
}

test('saves a new display name', async ({ page, freshOrg }) => {
  await signInAs(page, freshOrg.api);

  await page.goto('/account');
  await page.getByLabel('Your name').fill('Renamed Owner');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('Saved.')).toBeVisible();

  // Reloaded rather than trusting the form to echo what was typed: this is the
  // only thing proving the value round-tripped.
  await page.reload();
  await expect(page.getByLabel('Your name')).toHaveValue('Renamed Owner');
});

test('changes the password and keeps this session', async ({
  page,
  freshOrg,
}) => {
  const newPassword = 'e2e-changed-password-1';

  await signInAs(page, freshOrg.api);

  await page.goto('/account');
  await page.getByLabel('Current password').fill(E2E_PASSWORD);
  await page.locator('#newPassword').fill(newPassword);
  await page.getByLabel('Confirm new password').fill(newPassword);

  // Asserted on the status, not on an alert: getByRole('alert') matches the
  // error one too, so a failed change passed here and blew up two lines later
  // with nothing saying why.
  const response = page.waitForResponse(
    (res) =>
      res.url().includes('/account/password') &&
      res.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Change password' }).click();
  expect((await response).status()).toBe(200);

  // The old one is dead and the new one works. Asserted against the API rather
  // than the success message, because a handler that reported success without
  // writing the hash would look identical from the screen.
  expect(await canSignIn(freshOrg.email, E2E_PASSWORD)).toBe(false);
  expect(await canSignIn(freshOrg.email, newPassword)).toBe(true);

  /**
   * Still signed in here afterwards. A password change revokes other sessions
   * but rotates this one rather than clearing it (ADR-011).
   */
  await page.goto('/products');
  await expect(page).not.toHaveURL(/\/login/);
});

test('refuses a wrong current password and changes nothing', async ({
  page,
  freshOrg,
}) => {
  await signInAs(page, freshOrg.api);

  await page.goto('/account');
  await page.getByLabel('Current password').fill('not-the-right-one');
  await page.locator('#newPassword').fill('e2e-other-password-1');
  await page.getByLabel('Confirm new password').fill('e2e-other-password-1');

  const response = page.waitForResponse(
    (res) =>
      res.url().includes('/account/password') &&
      res.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Change password' }).click();
  expect((await response).status()).toBe(401);

  // A 401 that wrote the new hash anyway would be invisible from the screen,
  // so this checks both directions rather than the message.
  expect(await canSignIn(freshOrg.email, E2E_PASSWORD)).toBe(true);
  expect(await canSignIn(freshOrg.email, 'e2e-other-password-1')).toBe(false);
});

test('lists the current device and will not sign it out', async ({
  page,
  freshOrg,
}) => {
  await signInAs(page, freshOrg.api);

  await page.goto('/account/sessions');

  /**
   * The caller's own session is always in this list, so an empty one means
   * something went wrong rather than that there is nothing to show.
   *
   * The current row is disabled rather than hidden — the person needs to see
   * the device they are on, and ending it is sign-out, which clears the cookie
   * in the right order.
   */
  const rows = page.getByRole('listitem');
  await expect(rows.filter({ hasText: 'This device' })).toBeVisible();
  await expect(
    rows
      .filter({ hasText: 'This device' })
      .getByRole('button', { name: 'Sign out' }),
  ).toHaveCount(0);
});
