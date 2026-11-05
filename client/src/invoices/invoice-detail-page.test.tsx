import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { InvoiceDetail } from '../api/types.gen';
import { ToastProvider } from '../components/toast-provider';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { InvoiceDetailPage } from './invoice-detail-page';

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

const ISSUED: InvoiceDetail = {
  ...DRAFT,
  status: 'issued',
  number: 'INV-2026-0453',
  invoiceDate: '2026-11-05',
};

describe('InvoiceDetailPage', () => {
  /**
   * Issue shows only on a draft, so issuing takes away the button its
   * dialog would give focus back to: focus goes to the heading instead,
   * where the page begins, once it names the invoice's new number (#462,
   * WCAG 2.4.3).
   */
  it('puts focus on the heading, with its number, once issued', async () => {
    let invoice = DRAFT;
    server.use(
      http.get('/api/v1/invoices/inv-1', () => HttpResponse.json({ invoice })),
      http.post('/api/v1/invoices/inv-1/issue', () => {
        invoice = ISSUED;
        return HttpResponse.json({ invoice });
      }),
    );
    const user = userEvent.setup();
    renderWithAuth(
      <ToastProvider>
        <MemoryRouter initialEntries={['/invoices/inv-1']}>
          <Routes>
            <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
      { permissions: ['invoices.issue'] },
    );

    await user.click(await screen.findByRole('button', { name: 'Issue' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Issue',
      }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { level: 1, name: 'INV-2026-0453' }),
      ).toHaveFocus(),
    );
  });
});
