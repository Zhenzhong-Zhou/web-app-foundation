import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { RecentEntry } from '../lib/recent';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { RecentCard } from './recent-card';

const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

const ENTRIES: RecentEntry[] = [
  {
    kind: 'order',
    id: 'o1',
    title: 'SO-DEMO-1',
    detail: 'Northside Pharmacy',
    openedAt: minutesAgo(10),
  },
  {
    kind: 'invoice',
    id: 'i1',
    title: null,
    detail: '明德药房',
    openedAt: minutesAgo(90),
  },
];

function renderCard() {
  renderWithAuth(
    <MemoryRouter>
      <RecentCard />
    </MemoryRouter>,
  );
}

describe('RecentCard', () => {
  it('shows what was opened as tiles, each a link to its page', async () => {
    server.use(
      http.get('/api/v1/recent', () => HttpResponse.json({ recent: ENTRIES })),
    );
    renderCard();

    const order = await screen.findByRole('link', { name: 'SO-DEMO-1' });
    expect(order.getAttribute('href')).toBe('/orders/o1');
    expect(
      screen.getByText('Northside Pharmacy · 10 minutes ago'),
    ).toBeTruthy();
    // A draft invoice has no number yet, so it is named for what it is.
    expect(screen.getByRole('link', { name: 'Invoice (draft)' })).toBeTruthy();
  });

  it('is left out while empty', async () => {
    renderCard();
    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: 'Recently opened' }),
      ).toBeNull(),
    );
  });

  it('clears the history, and goes', async () => {
    let cleared = false;
    server.use(
      http.get('/api/v1/recent', () => HttpResponse.json({ recent: ENTRIES })),
      http.delete('/api/v1/recent', () => {
        cleared = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(cleared).toBe(true));
    expect(
      screen.queryByRole('region', { name: 'Recently opened' }),
    ).toBeNull();
  });
});
