import { readFile } from 'node:fs/promises';

import { expect, test } from './fixtures';
import { OWNER_CREDENTIALS_PATH } from './global-setup';

/**
 * ROUTES AND SELECTORS ARE ASSUMPTIONS. `/login` and the accessible names below
 * are a first guess at the markup in src/auth. Adjust them once, here, and the
 * rest of the suite keeps working — no other spec touches the login screen.
 *
 * Prefer getByRole and getByLabel over CSS. MUI generates class names that
 * change between builds, and a selector like `.MuiButton-root:nth-child(2)`
 * breaks the first time someone reorders a form. Roles do not.
 */

// Global setup signs everyone in. This one file has to start signed out.
test.use({ storageState: { cookies: [], origins: [] } });

test('signs in with valid credentials and lands in the app', async ({
  page,
}) => {
  const credentials = JSON.parse(
    await readFile(OWNER_CREDENTIALS_PATH, 'utf8'),
  ) as { email: string; password: string; organizationName: string };

  await page.goto('/login');

  await page.getByLabel(/email/i).fill(credentials.email);
  await page.getByLabel(/password/i).fill(credentials.password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();

  await expect(page).not.toHaveURL(/\/login/);

  /**
   * The organisation name comes from GET /v1/auth/me, so asserting on it proves
   * the session is usable — not merely that a redirect fired. A URL check alone
   * would pass against a shell still waiting on that request.
   *
   * Scoped to the banner so this keeps testing the header specifically: an
   * unscoped locator would start matching page content the moment a screen
   * happens to render the org name or an Account link of its own.
   */
  const banner = page.getByRole('banner');
  await expect(banner).toContainText(credentials.organizationName);
  await expect(banner.getByRole('link', { name: 'Account' })).toBeVisible();
});

test('rejects a wrong password without revealing whether the account exists', async ({
  page,
}) => {
  const credentials = JSON.parse(
    await readFile(OWNER_CREDENTIALS_PATH, 'utf8'),
  ) as { email: string };

  await page.goto('/login');

  await page.getByLabel(/email/i).fill(credentials.email);
  await page.getByLabel(/password/i).fill('definitely-the-wrong-password');
  await page.getByRole('button', { name: /sign in|log in/i }).click();

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);

  /**
   * The server returns an identical response for a wrong password and an
   * unknown address, down to the timing (ADR-011). If the UI ever surfaces
   * "no account found", that server-side care is wasted — so assert the
   * message stays generic.
   */
  await expect(page.getByRole('alert')).not.toContainText(
    /not found|no account/i,
  );
});
