import type { SxProps, Theme } from '@mui/material';

/**
 * A choice drawn as a card (ADR-055), for a FormControlLabel around a
 * checkbox or a radio: bordered, and once chosen the accent's border and
 * its light tint. Two pixels of border chosen, one otherwise, the padding
 * taking up the difference, so the text stays put. Invite's roles and the
 * role editor's Start from.
 */
export function chosenCardSx(chosen: boolean): SxProps<Theme> {
  return {
    m: 0,
    alignItems: 'flex-start',
    border: chosen ? 2 : 1,
    borderColor: chosen ? 'primary.main' : 'divider',
    bgcolor: chosen ? 'surface.chosen' : undefined,
    borderRadius: 1,
    px: chosen ? 1.25 : 1.375,
    py: chosen ? 0.375 : 0.5,
    '& .MuiCheckbox-root, & .MuiRadio-root': { mt: 0.25 },
  };
}
