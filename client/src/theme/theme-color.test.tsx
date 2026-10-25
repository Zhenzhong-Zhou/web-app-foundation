import { ThemeProvider, useColorScheme } from '@mui/material/styles';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { themeFor } from '.';
import { ThemeColor } from './theme-color';
import { DARK, LIGHT } from './tokens';

/** Sets the mode as the colour mode's picker does. */
function Choose() {
  const { setMode } = useColorScheme();
  return (
    <button type="button" onClick={() => setMode('system')}>
      System
    </button>
  );
}

function renderThemeColor() {
  render(
    <ThemeProvider theme={themeFor('en')} defaultMode="system">
      <ThemeColor />
      <Choose />
    </ThemeProvider>,
  );
}

/** The two theme-colors, as each stands: its media and its colour. */
const metas = () =>
  [
    ...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'),
  ].map((meta) => [meta.getAttribute('media'), meta.content]);

/**
 * A phone's bar in the page's colour (ADR-082): the mode chosen in the app
 * in both of index.html's theme-colors, and each its own under System.
 */
describe('ThemeColor', () => {
  beforeEach(() => {
    document.head.innerHTML = `
      <meta name="theme-color" content="${LIGHT.page}" media="(prefers-color-scheme: light)" />
      <meta name="theme-color" content="${DARK.page}" media="(prefers-color-scheme: dark)" />`;
  });

  afterEach(() => {
    document.head.innerHTML = '';
    localStorage.clear();
  });

  it("gives both the chosen mode's page colour, whatever the system's", async () => {
    localStorage.setItem('mui-mode', 'dark');

    renderThemeColor();

    await waitFor(() =>
      expect(metas()).toEqual([
        ['(prefers-color-scheme: light)', DARK.page],
        ['(prefers-color-scheme: dark)', DARK.page],
      ]),
    );
  });

  it('puts each back to its own under System', async () => {
    localStorage.setItem('mui-mode', 'light');
    renderThemeColor();
    await waitFor(() =>
      expect(metas()).toEqual([
        ['(prefers-color-scheme: light)', LIGHT.page],
        ['(prefers-color-scheme: dark)', LIGHT.page],
      ]),
    );

    await userEvent.click(screen.getByRole('button', { name: 'System' }));

    await waitFor(() =>
      expect(metas()).toEqual([
        ['(prefers-color-scheme: light)', LIGHT.page],
        ['(prefers-color-scheme: dark)', DARK.page],
      ]),
    );
  });
});
