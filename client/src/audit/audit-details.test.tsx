import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const LOT = '01a15178-4bc8-7967-a6f1-d72516cc29af';

/** A detail that is not a change: what the entry is about. */
function about(field: string, text: string, link?: Value['link']): Detail {
  return { field, changed: false, from: null, value: { text, link } };
}

/** A change, before and after; null for none. */
function change(field: string, from: string | null, to: string): Detail {
  return {
    field,
    changed: true,
    from: from === null ? null : { text: from },
    value: { text: to },
  };
}

type Detail = AuditRecord['details'][number];
type Value = NonNullable<Detail['value']>;

/** "Lot updated", as #687 words it: its item and lot, then what changed. */
const LOT_UPDATED: Detail[] = [
  about('Code', 'ASH-EXT-5'),
  about('Lot', 'ASH-0601', { kind: 'lot', id: LOT }),
  change('Lot code', 'ASH-06O1', 'ASH-0601'),
  change('Supplier’s lot', null, 'KSM-2291'),
  change('Expires', 'Doesn’t expire', 'Not known yet'),
];

/** `count` changes, as a role's areas might read. */
function changes(count: number): Detail[] {
  return Array.from({ length: count }, (_, index) =>
    change(`Area ${index + 1}`, 'None', 'View'),
  );
}

function renderEntry(details: Detail[]) {
  return renderWithAuth(
    <MemoryRouter>
      <AuditDetails details={details} />
    </MemoryRouter>,
    { permissions: ['stock.view'] },
  );
}

/** Each line of the changes, as a screen reader counts them. */
function lines() {
  return within(screen.getByRole('list'))
    .getAllByRole('listitem')
    .map((line) => line.textContent);
}

// ADR-076's amendment, an entry's changes one a line (ADR-094, R23).
describe('AuditDetails, its changes one a line', () => {
  it('reads one change on one line with the rest, joined by dots, as before', () => {
    const { container } = renderEntry(LOT_UPDATED.slice(0, 3));

    expect(container.textContent).toBe(
      'Code: ASH-EXT-5 · Lot: ASH-0601 · Lot code: ASH-06O1 → ASH-0601',
    );
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('puts each of three changes on its own line, the details that are not changes together on the first', () => {
    const { container } = renderEntry(LOT_UPDATED);

    expect(lines()).toEqual([
      'Lot code: ASH-06O1 → ASH-0601',
      'Supplier’s lot: — → KSM-2291',
      'Expires: Doesn’t expire → Not known yet',
    ]);
    // The first line, before the list, its lot still a link.
    expect(container.textContent).toMatch(
      /^Code: ASH-EXT-5 · Lot: ASH-0601Lot code:/,
    );
    expect(screen.getByRole('link', { name: 'ASH-0601' })).toHaveAttribute(
      'href',
      `/lots/${LOT}`,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('keeps a detail that is not a change on the first line, wherever it stood among two that are', () => {
    const { container } = renderEntry([
      change('Name', 'Calm 90ct', 'Calm 120ct'),
      about('Code', 'CALM-90'),
      change('Type', 'Products', 'Supplies'),
    ]);

    expect(container.textContent).toMatch(/^Code: CALM-90Name:/);
    expect(lines()).toEqual([
      'Name: Calm 90ct → Calm 120ct',
      'Type: Products → Supplies',
    ]);
  });

  it('keeps the arrow with the new value, to move to the next line whole', () => {
    renderEntry(LOT_UPDATED);

    const after = screen.getByText(
      (_, element) =>
        element?.tagName === 'SPAN' &&
        element.textContent === '→ Not known yet',
    );
    expect(after).toHaveStyle({ display: 'inline-block' });
  });

  it('shows six changes whole, with no button', () => {
    renderEntry(changes(6));

    expect(lines()).toHaveLength(6);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the first five of seven, and Show all 7 changes opens the rest in place, focus staying on it, then Show fewer', async () => {
    renderEntry(changes(7));

    expect(lines()).toEqual(
      changes(5).map(({ field }) => `${field}: None → View`),
    );
    const button = screen.getByRole('button', { name: 'Show all 7 changes' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute(
      'aria-controls',
      screen.getByRole('list').id,
    );

    await userEvent.click(button);
    expect(lines()).toHaveLength(7);
    expect(lines()[6]).toBe('Area 7: None → View');
    expect(button).toHaveAccessibleName('Show fewer');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveFocus();

    await userEvent.keyboard('{Enter}');
    expect(lines()).toHaveLength(5);
    expect(button).toHaveAccessibleName('Show all 7 changes');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();
  });
});
