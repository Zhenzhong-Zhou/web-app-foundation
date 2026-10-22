import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
import {
  Link,
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { renderWithAuth } from '../test/render-with-auth';
import { ChunkLoadError } from '../version/load-chunk';
import { reloadPage } from '../version/reload-page';
import { HelpButton } from './help-button';
import { HelpFrame } from './help-panel';
import { HelpProvider } from './help-provider';
import { LearnMore } from './learn-more';

/**
 * How many guide loads to fail before they work again, and how: offline
 * unless a test says otherwise.
 */
const failing = vi.hoisted(() => ({ loads: 0, error: null as unknown }));
vi.mock('./guides', async (original) => {
  const actual = await original<typeof import('./guides')>();
  return {
    ...actual,
    loadGuide: (...args: Parameters<typeof actual.loadGuide>) =>
      failing.loads-- > 0
        ? Promise.reject(failing.error ?? new Error('Failed to fetch'))
        : actual.loadGuide(...args),
  };
});

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.hash}</p>;
}

/** The frame's three parts, as AppLayout puts them, around two pages. */
function Frame() {
  const bar = useRef<HTMLElement>(null);
  return (
    <HelpProvider>
      <header ref={bar}>
        <HelpButton />
      </header>
      <HelpFrame bar={bar}>
        <Routes>
          <Route
            path="/orders"
            element={
              <>
                <h1>The orders page</h1>
                <Link to="/inventory">To inventory</Link>
              </>
            }
          />
          <Route path="/inventory" element={<h1>The inventory page</h1>} />
          <Route
            path="/"
            element={
              <p data-testid="hint">
                <LearnMore
                  target={{ guide: 'locations', section: 'add' }}
                  variant="inline"
                  after="Where stock is kept."
                />
              </p>
            }
          />
          <Route path="*" element={null} />
        </Routes>
        <Where />
      </HelpFrame>
    </HelpProvider>
  );
}

function renderFrame(at: string, permissions = ['orders.view', 'stock.view']) {
  return renderWithAuth(
    <MemoryRouter initialEntries={[at]}>
      <Frame />
    </MemoryRouter>,
    { permissions },
  );
}

const help = () => screen.getByRole('complementary', { name: 'Help' });

