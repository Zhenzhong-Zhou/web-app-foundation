import { expect, test } from './fixtures';

/**
 * The keyboard's way past the frame (WCAG 2.4.1, #121). Without it, a
 * keyboard user pressed Tab 24 times through the rail, the lookup, the bell
 * and the account before reaching the page.
 *
 * Chromium only, as every spec but accessibility.spec is, and on purpose:
 * WebKit's Tab passes over links, as Safari's does until a setting is
 * changed, so the first Tab there would land on a button instead.
 */
test('the first Tab offers to skip the frame, and Enter lands on the page', async ({
  page,
}) => {
  await page.goto('/');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1 })).toBeVisible();

  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();

  await page.keyboard.press('Enter');
  await expect(main).toBeFocused();
  // Focus moved by script: the address is unchanged.
  await expect(page).toHaveURL(/\/$/);
});
