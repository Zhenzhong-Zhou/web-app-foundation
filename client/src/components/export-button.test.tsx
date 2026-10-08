import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '../test/setup';
import { TestProviders } from '../test/test-providers';
import { ExportButton } from './export-button';

describe('ExportButton', () => {
  const created: string[] = [];

  beforeEach(() => {
    // jsdom has no object URLs; the button's download only needs a name back.
    URL.createObjectURL = vi.fn(() => 'blob:export');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      created.push(this.download);
    });
  });

  afterEach(() => {
    created.length = 0;
    vi.restoreAllMocks();
  });

  it('downloads the file under the name the server gives it', async () => {
    server.use(
      http.get(
        '/api/v1/invoices/export',
        () =>
          new HttpResponse('\uFEFFNumber\r\n', {
            headers: {
              'Content-Type': 'text/csv; charset=utf-8',
              'Content-Disposition':
                'attachment; filename="invoices-2026-10-07.csv"',
            },
          }),
      ),
    );
    const user = userEvent.setup();
    render(<ExportButton path="/invoices/export?from=2026-09-01" />, {
      wrapper: TestProviders,
    });

    await user.click(screen.getByRole('button', { name: 'Export' }));
    await vi.waitFor(() =>
      expect(created).toEqual(['invoices-2026-10-07.csv']),
    );
  });

  it('shows the server’s refusal, worded as the server words it', async () => {
    server.use(
      http.get('/api/v1/orders/export', () =>
        HttpResponse.json(
          { message: 'More than 50,000 rows match. Narrow the dates.' },
          { status: 400 },
        ),
      ),
    );
    const user = userEvent.setup();
    render(<ExportButton path="/orders/export" />, { wrapper: TestProviders });

    await user.click(screen.getByRole('button', { name: 'Export' }));
    expect(
      await screen.findByText('More than 50,000 rows match. Narrow the dates.'),
    ).toBeTruthy();
  });
});
