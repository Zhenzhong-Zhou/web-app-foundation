import { Link } from '@mui/material';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
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

  /**
   * A list page has no crumbs, so its tab ends with the product's name: the
   * one index.html's title has, never a name written here. vitest.config.ts
   * runs the tests under vite.config.ts's default.
   */
  it("ends a list page's tab with the product's name", () => {
    renderHeader({ crumbs: [], title: 'Movements' });

    expect(document.title).toBe('Movements · web-app-foundation');
  });

  describe('back', () => {
    /** Renders where the router is, so a test can see where Back went. */
    function Where() {
      return <p>at {useLocation().pathname}</p>;
    }

    function renderAt(entries: string[]) {
      return render(
        <MemoryRouter
          initialEntries={entries}
          initialIndex={entries.length - 1}
        >
          <Routes>
            <Route
              path="/lots/:id"
              element={
                <PageHeader
                  crumbs={[{ label: 'Trace a lot', to: '/lots' }]}
                  title="Lot BF-2609"
                />
              }
            />
            <Route path="*" element={<Where />} />
          </Routes>
        </MemoryRouter>,
      );
    }

    /**
     * Where you were, not where the page sits: arriving at a lot from a run,
     * Back returns to the run while the trail would go to the lot search.
     */
    it('returns to the previous page in the app', async () => {
      renderAt(['/production/run-1', '/lots/lot-1']);

      await userEvent.click(screen.getByRole('button', { name: 'Back' }));

      expect(screen.getByText('at /production/run-1')).toBeInTheDocument();
    });

    /**
     * Opened in a new tab or reloaded, there is no in-app page behind this
     * one, and history back would leave the app. Up is the next best answer.
     */
    it('goes up to the nearest ancestor when there is nowhere to go back to', async () => {
      renderAt(['/lots/lot-1']);

      await userEvent.click(screen.getByRole('button', { name: 'Back' }));

      expect(screen.getByText('at /lots')).toBeInTheDocument();
    });

    // A top-level page is reached from the navigation.
    it('is not offered on a page with no ancestors', () => {
      renderHeader({ crumbs: [], title: 'Movements' });

      expect(
        screen.queryByRole('button', { name: 'Back' }),
      ).not.toBeInTheDocument();
    });
  });

  /**
   * The subtitle is a line of words: a link in it, as an order's partner,
   * is underlined before any hover, so it is told from the words beside it
   * without its colour (WCAG 1.4.1). The app's links underline on hover.
   */
  it('underlines a link in its subtitle', () => {
    renderHeader({
      crumbs: [{ label: 'Orders', to: '/orders' }],
      title: 'SO-000001',
      subtitle: (
        <>
          Sale · expected Oct 17, 2026 ·{' '}
          <Link href="/partners/p-1" underline="hover">
            Northside Pharmacy
          </Link>{' '}
          <Link component="button" underline="hover">
            Learn more
          </Link>
        </>
      ),
    });

    expect(
      screen.getByRole('link', { name: 'Northside Pharmacy' }),
    ).toHaveStyle({ textDecoration: 'underline' });
    // A button drawn as a link, as Learn more is, keeps its own look.
    expect(screen.getByRole('button', { name: 'Learn more' })).not.toHaveStyle({
      textDecoration: 'underline',
    });
  });
});
