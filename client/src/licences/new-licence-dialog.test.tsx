import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { server } from '../test/setup';
import { NewLicenceDialog } from './new-licence-dialog';

/**
 * A licence's dates are `date` columns, sent as the day picked (ADR-052).
 * No conversion on the way: a day is not a moment, and any instant would
 * need a time zone to become one again.
 */
describe('NewLicenceDialog', () => {
  it('sends its dates as the days picked', async () => {
    const user = userEvent.setup();
    let body: Record<string, unknown> = {};

    server.use(
      http.post('/api/v1/product-licences', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 'licence-1' }, { status: 201 });
      }),
    );

    const onCreated = vi.fn();
    render(<NewLicenceDialog open onClose={vi.fn()} onCreated={onCreated} />);

    await user.type(
      screen.getByRole('textbox', { name: /Number/ }),
      'NPN-80012345',
    );
    await user.type(
      screen.getByRole('textbox', { name: /Issued by/ }),
      'Health Canada',
    );
    await user.type(screen.getByLabelText('Issued'), '2026-01-15');
    await user.type(screen.getByLabelText('Valid until'), '2031-01-14');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    // As typed: the API takes a calendar day as YYYY-MM-DD (ADR-052).
    expect(body.issuedAt).toBe('2026-01-15');
    expect(body.expiresAt).toBe('2031-01-14');
  });

  it('leaves out a date that was not given', async () => {
    const user = userEvent.setup();
    let body: Record<string, unknown> = {};

    server.use(
      http.post('/api/v1/product-licences', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 'licence-1' }, { status: 201 });
      }),
    );

    const onCreated = vi.fn();
    render(<NewLicenceDialog open onClose={vi.fn()} onCreated={onCreated} />);

    await user.type(
      screen.getByRole('textbox', { name: /Number/ }),
      'NPN-80012345',
    );
    await user.type(
      screen.getByRole('textbox', { name: /Issued by/ }),
      'Health Canada',
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(body).not.toHaveProperty('issuedAt');
    expect(body).not.toHaveProperty('expiresAt');
  });
});
