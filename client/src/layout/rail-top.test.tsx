import { ThemeProvider } from '@mui/material/styles';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { drawnIn } from '../test/drawn-colour';
import { loads } from '../test/image-loads';
import { renderWithAuth } from '../test/render-with-auth';
import { atTextSizes } from '../test/text-sizes';
import { themeFor } from '../theme';
import { LOGO_PLATE } from './logo';
import { RailTop } from './rail-top';

function renderTop({
  folded,
  name = 'WIDE Naturals Inc.',
  logoFileId = null,
  squareLogoFileId = null,
}: {
  folded: boolean;
  name?: string;
  logoFileId?: string | null;
  squareLogoFileId?: string | null;
}) {
  const onToggle = vi.fn();
  const view = renderWithAuth(
    <MemoryRouter>
      <ThemeProvider theme={themeFor('en')}>
        <RailTop name={name} folded={folded} onToggle={onToggle} />
      </ThemeProvider>
    </MemoryRouter>,
    {
      organization: {
        name,
        branding: {
          logoFileId,
          squareLogoFileId,
          accentColor: null,
          rail: 'dark',
          logoOnDocuments: true,
          expiryWarningDays: 90,
          expiryCriticalDays: 30,
        },
      },
    },
  );
  return { ...view, onToggle };
}

/**
 * The plate's image at Standard and at Larger text, as the browser draws
 * it: in rem, it grows with the plate (ADR-060, amended).
 */
const sizes = (image: Element | null) =>
  atTextSizes(() => {
    const { maxWidth, maxHeight } = getComputedStyle(image!);
    return `${maxWidth} × ${maxHeight}`;
  });

/** Named with the initials it shows, or alone with a logo (WCAG 2.5.3). */
const plate = () =>
  screen.getByRole('button', {
    name: /^(WN, )?Expand navigation \(WIDE Naturals Inc\.\)$/,
  });

/** The plate as drawn inside the button, by Plate (plate.tsx). */
const drawnPlate = () => plate().firstElementChild!;

/**
 * The rail's top (ADR-082, decision 11): the organization's, its logo or
 * name with the fold button, and folded, one plate that expands it.
 */
describe('RailTop', () => {
  it('shows the name, a link home, with the fold button, open, where there is no logo', async () => {
    const { onToggle } = renderTop({ folded: false });

    // The way home, as the top-left corner is (ADR-058), and the fold
    // button beside it, not in it.
    const home = screen.getByRole('link', { name: 'WIDE Naturals Inc.' });
    expect(home).toHaveAttribute('href', '/');
    expect(home).toHaveTextContent('WIDE Naturals Inc.');
    const fold = screen.getByRole('button', { name: 'Collapse navigation' });
    expect(home).not.toContainElement(fold);
    expect(fold).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(fold);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('shows the logo, open, whatever its shape, as the way home', () => {
    renderTop({ folded: false, logoFileId: 'wordmark-open' });

    const home = screen.getByRole('link', { name: 'WIDE Naturals Inc.' });
    expect(home).toHaveAttribute('href', '/');
    expect(
      within(home).getByRole('img', { name: 'WIDE Naturals Inc.' }),
    ).toHaveAttribute('src', '/api/v1/files/wordmark-open');
  });

  /**
   * Initials on the organization's accent, in a contained button's
   * colours, which pass in either mode; named for what it does and whose
   * it is, its tooltip for what it does.
   */
  it('is a plate of initials, folded, with no logo, and expands the rail', async () => {
    const user = userEvent.setup();
    const { onToggle } = renderTop({ folded: true });

    expect(plate()).toHaveTextContent('WN');
    expect(plate()).toHaveAccessibleName(
      'WN, Expand navigation (WIDE Naturals Inc.)',
    );
    expect(plate()).toHaveAttribute('aria-expanded', 'false');
    const drawn = getComputedStyle(drawnPlate());
    expect(drawnIn('light', drawn.backgroundColor)).toBe('#5546B8');
    expect(drawnIn('light', drawn.color)).toBe('#FFFFFF');
    expect(
      screen.queryByRole('button', { name: 'Collapse navigation' }),
    ).toBeNull();

    await user.hover(plate());
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Expand navigation',
    );
    await user.click(plate());
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('puts a square logo on the plate once it has loaded', () => {
    const { container } = renderTop({ folded: true, logoFileId: 'square' });
    // » alone until the logo's shape is known: neither initials that would
    // give way to it, nor a name that would change with them.
    expect(plate()).not.toHaveTextContent('WN');
    expect(plate().querySelector('img')).toBeNull();
    expect(
      plate().querySelector('[data-testid="KeyboardDoubleArrowRightIcon"]'),
    ).toBeVisible();
    expect(plate()).toHaveAccessibleName(
      'Expand navigation (WIDE Naturals Inc.)',
    );

    loads(container, 200, 180);

    expect(plate()).not.toHaveTextContent('WN');
    expect(plate()).toHaveAccessibleName(
      'Expand navigation (WIDE Naturals Inc.)',
    );
    expect(plate().querySelector('img')).toHaveAttribute(
      'src',
      '/api/v1/files/square',
    );
    expect(sizes(plate().querySelector('img'))).toEqual({
      standard: '28px × 28px',
      larger: '35px × 35px',
    });
  });

  /**
   * The plate's first choice (ADR-060, amended): known square already, so
   * nothing is measured, and drawn from the small file the plate needs.
   */
  it.each([
    ['without a main logo', null],
    ['ahead of a wide main logo', 'wordmark'],
  ])('puts the square logo on the plate at once, %s', (_, logoFileId) => {
    const { container } = renderTop({
      folded: true,
      logoFileId,
      squareLogoFileId: 'mark',
    });

    expect(container.querySelector('img[hidden]')).toBeNull();
    expect(plate()).not.toHaveTextContent('WN');
    expect(plate()).toHaveAccessibleName(
      'Expand navigation (WIDE Naturals Inc.)',
    );
    const image = plate().querySelector('img');
    expect(image).toHaveAttribute('src', '/api/v1/files/mark?size=thumb');
    expect(sizes(image)).toEqual({
      standard: '28px × 28px',
      larger: '35px × 35px',
    });
    // On the white plate, as a square main logo is, until hover or focus.
    expect(drawnPlate()).toHaveStyle({ backgroundColor: LOGO_PLATE });
    expect(
      plate().querySelector('[data-testid="KeyboardDoubleArrowRightIcon"]'),
    ).toHaveClass('unfold');
  });

  it('measures nothing open either, with a square logo', () => {
    const { container } = renderTop({
      folded: false,
      logoFileId: 'wordmark-open',
      squareLogoFileId: 'mark',
    });

    expect(container.querySelector('img[hidden]')).toBeNull();
  });

  it('keeps the initials for a wide logo, a wordmark', () => {
    const { container } = renderTop({ folded: true, logoFileId: 'wordmark' });

    loads(container, 400, 100);

    expect(plate()).toHaveTextContent('WN');
    expect(plate().querySelector('img')).toBeNull();
  });

  it('keeps the initials for a logo that will not load', () => {
    const { container } = renderTop({ folded: true, logoFileId: 'missing' });

    fireEvent.error(container.querySelector('img[hidden]')!);

    expect(plate()).toHaveTextContent('WN');
    expect(container.querySelector('img')).toBeNull();
  });

  it('takes a Chinese name’s first two characters, without its legal ending', () => {
    renderTop({ folded: true, name: '清禾药业有限公司' });

    expect(
      screen.getByRole('button', {
        name: '清禾, Expand navigation (清禾药业有限公司)',
      }),
    ).toHaveTextContent('清禾');
  });
});
