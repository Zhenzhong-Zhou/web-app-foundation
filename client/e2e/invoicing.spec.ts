import type { APIRequestContext } from '@playwright/test';

import { expect, test } from './fixtures';
import { created, signInAs } from './support/api';

/**
 * An invoice through the browser (ADR-046): a draft's tax set for every
 * line, its total previewed, issued with a number, then voided by a credit
 * note that the invoice links to.
 *
 * Seeded through the API up to the draft: shipping has its own journey,
 * and creating an invoice from a shipment arrives with the order page's
 * button. freshOrg, because numbers are asserted from INV-000001.
 */

/** A PUT, PATCH or DELETE that must succeed; they return no body. */
async function ok(
  response: Awaited<ReturnType<APIRequestContext['patch']>>,
): Promise<void> {
  expect(response.ok(), await response.text()).toBeTruthy();
}

/**
 * Everything issuing needs, and a draft for one shipment: 6 capsules at
 * 12.50 CAD, with no tax code yet.
 */
async function seedDraft(api: APIRequestContext): Promise<string> {
  await ok(
    await api.put('/v1/organization/address', {
      data: { line1: '100 Main St', city: 'Vancouver', country: 'CA' },
    }),
  );

  const { partner } = await created<{ partner: { id: string } }>(
    await api.post('/v1/partners', {
      data: { name: 'Northside Pharmacy', code: 'NORTH' },
    }),
  );

  await created(
    await api.post(`/v1/partners/${partner.id}/addresses`, {
      data: {
        line1: '9 Harbour Rd',
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

  for (const [name, components] of [
    ['GST', [{ name: 'GST', rate: '5' }]],
    ['Exempt', []],
  ] as const) {
    await created(
      await api.post('/v1/tax-codes', { data: { name, components } }),
    );
  }

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

  const { invoice } = await created<{ invoice: { id: string } }>(
    await api.post('/v1/invoices', { data: { shipmentId: shipment.id } }),
  );

  return invoice.id;
}

test('taxes a draft, issues it, and voids it with a credit note', async ({
  page,
  freshOrg,
}) => {
  await seedDraft(freshOrg.api);
  await signInAs(page, freshOrg.api);

  // Reached from the top nav, and listed as a draft.
  await page.goto('/orders');
  await page.getByRole('link', { name: 'Invoices' }).click();
  await expect(page).toHaveURL(/\/invoices$/);
  await page.getByRole('link', { name: 'Draft' }).click();

  await expect(
    page.getByRole('heading', { name: 'Draft invoice' }),
  ).toBeVisible();
  // No tax yet, and the page says so on the line.
  await expect(page.getByText('None yet')).toBeVisible();

  // One code for every line, the usual case.
  await page.getByRole('combobox', { name: 'Tax code for every line' }).click();
  await page.getByRole('option', { name: 'GST' }).click();
  await page.getByRole('button', { name: 'Apply to every line' }).click();

  // 6 × 12.50 = 75.00, GST 5% = 3.75, previewed as issuing will store it.
  await expect(page.getByText('GST 5%')).toBeVisible();
  await expect(page.getByText(/78\.75/)).toBeVisible();

  await page.getByRole('button', { name: 'Issue' }).click();
  const issue = page.getByRole('dialog');
  await expect(issue).toContainText('78.75');
  await issue.getByRole('button', { name: 'Issue' }).click();
  await expect(issue).toBeHidden();

  // Numbered, and nothing left to edit.
  await expect(page.getByRole('heading', { name: 'INV-000001' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Apply to every line' }),
  ).toHaveCount(0);
  await expect(page.getByText('Northside Pharmacy').first()).toBeVisible();

  await page.getByRole('button', { name: 'Void' }).click();
  const voiding = page.getByRole('dialog');
  await voiding.getByLabel('Reason').fill('Billed at the wrong price');
  await voiding.getByRole('button', { name: 'Void invoice' }).click();
  await expect(voiding).toBeHidden();

  await expect(page.getByText(/Voided/).first()).toBeVisible();

  // The credit note is its own document, with its own number.
  await page.getByRole('link', { name: 'CN-000001' }).click();
  await expect(page.getByRole('heading', { name: 'CN-000001' })).toBeVisible();
  await expect(page.getByText(/Billed at the wrong price/)).toBeVisible();
  await expect(page.getByText(/78\.75/).first()).toBeVisible();
});

test('refuses to issue until every line is taxed, and deletes a draft', async ({
  page,
  freshOrg,
}) => {
  const invoiceId = await seedDraft(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await page.goto(`/invoices/${invoiceId}`);

  // The dialog warns first; the server's refusal is shown if sent anyway.
  await page.getByRole('button', { name: 'Issue' }).click();
  const issue = page.getByRole('dialog');
  await expect(issue).toContainText('FOCUS-60CT has no tax code yet');
  await issue.getByRole('button', { name: 'Issue' }).click();
  // The server's own refusal, shown in the dialog.
  await expect(issue).toContainText(/choose one, or Exempt/);
  await issue.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'Delete draft' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete draft' })
    .click();

  await expect(page).toHaveURL(/\/invoices$/);
  await expect(page.getByText(/No invoices yet/)).toBeVisible();
});

test('prints a draft as DRAFT, and a voided invoice and its credit note', async ({
  page,
  freshOrg,
}) => {
  const api = freshOrg.api;
  const invoiceId = await seedDraft(api);
  await signInAs(page, api);

  // A draft prints for checking, but cannot pass for a sent invoice.
  await page.goto(`/invoices/${invoiceId}/print`);
  await expect(page.getByText('DRAFT — not an invoice')).toBeVisible();

  const { taxCodes } = await created<{
    taxCodes: { id: string; name: string }[];
  }>(await api.get('/v1/tax-codes'));
  const gst = taxCodes.find((code) => code.name === 'GST')!;

  await ok(
    await api.patch(`/v1/invoices/${invoiceId}`, {
      data: { taxCodeId: gst.id },
    }),
  );
  await created(
    await api.post(`/v1/invoices/${invoiceId}/issue`, {
      data: { invoiceDate: '2026-09-25' },
    }),
  );
  const { creditNote } = await created<{ creditNote: { id: string } }>(
    await api.post(`/v1/invoices/${invoiceId}/void`, {
      data: { reason: 'Billed twice', creditDate: '2026-09-25' },
    }),
  );

  // Found in a drawer later, it must not pass for one that is owed.
  await page.goto(`/invoices/${invoiceId}/print`);
  await expect(page.getByText('INV-000001')).toBeVisible();
  await expect(page.getByText(/VOID — nothing is owed/)).toBeVisible();
  await expect(page.getByText(/reversed by CN-000001/)).toBeVisible();

  await page.goto(`/credit-notes/${creditNote.id}/print`);
  await expect(
    page.getByRole('heading', { name: 'Credit note' }),
  ).toBeVisible();
  await expect(page.getByText('CN-000001')).toBeVisible();
  await expect(page.getByText(/Voids invoice INV-000001/)).toBeVisible();
  await expect(page.getByText('Reason: Billed twice')).toBeVisible();
});
