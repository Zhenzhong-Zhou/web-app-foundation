import {
  autocompleteClasses,
  type AutocompleteRenderGroupParams,
  Box,
  ListSubheader,
} from '@mui/material';
import { useId } from 'react';

/**
 * A heading's options, as the listbox's own group named by the heading:
 * listbox, group, option, as WAI-ARIA's grouped listbox has them. MUI draws
 * a plain list item holding a plain list, which takes the options out of
 * the listbox for a screen reader, and which axe refuses (#196). The look
 * is MUI's: its heading's colours and its options' indent.
 *
 * Every Autocomplete's groups, from the theme's renderGroup.
 */
export function OptionGroup({
  group,
  children,
}: Omit<AutocompleteRenderGroupParams, 'key'>) {
  const heading = useId();

  return (
    <li role="none">
      <Box
        component="ul"
        role="group"
        aria-labelledby={heading}
        className={autocompleteClasses.groupUl}
        sx={{ p: 0, [`& .${autocompleteClasses.option}`]: { pl: 3 } }}
      >
        <ListSubheader
          id={heading}
          role="presentation"
          className={autocompleteClasses.groupLabel}
          sx={{ bgcolor: 'background.paper', top: -8 }}
        >
          {group}
        </ListSubheader>
        {children}
      </Box>
    </li>
  );
}
