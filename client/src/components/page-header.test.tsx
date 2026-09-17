import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { PageHeader } from './page-header';

function renderHeader(props: Parameters<typeof PageHeader>[0]) {
  return render(
    <MemoryRouter>
      <PageHeader {...props} />
    </MemoryRouter>,
  );
}

describe('PageHeader', () => {
  /**
   * A link to where you already are is a control that does nothing, and
   * without the last crumb the path reads as incomplete. Both halves matter,
   * so both are asserted.
   */
  it('shows the current page in the trail without linking to it', () => {
    renderHeader({
      crumbs: [{ label: 'Orders', to: '/orders' }],
      title: 'Acme Supplies',
    });

    expect(screen.getByRole('link', { name: 'Orders' })).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Acme Supplies' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Acme Supplies' }),
    ).toBeInTheDocument();
  });

  it('links the title when it points somewhere of its own', () => {
    renderHeader({
      crumbs: [{ label: 'Orders', to: '/orders' }],
      title: 'Acme Supplies',
      titleTo: '/partners/partner-1',
    });

    expect(screen.getByRole('link', { name: 'Acme Supplies' })).toHaveAttribute(
      'href',
      '/partners/partner-1',
    );
  });

  /**
   * List pages pass no crumbs. The trail is then just the page name, which is
   * why this renders rather than collapsing to nothing.
   */
  it('works with no ancestors', () => {
    renderHeader({ crumbs: [], title: 'Movements' });

    expect(
      screen.getByRole('heading', { name: 'Movements' }),
    ).toBeInTheDocument();
  });

  /**
   * The one navigation surface the component cannot otherwise provide: without
   * this every tab in the app is called the same thing.
   */
  it('names the tab, and restores it on unmount', () => {
    const before = document.title;

    const { unmount } = renderHeader({
      crumbs: [{ label: 'Orders', to: '/orders' }],
      title: 'Acme Supplies',
    });

    expect(document.title).toBe('Acme Supplies · Orders');

    unmount();
    expect(document.title).toBe(before);
  });
});
