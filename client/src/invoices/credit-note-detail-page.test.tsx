import { render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { CreditNoteDetail } from '../api/types.gen';
import { server } from '../test/setup';
import { CreditNoteDetailPage } from './credit-note-detail-page';

const NOTE: CreditNoteDetail = {
  id: 'credit-note-1',
  number: 'CN-000001',
  invoiceId: 'invoice-1',
  invoiceNumber: 'INV-000001',
  invoiceDate: '2026-09-25',
  currency: 'CAD',
  creditDate: '2026-09-30',
  reason: 'Damaged in transit',
  isVoid: false,
  subtotal: '50.0000',
  taxTotal: '2.5000',
  total: '52.5000',
  lines: [],
  taxes: [],
  language: 'en',
  secondLanguage: null,
  sellerName: 'Alpha Wellness',
  sellerTaxNumber: null,
  sellerLine1: null,
  sellerLine2: null,
  sellerCity: null,
  sellerRegion: null,
  sellerPostalCode: null,
  sellerCountry: null,
  billToName: 'Acme Supplies',
  billToLine1: null,
  billToLine2: null,
  billToCity: null,
  billToRegion: null,
  billToPostalCode: null,
  billToCountry: null,
};

function renderPage() {
  server.use(
    http.get('/api/v1/credit-notes/:id', () =>
      HttpResponse.json({ creditNote: NOTE }),
    ),
  );
  render(
    <MemoryRouter initialEntries={['/credit-notes/credit-note-1']}>
      <Routes>
        <Route path="/credit-notes/:id" element={<CreditNoteDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CreditNoteDetailPage', () => {
  /**
   * What it credits is part of the page, read where it stands: a note, not
   * the alert MUI makes of an Alert, which a screen reader announces on
   * arrival as if it were news (#171).
   */
  it('says what it credits in a note, not an alert', async () => {
    renderPage();

    const note = await screen.findByRole('note');
    expect(note).toHaveTextContent(
      'Credits against INV-000001 of Sep 25, 2026. Reason: Damaged in transit',
    );
    expect(
      within(note).getByRole('link', { name: 'INV-000001' }),
    ).toHaveAttribute('href', '/invoices/invoice-1');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
