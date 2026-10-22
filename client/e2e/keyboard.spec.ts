import { expect, test } from './fixtures';
import { created, createPartner, createProduct } from './support/api';

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

/**
 * A dialog gives focus back to the button that opened it (#155). openDialog
 * takes focus off the button first, for Chrome's aria-hidden warning, and
 * without the hand-back a keyboard user closing a dialog started again from
 * the top of the page.
 */
test('a dialog closed by Cancel or by Escape gives focus back to its button', async ({
  page,
}) => {
  await page.goto('/products');
  const add = page.getByRole('button', { name: 'Add product', exact: true });
  const dialog = page.getByRole('dialog');

  await add.click();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(add).toBeFocused();

  // From the keyboard alone, from where Cancel left it.
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(add).toBeFocused();
});

/**
 * On a phone, an order's summary sits above its tabs, and Tab reaches it
 * first too (WCAG 1.3.2, #155): Ship came after Items and the lines'
 * actions, though it is seen before them.
 */
test('on a phone, Tab reaches an order’s summary before its tabs', async ({
  page,
  api,
}) => {
  const partner = await createPartner(api);
  const product = await createProduct(api);
  const { order } = await created<{ order: { id: string } }>(
    await api.post('/v1/orders', {
      data: {
        partnerId: partner.id,
        direction: 'purchase',
        lines: [{ variantId: product.variantId, quantityOrdered: '1' }],
      },
    }),
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/orders/${order.id}`);
  await page.getByRole('tab', { name: /^Items/ }).focus();
  await page.keyboard.press('Shift+Tab');

  const summary = page.getByRole('complementary', { name: 'Summary' });
  await expect(summary.locator(':focus')).toHaveCount(1);
});

/**
 * The account menu's preferences open from the keyboard (#151): Enter or
 * Space on a row opens its select, and a choice or Escape comes back to
 * the row, where the arrow keys go on through the menu. The colour mode
 * and the text size, which this browser keeps: the language would be
 * saved to the shared owner's account.
 */
test('the account menu’s preferences open from the keyboard, and come back to their row', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('button', { name: /signed in as/ }).click();
  const menu = page.getByRole('menu');
  const rowOf = (name: string) =>
    menu
      .getByRole('menuitem')
      .filter({ has: page.getByRole('combobox', { name, exact: true }) });
  const listbox = page.getByRole('listbox');

  // Your account, Your devices, then the colour mode.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(rowOf('Colour mode')).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(listbox).toBeVisible();
  // From System, the choice open, to Dark.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(listbox.getByRole('option', { name: 'Dark' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(listbox).toBeHidden();
  await expect(rowOf('Colour mode')).toBeFocused();
  await expect(rowOf('Colour mode')).toContainText('Dark');

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(rowOf('Text size')).toBeFocused();
  await page.keyboard.press(' ');
  await expect(listbox).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(listbox).toBeHidden();
  await expect(menu).toBeVisible();
  await expect(rowOf('Text size')).toBeFocused();
});
