import { ThemeProvider } from '@mui/material/styles';
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InvitationLayout } from '../auth/invitation-parts';
import { renderWithAuth } from '../test/render-with-auth';
import { themeFor } from '../theme';
import { SignedOutFrame } from './signed-out-frame';

const HOLDER = '© 2026 Zhenzhong (Bob) Zhou';

const renderInTheme = (ui: ReactNode) =>
  render(<ThemeProvider theme={themeFor('en')}>{ui}</ThemeProvider>);

/** AuthLayout's language picker reads the session, so it has one. */
const renderInvitation = (ui: ReactNode) =>
  renderWithAuth(<ThemeProvider theme={themeFor('en')}>{ui}</ThemeProvider>);

/** The mark's bowl as drawn: its purple says which master it is. */
const bowl = (container: HTMLElement) =>
  getComputedStyle(container.querySelector('.bowl')!).fill;

/**
 * Every screen before sign-in (ADR-082): the product's mark and name above
 * the content, the © line below; an invitation's, the organization's, has
 * Panivo in its footer only.
 */
describe('SignedOutFrame', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('heads the page with the name in text, and ends with the © line', () => {
    vi.stubGlobal('__COPYRIGHT__', HOLDER);
    const { container } = renderInTheme(
      <SignedOutFrame>
        <h1>Sign in</h1>
      </SignedOutFrame>,
    );

    const main = screen.getByRole('main');
    expect(within(main).getByText('web-app-foundation')).toBeVisible();
    expect(
      within(main).getByRole('heading', { name: 'Sign in' }),
    ).toBeVisible();
    expect(screen.getByRole('contentinfo')).toHaveTextContent(HOLDER);
    // The mark says nothing a screen reader has not just read.
    expect(container.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('has no footer where no holder is set, as on a fork', () => {
    renderInTheme(
      <SignedOutFrame>
        <h1>Sign in</h1>
      </SignedOutFrame>,
    );

    expect(screen.queryByRole('contentinfo')).toBeNull();
    expect(screen.queryByText(/©/)).toBeNull();
  });

  it('switches the mark with Light and Dark', () => {
    const { container } = renderInTheme(
      <SignedOutFrame>
        <h1>Sign in</h1>
      </SignedOutFrame>,
    );
    expect(bowl(container)).toBe('rgb(85, 70, 184)');

    document.documentElement.classList.add('dark');
    expect(bowl(container)).toBe('rgb(119, 107, 198)');
  });

  it('names the product in 中文 by its own setting', async () => {
    vi.stubGlobal('__APP_NAMES__', {
      en: 'Panivo',
      'fr-CA': 'Panivo',
      'zh-Hans': '品桥',
    });
    localStorage.setItem('language', 'zh-Hans');
    renderInTheme(
      <SignedOutFrame>
        <h1>登录</h1>
      </SignedOutFrame>,
    );

    expect(
      await within(await screen.findByRole('main')).findByText('品桥'),
    ).toBeVisible();
  });

  /**
   * Every state of an invitation is the organization's page (ADR-077):
   * its heading stays, and the product is in the footer only, mark, name
   * and © line, so two marks never compete.
   */
  it("keeps the product to an invitation's footer", () => {
    vi.stubGlobal('__COPYRIGHT__', HOLDER);
    const { container } = renderInvitation(
      <InvitationLayout title="Join Northside Naturals">
        <p>Mei Lin invited you.</p>
      </InvitationLayout>,
    );

    const main = screen.getByRole('main');
    expect(
      within(main).getByRole('heading', { name: 'Join Northside Naturals' }),
    ).toBeVisible();
    expect(within(main).queryByText('web-app-foundation')).toBeNull();
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent(`web-app-foundation${HOLDER}`);
    expect(footer.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(
      container.querySelectorAll('svg.MuiSvgIcon-root .bowl'),
    ).toHaveLength(1);
  });

  it("names the product in an invitation's footer without a holder too", () => {
    renderInvitation(
      <InvitationLayout title="This invitation has ended">
        <p>Ask for a new one.</p>
      </InvitationLayout>,
    );

    expect(screen.getByRole('contentinfo')).toHaveTextContent(
      /^web-app-foundation$/,
    );
  });
});
