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

  // The frame in French.
  await expect(page.getByRole('link', { name: 'Factures' })).toBeVisible();

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
