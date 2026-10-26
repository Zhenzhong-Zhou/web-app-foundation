import { ThemeProvider } from '@mui/material/styles';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithAuth } from '../test/render-with-auth';
import { atTextSizes } from '../test/text-sizes';
import { themeFor } from '../theme';
import { LOGO_PLATE } from './logo';
import { OrganizationMark } from './organization-mark';

function renderMark({
  logoFileId = null,
  squareLogoFileId = null,
  rail = 'dark',
  onRail = false,
  initials = false,
}: {
  logoFileId?: string | null;
  squareLogoFileId?: string | null;
  rail?: 'dark' | 'light';
  onRail?: boolean;
  initials?: boolean;
}) {
  return renderWithAuth(
    <ThemeProvider theme={themeFor('en')}>
      {/* In its link, as the rail's top and the top bar hold it. */}
      <a href="/">
        <OrganizationMark
          name="WIDE Naturals Inc."
          onRail={onRail}
          initials={initials}
        />
      </a>
    </ThemeProvider>,
    {
      organization: {
        name: 'WIDE Naturals Inc.',
        branding: {
          logoFileId,
          squareLogoFileId,
          accentColor: null,
          rail,
          logoOnDocuments: true,
          expiryWarningDays: 90,
          expiryCriticalDays: 30,
        },
      },
    },
  );
}

const home = () => screen.getByRole('link');

/**
 * The organization's place in the corner, the rail's top and the drawer's
 * header (ADR-060, amended): with no main logo, its square logo beside the
 * name; on the tight bar (ADR-079), the square logo first, alone.
 */
describe('OrganizationMark', () => {
  it('puts the square logo beside the name, with no main logo, the link named by the name', () => {
    const { container } = renderMark({
      squareLogoFileId: 'mark',
      onRail: true,
    });

    expect(home()).toHaveAccessibleName('WIDE Naturals Inc.');
    expect(home()).toHaveTextContent('WIDE Naturals Inc.');
    // Said by the name beside it, so it says nothing itself.
    const image = container.querySelector('img');
    expect(image).toHaveAttribute('alt', '');
    expect(image).toHaveAttribute('src', '/api/v1/files/mark?size=thumb');
    // On the white plate on the dark rail, as a logo is.
    expect(image!.parentElement).toHaveStyle({ backgroundColor: LOGO_PLATE });

    // At most 32 px, in rem, so it grows with the name beside it.
    expect(atTextSizes(() => getComputedStyle(image!).maxHeight)).toEqual({
      standard: '32px',
      larger: '40px',
    });
  });

  it('draws the square logo on the light rail without a plate', () => {
    const { container } = renderMark({
      squareLogoFileId: 'mark',
      rail: 'light',
      onRail: true,
    });

    expect(container.querySelector('img')!.parentElement).not.toHaveStyle({
      backgroundColor: LOGO_PLATE,
    });
  });

  it('keeps a main logo, alone, beside no square logo', () => {
    const { container } = renderMark({
      logoFileId: 'wordmark',
      squareLogoFileId: 'mark',
      onRail: true,
    });

    expect(
      screen.getByRole('img', { name: 'WIDE Naturals Inc.' }),
    ).toHaveAttribute('src', '/api/v1/files/wordmark');
    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(home()).not.toHaveTextContent('WIDE Naturals Inc.');
  });

  it.each([
    ['with no main logo', null],
    ['ahead of a main logo', 'wordmark'],
  ])(
    'shows the square logo alone on the tight bar, %s, named for the organization',
    (_, logoFileId) => {
      const { container } = renderMark({
        logoFileId,
        squareLogoFileId: 'mark',
        initials: true,
      });

      expect(
        screen.getByRole('img', { name: 'WIDE Naturals Inc.' }),
      ).toHaveAttribute('src', '/api/v1/files/mark?size=thumb');
      expect(container.querySelectorAll('img')).toHaveLength(1);
      expect(home()).toHaveAccessibleName('WIDE Naturals Inc.');
      expect(home()).not.toHaveTextContent('WN');
    },
  );

  it('keeps the main logo, then the initials, on the tight bar without a square logo', () => {
    const { unmount } = renderMark({ logoFileId: 'wordmark', initials: true });
    expect(
      screen.getByRole('img', { name: 'WIDE Naturals Inc.' }),
    ).toHaveAttribute('src', '/api/v1/files/wordmark');
    unmount();

    renderMark({ initials: true });
    expect(home()).toHaveTextContent(/^WNWIDE Naturals Inc\.$/);
    expect(screen.queryByRole('img')).toBeNull();
  });
});
