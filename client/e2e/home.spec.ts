import { expect, test } from './fixtures';
import {
  created,
  createLocation,
  createProduct,
  daysFromNow,
  signInAs,
} from './support/api';

/**
 * Home (ADR-058): signing in lands on it, Home leads the rail, a new
 * organization is led by Getting started, and a card with work shows,
 * its See all opening its list with the same rows.
 */
test('a new organization lands on Home, led by Getting started', async ({
  page,
  freshOrg,
}) => {
  await signInAs(page, freshOrg.api);
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    /^Good (morning|afternoon|evening), /,
  );
  await expect(
    page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Home' }),
  ).toBeVisible();

  const start = page.getByRole('region', { name: 'Getting started' });
  await expect(start).toBeVisible();
  await expect(start.getByRole('button', { name: 'Skip' })).toHaveCount(1);

  // Dismissed, it stays out of the way, and comes back on request.
  await start.getByRole('button', { name: 'Dismiss' }).click();
  await expect(start).toBeHidden();
  await page.getByRole('button', { name: 'Show Getting started' }).click();
  await expect(
    page.getByRole('region', { name: 'Getting started' }),
  ).toBeVisible();
});

test('a card with work shows, and See all opens its list the same', async ({
  page,
  freshOrg,
}) => {
  // Its own data, so the card's count is known: one lot expiring in 10 days.
  const product = await createProduct(freshOrg.api, { tracksLots: true });
  const location = await createLocation(freshOrg.api);
  await created(
    await freshOrg.api.post('/v1/stock/movements', {
      data: {
        variantId: product.variantId,
        toLocationId: location.id,
        quantity: '5',
        reason: 'receipt',
        lot: { code: 'E2E-SOON', expiresAt: daysFromNow(10) },
      },
    }),
  );

  await signInAs(page, freshOrg.api);
  await page.goto('/');

  const expiring = page.getByRole('region', { name: 'Expiring soon' });
  await expect(expiring.getByRole('link', { name: 'E2E-SOON' })).toBeVisible();
  await expiring.getByRole('link', { name: 'See all 1' }).click();

  await expect(page).toHaveURL(/\/inventory\?expiring=1$/);
  await expect(
    page.getByRole('button', { name: /^Expiring soon/ }),
  ).toHaveAttribute('aria-pressed', 'true');
});
