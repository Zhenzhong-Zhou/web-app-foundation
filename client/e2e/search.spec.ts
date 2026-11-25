import { expect, test } from './fixtures';
import {
  created,
  createLocation,
  createProduct,
  daysFromNow,
  signInAs,
} from './support/api';
import { saidOn } from './support/said';

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

/**
 * Below `md` the lookup is a sheet over the whole screen, and a tablet or
 * a phone has no Escape: Close beside the field shuts it, and the person
 * is still where they were, not on the page before (#480).
 */
test('closes the full-screen search on a tablet held upright, still on Home', async ({
  page,
}) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto('/orders');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Orders' }),
  ).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  await page.getByRole('button', { name: 'Search everything' }).click();
  const sheet = page.getByRole('dialog');
  await expect(
    sheet.getByRole('combobox', { name: 'Search everything' }),
  ).toBeFocused();
  await sheet.getByRole('button', { name: 'Close search' }).click();

  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

/**
 * The top bar's close matches (ADR-056 amended, #654), the two rows of
 * ADR-094's amended interaction table: what matches as typed shows alone;
 * the close matches only when nothing does, under one heading.
 */
test('The top bar, a whole code that matches: only what matches, no close match', async ({
  page,
  freshOrg,
}) => {
  const product = await createProduct(freshOrg.api, { tracksLots: true });
  const location = await createLocation(freshOrg.api);
  // BF-2609 is a close match for BF-2609-B, which the lookup finds as
  // typed: the box shows the second alone.
  for (const code of ['BF-2609', 'BF-2609-B']) {
    await created(
      await freshOrg.api.post('/v1/stock/movements', {
        data: {
          variantId: product.variantId,
          toLocationId: location.id,
          quantity: '5',
          reason: 'receipt',
          lot: { code, expiresAt: daysFromNow(200) },
        },
      }),
    );
  }
  await signInAs(page, freshOrg.api);
  await page.goto('/inventory');

  const box = page.getByRole('combobox', { name: 'Search everything' });
  const [answer] = await Promise.all([
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/v1/lookup' &&
        new URL(response.url()).searchParams.get('q') === 'BF-2609-B',
    ),
    box.fill('BF-2609-B'),
  ]);
  // The server's answer holds the close one; the box leaves it out.
  const { groups } = (await answer.json()) as {
    groups: { results: { title: string; close: boolean }[] }[];
  };
  expect(groups.flatMap((group) => group.results)).toContainEqual(
    expect.objectContaining({ title: 'BF-2609', close: true }),
  );
  const listbox = page.getByRole('listbox');
  await expect(
    listbox.getByRole('option', { name: /^BF-2609-B/ }),
  ).toBeVisible();
  await expect(listbox.getByRole('option', { name: /^BF-2609 / })).toHaveCount(
    0,
  );
  await expect(
    listbox.getByText(saidOn('en', 'inventory.movements.closeMatches')),
  ).toHaveCount(0);
});

test('The top bar, text nothing matches as typed: the close matches, under their heading, each saying its kind', async ({
  page,
  freshOrg,
}) => {
  await createProduct(freshOrg.api, { name: 'Focus 60ct', sku: 'E2E-FOCUS' });
  await signInAs(page, freshOrg.api);
  await page.goto('/inventory');

  const box = page.getByRole('combobox', { name: 'Search everything' });
  await box.fill('fokus');
  const listbox = page.getByRole('listbox');
  await expect(
    listbox.getByText(saidOn('en', 'inventory.movements.closeMatches'), {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    listbox.getByRole('option', {
      name: new RegExp(
        `^Focus 60ct · ${saidOn('en', 'search.kindOne', { kind: 'item' })}`,
      ),
    }),
  ).toBeVisible();
  // One heading for them all, the kinds' own gone.
  await expect(
    listbox.getByText(saidOn('en', 'search.kind.item'), { exact: true }),
  ).toHaveCount(0);
});
