import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Suspense } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { lazyNamed } from '../lib/lazy-named';
import { server } from '../test/setup';
import { ChunkLoadError } from '../version/load-chunk';
import { reloadPage } from '../version/reload-page';
import { ErrorBoundary } from './error-boundary';

function Page({ broken }: { broken: boolean }) {
  if (broken) throw new Error('Broken page');
  return <p>Orders</p>;
}

/** A page whose chunk would not load, as the loader found it. */
function Unloaded({ failure }: { failure: unknown }): never {
  throw failure;
}

const unloaded = (failure: unknown) =>
  render(
    <MemoryRouter>
      <ErrorBoundary resetKey="/inventory">
        <Unloaded failure={failure} />
      </ErrorBoundary>
    </MemoryRouter>,
  );

const browsers = new TypeError(
  'Failed to fetch dynamically imported module: /assets/inventory-page.js',
);

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React and the boundary both log the failure; neither is under test.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(reloadPage).mockClear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clears when the person goes elsewhere, so a broken page can be left', () => {
    const { rerender } = render(
      <MemoryRouter>
        <ErrorBoundary resetKey="/orders/1">
          <Page broken />
        </ErrorBoundary>
      </MemoryRouter>,
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    // The same address keeps the message: nothing has changed to fix it.
    rerender(
      <MemoryRouter>
        <ErrorBoundary resetKey="/orders/1">
          <Page broken={false} />
        </ErrorBoundary>
      </MemoryRouter>,
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <ErrorBoundary resetKey="/orders">
          <Page broken={false} />
        </ErrorBoundary>
      </MemoryRouter>,
    );
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    expect(screen.getByText('Orders')).toBeInTheDocument();
  });

  it('loads the page in full on Reload, as every Reload does', async () => {
    render(
      <MemoryRouter>
        <ErrorBoundary resetKey="/orders/1">
          <Page broken />
        </ErrorBoundary>
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  describe('a page that won’t load says why (ADR-081)', () => {
    it('the connection dropped: tries again on Try again, and by itself when it comes back', async () => {
      unloaded(new ChunkLoadError('offline', browsers));

      expect(
        screen.getByRole('heading', {
          level: 1,
          name: "Can't reach the server",
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          'This page tries again by itself when your connection comes back.',
        ),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(reloadPage).toHaveBeenCalledTimes(1);

      window.dispatchEvent(new Event('online'));
      expect(reloadPage).toHaveBeenCalledTimes(2);
    });

    it('a new version that would not load either: says so, with Reload', async () => {
      unloaded(new ChunkLoadError('newer', browsers));

      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'A new version is ready',
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          'A new version came out while this tab was open. Reload to use it; nothing is lost.',
        ),
      ).toBeInTheDocument();
      // Nothing loads by itself here: the loader has tried that once.
      expect(reloadPage).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
      expect(reloadPage).toHaveBeenCalledTimes(1);
    });

    it('this build: the crash page, with its reference', () => {
      unloaded(new ChunkLoadError('broken', browsers));

      expect(
        screen.getByRole('heading', { level: 1, name: 'Something went wrong' }),
      ).toBeInTheDocument();
      expect(screen.getByText(/^Reference:/)).toBeInTheDocument();
    });

    it('decides from the loader, never from the browser’s words', () => {
      unloaded(browsers);

      expect(
        screen.getByRole('heading', { level: 1, name: 'Something went wrong' }),
      ).toBeInTheDocument();
    });

    it('through lazyNamed: tried twice, then the version file read', async () => {
      server.use(http.get('/version.json', () => HttpResponse.error()));
      const load = vi.fn(() =>
        Promise.reject<{ InventoryPage: () => null }>(browsers),
      );
      const InventoryPage = lazyNamed(load, 'InventoryPage');

      render(
        <MemoryRouter>
          <ErrorBoundary resetKey="/inventory">
            <Suspense fallback={<p>Loading</p>}>
              <InventoryPage />
            </Suspense>
          </ErrorBoundary>
        </MemoryRouter>,
      );

      expect(
        await screen.findByRole(
          'heading',
          { level: 1, name: "Can't reach the server" },
          { timeout: 3000 },
        ),
      ).toBeInTheDocument();
      expect(load).toHaveBeenCalledTimes(2);
    });
  });
});