describe('Help', () => {
  it("opens on the page's guide, and follows the person to the next page's", async () => {
    renderFrame('/orders');
    const button = screen.getByRole('button', { name: 'Help' });
    expect(button).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(button);

    const title = await within(help()).findByRole('heading', {
      level: 2,
      name: 'Orders',
    });
    expect(title).toHaveFocus();
    expect(button).toHaveAttribute('aria-expanded', 'true');

    // The page still works with Help open: nothing covers it from a click.
    await userEvent.click(screen.getByRole('link', { name: 'To inventory' }));

    expect(
      await within(help()).findByRole('heading', {
        level: 2,
        name: 'Inventory',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('The inventory page')).toBeInTheDocument();
  });

  it('says when a guide could not be opened, and Try again opens it', async () => {
    failing.loads = 1;
    renderFrame('/orders');

    await userEvent.click(screen.getByRole('button', { name: 'Help' }));
    expect(
      await within(help()).findByText(
        'This guide could not be opened. Check your connection, then try again.',
      ),
    ).toBeVisible();

    await userEvent.click(
      within(help()).getByRole('button', { name: 'Try again' }),
    );
    expect(
      await within(help()).findByRole('heading', { level: 2, name: 'Orders' }),
    ).toBeVisible();
  });

  it('says a guide has a new version, never reloading under the reader', async () => {
    vi.mocked(reloadPage).mockClear();
    failing.loads = 1;
    failing.error = new ChunkLoadError('newer', new TypeError('Failed'));
    renderFrame('/orders');

    await userEvent.click(screen.getByRole('button', { name: 'Help' }));
    const status = await within(help()).findByRole('status');
    expect(status).toHaveTextContent(
      'This guide has a new version. Reload to read it.',
    );
    expect(reloadPage).not.toHaveBeenCalled();

    await userEvent.click(
      within(status).getByRole('button', { name: 'Reload' }),
    );
    expect(reloadPage).toHaveBeenCalledTimes(1);
    failing.error = null;
  });

  it('closes on Esc and on Close, and focus goes back to the button', async () => {
    renderFrame('/orders');
    const button = screen.getByRole('button', { name: 'Help' });

    await userEvent.click(button);
    await within(help()).findByRole('heading', { level: 2, name: 'Orders' });
    await userEvent.keyboard('{Escape}');

    expect(button).toHaveFocus();
    expect(button).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(button);
    await userEvent.click(
      await within(help()).findByRole('button', { name: 'Close help' }),
    );

    expect(button).toHaveFocus();
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens at a Learn more’s section, marked, and returns to it on Esc', async () => {
    renderFrame('/');
    // After the words it follows, as the language joins them.
    expect(screen.getByTestId('hint')).toHaveTextContent(
      'Where stock is kept. Learn more',
    );
    const learnMore = screen.getByRole('button', { name: 'Learn more' });

    await userEvent.click(learnMore);

    const section = await within(help()).findByRole('heading', {
      level: 3,
      name: 'Add a location',
    });
    expect(
      within(help()).getByRole('heading', { level: 2, name: 'Locations' }),
    ).toBeInTheDocument();
    expect(section).toHaveFocus();
    expect(section).toHaveAttribute('data-marked');

    await userEvent.keyboard('{Escape}');
    expect(learnMore).toHaveFocus();
  });

  // Safari focuses no button on a click: the press leaves focus on <body>.
  it('returns focus to the Help button when what opened it took no focus', async () => {
    renderFrame('/');
    fireEvent.click(screen.getByRole('button', { name: 'Learn more' }));
    await within(help()).findByRole('heading', {
      level: 3,
      name: 'Add a location',
    });

    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Help' })).toHaveFocus();
  });

  it('lists the guides for the pages the person can open, and shows one in place', async () => {
    // Seeing who works here is every role's (ADR-080), and opens People
    // and Members.
    renderFrame('/orders', ['orders.view', 'users.view']);
    await userEvent.click(screen.getByRole('button', { name: 'Help' }));

    const all = await within(help()).findByRole('navigation', {
      name: 'All guides',
    });
    const names = within(all)
      .getAllByRole('button')
      .map((guide) => guide.textContent);
    // Work, Settings and You: no stock, so no Inventory, Movements or Lots.
    expect(names).toEqual([
      'Home',
      'Orders',
      'People',
      'Members',
      'Your account',
    ]);
    expect(within(all).getByRole('button', { name: 'Orders' })).toHaveAttribute(
      'aria-current',
      'true',
    );

    await userEvent.click(within(all).getByRole('button', { name: 'Home' }));

    expect(
      await within(help()).findByRole('heading', { level: 2, name: 'Home' }),
    ).toHaveFocus();
    expect(screen.getByTestId('where')).toHaveTextContent('/orders');
  });

  it('ends with the version this tab runs, in the reader’s language (ADR-081)', async () => {
    renderFrame('/orders');
    await userEvent.click(screen.getByRole('button', { name: 'Help' }));

    // The release, the build's first seven, and the day it was built.
    expect(
      await within(help()).findByText(
        'Version 0.7.0 · build 983c1d8 · Oct 22, 2026',
      ),
    ).toBeVisible();
  });

  it('gives the version in Chinese too', async () => {
    localStorage.setItem('language', 'zh-Hans');
    try {
      renderFrame('/orders');
      await userEvent.click(
        await screen.findByRole('button', { name: '帮助' }),
      );

      expect(
        await within(
          screen.getByRole('complementary', { name: '帮助' }),
        ).findByText('版本 0.7.0 · 构建 983c1d8 · 2026年10月22日'),
      ).toBeVisible();
    } finally {
      localStorage.clear();
    }
  });

  it("follows a guide's link to its page, and that page's guide at the section", async () => {
    renderFrame('/orders');
    await userEvent.click(screen.getByRole('button', { name: 'Help' }));
    await within(help()).findByRole('heading', { level: 2, name: 'Orders' });
    await userEvent.click(within(help()).getByRole('button', { name: 'Home' }));
    await within(help()).findByRole('heading', { level: 2, name: 'Home' });

    // The guide's own link, the first of two: the foot has one too.
    const [link] = within(help()).getAllByRole('link', {
      name: 'Your account',
    });
    await userEvent.click(link);

    expect(screen.getByTestId('where')).toHaveTextContent(
      '/account#your-access',
    );
    const section = await within(help()).findByRole('heading', {
      level: 3,
      name: 'Your access',
    });
    expect(section).toHaveFocus();
  });
});
