import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { OrdersPage } from './orders-page';

describe('OrdersPage', () => {
  /**
   * Home's To ship opens the list narrowed to what is still to ship
   * (ADR-058, #163), shown as a filter the person can clear.
   */
  it('lists what is still to ship when the address asks, until cleared', async () => {
    const user = userEvent.setup();
    const asked: URL[] = [];
    server.use(
      http.get('/api/v1/orders', ({ request }) => {
        asked.push(new URL(request.url));
        return HttpResponse.json({ entries: [], nextCursor: null });
      }),
    );

    renderWithAuth(
      <MemoryRouter
        initialEntries={[
          '/orders?direction=sale&status=confirmed&outstanding=1',
        ]}
      >
        <OrdersPage />
      </MemoryRouter>,
      { permissions: ['orders.view'] },
    );

    const chip = await screen.findByRole('button', { name: 'Still to ship' });
    await expect.poll(() => asked.length).toBeGreaterThan(0);
    expect(asked[0].searchParams.get('outstanding')).toBe('true');

    chip.focus();
    await user.keyboard('{Delete}');
    expect(
      screen.queryByRole('button', { name: 'Still to ship' }),
    ).not.toBeInTheDocument();
    await expect
      .poll(() => asked.at(-1)?.searchParams.has('outstanding'))
      .toBe(false);
  });

  /**
   * Home's late button opens the late ones only (ADR-091), by expected
   * date, soonest first, as To ship does, until a header or the filters
   * are changed.
   */
  it('lists the late when the address asks, soonest first, until cleared', async () => {
    const user = userEvent.setup();
    const asked: URLSearchParams[] = [];
    server.use(
      http.get('/api/v1/orders', ({ request }) => {
        asked.push(new URL(request.url).searchParams);
        return HttpResponse.json({
          entries: [
            {
              id: 'order-1',
              number: 'SO-1',
              partnerId: 'partner-1',
              partnerName: 'Harbour Pharmacy',
              direction: 'sale',
              isSample: false,
              status: 'confirmed',
              reference: null,
              expectedAt: '2026-11-03',
              createdAt: '2026-10-01T10:00:00.000Z',
              lineCount: 1,
              quantityOrdered: '5.0000',
              quantityFulfilled: '0.0000',
            },
          ],
          nextCursor: null,
        });
      }),
    );

    renderWithAuth(
      <MemoryRouter
        initialEntries={['/orders?direction=sale&outstanding=1&late=1']}
      >
        <OrdersPage />
      </MemoryRouter>,
      { permissions: ['orders.view'] },
    );

    const chip = await screen.findByRole('button', { name: 'Late' });
    await expect.poll(() => asked.length).toBeGreaterThan(0);
    expect(Object.fromEntries(asked[0])).toMatchObject({
      outstanding: 'true',
      late: 'true',
      sort: 'expectedAt',
      order: 'asc',
    });
    expect(
      await screen.findByRole('columnheader', { name: 'Expected' }),
    ).toHaveAttribute('aria-sort', 'ascending');

    // The header turns it round, and the filters keep that.
    await user.click(screen.getByRole('button', { name: 'Expected' }));
    await expect.poll(() => asked.at(-1)?.get('order')).toBe('desc');

    chip.focus();
    await user.keyboard('{Delete}');
    expect(
      screen.queryByRole('button', { name: 'Late' }),
    ).not.toBeInTheDocument();
    await expect.poll(() => asked.at(-1)?.has('late')).toBe(false);
    expect(asked.at(-1)?.get('order')).toBe('desc');
  });

  // With neither filter, the list stays newest first, as every list was.
  it('stays newest first without Still to ship or Late', async () => {
    const asked: URLSearchParams[] = [];
    server.use(
      http.get('/api/v1/orders', ({ request }) => {
        asked.push(new URL(request.url).searchParams);
        return HttpResponse.json({ entries: [], nextCursor: null });
      }),
    );

    renderWithAuth(
      <MemoryRouter initialEntries={['/orders?direction=sale']}>
        <OrdersPage />
      </MemoryRouter>,
      { permissions: ['orders.view'] },
    );

    await expect.poll(() => asked.length).toBeGreaterThan(0);
    expect(asked[0].has('sort')).toBe(false);
  });
});
