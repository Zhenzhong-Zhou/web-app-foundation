import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { renderWithAuth } from '../test/render-with-auth';
import { PdfActions } from './pdf-actions';

describe('PdfActions', () => {
  afterEach(() => localStorage.clear());

  /**
   * Each link says the app's language (ADR-071, amended for #526), for the
   * page a refused PDF answers with: `en`, the app's, not intl's `en-US`,
   * which the server would not match.
   */
  it('opens the PDF in a new tab to print, and saves it to download, each saying the app’s language', () => {
    renderWithAuth(<PdfActions path="/invoices/inv-1/pdf" />);

    const print = screen.getByRole('link', { name: 'Print' });
    expect(print).toHaveAttribute(
      'href',
      '/api/v1/invoices/inv-1/pdf?locale=en',
    );
    expect(print).toHaveAttribute('target', '_blank');

    expect(screen.getByRole('link', { name: 'Download PDF' })).toHaveAttribute(
      'href',
      '/api/v1/invoices/inv-1/pdf?download=1&locale=en',
    );
  });

  /** jsdom's browser is English; the app's choice wins over it. */
  it('says 中文 when the app is in it, whatever the browser’s language', async () => {
    localStorage.setItem('language', 'zh-Hans');

    renderWithAuth(<PdfActions path="/invoices/inv-1/pdf" />);

    expect(await screen.findByRole('link', { name: '打印' })).toHaveAttribute(
      'href',
      '/api/v1/invoices/inv-1/pdf?locale=zh-Hans',
    );
    expect(screen.getByRole('link', { name: '下载 PDF' })).toHaveAttribute(
      'href',
      '/api/v1/invoices/inv-1/pdf?download=1&locale=zh-Hans',
    );
  });

  /** The pro forma's path asks for its tax code already. */
  it('adds the language after a question the path already asks', () => {
    renderWithAuth(
      <PdfActions path="/orders/order-1/pro-forma?taxCodeId=tax-1" />,
    );

    expect(screen.getByRole('link', { name: 'Print' })).toHaveAttribute(
      'href',
      '/api/v1/orders/order-1/pro-forma?taxCodeId=tax-1&locale=en',
    );
    expect(screen.getByRole('link', { name: 'Download PDF' })).toHaveAttribute(
      'href',
      '/api/v1/orders/order-1/pro-forma?taxCodeId=tax-1&download=1&locale=en',
    );
  });
});
