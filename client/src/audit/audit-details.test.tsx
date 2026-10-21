import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { AuditRecord } from '../api/types.gen';
import { formatDay } from '../lib/format';
import { renderWithAuth } from '../test/render-with-auth';
import { AuditDetails } from './audit-details';

const ORDER = '01a15178-4bc8-7967-a6f1-d72516cc29ae';

/** As the server words them (ADR-076). */
const DETAILS: AuditRecord['details'] = [
  {
    field: 'Order',
    changed: false,
    from: null,
    value: {
      text: 'SO-000009 · Kits Wellness Co-op',
      link: { kind: 'order', id: ORDER },
    },
  },
  {
    field: 'Role',
    changed: true,
    from: { text: 'Viewer', link: { kind: 'role', id: 'role-viewer' } },
    value: { text: 'Admin', link: { kind: 'role', id: 'role-admin' } },
  },
  {
    field: 'Tax code',
    changed: false,
    from: null,
    value: { text: 'GST', link: { kind: 'tax_code', id: 'tax-code-1' } },
  },
  {
    field: 'Due date',
    changed: true,
    from: null,
    value: { text: '2026-11-18', day: '2026-11-18' },
  },
];

function renderDetails(permissions: string[]) {
  return renderWithAuth(
    <MemoryRouter>
      <AuditDetails details={DETAILS} />
    </MemoryRouter>,
    { permissions },
  );
}

describe('AuditDetails', () => {
  it('links a reference the reader may open, by its name, the id only in the URL', () => {
    const { container } = renderDetails(['orders.view']);

    const order = screen.getByRole('link', {
      name: 'SO-000009 · Kits Wellness Co-op',
    });
    expect(order).toHaveAttribute('href', `/orders/${ORDER}`);
    expect(container.textContent).not.toContain(ORDER);
  });

  it('shows the name without a link to a reader who may not open it', () => {
    renderDetails([]);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(/SO-000009/)).toBeInTheDocument();
  });

  it('reads a change with an arrow, and a day in the reader format', () => {
    const { container } = renderDetails(['orders.view']);
    expect(container.textContent).toContain('Role: Viewer → Admin');
    // In the reader's own format, whatever the runtime's locale (format.test).
    expect(container.textContent).toContain(
      `Due date: — → ${formatDay('2026-11-18')}`,
    );
    expect(container.textContent).not.toContain('2026-11-18');
    // The role links only for a reader who may see the roles.
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('links a role to its page, and leaves a kind with no page as text', () => {
    renderDetails(['orders.view', 'roles.view']);
    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute(
      'href',
      '/settings/roles/role-admin',
    );
    expect(screen.queryByRole('link', { name: 'GST' })).toBeNull();
    expect(screen.getByText(/GST/)).toBeInTheDocument();
  });

  it('renders nothing when there is nothing recorded', () => {
    const { container } = renderWithAuth(
      <MemoryRouter>
        <AuditDetails details={[]} />
      </MemoryRouter>,
    );
    expect(container.textContent).toBe('');
  });
});
