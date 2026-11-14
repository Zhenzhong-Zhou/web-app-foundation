import type { APIRequestContext } from '@playwright/test';

import { expect, test } from './fixtures';
import { created, signInAs } from './support/api';

/**
 * Languages end to end (ADR-054): the screens in the reader's language, and
 * the server answering in the language of the screen that asked. A
 * document in its customer's languages is a PDF the server draws, so its
 * words are checked there (invoices.e2e, ADR-071).
 */

async function ok(
  response: Awaited<ReturnType<APIRequestContext['patch']>>,
): Promise<void> {
  expect(response.ok(), await response.text()).toBeTruthy();
}

/**
 * A Quebec customer whose documents print in French then English, and a
 * product shipped to them, ready to invoice.
 */
async function seedQuebecSale(api: APIRequestContext) {
  await ok(
    await api.put('/v1/organization/address', {
      data: { line1: '100 Main St', city: 'Vancouver', country: 'CA' },
    }),
  );

  const { partner } = await created<{ partner: { id: string } }>(
    await api.post('/v1/partners', {
      data: {
        name: 'Pharmacie Saint-Laurent',
        code: 'QUEBEC',
        documentLanguage: 'fr-CA',
        documentSecondLanguage: 'en',
      },
    }),
  );
  await created(
    await api.post(`/v1/partners/${partner.id}/addresses`, {
      data: {
        line1: '1200, rue Sainte-Catherine Ouest',
        city: 'Montréal',
        region: 'QC',
        country: 'CA',
        isBilling: true,
        isDefault: true,
      },
    }),
  );

  const { product } = await created<{
    product: { variants: { id: string }[] };
  }>(
    await api.post('/v1/products', {
      data: { type: 'good', name: 'Focus', variant: { sku: 'FOCUS-60CT' } },
    }),
  );
  const variantId = product.variants[0].id;

  const { location } = await created<{ location: { id: string } }>(
    await api.post('/v1/locations', { data: { type: 'site', name: 'Shelf' } }),
  );
  await created(
    await api.post('/v1/stock/movements', {
      data: {
        variantId,
        toLocationId: location.id,
        quantity: '100',
        reason: 'receipt',
      },
    }),
  );

  const { order } = await created<{
    order: { id: string; lines: { id: string }[] };
  }>(
    await api.post('/v1/orders', {
      data: {
        partnerId: partner.id,
        direction: 'sale',
        lines: [
          {
            variantId,
            quantityOrdered: '10',
            unitPrice: '12.50',
            currency: 'CAD',
          },
        ],
      },
    }),
  );
  await ok(
    await api.patch(`/v1/orders/${order.id}`, {
      data: { status: 'confirmed' },
    }),
  );

  const { shipment } = await created<{ shipment: { id: string } }>(
    await api.post(`/v1/orders/${order.id}/shipments`, {
      data: {
        fromLocationId: location.id,
        lines: [{ lineId: order.lines[0].id, quantity: '6' }],
      },
    }),
  );

  return { shipmentId: shipment.id };
}

test('switches the screens to French, and the server answers in French', async ({
  page,
  freshOrg,
}) => {
  const api = freshOrg.api;
  const { shipmentId } = await seedQuebecSale(api);

  // A draft with no tax code: issuing it is refused by the server.
  const { invoice } = await created<{ invoice: { id: string } }>(
    await api.post('/v1/invoices', { data: { shipmentId } }),
  );

  // The person's own language, chosen once and kept on their account.
  await ok(
    await api.patch('/v1/account/profile', { data: { locale: 'fr-CA' } }),
  );

  await signInAs(page, api);
  await page.goto(`/invoices/${invoice.id}`);

  // The frame in French: the rail's link, not the breadcrumb's, which the
  // page adds once the invoice has loaded.
  await expect(
    page
      .getByRole('navigation', { name: 'Principale', exact: true })
      .getByRole('link', { name: 'Factures', exact: true }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Émettre' }).click();
  const issue = page.getByRole('dialog');
  // The screen's own warning, then the server's refusal, both in French.
  await expect(issue).toContainText(
    'FOCUS-60CT n’a pas encore de code de taxe.',
  );
  await issue.getByRole('button', { name: 'Émettre' }).click();
  await expect(issue).toContainText(/choisissez-en un, ou Exonéré/);
  await expect(issue).not.toContainText(/choose one, or Exempt/);
});

/**
 * en-XA (ADR-054's November 2026 amendment, R9), the interaction table's
 * second row: chosen from the picker in development and the browser tests,
 * every screen in longer, accented English, a server message in plain
 * English, on the same page, until another language is chosen.
 */
test('switches the screens to en-XA, the server answering in plain English, and back', async ({
  browser,
}) => {
  // Signed out, in a browser of its own, so the shared session is left alone.
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel(/email/i).fill('nobody-here@example.test');
  await page.getByLabel(/^password/i).fill('definitely-the-wrong-password');

  await page.getByRole('combobox', { name: 'Language' }).click();
  await page.getByRole('option', { name: 'en-XA', exact: true }).click();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    '[Šíğñ íñ one]',
  );
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole('button', { name: '[Šíğñ íñ one]' }).click();
  // The server is asked in English, and answers in it.
  await expect(page.getByRole('alert')).toHaveText(
    'Invalid email or password. Check both and try again.',
  );

  await page.getByRole('combobox', { name: '[Ĺáñğúáğé one]' }).click();
  await page
    .getByRole('option', { name: 'Français (Canada) — bêta', exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Se connecter',
  );
  await expect(page).toHaveURL(/\/login$/);

  await context.close();
});
