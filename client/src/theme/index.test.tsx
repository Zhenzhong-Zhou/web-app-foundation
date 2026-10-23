import { Autocomplete, Menu, MenuItem, TextField } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { themeFor } from '.';

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
