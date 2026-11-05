import { Box, IconButton, type IconButtonProps } from '@mui/material';
import type { ReactNode } from 'react';

import { RADIUS } from '../theme/tokens';
import { BAR, WORDS_FIT } from './bar';

/**
 * A target in the top bar (ADR-091): below `lg` its icon with a short word
 * under it, the app's own name for it, as a phone's tab bar has; from `lg`
 * the icon alone, as before. The word comes first in the markup, drawn
 * under the icon, so the words read from the button are the word's before
 * a badge's count or an avatar's initials, and the button's name, which
 * starts with the word, holds them in that order (WCAG 2.5.3, Label in
 * Name).
 */
export function BarButton({
  icon,
  word,
  sx,
  ...props
}: Omit<IconButtonProps, 'children'> & {
  icon: ReactNode;
  word: string;
}) {
  return (
    <IconButton
      {...props}
      sx={[
        (theme) => ({
          [theme.breakpoints.down(BAR)]: {
            [WORDS_FIT]: {
              flexDirection: 'column',
              gap: '2px',
              px: 0.5,
              py: 0.5,
              borderRadius: `${RADIUS.control}px`,
            },
          },
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box
        component="span"
        sx={(theme) => ({
          display: 'none',
          order: 1,
          ...theme.typography.caption,
          color: 'text.secondary',
          whiteSpace: 'nowrap',
          [theme.breakpoints.down(BAR)]: { [WORDS_FIT]: { display: 'block' } },
        })}
      >
        {word}
      </Box>
      {icon}
    </IconButton>
  );
}
