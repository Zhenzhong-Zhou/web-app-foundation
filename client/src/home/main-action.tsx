import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown';
import {
  Button,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
} from '@mui/material';
import { type ReactElement, useId, useState } from 'react';
import { useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import { OFFER_BACK } from '../lib/offer-back';
import { TONAL } from './tonal';

/** A link to a top-level page, the action it is, and its icon. */
export interface QuickAction {
  to: string;
  label: string;
  icon: ReactElement;
}

/**
 * Home's main action (ADR-091): the first the member may do of Raise an
 * order, Receive stock, Plan a run and Trace a lot, in the accent, and
 * beside it More, a menu of the others they may do; with none other, no
 * More. Home leaves it out while Getting started shows, whose next step
 * is then the page's one main action (ADR-058). Full width below `md`, the
 * main button taking the room.
 */
export function MainAction({ actions }: { actions: QuickAction[] }) {
  const intl = useIntl();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const menuId = useId();
  const moreId = useId();
  const [main, ...others] = actions;

  return (
    <Stack
      direction="row"
      sx={{ gap: 1, width: { xs: '100%', md: 'auto' }, flexShrink: 0 }}
    >
      <Button
        component={RouterLink}
        to={main.to}
        state={OFFER_BACK}
        startIcon={main.icon}
        variant="contained"
        sx={{ flexGrow: { xs: 1, md: 0 } }}
      >
        {main.label}
      </Button>

      {others.length > 0 && (
        <>
          {/* A menu button: it says so and whether it is open; MUI's menu
              takes the arrows, and Escape gives focus back here. */}
          <Button
            id={moreId}
            variant="text"
            color="inherit"
            endIcon={<KeyboardArrowDown />}
            aria-haspopup="menu"
            aria-expanded={!!anchor}
            aria-controls={anchor ? menuId : undefined}
            onClick={(event) => setAnchor(event.currentTarget)}
            sx={TONAL}
          >
            {intl.formatMessage({
              id: 'home.actions.more',
              defaultMessage: 'More',
            })}
          </Button>
          <Menu
            id={menuId}
            anchorEl={anchor}
            open={!!anchor}
            onClose={() => setAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            // Named by the button that opens it (ADR-091's review).
            slotProps={{ list: { 'aria-labelledby': moreId } }}
          >
            {others.map((action) => (
              <MenuItem
                key={action.to + action.label}
                component={RouterLink}
                to={action.to}
                state={OFFER_BACK}
                onClick={() => setAnchor(null)}
              >
                <ListItemIcon>{action.icon}</ListItemIcon>
                <ListItemText>{action.label}</ListItemText>
              </MenuItem>
            ))}
          </Menu>
        </>
      )}
    </Stack>
  );
}
