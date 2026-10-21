import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { AppLayout } from './app-layout';

function renderFrame() {
  return renderWithAuth(
    <MemoryRouter initialEntries={['/orders']}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/orders" element={<h1>Orders</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

/** The rail's own button, named for what it would do. */
const rail = (name: 'Collapse navigation' | 'Expand navigation') =>
  // Hidden here: jsdom does not match the media query that shows the rail.
  screen.getByRole('button', { name, hidden: true });

async function openHelp(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    within(screen.getByRole('banner')).getByRole('button', { name: 'Help' }),
  );
  expect(
    await screen.findByRole('complementary', { name: 'Help' }),
  ).toBeInTheDocument();
}

const closeHelp = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Close help' }));

/**
 * While Help is open on a computer the rail folds, to leave the page room
 * beside it, and comes back as it was; the person's own choice, remembered
 * on this device, is never Help's to change (ADR-079).
 */
describe('the rail while Help is open', () => {
  beforeEach(() => {
    server.use(
      http.get('/api/v1/notifications/unread-count', () =>
        HttpResponse.json({ count: 0 }),
      ),
    );
  });
  afterEach(() => localStorage.clear());

  it('folds while Help is open and opens again once it closes', async () => {
    const user = userEvent.setup();
    renderFrame();
    expect(rail('Collapse navigation')).toBeInTheDocument();

    await openHelp(user);
    expect(rail('Expand navigation')).toBeInTheDocument();

    await closeHelp(user);
    expect(rail('Collapse navigation')).toBeInTheDocument();
    expect(localStorage.getItem('nav.folded')).toBeNull();
  });

  it('stays folded once Help closes when the person had folded it', async () => {
    localStorage.setItem('nav.folded', 'true');
    const user = userEvent.setup();
    renderFrame();
    expect(rail('Expand navigation')).toBeInTheDocument();

    await openHelp(user);
    expect(rail('Expand navigation')).toBeInTheDocument();
    await closeHelp(user);
    expect(rail('Expand navigation')).toBeInTheDocument();
    expect(localStorage.getItem('nav.folded')).toBe('true');
  });

  it('keeps what the person chose while Help was open', async () => {
    const user = userEvent.setup();
    renderFrame();

    // Opened again beside Help: it stays open once Help closes.
    await openHelp(user);
    await user.click(rail('Expand navigation'));
    await closeHelp(user);
    expect(rail('Collapse navigation')).toBeInTheDocument();

    // Opened and folded again: folded is now theirs, and stays.
    await openHelp(user);
    await user.click(rail('Expand navigation'));
    await user.click(rail('Collapse navigation'));
    await closeHelp(user);
    expect(rail('Expand navigation')).toBeInTheDocument();
    expect(localStorage.getItem('nav.folded')).toBe('true');
  });
});
