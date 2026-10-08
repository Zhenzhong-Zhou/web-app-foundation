import { expect, test } from './fixtures';
import { createPartner, signInAs } from './support/api';

/**
 * Recently opened (ADR-058): a record page, once opened, is on Home and in
 * the search before anything is typed, so `/` then Enter reopens it.
 */
test('a partner once opened is on Home and in the empty search', async ({
  page,
  freshOrg,
}) => {
  const partner = await createPartner(freshOrg.api, {
    name: 'E2E Recently Opened Pharmacy',
  });
  await signInAs(page, freshOrg.api);

  await page.goto(`/partners/${partner.id}`);
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'E2E Recently Opened Pharmacy',
    }),
  ).toBeVisible();

  await page.goto('/');
  const recent = page.getByRole('region', { name: 'Recently opened' });
  await expect(
    recent.getByRole('link', { name: 'E2E Recently Opened Pharmacy' }),
  ).toBeVisible();

  // The search, focused before typing, offers it first.
  await page.keyboard.press('/');
  await expect(
    page.getByRole('option', { name: /E2E Recently Opened Pharmacy/ }),
  ).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/partners/${partner.id}$`));
});
