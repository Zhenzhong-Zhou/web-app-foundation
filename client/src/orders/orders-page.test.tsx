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
});
