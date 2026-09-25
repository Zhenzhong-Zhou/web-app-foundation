import type { APIRequestContext } from '@playwright/test';

import { expect, test } from './fixtures';
import { created, daysFromNow, signInAs } from './support/api';

/**
 * The flow with the most moving parts, driven through the browser: a
 * licensed recipe, a lot-tracked component, a run planned, released with its
 * lots previewed, output recorded into a batch, and closed over plan.
 *
 * Seeded through the API and acted on through the UI. The seeding is the
 * part other suites already cover; what only a browser can check is that the
 * dialogs send what the server expects and render what it sends back — the
 * earliest-expiry preview, the batch picker, the variance on close.
 *
 * freshOrg, because the run list and the lot preview both count rows.
 */

async function seedRecipe(api: APIRequestContext) {
  const { licence } = await created<{ licence: { id: string } }>(
    await api.post('/v1/product-licences', {
      data: { number: '80099999', authority: 'Health Canada' },
    }),
  );

  const { location: site } = await created<{ location: { id: string } }>(
    await api.post('/v1/locations', {
      data: { type: 'site', name: 'E2E Plant' },
    }),
  );

  for (const [name, code] of [
    ['E2E Shelf', 'E2E-SHELF'],
    ['E2E Blending', 'E2E-BLEND'],
  ]) {
    await created(
      await api.post('/v1/locations', {
        data: { type: 'bin', name, code, parentId: site.id },
      }),
    );
  }

  const locations = (await (await api.get('/v1/locations')).json()) as {
    id: string;
    name: string;
  }[];
  const shelf = locations.find((row) => row.name === 'E2E Shelf');
  if (!shelf) throw new Error('The shelf was not created');

  const variantOf = async (sku: string, type: string, unit: string) =>
    (
      await created<{ product: { variants: { id: string }[] } }>(
        await api.post('/v1/products', {
          data: {
            type,
            name: sku,
            variant: { sku, unitOfMeasure: unit, tracksLots: true },
          },
        }),
      )
    ).product.variants[0].id;

  const output = await variantOf('E2E-FOCUS', 'good', 'each');
  const blend = await variantOf('E2E-BLEND-MIX', 'material', 'kg');

  // Two lots on the shelf, so the preview has a choice to make: the one
  // expiring sooner must be picked first (ADR-039).
  for (const [code, days] of [
    ['LATE-LOT', 400],
    ['EARLY-LOT', 100],
  ] as const) {
    await created(
      await api.post('/v1/stock/movements', {
        data: {
          variantId: blend,
          toLocationId: shelf.id,
          quantity: '20',
          reason: 'receipt',
          lot: { code, expiresAt: daysFromNow(days) },
        },
      }),
    );
  }

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
}

test('plans, releases by lot, records output and closes a run', async ({
  page,
  freshOrg,
}) => {
  await seedRecipe(freshOrg.api);
  await signInAs(page, freshOrg.api);

  // --- Plan -----------------------------------------------------------------
  await page.goto('/production');
  await page.getByRole('button', { name: 'Plan a run' }).click();

  const plan = page.getByRole('dialog');
  await plan.getByLabel('Making').fill('E2E-FOCUS');
  await page.getByRole('option', { name: /E2E-FOCUS/ }).click();
  await plan.getByLabel('Quantity to make').fill('1000');
  await plan.getByLabel('Made at').click();
  await page.getByRole('option', { name: /E2E Blending/ }).click();
  await plan.getByLabel('Reference').fill('E2E-RUN-1');

  /**
   * Read the response rather than trusting the list to show it. Two things
   * can make the row fail to appear, and they need different fixes: the
   * server refused the plan, or it accepted it but dropped the reference.
   * The second is what a stale server does — validation strips a property
   * it does not know rather than refusing it, so an old process still
   * listening on the e2e port saves the run without one.
   */
  const [planned] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname.endsWith('/v1/production-orders'),
    ),
    plan.getByRole('button', { name: 'Plan run' }).click(),
  ]);

  expect(planned.ok(), await planned.text()).toBeTruthy();

  const { productionOrder: run } = (await planned.json()) as {
    productionOrder: {
      id: string;
      reference: string | null;
      bomId: string | null;
    };
  };

  // The plan dialog shows the active recipe; the run must carry it.
  expect(run.bomId, 'The run was planned without its recipe').not.toBeNull();

  expect(
    run.reference,
    'The server saved the run without its reference: either create() does ' +
      'not write it, or an older server is still running on port 3100 and ' +
      'being reused.',
  ).toBe('E2E-RUN-1');

  await expect(plan).toBeHidden();

  // The list shows it by reference, then opening it lands on its page.
  const row = page.getByRole('row', { name: /E2E-RUN-1/ });
  await expect(row).toBeVisible();
  await row.getByRole('link', { name: 'Open' }).click();
  await expect(page).toHaveURL(new RegExp(`/production/${run.id}$`));

  // Titled by its reference, not by '1000.0000 planned'.
  await expect(page.getByRole('heading', { name: 'E2E-RUN-1' })).toBeVisible();

  // --- Release, with the lot preview ----------------------------------------
  await page.getByRole('button', { name: 'Release' }).click();

  const release = page.getByRole('dialog');
  await release.getByLabel('Pick components from').click();
  await page.getByRole('option', { name: /E2E Shelf/ }).click();

  /**
   * The preview is the point: 30 kg needed, 20 in each lot, so earliest
   * expiry first takes all of EARLY-LOT and 10 of LATE-LOT. Seeing it here
   * means the dialog asked for the plan and rendered what came back.
   */
  await expect(release).toContainText('E2E-BLEND-MIX');
  await expect(release).toContainText('EARLY-LOT');
  await expect(release).toContainText('20.0000');
  await expect(release).toContainText('LATE-LOT');
  await expect(release).toContainText('10.0000');

  await release.getByRole('button', { name: 'Release' }).click();
  await expect(release).toBeHidden();

  // The run page names the lots that went in — the recall trail.
  await expect(page.getByRole('row', { name: /E2E-BLEND-MIX/ })).toContainText(
    'EARLY-LOT',
  );

  // --- Output into a new batch ----------------------------------------------
  await page.getByRole('button', { name: 'Record output' }).click();

  const output = page.getByRole('dialog');
  await output.getByLabel('Finished this time').fill('980');
  await output.getByLabel('Batch number').fill('E2E-BATCH-1');
  await output.getByRole('button', { name: 'Record' }).click();
  await expect(output).toBeHidden();

  // A second recording offers the batch by its code, not its id.
  await page.getByRole('button', { name: 'Record output' }).click();
  await page.getByRole('dialog').getByLabel('Batch number').click();
  await expect(page.getByRole('option', { name: /E2E-BATCH-1/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Cancel' })
    .click();

  // --- Close, over plan -----------------------------------------------------
  await page.getByRole('button', { name: 'Close run' }).click();

  const close = page.getByRole('dialog');
  await close
    .getByRole('row', { name: /E2E-BLEND-MIX/ })
    .getByRole('textbox')
    .fill('34');
  await close.getByRole('button', { name: 'Close run' }).click();
  await expect(close).toBeHidden();

  // 34 against 30 is over the threshold, so it is said once, here.
  await expect(page.getByText(/One component was well off plan/)).toBeVisible();
  await expect(page.getByRole('row', { name: /E2E-BLEND-MIX/ })).toContainText(
    'used',
  );
});
