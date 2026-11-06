import { act, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { lazy, Suspense, useEffect } from 'react';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { api } from '../lib/api';
import { server } from '../test/setup';
import { LoadingBar } from './loading-bar';
import { watchNavigations } from './page-loading';

/** A promise to settle from the test, as a slow network would. */
function later<T = void>() {
  let settle!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

function Orders() {
  useEffect(() => {
    void api('/orders').catch(() => undefined);
  }, []);
  return <h1>Orders</h1>;
}

let unwatch: (() => void) | null = null;
afterEach(() => {
  unwatch?.();
  unwatch = null;
});

/**
 * Home's Plan run link on a slow network showed Home for a second and a
 * half with only the address changed (#431): the bar shows at once, while
 * the next screen's code loads and then its first read (ADR-091).
 */
describe('LoadingBar', () => {
  it('shows from the tap until the next screen’s code and first read are in', async () => {
    const code = later<{ default: typeof Orders }>();
    const read = later();
    server.use(
      http.get('/api/v1/orders', async () => {
        await read.promise;
        return HttpResponse.json({ entries: [] });
      }),
    );
    const OrdersPage = lazy(() => code.promise);
    const router = createMemoryRouter([
      {
        path: '/',
        element: (
          <>
            <LoadingBar />
            <Suspense>
              <Outlet />
            </Suspense>
          </>
        ),
        children: [
          { index: true, element: <h1>Home</h1> },
          { path: 'orders', element: <OrdersPage /> },
        ],
      },
    ]);
    unwatch = watchNavigations(router);
    render(<RouterProvider router={router} />);
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeVisible();
    expect(screen.queryByRole('progressbar')).toBeNull();

    // The tap: Home stays while the code loads, the bar under the top bar.
    await act(() => router.navigate('/orders'));
    expect(screen.getByRole('progressbar', { name: 'Loading…' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Home' })).toBeVisible();

    // The code is in; the screen's first read is on its way.
    await act(async () => code.settle({ default: Orders }));
    expect(
      await screen.findByRole('heading', { name: 'Orders' }),
    ).toBeVisible();
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(screen.getByRole('progressbar', { name: 'Loading…' })).toBeVisible();

    await act(async () => read.settle());
    await expect.poll(() => screen.queryByRole('progressbar')).toBeNull();
  });

  it('stays away when the address changes on the same screen', async () => {
    const router = createMemoryRouter(
      [{ path: '/orders', element: <LoadingBar /> }],
      { initialEntries: ['/orders'] },
    );
    unwatch = watchNavigations(router);
    render(<RouterProvider router={router} />);

    await act(() => router.navigate('/orders?late=1', { replace: true }));
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});
