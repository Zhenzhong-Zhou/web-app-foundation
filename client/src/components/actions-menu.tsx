import ArrowDropDown from '@mui/icons-material/ArrowDropDown';
import { Button, Menu, MenuItem } from '@mui/material';
import { type Ref, useId, useState } from 'react';
import { useIntl } from 'react-intl';

/** One choice in a row's Actions. */
export interface Action {
  /** Its words in the menu, which also tell one choice from another. */
  label: string;
  onSelect: () => void;
  /** A removal, in the critical tone. */
  danger?: boolean;
}

/**
 * A row's Actions, in words (the design language's Rows; ADR-093, R6): a
 * button reading "Actions", named for its row ("Actions for VITC-100"),
 * that opens a menu of what the reader may do there. Nothing to offer, no
 * button.
 *
 * A choice runs once the menu has finished closing, not on the click.
 * Both at once has MUI give focus back to this button while the dialog
 * the choice opens marks #root aria-hidden: a focused element inside a
 * hidden subtree, which assistive technology cannot reach.
 */
export function ActionsMenu({
  name,
  actions,
  buttonRef,
}: {
  /** The button's name, its word first (WCAG 2.5.3). */
  name: string;
  actions: Action[];
  /** For a screen that moves focus to it. */
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  const intl = useIntl();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [pending, setPending] = useState<Action | null>(null);
  const menuId = useId();

  if (actions.length === 0) return null;

  return (
    <>
      <Button
        ref={buttonRef}
        size="small"
        variant="text"
        endIcon={<ArrowDropDown />}
        aria-label={name}
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        aria-controls={anchor ? menuId : undefined}
        onClick={(event) => setAnchor(event.currentTarget)}
        sx={{ whiteSpace: 'nowrap' }}
      >
        {intl.formatMessage({
          id: 'common.actions',
          defaultMessage: 'Actions',
        })}
      </Button>
      <Menu
        id={menuId}
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
        slotProps={{
          transition: {
            onExited: () => {
              pending?.onSelect();
              setPending(null);
            },
          },
        }}
      >
        {actions.map((action) => (
          <MenuItem
            key={action.label}
            onClick={() => {
              setPending(action);
              setAnchor(null);
            }}
            sx={action.danger ? { color: 'error.main' } : undefined}
          >
            {action.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
