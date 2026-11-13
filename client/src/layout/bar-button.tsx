import { Box, IconButton, type IconButtonProps } from '@mui/material';
import type { ReactNode } from 'react';

import { useLanguage } from '../i18n/use-language';
import { RADIUS } from '../theme/tokens';
import { BAR, wordsFit } from './bar';

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
  // The language the screens show, en-XA included, not Intl's tag, which
  // carries the browser's region.
  const fit = wordsFit(useLanguage().shown);
  return (
    <IconButton
      {...props}
      sx={[
        (theme) => ({
          [theme.breakpoints.down(BAR)]: {
            [fit]: {
              flexDirection: 'column',
              gap: '2px',
              px: 0.5,
              py: 0.5,
              borderRadius: `${RADIUS.control}px`,
              // The bell's count lower by its own overhang, so it stays
              // inside the bar, not cut flat at the screen's top edge
              // (ADR-091's review).
              '& .MuiBadge-standard': { top: 6 },
              // As tall as the bar, its word at the foot, so every word
              // sits on one line, Account's under the taller avatar too
              // (ADR-091's review).
              alignSelf: 'stretch',
              justifyContent: 'flex-end',
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
          ...theme.typography.body2,
          color: 'text.secondary',
          whiteSpace: 'nowrap',
          [theme.breakpoints.down(BAR)]: { [fit]: { display: 'block' } },
        })}
      >
        {word}
      </Box>
      {icon}
    </IconButton>
  );
}
