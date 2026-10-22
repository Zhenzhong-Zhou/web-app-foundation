import { expect, test } from './fixtures';
import { backToTheFront, deploy } from './support/version';

/**
 * A tab left open across a deploy (ADR-081): it finds the new version when
 * it comes back to the front, says so in the top bar, and loads the next
 * page in full. Reads only, in the shared organization.
 */
test('a deploy: New version in the top bar, and the next page loads in full', async ({
  page,
}) => {
  await page.goto('/orders');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Orders' }),
  ).toBeVisible();
  const bar = page.getByRole('banner');
  // The dev server's own file names `dev`: nothing to say.
  await expect(bar.getByRole('button', { name: 'Help' })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'New version' })).toHaveCount(0);

  await deploy(page);
  await backToTheFront(page);

  const button = bar.getByRole('button', { name: 'New version' });
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.getByRole('dialog', { name: 'New version' })).toContainText(
    'A new version is ready. It loads by itself when you open another page.',
  );
  await page.keyboard.press('Escape');

  // Another page loads in full, from the new version: a mark left on this
  // document is gone from the next.
  await page.evaluate(() => {
    (window as { sameDocument?: boolean }).sameDocument = true;
  });
  const loaded = page.waitForEvent('load');
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Inventory' })
    .click();
  await loaded;

  await expect(page).toHaveURL(/\/inventory$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Inventory' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as { sameDocument?: boolean }).sameDocument,
    ),
  ).toBeUndefined();
});
