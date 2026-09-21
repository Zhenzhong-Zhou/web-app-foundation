import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import type { AuditRecord } from './audit-format';
import { HistoryButton } from './history-button';

const ENTRY: AuditRecord = {
  id: 'audit-1',
  action: 'product.variant_updated',
  resourceType: 'product',
  resourceId: 'product-1',
  resourceLabel: 'Widget',
  actorId: 'user-1',
  actorEmail: 'owner@alpha.example.com',
  payload: { sku: { from: 'WIDGET-1', to: 'RENAMED-1' } },
  ip: null,
  createdAt: new Date().toISOString(),
};

function renderButton(permissions: string[]) {
  return renderWithAuth(
    <MemoryRouter>
      <HistoryButton resourceId="product-1" />
    </MemoryRouter>,
    { permissions },
  );
}

describe('HistoryButton', () => {
  it('shows this record history in a drawer', async () => {
    const requested: URL[] = [];

    server.use(
      http.get('/api/v1/audit', ({ request }) => {
        requested.push(new URL(request.url));
        return HttpResponse.json({ entries: [ENTRY], nextCursor: null });
      }),
    );

    renderButton(['audit.view']);
    await userEvent.click(screen.getByRole('button', { name: 'History' }));

    expect(
      await screen.findByText('Product variant updated'),
    ).toBeInTheDocument();
    expect(screen.getByText('sku: WIDGET-1 → RENAMED-1')).toBeInTheDocument();

    // Scoped to this record, or the drawer is the whole organization's log.
    expect(requested[0].searchParams.get('resourceId')).toBe('product-1');
  });

  // The drawer is the short answer; the audit page keeps the filters.
  it('links out to the full audit log for this record', async () => {
    server.use(
      http.get('/api/v1/audit', () =>
        HttpResponse.json({ entries: [], nextCursor: null }),
      ),
    );

    renderButton(['audit.view']);
    await userEvent.click(screen.getByRole('button', { name: 'History' }));

    expect(
      await screen.findByRole('link', { name: 'Open in audit log' }),
    ).toHaveAttribute('href', '/audit?resourceId=product-1');
    expect(screen.getByText('No recorded changes.')).toBeInTheDocument();
  });

  it('is absent without audit.view', () => {
    renderButton([]);

    expect(
      screen.queryByRole('button', { name: 'History' }),
    ).not.toBeInTheDocument();
  });
});
