import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithAuth } from '../test/render-with-auth';
import { PdfActions } from './pdf-actions';

describe('PdfActions', () => {
  it('opens the PDF in a new tab to print, and saves it to download', () => {
    renderWithAuth(<PdfActions path="/invoices/inv-1/pdf" />);

    const print = screen.getByRole('link', { name: 'Print' });
    expect(print).toHaveAttribute('href', '/api/v1/invoices/inv-1/pdf');
    expect(print).toHaveAttribute('target', '_blank');

    expect(screen.getByRole('link', { name: 'Download PDF' })).toHaveAttribute(
      'href',
      '/api/v1/invoices/inv-1/pdf?download=1',
    );
  });
});
