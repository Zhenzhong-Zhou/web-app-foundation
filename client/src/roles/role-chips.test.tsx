import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { roleRef } from '../test/factories';
import { themeFor } from '../theme';
import { RoleChips } from './role-chips';

describe('RoleChips', () => {
  // WCAG 1.4.1: a made role is told from a built-in one by more than its
  // colour, its square corners.
  it('squares a made role’s corners, and leaves a built-in one a pill', () => {
    render(
      <ThemeProvider theme={themeFor('en')}>
        <RoleChips
          roles={[
            roleRef('Viewer'),
            { id: 'role-lead', name: 'Warehouse lead', builtIn: false },
          ]}
        />
      </ThemeProvider>,
    );

    const cornersOf = (name: string) => {
      const chip = screen.getByText(name).closest('.MuiChip-root');
      return parseFloat(chip ? getComputedStyle(chip).borderRadius : '');
    };
    expect(cornersOf('Warehouse lead')).toBeLessThan(cornersOf('Viewer') / 2);
  });
});
