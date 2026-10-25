import { expect, test } from './fixtures';
import { inviteByLink, signInAs, uniqueEmail } from './support/api';
import { verifyEmail } from './support/mail';

/**
 * The app on a phone's screen and engine (ADR-055): an iPhone's Safari,
 * which every browser on an iPhone is underneath, WeChat's included.
 * Run by the iphone project only (playwright.config.ts).
 *
 * Reads and navigates, and changes nothing in the shared organization, so
 * it can run beside the Chromium suite; a test that writes makes its own.
 */
test('finds its way round on a phone, through the drawer', async ({ page }) => {
  await page.goto('/inventory');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // Below 1200px the rail folds into a drawer behind ☰ (ADR-055). Its
  // foot is pinned below the links, in view on a phone's screen without
  // scrolling them (ADR-082).
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Navigation' }).getByText(/^Powered by /),
  ).toBeInViewport({ ratio: 1 });
  await page.getByRole('link', { name: 'Orders' }).click();

  await expect(
    page.getByRole('heading', { level: 1, name: 'Orders' }),
  ).toBeVisible();
  // Choosing a page closes the drawer.
  await expect(page.getByRole('link', { name: 'Inventory' })).toBeHidden();
});

/**
 * Held sideways, about 340 px tall, the phone cannot spare the foot its own
 * place: the drawer scrolls as one, its foot after the links (ADR-082).
 */
test('scrolls the drawer as one on a phone held sideways, its foot last', async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 340 });
  await page.goto('/inventory');
  await page.getByRole('button', { name: 'Open navigation' }).click();

  const drawer = page.getByRole('dialog', { name: 'Navigation' });
  const foot = drawer.getByText(/^Powered by /);
  await expect(drawer.getByRole('link', { name: 'Home' })).toBeInViewport();
  await expect(foot).not.toBeInViewport();

  await foot.scrollIntoViewIfNeeded();
  await expect(foot).toBeInViewport({ ratio: 1 });
  const last = drawer.getByRole('link').last();
  const [link, line] = await Promise.all([
    last.boundingBox(),
    foot.boundingBox(),
  ]);
  expect(line!.y).toBeGreaterThanOrEqual(link!.y + link!.height);
});

test('signs in from a phone, with the password shown to check it', async ({
  browser,
}) => {
  // Its own context, signed out, so the shared session is left alone.
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();

  await page.goto('/login');
  await page.getByLabel(/^password/i).fill('not-a-real-password');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(page.getByLabel(/^password/i)).toHaveValue(
    'not-a-real-password',
  );
  await expect(page.getByLabel(/^password/i)).toHaveAttribute('type', 'text');

  await context.close();
});

test('lists Invited as cards on a phone, and invites full screen, in Chinese', async ({
  page,
  freshOrg,
}) => {
  // Its own organization: this one writes.
  await verifyEmail(freshOrg.api, freshOrg.email);
  const email = uniqueEmail('phone');
  await inviteByLink(freshOrg.api, email);
  await signInAs(page, freshOrg.api);
  await page.addInitScript(() => localStorage.setItem('language', 'zh-Hans'));
  await page.goto('/members');

  // A card per invitation, no table to scroll sideways (ADR-077).
  const card = page.getByRole('article', { name: email });
  await expect(card).toContainText('已复制链接 · ');
  await expect(
    card.getByRole('button', { name: `重新发送给 ${email}` }),
  ).toBeVisible();
  await expect(page.getByRole('table', { name: '已邀请' })).toHaveCount(0);

  await page.getByRole('button', { name: '邀请', exact: true }).click();
  const dialog = page.getByRole('dialog', {
    name: `邀请加入 ${freshOrg.organizationName}`,
  });
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(box?.width).toBe(viewport?.width);
  await expect(dialog.getByRole('button', { name: '关闭' })).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: '复制链接，自己发送' }),
  ).toBeVisible();
});

test('opens Help full screen on a phone, in Chinese, and closes it', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('language', 'zh-Hans'));
  await page.goto('/orders');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // The icon alone in the bar, named for a screen reader (ADR-079).
  const button = page.getByRole('button', { name: '帮助', exact: true });
  await button.click();

  const help = page.getByRole('dialog', { name: '帮助 · 订单', exact: true });
  const box = await help.boundingBox();
  expect(box?.width).toBe(page.viewportSize()?.width);
  await expect(
    help.getByRole('heading', { level: 2, name: '订单', exact: true }),
  ).toBeFocused();
  await expect(
    help.getByRole('heading', { level: 3, name: '创建订单', exact: true }),
  ).toBeVisible();

  await help.getByRole('button', { name: '关闭帮助', exact: true }).click();
  await expect(help).toBeHidden();
  await expect(button).toBeFocused();
});
