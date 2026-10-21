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

  const help = page.getByRole('complementary', { name: 'Help', exact: true });
  await expect(
    help.getByRole('heading', { level: 2, name: 'Orders', exact: true }),
  ).toBeFocused();
  await expect(
    help.getByRole('heading', {
      level: 3,
      name: 'Raise an order',
      exact: true,
    }),
  ).toBeVisible();

  // The page still works beside it: the rail takes the person on, and Help
  // follows with the next page's guide.
  await page
    .getByRole('navigation', { name: 'Main', exact: true })
    .getByRole('link', { name: 'Inventory', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Inventory', exact: true }),
  ).toBeVisible();
  await expect(
    help.getByRole('heading', { level: 2, name: 'Inventory', exact: true }),
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
    .getByRole('region', { name: 'Getting started', exact: true })
    .getByText('Where stock is kept', { exact: false });
  await step.getByRole('button', { name: 'Learn more', exact: true }).click();

  const help = page.getByRole('complementary', { name: 'Help', exact: true });
  await expect(
    help.getByRole('heading', { level: 2, name: 'Locations', exact: true }),
  ).toBeAttached();
  const section = help.getByRole('heading', {
    level: 3,
    name: 'Add a location',
    exact: true,
  });
  await expect(section).toBeFocused();
  await expect(section).toBeInViewport();

  // Closed, focus goes back to the Learn more that opened it.
  await help.getByRole('button', { name: 'Close help', exact: true }).click();
  await expect(
    step.getByRole('button', { name: 'Learn more', exact: true }),
  ).toBeFocused();
});

test('a dialog opened beside Help leaves Help readable above its dimming', async ({
  page,
}) => {
  await page.goto('/locations');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Help', exact: true }).click();

  // By id, not by role: while a dialog is open, MUI hides the page, Help
  // with it, from assistive technology, and roles go with it.
  const help = page.locator('#help-panel');
  const title = help.locator('h2');
  await expect(title).toHaveText('Locations');

  // Over the page at this width, Help covers its top right, where Add
  // location is; the keyboard still reaches it.
  await page.getByRole('button', { name: 'Add location', exact: true }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Help's words are on top, not under the dimming, and the dialog sits
  // beside Help rather than under it.
  await expect(title).toBeVisible();
  const box = (await title.boundingBox())!;
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const onTop = await page.evaluate(
    ({ x, y }) => !!document.elementFromPoint(x, y)?.closest('#help-panel'),
    point,
  );
  expect(onTop).toBe(true);
  const panel = (await help.boundingBox())!;
  const paper = (await dialog.boundingBox())!;
  expect(paper.x + paper.width).toBeLessThanOrEqual(panel.x);

  // It scrolls under the mouse, and the keyboard stays in the dialog.
  const scroller = help.locator('[data-help-scroller]');
  await page.mouse.move(point.x, point.y + 200);
  await page.mouse.wheel(0, 600);
  await expect
    .poll(() => scroller.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  expect(
    await dialog.evaluate((element) =>
      element.contains(document.activeElement),
    ),
  ).toBe(true);

  // Closed, the dialog leaves Help as it was, under the page's own menus.
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page
      .getByRole('complementary', { name: 'Help', exact: true })
      .getByRole('heading', { level: 2, name: 'Locations', exact: true }),
  ).toBeVisible();
  expect(
    await help.evaluate((element) => getComputedStyle(element).zIndex),
  ).toBe('1099');
});
