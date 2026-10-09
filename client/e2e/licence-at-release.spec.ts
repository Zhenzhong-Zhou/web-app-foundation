import type { APIRequestContext } from '@playwright/test';

import { expect, test } from './fixtures';
import { created, daysFromNow, signInAs } from './support/api';

/**
 * A licence's state at release, through the browser (ADR-050): the release
 * dialog shows what release will do before it is pressed, an expired
 * licence is released under an override with its reason, and the run page
 * says so afterwards. Then the same licence refused outright once the
 * organization's policy says so.
 *
 * Seeded through the API — the rules themselves are the server suite's —
 * and acted on through the UI, which is what only a browser can check.
 * freshOrg, because the policy is the organization's own.
 */

/** A recipe made under a licence that expired yesterday, and a run of it. */
async function seedExpiredRun(api: APIRequestContext) {
  const { licence } = await created<{ licence: { id: string } }>(
    await api.post('/v1/product-licences', {
      data: {
        number: 'E2E-80012345',
        authority: 'Health Canada',
        issuedAt: daysFromNow(-400),
        expiresAt: daysFromNow(-1),
      },
    }),
  );

  const { location: site } = await created<{ location: { id: string } }>(
    await api.post('/v1/locations', {
      data: { type: 'site', name: 'E2E Licence Plant' },
    }),
  );
  const { location: shelf } = await created<{ location: { id: string } }>(
    await api.post('/v1/locations', {
      data: {
        type: 'bin',
        name: 'E2E Licence Shelf',
        code: 'E2E-LIC-SHELF',
        parentId: site.id,
      },
    }),
  );
  const { location: line } = await created<{ location: { id: string } }>(
    await api.post('/v1/locations', {
      data: {
        type: 'bin',
        name: 'E2E Licence Line',
        code: 'E2E-LIC-LINE',
        parentId: site.id,
      },
    }),
  );

  const variantOf = async (sku: string, type: string, tracksLots: boolean) =>
    (
      await created<{ product: { variants: { id: string }[] } }>(
        await api.post('/v1/products', {
          data: {
            type,
            name: sku,
            variant: { sku, unitOfMeasure: 'each', tracksLots },
          },
        }),
      )
    ).product.variants[0].id;

  const output = await variantOf('E2E-LIC-FOCUS', 'good', true);
  const blend = await variantOf('E2E-LIC-BLEND', 'material', false);

  await created(
    await api.post('/v1/stock/movements', {
      data: {
        variantId: blend,
        toLocationId: shelf.id,
        quantity: '100',
        reason: 'receipt',
      },
    }),
  );

  const { bom } = await created<{ bom: { id: string } }>(
    await api.post('/v1/boms', {
      data: {
        outputVariantId: output,
        outputQuantity: '1000',
        licenceId: licence.id,
        lines: [{ componentVariantId: blend, quantity: '30' }],
      },
    }),
  );
  const promoted = await api.post(`/v1/boms/${bom.id}/promote`);
  expect(promoted.ok(), await promoted.text()).toBeTruthy();

  const { productionOrder } = await created<{
    productionOrder: { id: string };
  }>(
    await api.post('/v1/production-orders', {
      data: {
        outputVariantId: output,
        bomId: bom.id,
        locationId: line.id,
        quantityPlanned: '1000',
        reference: 'E2E-LIC-RUN',
      },
    }),
  );

  return productionOrder.id;
}

test('releases under an expired licence with a reason, and the run says so', async ({
  page,
  freshOrg,
}) => {
  const runId = await seedExpiredRun(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await page.goto(`/production/${runId}`);

  await page.getByRole('button', { name: 'Release' }).click();

  const release = page.getByRole('dialog');
  await release.getByLabel('Pick components from').click();
  await page.getByRole('option', { name: /E2E Licence Shelf/ }).click();

  // The default policy: an expired licence needs an override, and the Owner
  // holds the permission, so the dialog asks for a reason first.
  await expect(release).toContainText(
    'E2E-80012345 (Health Canada) expired on',
  );
  const submit = release.getByRole('button', { name: 'Release' });
  await expect(submit).toBeDisabled();

  await release
    .getByLabel('Reason for releasing anyway')
    .fill('Renewal filed, confirmed by phone');
  await submit.click();
  await expect(release).toBeHidden();

  // Read where it is shown: "Made under …, expired at release, released by
  // E2E Owner: …", split across the link and the text after it.
  await expect(page.locator('body')).toContainText(
    'expired at release, released by E2E Owner: Renewal filed, confirmed by phone',
  );
});

test('refuses the same licence once the policy says so', async ({
  page,
  freshOrg,
}) => {
  const runId = await seedExpiredRun(freshOrg.api);
  await signInAs(page, freshOrg.api);

  // Settings → Organization → Stock, where the policy is set (ADR-061).
  await page.goto('/settings/organization?tab=stock');
  await page.getByLabel('Expired').click();
  await page.getByRole('option', { name: 'Refuse', exact: true }).click();
  await page.getByRole('button', { name: 'Save licence policy' }).click();
  await expect(page.getByText('Licence policy saved')).toBeVisible();

  await page.goto(`/production/${runId}`);
  await page.getByRole('button', { name: 'Release' }).click();

  const release = page.getByRole('dialog');
  await release.getByLabel('Pick components from').click();
  await page.getByRole('option', { name: /E2E Licence Shelf/ }).click();

  await expect(release).toContainText(
    'Your organization does not release runs under it',
  );
  await expect(release.getByLabel('Reason for releasing anyway')).toHaveCount(
    0,
  );
  await expect(release.getByRole('button', { name: 'Release' })).toBeDisabled();
});
