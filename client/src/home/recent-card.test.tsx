import { screen, waitFor, within } from '@testing-library/react';
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
  it('shows what was opened as rows, the name first, each a link to its page', async () => {
    server.use(
      http.get('/api/v1/recent', () => HttpResponse.json({ recent: ENTRIES })),
    );
    renderCard();

    // The partner's name, then the number and the kind (ADR-091): the
    // whole row is the link.
    const order = await screen.findByRole('link', {
      name: /^Northside Pharmacy/,
    });
    expect(order.getAttribute('href')).toBe('/orders/o1');
    expect(within(order).getByText('SO-DEMO-1 · Order')).toBeTruthy();
    expect(within(order).getByText('10 minutes ago')).toBeTruthy();
    // A draft invoice has no number yet, so it is named for what it is.
    const invoice = screen.getByRole('link', { name: /^明德药房/ });
    expect(within(invoice).getByText('Invoice (draft)')).toBeTruthy();
  });

  /** A kind is in sentence case, as every caption is (#223). */
  it('writes each kind in sentence case, not capitals', async () => {
    server.use(
      http.get('/api/v1/recent', () => HttpResponse.json({ recent: ENTRIES })),
    );
    renderCard();

    expect(await screen.findByText('SO-DEMO-1 · Order')).not.toHaveStyle({
      textTransform: 'uppercase',
    });
  });

  it('is left out while empty', async () => {
    renderCard();
    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: 'Recently opened' }),
      ).toBeNull(),
    );
  });

  it('clears the history, saying so and where Recently opened is turned off', async () => {
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
    const said = await screen.findByRole('status');
    expect(said).toHaveTextContent(
      'Cleared. It fills again as you open things; turn it off in Customise Home.',
    );
    await waitFor(() => expect(said).toHaveFocus());
  });
});
