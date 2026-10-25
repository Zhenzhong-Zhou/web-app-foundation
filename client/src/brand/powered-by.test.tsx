import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { themeFor } from '../theme';
import { setBrand } from '../theme/brand-store';
import { PoweredBy } from './powered-by';

const ON_DARK = 'rgb(119, 107, 198)';
const LIGHT = 'rgb(85, 70, 184)';

function renderFoot(folded = false) {
  return render(
    <ThemeProvider theme={themeFor('en')}>
      <PoweredBy folded={folded} />
    </ThemeProvider>,
  );
}

/** The mark's bowl in Light, then in Dark: its purple says which master. */
function bowlInEachMode(container: HTMLElement): [string, string] {
  const bowl = container.querySelector('.bowl')!;
  const light = getComputedStyle(bowl).fill;
  document.documentElement.classList.add('dark');
  return [light, getComputedStyle(bowl).fill];
}

/**
 * The rail's foot (ADR-082): Powered by, the mark and the name, the mark
 * in the version for the rail's actual colour (decision 3).
 */
describe('PoweredBy', () => {
  afterEach(() => {
    setBrand(null);
    vi.unstubAllGlobals();
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('says it with the name, the on-dark mark on the dark rail in both modes', () => {
    const { container } = renderFoot();

    expect(screen.getByText(/^Powered by/)).toHaveTextContent(
      'Powered by web-app-foundation',
    );
    expect(bowlInEachMode(container)).toEqual([ON_DARK, ON_DARK]);
  });

  // The light rail is dark in Dark mode, #1E232C.
  it('draws the light mark on the light rail in Light only', () => {
    setBrand({ accentColor: null, rail: 'light' });
    const { container } = renderFoot();

    expect(bowlInEachMode(container)).toEqual([LIGHT, ON_DARK]);
  });

  it('is the mark alone folded, named, with a tooltip on focus', async () => {
    const user = userEvent.setup();
    renderFoot(true);

    const mark = screen.getByRole('img', {
      name: 'Powered by web-app-foundation',
    });
    expect(screen.queryByText(/^Powered by/)).toBeNull();

    await user.tab();
    expect(mark).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Powered by web-app-foundation',
    );
  });

  it('puts the name where 中文 puts it, by its own setting', async () => {
    vi.stubGlobal('__APP_NAMES__', {
      en: 'Panivo',
      'fr-CA': 'Panivo',
      'zh-Hans': '品桥',
    });
    localStorage.setItem('language', 'zh-Hans');
    renderFoot();

    expect(await screen.findByText(/^由/)).toHaveTextContent('由品桥提供支持');
  });
});
