import { ThemeProvider } from '@mui/material/styles';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { drawnIn } from '../test/drawn-colour';
import { renderWithAuth } from '../test/render-with-auth';
import { themeFor } from '../theme';
import { RailTop } from './rail-top';

function renderTop({
  folded,
  name = 'WIDE Naturals Inc.',
  logoFileId = null,
}: {
  folded: boolean;
  name?: string;
  logoFileId?: string | null;
}) {
  const onToggle = vi.fn();
  const view = renderWithAuth(
    <ThemeProvider theme={themeFor('en')}>
      <RailTop name={name} folded={folded} onToggle={onToggle} />
    </ThemeProvider>,
    {
      organization: {
        name,
        branding: {
          logoFileId,
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

/** The logo loaded at its own size, as the browser reads it. */
function loads(container: HTMLElement, width: number, height: number) {
  const image = container.querySelector<HTMLImageElement>('img[hidden]')!;
  Object.defineProperty(image, 'naturalWidth', { value: width });
  Object.defineProperty(image, 'naturalHeight', { value: height });
  fireEvent.load(image);
}

/** Named with the initials it shows, or alone with a logo (WCAG 2.5.3). */
const plate = () =>
  screen.getByRole('button', {
    name: /^(WN, )?Expand navigation \(WIDE Naturals Inc\.\)$/,
  });

/**
 * The rail's top (ADR-082, decision 11): the organization's, its logo or
 * name with the fold button, and folded, one plate that expands it.
 */
describe('RailTop', () => {
  it('shows the name with the fold button, open, where there is no logo', async () => {
    const { onToggle } = renderTop({ folded: false });

    expect(screen.getByText('WIDE Naturals Inc.')).toBeVisible();
    const fold = screen.getByRole('button', { name: 'Collapse navigation' });
    expect(fold).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(fold);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('shows the logo, open, whatever its shape', () => {
    renderTop({ folded: false, logoFileId: 'wordmark-open' });

    expect(
      screen.getByRole('img', { name: 'WIDE Naturals Inc.' }),
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
    const drawn = getComputedStyle(plate());
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
