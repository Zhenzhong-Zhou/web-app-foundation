import { expect, test } from './fixtures';
import { signInAs } from './support/api';

/**
 * Help (ADR-079): the page's guide in a panel from the top bar, following
 * the person from page to page, and Learn more opening it at a section.
 *
 * Reads only, so the first runs in the shared organization; the second
 * needs Getting started, which only a new organization shows.
 */
test('Help on Orders, then Inventory’s guide on Inventory', async ({
  page,
}) => {
  await page.goto('/orders');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const button = page.getByRole('button', { name: 'Help', exact: true });
  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');

  const help = page.getByRole('complementary', { name: 'Help' });
  await expect(
    help.getByRole('heading', { level: 2, name: 'Orders' }),
  ).toBeFocused();
  await expect(
    help.getByRole('heading', { level: 3, name: 'Raise an order' }),
  ).toBeVisible();

  // The page still works beside it: the rail takes the person on, and Help
  // follows with the next page's guide.
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Inventory' })
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Inventory' }),
  ).toBeVisible();
  await expect(
    help.getByRole('heading', { level: 2, name: 'Inventory' }),
  ).toBeVisible();

  // Esc from inside it shuts it, and focus is back on the button.
  await help.getByRole('heading', { level: 2 }).click();
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  await expect(button).toBeFocused();
  await expect(button).toHaveAttribute('aria-expanded', 'false');
});

test('Learn more on a Getting started step opens Help at its section', async ({
  page,
  freshOrg,
}) => {
  await signInAs(page, freshOrg.api);
  await page.goto('/');

  const step = page
    .getByRole('region', { name: 'Getting started' })
    .getByText('Where stock is kept', { exact: false });
  await step.getByRole('button', { name: 'Learn more' }).click();

  const help = page.getByRole('complementary', { name: 'Help' });
  await expect(
    help.getByRole('heading', { level: 2, name: 'Locations' }),
  ).toBeAttached();
  const section = help.getByRole('heading', {
    level: 3,
    name: 'Add a location',
  });
  await expect(section).toBeFocused();
  await expect(section).toBeInViewport();

  // Closed, focus goes back to the Learn more that opened it.
  await help.getByRole('button', { name: 'Close help' }).click();
  await expect(step.getByRole('button', { name: 'Learn more' })).toBeFocused();
});
