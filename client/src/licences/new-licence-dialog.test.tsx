import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { server } from '../test/setup';
import { NewLicenceDialog } from './new-licence-dialog';

/**
 * A licence's dates are timestamptz columns. Sent as the bare day, Postgres
 * would store midnight in whatever zone its session runs in, and the day
 * shown back could differ from the day picked. Sent as UTC midnight, it
 * cannot.
 */
describe('NewLicenceDialog', () => {
  it('sends its dates as UTC midnight of the days picked', async () => {
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
    expect(body.issuedAt).toBe('2026-01-15T00:00:00.000Z');
    expect(body.expiresAt).toBe('2031-01-14T00:00:00.000Z');
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
