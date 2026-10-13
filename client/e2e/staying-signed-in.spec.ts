import { expect, test } from './fixtures';
import { signInAs } from './support/api';

/**
 * Staying signed in (ADR-065): an owner sets the organization's idle
 * sign-out on the Security tab, and the sign-in page offers Keep me
 * signed in, remembered by the browser.
 */
test('sets the idle sign-out on the Security tab', async ({
  page,
  freshOrg,
}) => {
  await signInAs(page, freshOrg.api);
  await page.goto('/settings/organization?tab=security');

  await page.getByRole('combobox', { name: 'After' }).click();
  await page.getByRole('option', { name: '15 minutes' }).click();
  await page.getByLabel('Everyone: for rules', { exact: false }).check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Sign-out setting saved')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('combobox', { name: 'After' })).toHaveText(
    /15 minutes/,
  );
});

test('remembers an unticked Keep me signed in on this browser', async ({
  browser,
  freshOrg,
}) => {
  // Its own context, signed out, so the shared session is left alone.
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();

  await page.goto('/login');
  const keep = page.getByLabel('Keep me signed in');
  await expect(keep).toBeChecked();
  await keep.uncheck();

  await page.getByLabel(/^email/i).fill(freshOrg.email);
  await page.getByLabel(/^password/i).fill(freshOrg.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);

  // Signed out, the box starts as it was left on this browser.
  await context.clearCookies();
  await page.goto('/login');
  await expect(page.getByLabel('Keep me signed in')).not.toBeChecked();
  await context.close();
});
