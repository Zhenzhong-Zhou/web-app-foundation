import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { drawnIn } from '../test/drawn-colour';
import { themeFor } from '../theme';
import { contrast } from '../theme/accent';
import { type StatusKind, StatusPage } from './status-page';

/** Every kind; a new one fails to compile here until it is added. */
const KINDS = Object.keys({
  notFound: true,
  missing: true,
  forbidden: true,
  crash: true,
  offline: true,
  updated: true,
  installing: true,
} satisfies Record<StatusKind, true>) as StatusKind[];

describe('StatusPage', () => {
  // ADR-055's tones, not MUI's derived light and dark: the crash page's
  // icon was 2.2 : 1 on its disc in both modes (ADR-081).
  it.each(KINDS)(
    'draws the %s icon at 3 : 1 on its disc, in both modes',
    (kind) => {
      const { container } = render(
        <ThemeProvider theme={themeFor('en')}>
          <StatusPage kind={kind} title="Title" message="Message" />
        </ThemeProvider>,
      );
      const disc = container.querySelector('[aria-hidden="true"]')!;
      const { color, backgroundColor } = getComputedStyle(disc);

      for (const mode of ['light', 'dark'] as const) {
        expect(
          contrast(drawnIn(mode, color), drawnIn(mode, backgroundColor)),
        ).toBeGreaterThanOrEqual(3);
      }
    },
  );

  // In sx, since Typography's color prop takes a palette name, not a path:
  // color="text.secondary" drew nothing, so the message was as dark as the
  // title and the note read as the message (#196).
  it('draws its message and its note in the secondary text colour', () => {
    render(
      <ThemeProvider theme={themeFor('en')}>
        <StatusPage
          kind="offline"
          title="Title"
          message="Message"
          note="This page tries again by itself."
        />
      </ThemeProvider>,
    );

    for (const text of ['Message', 'This page tries again by itself.']) {
      expect(getComputedStyle(screen.getByText(text)).color).toBe(
        'var(--mui-palette-text-secondary)',
      );
    }
  });
});
