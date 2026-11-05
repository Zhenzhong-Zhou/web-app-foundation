import { expect, test } from './fixtures';
import {
  created,
  createLocation,
  createProduct,
  daysFromNow,
  signInAs,
} from './support/api';

/**
 * The top bar's lookup (ADR-056), end to end: a lot code typed in part,
 * Enter, and the lot's trace. Its own organization, so it can run beside
 * the rest of the suite.
 */
test('finds a lot from the top bar and opens its trace', async ({
  page,
  freshOrg,
}) => {
  const product = await createProduct(freshOrg.api, { tracksLots: true });
  const location = await createLocation(freshOrg.api);
  await created(
    await freshOrg.api.post('/v1/stock/movements', {
      data: {
        variantId: product.variantId,
        toLocationId: location.id,
        quantity: '12',
        reason: 'receipt',
        lot: { code: 'E2E-LOOK-2609', expiresAt: daysFromNow(200) },
      },
    }),
  );

  await signInAs(page, freshOrg.api);
  await page.goto('/inventory');

  // At desktop width the box sits in the top bar.
  const box = page.getByRole('combobox', { name: 'Search everything' });
  await box.fill('look-2609');

  await expect(
    page.getByRole('option', { name: /E2E-LOOK-2609/ }),
  ).toBeVisible();
  await box.press('Enter');

  await expect(page).toHaveURL(/\/lots\//);
  await expect(page.getByText('E2E-LOOK-2609').first()).toBeVisible();
});

test('opens the lookup with / from anywhere on the page', async ({
  page,
  freshOrg,
}) => {
  await signInAs(page, freshOrg.api);
  await page.goto('/orders');
  // The page has drawn, and with it the top bar listening for the key: a
  // key pressed while the app is still signing in reaches nothing.
  await expect(
    page.getByRole('heading', { level: 1, name: 'Orders' }),
  ).toBeVisible();

  await page.keyboard.press('/');
  await expect(
    page.getByRole('combobox', { name: 'Search everything' }),
  ).toBeFocused();
});

/**
 * The search in the middle of the bar (ADR-091): centred between where the
 * menu side ends, the rail's edge from `lg`, and Help, at a laptop's width
 * and a wide desktop's. Within the bar's own left padding, 24 px against
 * the 8 px before Help, which puts it 8 px right of the exact middle.
 */
for (const viewport of [
  { width: 1366, height: 768 },
  { width: 2560, height: 1440 },
]) {
  test(`centres the search between the menu side and Help at ${viewport.width} px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/orders');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Orders' }),
    ).toBeVisible();

    const bar = page.getByRole('banner');
    const [side, field, help] = await Promise.all([
      bar.boundingBox(),
      bar.locator('.MuiInputBase-root').boundingBox(),
      bar.getByRole('button', { name: 'Help', exact: true }).boundingBox(),
    ]);
    const middle = (side!.x + help!.x) / 2;
    const centre = field!.x + field!.width / 2;
    expect(Math.abs(centre - middle)).toBeLessThanOrEqual(10);
  });
}
