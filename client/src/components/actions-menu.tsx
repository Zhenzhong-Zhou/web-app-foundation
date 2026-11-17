import {
  Button,
  Divider,
  ListItemText,
  Menu,
  MenuItem,
  Typography,
} from '@mui/material';
import { Fragment, type Ref, useId, useState } from 'react';
import { useIntl } from 'react-intl';

/** One choice in a row's Actions. */
export interface Action {
  /** Its words in the menu, which also tell one choice from another. */
  label: string;
  onSelect: () => void;
  /** A removal, in the critical tone. */
  danger?: boolean;
  /**
   * Why it cannot be done here, said beneath it: the choice is greyed,
   * `aria-disabled`, still reached by the keyboard, and does nothing
   * (ADR-093 v3: "Nothing on hand to move").
   */
  unavailable?: string;
}

/**
 * A row's Actions, in words (the design language's Rows; ADR-093, R6): a
 * button reading "Actions", named for its row ("Actions for Vitamin C",
 * "Actions for lot VC-0302 at Shelf A2"), that opens a menu of what the
 * reader may do there, in groups with a divider between them, and a line
 * above them where one says what comes next. Nothing to offer, no button.
 *
 * A choice runs once the menu has finished closing, not on the click.
 * Both at once has MUI give focus back to this button while the dialog
 * the choice opens marks #root aria-hidden: a focused element inside a
 * hidden subtree, which assistive technology cannot reach.
 */
export function ActionsMenu({
  name,
  groups,
  note,
  buttonRef,
}: {
  /** The button's name, its word first (WCAG 2.5.3). */
  name: string;
  /** The choices, each group apart from the next; empty groups left out. */
  groups: Action[][];
  /** A line above the choices, read with the menu: "3 lots in 2 places: …". */
  note?: string;
  /** For a screen that moves focus to it. */
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  const intl = useIntl();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [pending, setPending] = useState<Action | null>(null);
  const menuId = useId();
  const noteId = useId();
  const shown = groups.filter((group) => group.length > 0);

  if (shown.length === 0) return null;

  return (
    <>
      {/* The word in grey, no border; the tint and the accent only under
          the pointer or the keyboard's focus, centred on the word, as v2's
          board draws it (ADR-093). */}
      <Button
        ref={buttonRef}
        size="small"
        variant="text"
        aria-label={name}
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        aria-controls={anchor ? menuId : undefined}
        onClick={(event) => setAnchor(event.currentTarget)}
        sx={{
          whiteSpace: 'nowrap',
          minWidth: 0,
          px: 1,
          color: 'text.secondary',
          '&:hover, &.Mui-focusVisible, &[aria-expanded="true"]': {
            color: 'primary.main',
            bgcolor: 'action.hover',
          },
        }}
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
          // A greyed choice is still reached by the arrows, so its reason
          // is heard (ADR-093 v3).
          list: {
            disabledItemsFocusable: true,
            ...(note && { 'aria-describedby': noteId }),
          },
          transition: {
            onExited: () => {
              pending?.onSelect();
              setPending(null);
            },
          },
        }}
      >
        {note && (
          <Typography
            id={noteId}
            component="li"
            role="presentation"
            variant="body2"
            sx={{ px: 2, pt: 0.5, pb: 1, color: 'text.secondary' }}
          >
            {note}
          </Typography>
        )}
        {shown.map((group, index) => (
          <Fragment key={group[0]!.label}>
            {(index > 0 || note) && <Divider component="li" />}
            {group.map((action) =>
              action.unavailable ? (
                // Greyed, its reason beneath, still reached by the keyboard.
                <MenuItem
                  key={action.label}
                  aria-disabled
                  onClick={() => undefined}
                  sx={{ color: 'text.disabled', cursor: 'default' }}
                >
                  <ListItemText
                    primary={action.label}
                    secondary={action.unavailable}
                  />
                </MenuItem>
              ) : (
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
              ),
            )}
          </Fragment>
        ))}
      </Menu>
    </>
  );
}
