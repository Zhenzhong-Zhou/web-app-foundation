import { Autocomplete, Menu, MenuItem, Switch, TextField } from '@mui/material';
import {
  type CssVarsTheme,
  rgbToHex,
  type Theme,
  ThemeProvider,
} from '@mui/material/styles';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { drawnIn } from '../test/drawn-colour';
import { themeFor } from '.';
import { contrast, safeAccent } from './accent';
import { DARK, LIGHT } from './tokens';

/** The colour muted text takes inside an element. */
const mutedIn = (element: Element) =>
  getComputedStyle(element)
    .getPropertyValue('--mui-palette-text-secondary')
    .trim();

const MAIN = 'var(--mui-palette-text-primary)';

// MUI's tint on these takes muted text below AA, so the theme draws it in
// the main text colour there (tokens.test.ts, #196).
describe('muted text on a focused or selected entry', () => {
  it('is the main text colour in an option focused or selected', async () => {
    render(
      <ThemeProvider theme={themeFor('en')}>
        <Autocomplete
          options={['Paris', 'Tokyo', 'Toronto']}
          value="Paris"
          renderInput={(params) => <TextField {...params} label="City" />}
        />
      </ThemeProvider>,
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'City' }));
    await userEvent.keyboard('{ArrowDown}');

    expect(mutedIn(screen.getByRole('option', { name: 'Paris' }))).toBe(MAIN);
    expect(mutedIn(screen.getByRole('option', { name: 'Tokyo' }))).toBe(MAIN);
    expect(mutedIn(screen.getByRole('option', { name: 'Toronto' }))).not.toBe(
      MAIN,
    );
  });

  it('is the main text colour in a menu entry the keyboard is on', async () => {
    render(
      <ThemeProvider theme={themeFor('en')}>
        <Menu open anchorEl={document.body}>
          <MenuItem>Shipped</MenuItem>
          <MenuItem>Invoiced</MenuItem>
        </Menu>
      </ThemeProvider>,
    );
    await userEvent.keyboard('{ArrowDown}');

    expect(mutedIn(screen.getByRole('menuitem', { name: 'Invoiced' }))).toBe(
      MAIN,
    );
    expect(mutedIn(screen.getByRole('menuitem', { name: 'Shipped' }))).not.toBe(
      MAIN,
    );
  });
});

// The listbox, its groups and their options, as WAI-ARIA's grouped listbox
// has them; MUI's own took the options out of the listbox (#196).
describe('options under a heading', () => {
  it('are a group of the listbox, named by the heading', async () => {
    render(
      <ThemeProvider theme={themeFor('en')}>
        <Autocomplete
          options={['Paris', 'Lyon', 'Tokyo']}
          groupBy={(city) => (city === 'Tokyo' ? 'Japan' : 'France')}
          renderInput={(params) => <TextField {...params} label="City" />}
        />
      </ThemeProvider>,
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'City' }));

    const france = within(screen.getByRole('listbox')).getByRole('group', {
      name: 'France',
    });
    expect(
      within(france)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Paris', 'Lyon']);
    expect(screen.getByRole('group', { name: 'Japan' })).toContainElement(
      screen.getByRole('option', { name: 'Tokyo' }),
    );
  });
});

// ADR-091: a step of 1.25 from the 16 px text, so a heading is told apart
// by its size, and each line on a 4 px grid, at the Standard text size.
describe('the type scale', () => {
  const { typography } = themeFor('en');
  const px = (size: unknown) => parseFloat(String(size)) * 16;

  it.each([
    ['h5', 25, 32],
    ['h6', 20, 28],
    ['body1', 16, 24],
    ['body2', 14, 20],
  ] as const)('sets %s at %s px on %s', (variant, size, line) => {
    const { fontSize, lineHeight } = typography[variant];

    expect(px(fontSize)).toBe(size);
    expect(px(fontSize) * Number(lineHeight)).toBeCloseTo(line);
  });

  // More room for Chinese strokes, still on the grid (ADR-091), on the
  // variants themselves, so a table's cells and a menu's items take it
  // too, not Typography alone (ADR-091's review).
  it.each([
    ['body1', 28],
    ['body2', 24],
  ] as const)('sets Chinese %s on %s', (variant, line) => {
    const { fontSize, lineHeight } = themeFor('zh-Hans').typography[variant];

    expect(px(fontSize) * Number(lineHeight)).toBeCloseTo(line);
  });
});

// A switch off is seen by its track, which MUI draws pale: the theme's is
// the edge's grey, 3:1 on a panel in both modes (WCAG 1.4.11).
describe('a switch', () => {
  it('draws its track while off at 3:1 on a panel, in both modes', () => {
    render(
      <ThemeProvider theme={themeFor('en')}>
        <Switch slotProps={{ input: { 'aria-label': 'Recently opened' } }} />
      </ThemeProvider>,
    );
    const track = screen
      .getByRole('switch', { name: 'Recently opened' })
      .closest('.MuiSwitch-root')!
      .querySelector('.MuiSwitch-track')!;
    const { backgroundColor, opacity } = getComputedStyle(track);
    expect(opacity).toBe('1');
    for (const [mode, scheme] of [
      ['light', LIGHT],
      ['dark', DARK],
    ] as const) {
      expect(
        contrast(drawnIn(mode, backgroundColor), scheme.surface),
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('leaves its track while on as MUI draws it, in the accent', () => {
    render(
      <ThemeProvider theme={themeFor('en')}>
        <Switch
          defaultChecked
          slotProps={{ input: { 'aria-label': 'Recently opened' } }}
        />
      </ThemeProvider>,
    );
    const track = screen
      .getByRole('switch', { name: 'Recently opened' })
      .closest('.MuiSwitch-root')!
      .querySelector('.MuiSwitch-track')!;
    expect(getComputedStyle(track).backgroundColor).toBe(
      'var(--mui-palette-primary-main)',
    );
  });
});

// A main button under the pointer takes primary.dark: darker in light mode,
// lighter in dark, away from its text, for ADR-060's presets and for a
// chosen accent accent.ts had to adjust (#557).
describe('a main button under the pointer', () => {
  const accents = [
    '#5546B8',
    '#1F5FBF',
    '#0F6E6E',
    '#2F5D50',
    '#7A3B69',
    '#3A4150',
    safeAccent('#FFFF00').accent,
  ];

  it.each(['light', 'dark'] as const)(
    'keeps its text readable in %s',
    (mode) => {
      for (const accent of accents) {
        // The theme has CSS variables, so it carries both modes' palettes.
        const theme = themeFor('en', { accent, rail: 'dark' }) as Theme &
          Pick<CssVarsTheme, 'colorSchemes'>;
        const { primary } = theme.colorSchemes[mode]!.palette;
        expect(
          contrast(rgbToHex(primary.dark), primary.contrastText),
        ).toBeGreaterThanOrEqual(4.5);
      }
    },
  );
});
