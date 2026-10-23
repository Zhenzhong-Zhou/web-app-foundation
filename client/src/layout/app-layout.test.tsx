import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { deploy } from '../test/version';
import { reloadPage } from '../version/reload-page';
import { checkVersion } from '../version/version-check';
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

/**
 * A preference in the account menu opens from its row (#151): Enter or
 * Space there opens the select, and Escape comes back to the row, where
 * the menu's arrow keys go on.
 */
/** The menu on a phone, where jsdom leaves the frame (ADR-055). */
describe('the menu on a phone', () => {
  beforeEach(() => {
    server.use(
      http.get('/api/v1/notifications/unread-count', () =>
        HttpResponse.json({ count: 0 }),
      ),
    );
  });

  it('opens as a dialog named for what it holds', async () => {
    const user = userEvent.setup();
    renderFrame();

    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    const menu = await screen.findByRole('dialog', { name: 'Navigation' });
    expect(
      within(menu).getByRole('button', { name: 'Close navigation' }),
    ).toBeVisible();
  });
});

describe('the account menu’s preferences', () => {
  beforeEach(() => {
    server.use(
      http.get('/api/v1/notifications/unread-count', () =>
        HttpResponse.json({ count: 0 }),
      ),
    );
  });
  afterEach(() => localStorage.clear());

  it('opens a preference from its row, and Escape comes back to the row', async () => {
    const user = userEvent.setup();
    renderFrame();
    await user.click(screen.getByRole('button', { name: /signed in as/ }));
    const menu = screen.getByRole('menu');
    const row = within(menu)
      .getAllByRole('menuitem')
      .find((item) =>
        within(item).queryByRole('combobox', { name: 'Text size' }),
      )!;

    row.focus();
    await user.keyboard('{Enter}');
    const listbox = await screen.findByRole('listbox');
    expect(
      within(listbox).getByRole('option', { name: 'Large text' }),
    ).toBeVisible();

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument(),
    );
    expect(row).toHaveFocus();
    expect(screen.getByRole('menu')).toBeVisible();

    await user.keyboard(' ');
    expect(await screen.findByRole('listbox')).toBeVisible();
  });
});

/**
 * A newer build in the frame (ADR-081): "New version" beside Help on a
 * computer, a dot on the account button on a phone, both moving nothing,
 * and amber at the top of the page once its saves would be refused.
 */
describe('a new version', () => {
  beforeEach(() => {
    server.use(
      http.get('/api/v1/notifications/unread-count', () =>
        HttpResponse.json({ count: 0 }),
      ),
    );
  });
  afterEach(() => {
    vi.mocked(reloadPage).mockClear();
    vi.unstubAllGlobals();
  });

  const NOTE =
    'A new version is ready. It loads by itself when you open another page.';

  /** Every width query matches, as at 390 px; jsdom has no matchMedia. */
  const onAPhone = () =>
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));

  it('shows nothing while the server has this tab’s build', async () => {
    renderFrame();
    await act(() => checkVersion());

    expect(
      screen.queryByRole('button', { name: 'New version' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });

  it('puts New version beside Help on a computer, whose note offers Reload now', async () => {
    const user = userEvent.setup();
    renderFrame();
    await deploy();

    const bar = within(screen.getByRole('banner'));
    const button = bar.getByRole('button', { name: 'New version' });
    expect(button.nextElementSibling).toBe(
      bar.getByRole('button', { name: 'Help' }),
    );
    // Said once to a screen reader, and no banner moves the page.
    expect(screen.getByText(NOTE)).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    await user.click(button);
    const note = await screen.findByRole('dialog', { name: 'New version' });
    expect(within(note).getByText(NOTE)).toBeVisible();
    await user.click(within(note).getByRole('button', { name: 'Reload now' }));
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('on a phone, puts a dot on the account button and the new version first in its menu', async () => {
    onAPhone();
    const user = userEvent.setup();
    renderFrame();
    await deploy();

    expect(
      screen.queryByRole('button', { name: 'New version' }),
    ).not.toBeInTheDocument();
    const account = screen.getByRole('button', {
      name: 'OW, signed in as owner@alpha.example.com, a new version is ready',
    });
    expect(
      account.querySelector('.MuiBadge-dot:not(.MuiBadge-invisible)'),
    ).not.toBeNull();

    await user.click(account);
    const first = within(screen.getByRole('menu')).getAllByRole('menuitem')[0];
    expect(first).toHaveTextContent(
      'A new version is ready · Reload nowIt also loads by itself when you open another page.',
    );
    await user.click(first);
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('turns amber once its saves would be refused, first on the page, in place of the button and the dot', async () => {
    const user = userEvent.setup();
    renderFrame();
    await deploy({ urgent: true });

    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent(
      'A new version is ready, and this tab can no longer save changes. Copy anything you’ve typed, then reload.',
    );
    expect(
      banner.compareDocumentPosition(
        screen.getByRole('heading', { name: 'Orders' }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'New version' }),
    ).not.toBeInTheDocument();

    await user.click(within(banner).getByRole('button', { name: 'Reload' }));
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('on a phone, amber leaves the account button without its dot', async () => {
    onAPhone();
    renderFrame();
    await deploy({ urgent: true });

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'OW, signed in as owner@alpha.example.com',
      }),
    ).toBeInTheDocument();
  });
});
