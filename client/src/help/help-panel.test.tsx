import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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

import { reportFault } from '../errors/report-fault';
import { stubNames } from '../test/app-names';
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

vi.mock('../errors/report-fault', async (original) => ({
  ...(await original<typeof import('../errors/report-fault')>()),
  reportFault: vi.fn(),
}));

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
    // Focus moves in an effect once the guide is drawn, a moment after the
    // heading shows (#210).
    await waitFor(() => expect(title).toHaveFocus());
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

  it('hands a guide broken in this build to the error tracker (ADR-084)', async () => {
    const broken = new ChunkLoadError('broken', new TypeError('Failed'));
    failing.loads = 1;
    failing.error = broken;
    renderFrame('/orders');

    await userEvent.click(screen.getByRole('button', { name: 'Help' }));
    expect(
      await within(help()).findByText(
        'This guide could not be opened. Check your connection, then try again.',
      ),
    ).toBeVisible();
    expect(reportFault).toHaveBeenCalledWith(broken);
    failing.error = null;
  });

  it('closes on Esc and on Close, and focus goes back to the button', async () => {
    renderFrame('/orders');
    const button = screen.getByRole('button', { name: 'Help' });

    await userEvent.click(button);
    const title = await within(help()).findByRole('heading', {
      level: 2,
      name: 'Orders',
    });
    // Esc is Help's own, so it is pressed once focus is in Help, which an
    // effect gives once the guide is drawn (#210).
    await waitFor(() => expect(title).toHaveFocus());
    await userEvent.keyboard('{Escape}');

    // Given back in an effect once Help has closed (#210).
    await waitFor(() => expect(button).toHaveFocus());
    expect(button).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(button);
    await userEvent.click(
      await within(help()).findByRole('button', { name: 'Close help' }),
    );

    await waitFor(() => expect(button).toHaveFocus());
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
    // Focused and marked in one effect, once the guide is drawn (#210).
    await waitFor(() => {
      expect(section).toHaveFocus();
      // eslint-disable-next-line testing-library/no-wait-for-multiple-assertions -- one effect does both, so one wait (#210)
      expect(section).toHaveAttribute('data-marked');
    });

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(learnMore).toHaveFocus());
  });

  // Safari focuses no button on a click: the press leaves focus on <body>.
  it('returns focus to the Help button when what opened it took no focus', async () => {
    renderFrame('/');
    fireEvent.click(screen.getByRole('button', { name: 'Learn more' }));
    const section = await within(help()).findByRole('heading', {
      level: 3,
      name: 'Add a location',
    });
    // In Help before Esc, as above (#210).
    await waitFor(() => expect(section).toHaveFocus());

    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Help' })).toHaveFocus(),
    );
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

    // Once the first guide has taken focus, as it does in an effect when
    // drawn; a guide chosen before then would find the request for focus
    // already taken (#210).
    const orders = await within(help()).findByRole('heading', {
      level: 2,
      name: 'Orders',
    });
    await waitFor(() => expect(orders).toHaveFocus());
    await userEvent.click(within(all).getByRole('button', { name: 'Home' }));

    const home = await within(help()).findByRole('heading', {
      level: 2,
      name: 'Home',
    });
    await waitFor(() => expect(home).toHaveFocus());
    expect(screen.getByTestId('where')).toHaveTextContent('/orders');
  });

  /**
   * The product's name, then the release, the build's first seven and the
   * day it was built (ADR-081, ADR-082). No © line without a holder, as on
   * a fork, and vitest.config.ts builds the tests with none.
   */
  it('ends with the product and the version this tab runs', async () => {
    renderFrame('/orders');
    await userEvent.click(screen.getByRole('button', { name: 'Help' }));

    const foot = await within(help()).findByText(
      'web-app-foundation · Version 0.7.0 · build 983c1d8 · Oct 22, 2026',
    );
    expect(foot).toBeVisible();
    // In small grey text: Typography's color prop takes a palette name, not
    // a path, so the colour is given in sx (#196).
    expect(getComputedStyle(foot).color).toBe('rgba(0, 0, 0, 0.6)');
    expect(within(help()).queryByText(/^©/)).toBeNull();
  });

  it('puts the © line under it where a holder is set', async () => {
    vi.stubGlobal('__COPYRIGHT__', '© 2026 Zhenzhong (Bob) Zhou');
    try {
      renderFrame('/orders');
      await userEvent.click(screen.getByRole('button', { name: 'Help' }));

      const line = await within(help()).findByText(
        '© 2026 Zhenzhong (Bob) Zhou',
      );
      expect(line).toBeVisible();
      expect(line.previousElementSibling).toHaveTextContent(
        /^web-app-foundation · Version 0\.7\.0/,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('gives the name and the version in Chinese too', async () => {
    stubNames({ 'zh-Hans': '品桥' });
    localStorage.setItem('language', 'zh-Hans');
    try {
      renderFrame('/orders');
      await userEvent.click(
        await screen.findByRole('button', { name: '帮助' }),
      );

      expect(
        await within(
          screen.getByRole('complementary', { name: '帮助' }),
        ).findByText('品桥 · 版本 0.7.0 · 构建 983c1d8 · 2026年10月22日'),
      ).toBeVisible();
    } finally {
      localStorage.clear();
      vi.unstubAllGlobals();
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
    await waitFor(() => expect(section).toHaveFocus());
  });
});
