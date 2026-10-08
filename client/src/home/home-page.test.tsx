import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { HomeResponse } from '../lib/types';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { HomePage } from './home-page';

const COMPLETE: HomeResponse['gettingStarted'] = {
  steps: {
    organization: true,
    location: true,
    product: true,
    partner: true,
    receipt: true,
    invoice: true,
    team: true,
  },
  teamSkipped: false,
  dismissed: false,
  complete: true,
};

/** Home links everywhere, so it renders inside a router. */
const routed = (element: ReactElement) => (
  <MemoryRouter>{element}</MemoryRouter>
);

function serve(home: HomeResponse) {
  server.use(http.get('/api/v1/home', () => HttpResponse.json(home)));
}

const day = (offset: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${dayOfMonth}`;
};

describe('HomePage', () => {
  it('greets, sums up, and shows each card with its rows and See all', async () => {
    serve({
      gettingStarted: COMPLETE,
      cards: [
        {
          kind: 'toShip',
          count: 3,
          late: 1,
          rows: [
            {
              id: 'o1',
              title: 'SO-1',
              detail: 'Northside',
              due: day(-2),
              late: true,
            },
            {
              id: 'o2',
              title: 'SO-2',
              detail: '明德药房',
              due: day(3),
              late: false,
            },
          ],
        },
        { kind: 'costsWaiting', count: 0, late: 0, rows: [] },
      ],
    });
    renderWithAuth(routed(<HomePage />), {
      permissions: ['orders.view', 'costs.view'],
    });

    expect(
      await screen.findByText('3 things need attention, 1 of them overdue.'),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(
      /^Good (morning|afternoon|evening), Owner$/,
    );

    const ship = screen.getByRole('region', { name: 'To ship' });
    expect(
      within(ship)
        .getByRole('link', { name: 'See all 3' })
        .getAttribute('href'),
    ).toBe('/orders?direction=sale&status=confirmed');
    expect(within(ship).getByText('2 days late')).toBeTruthy();
    expect(
      within(ship).getByRole('link', { name: 'SO-1' }).getAttribute('href'),
    ).toBe('/orders/o1');

    // A card with nothing to do says so, quietly, rather than disappearing.
    const costs = screen.getByRole('region', { name: 'Costs waiting' });
    expect(
      within(costs).getByText('Nothing waiting. Every receipt has a cost.'),
    ).toBeTruthy();
  });

  it('offers only the quick actions the role may take', async () => {
    serve({ gettingStarted: COMPLETE, cards: [] });
    renderWithAuth(routed(<HomePage />), { permissions: ['stock.view'] });

    expect(
      await screen.findByRole('link', { name: 'Trace a lot' }),
    ).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Raise an order' })).toBeNull();
  });

  it('leads a new organization with Getting started, Skip only on the team step', async () => {
    serve({
      gettingStarted: {
        ...COMPLETE,
        steps: {
          ...COMPLETE.steps,
          product: false,
          partner: false,
          receipt: false,
          invoice: false,
          team: false,
        },
        complete: false,
      },
      cards: [{ kind: 'toShip', count: 0, late: 0, rows: [] }],
    });
    let skipped = false;
    server.use(
      http.post('/api/v1/home/getting-started/skip-team', () => {
        skipped = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderWithAuth(routed(<HomePage />), {
      permissions: ['organizations.update', 'orders.view'],
    });

    const start = await screen.findByRole('region', {
      name: 'Getting started',
    });
    expect(within(start).getByText('2 of 7 done')).toBeTruthy();
    expect(within(start).getAllByRole('button', { name: 'Skip' })).toHaveLength(
      1,
    );
    expect(within(start).getByRole('button', { name: 'Dismiss' })).toBeTruthy();
    // Nothing to do yet, so the empty cards stay out of the way.
    expect(screen.queryByRole('region', { name: 'To ship' })).toBeNull();

    await user.click(within(start).getByRole('button', { name: 'Skip' }));
    await vi.waitFor(() => expect(skipped).toBe(true));
  });

  it('keeps Skip and Dismiss from those who may not change the settings', async () => {
    serve({
      gettingStarted: {
        ...COMPLETE,
        steps: { ...COMPLETE.steps, team: false },
        complete: false,
      },
      cards: [],
    });
    renderWithAuth(routed(<HomePage />), { permissions: [] });

    const start = await screen.findByRole('region', {
      name: 'Getting started',
    });
    expect(within(start).queryByRole('button', { name: 'Skip' })).toBeNull();
    expect(within(start).queryByRole('button', { name: 'Dismiss' })).toBeNull();
  });
});
