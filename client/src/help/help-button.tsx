import HelpOutlineOutlined from '@mui/icons-material/HelpOutlineOutlined';
import { Button, useMediaQuery, useTheme } from '@mui/material';
import type { KeyboardEvent } from 'react';
import { useIntl } from 'react-intl';

import { BAR } from '../layout/bar';
import { BarButton } from '../layout/bar-button';
import { HELP_PANEL_ID } from './help-ids';
import { useHelp } from './use-help';

/**
 * Help in the top bar, beside the bell (ADR-079): its icon and the word,
 * which a newcomer finds sooner than an icon alone. From `lg` the word
 * beside the icon; below it the word under the icon, as the bar's other
 * targets have (ADR-091), or the icon alone where the bar is too narrow
 * for the words, named Help for a screen reader. Shown pressed while Help
 * is open, and pressed again to close it.
 */
export function HelpButton() {
  const intl = useIntl();
  const theme = useTheme();
  // noSsr, as the lookup's: the bar never draws one button, then the other.
  const phone = useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true });
  const compact = useMediaQuery(theme.breakpoints.down(BAR), { noSsr: true });
  const help = useHelp();
  if (!help) return null;

  const label = intl.formatMessage({
    id: 'help.title',
    defaultMessage: 'Help',
  });
  const props = {
    ref: help.buttonRef,
    onClick: help.toggle,
    // Esc closes Help from here too, where focus still is until the guide
    // has loaded and taken it (#212); focus stays on the button.
    onKeyDown: (event: KeyboardEvent) => {
      if (help.open && event.key === 'Escape') {
        event.stopPropagation();
        help.toggle();
      }
    },
    'aria-expanded': help.open,
    // On a phone Help is a dialog of its own, not a panel this controls.
    'aria-controls': help.open && !phone ? HELP_PANEL_ID : undefined,
  };

  if (compact) {
    return (
      <BarButton
        aria-label={label}
        word={label}
        icon={<HelpOutlineOutlined />}
        {...props}
        sx={
          help.open
            ? { color: 'primary.main', bgcolor: 'surface.chosen' }
            : undefined
        }
      />
    );
  }

  return (
    <Button
      variant="outlined"
      startIcon={<HelpOutlineOutlined />}
      {...props}
      sx={{
        borderRadius: 999,
        borderColor: 'divider',
        color: help.open ? 'primary.main' : 'text.primary',
        bgcolor: help.open ? 'surface.chosen' : 'transparent',
      }}
    >
      {label}
    </Button>
  );
}
