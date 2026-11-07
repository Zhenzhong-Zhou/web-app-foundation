import { act, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HomeResponse } from '../api/types.gen';
import { setOrganizationTimeZone } from '../lib/time-zone';
import { GETTING_STARTED_DONE, homeCard } from '../test/factories';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { HomePage } from './home-page';

/** Each time a tile draws, as it reads the organization's expiry days. */
const drawn = vi.hoisted(() => ({ tiles: 0 }));
vi.mock('../lib/use-expiry-days', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/use-expiry-days')>();
  return {
    ...actual,
    useExpiryDays: () => {
      drawn.tiles += 1;
      return actual.useExpiryDays();
    },
  };
});

describe('HomeClock', () => {
  beforeEach(() => {
    // Timers by hand, the rest of the clock moving, so the reads resolve.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // Half a minute before noon on the organization's clock.
    setOrganizationTimeZone('UTC');
    vi.setSystemTime(new Date('2026-11-05T11:59:30Z'));
    server.use(
      http.get('/api/v1/home', () =>
        HttpResponse.json({
          whatWeDo: null,
          gettingStarted: GETTING_STARTED_DONE,
          welcome: null,
          cards: [homeCard({ kind: 'toShip', count: 1 })],
          recent: false,
          defaultLayout: { order: ['toShip'], hidden: [], recent: true },
        } satisfies HomeResponse),
      ),
    );
  });

  afterEach(() => setOrganizationTimeZone(null));

  // #505's 66: the minute moves the time and the greeting's words, and
  // draws none of the rest of Home again.
  it('moves the time and the greeting on at the minute, and draws no tile again', async () => {
    renderWithAuth(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
      { permissions: ['orders.view', 'orders.create'] },
    );
    expect(
      await screen.findByRole('link', { name: 'To ship, 1' }),
    ).toBeTruthy();
    const heading = screen.getByRole('heading', { level: 1 });
    const time = screen.getByText(/, 11:59\sAM$/);
    expect(heading).toHaveTextContent('Good morning, Owner');
    // A second on, whatever the first draw set off settled; then to noon.
    await act(() => vi.advanceTimersByTimeAsync(1000));
    const tiles = drawn.tiles;

    act(() => vi.advanceTimersByTime(29_000));

    expect(time).toHaveTextContent(/, 12:00\sPM$/);
    expect(heading).toHaveTextContent('Good afternoon, Owner');
    expect(drawn.tiles).toBe(tiles);
  });
});
