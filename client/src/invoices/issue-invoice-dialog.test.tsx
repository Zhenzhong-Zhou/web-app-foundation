import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { InvoiceDetail } from '../api/types.gen';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { IssueInvoiceDialog } from './issue-invoice-dialog';

const DRAFT: InvoiceDetail = {
  id: 'inv-1',
  number: null,
  status: 'draft',
  orderId: 'order-1',
  orderNumber: 'SO-000001',
  orderReference: 'PO-ACME-1',
  shipmentId: 'ship-1',
  partnerId: 'partner-1',
  partnerName: 'Northside Pharmacy',
  currency: 'CAD',
  invoiceDate: null,
  dueDate: null,
  note: null,
  subtotal: null,
  taxTotal: null,
  total: null,
  sellerName: null,
  sellerTaxNumber: null,
  sellerLine1: null,
  sellerLine2: null,
  sellerCity: null,
  sellerRegion: null,
  sellerPostalCode: null,
  sellerCountry: null,
  billToName: null,
  billToLine1: null,
  billToLine2: null,
  billToCity: null,
  billToRegion: null,
  billToPostalCode: null,
  billToCountry: null,
  shipToLabel: null,
  shipToLine1: null,
  shipToLine2: null,
  shipToCity: null,
  shipToRegion: null,
  shipToPostalCode: null,
  shipToCountry: null,
  issuedAt: null,
  voidedAt: null,
  voidReason: null,
  lines: [],
  taxes: null,
  preview: null,
  creditNotes: [],
  language: 'en',
  secondLanguage: null,
};

/** The server's answer to Issue, as the exception filter shapes it. */
function refuse(body: { message: string; code?: string }) {
  server.use(
    http.post('/api/v1/invoices/inv-1/issue', () =>
      HttpResponse.json(body, { status: 409 }),
    ),
  );
}

async function issueAs(permissions: string[]) {
  const user = userEvent.setup();
  renderWithAuth(
    <MemoryRouter>
      <IssueInvoiceDialog
        invoice={DRAFT}
        open
        onClose={() => undefined}
        onIssued={() => undefined}
      />
    </MemoryRouter>,
    { permissions },
  );
  await user.click(screen.getByRole('button', { name: 'Issue' }));
}

const ADDRESS_MISSING = {
  message: 'Set the organization’s registered address before issuing',
  code: 'organization_address_missing',
};

const TAX_NUMBER_MISSING = {
  message: 'Set the organization’s tax number before issuing',
  code: 'organization_tax_number_missing',
};

const BILLING_MISSING = {
  message: 'Northside Pharmacy has no billing address',
  code: 'customer_billing_address_missing',
};

/**
 * The refusal names what is missing; the link saves the search for where it
 * is set (ADR-061). Keyed on the code, so it holds in every language.
 */
describe('IssueInvoiceDialog', () => {
  it('links a missing address to Organization → Profile for whoever may set it', async () => {
    refuse(ADDRESS_MISSING);
    await issueAs(['invoices.issue', 'organizations.update']);

    const link = await screen.findByRole('link', {
      name: 'Set it on Organization → Profile',
    });
    expect(link.getAttribute('href')).toBe('/settings/organization');
    // Inside the error, under the server's message.
    const alert = screen.getByRole('alert', { name: 'Error' });
    expect(alert.contains(link)).toBe(true);
    expect(screen.getByText(/registered address before issuing/)).toBeTruthy();
  });

  it('shows the message alone to someone who cannot change the organization', async () => {
    refuse(ADDRESS_MISSING);
    await issueAs(['invoices.issue']);

    expect(
      await screen.findByText(/registered address before issuing/),
    ).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('links a missing tax number to Organization → Profile', async () => {
    refuse(TAX_NUMBER_MISSING);
    await issueAs(['invoices.issue', 'organizations.update']);

    const link = await screen.findByRole('link', {
      name: 'Set it on Organization → Profile',
    });
    expect(link.getAttribute('href')).toBe('/settings/organization');
  });

  it('links a customer with no billing address to the customer', async () => {
    refuse(BILLING_MISSING);
    await issueAs(['invoices.issue', 'partners.update']);

    const link = await screen.findByRole('link', {
      name: 'Open Northside Pharmacy to add one',
    });
    expect(link.getAttribute('href')).toBe('/partners/partner-1');
  });

  it('keeps each link to whoever may make that change', async () => {
    refuse(BILLING_MISSING);
    // May change the organization, not the customer.
    await issueAs(['invoices.issue', 'organizations.update']);

    expect(await screen.findByText(/no billing address/)).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('offers no link for a refusal without a code', async () => {
    refuse({ message: 'SKU-1 has no tax code' });
    await issueAs([
      'invoices.issue',
      'organizations.update',
      'partners.update',
    ]);

    expect(await screen.findByText(/no tax code/)).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
