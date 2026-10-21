import HelpOutlineOutlined from '@mui/icons-material/HelpOutlineOutlined';
import { Button, IconButton, useMediaQuery, useTheme } from '@mui/material';
import { useIntl } from 'react-intl';

import { HELP_PANEL_ID } from './help-ids';
import { useHelp } from './use-help';

/**
 * Help in the top bar, beside the bell (ADR-079): its icon and the word
 * where the bar has room, which a newcomer finds sooner than an icon alone;
 * the icon alone on a phone, named Help for a screen reader. Shown pressed
 * while Help is open, and pressed again to close it.
 */
export function HelpButton() {
  const intl = useIntl();
  const theme = useTheme();
  // noSsr, as the lookup's: the bar never draws one button, then the other.
  const phone = useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true });
  const help = useHelp();
  if (!help) return null;

  const label = intl.formatMessage({
    id: 'help.title',
    defaultMessage: 'Help',
  });
  const props = {
    ref: help.buttonRef,
    onClick: help.toggle,
    'aria-expanded': help.open,
    // On a phone Help is a dialog of its own, not a panel this controls.
    'aria-controls': help.open && !phone ? HELP_PANEL_ID : undefined,
  };

  if (phone) {
    return (
      <IconButton aria-label={label} {...props}>
        <HelpOutlineOutlined />
      </IconButton>
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
