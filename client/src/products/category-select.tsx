import { Box, MenuItem } from '@mui/material';
import type { ComponentProps } from 'react';

import type { ProductCategory } from '../api/types.gen';
import { SelectField } from '../components/select-field';
import { categoryPlaces, NOT_CHOSEN, pathName } from './item-list';

/**
 * A category to choose (ADR-092): the whole tree, each under its parent,
 * an empty one too, after the empty choice named in words. Add item,
 * Edit, Set category and a category's Under choose with it; `leaveOut`
 * drops what may not be chosen, as Move drops the category's own branch.
 *
 * With `unchosen`, it can open on nothing chosen, NOT_CHOSEN, which
 * shows those words in grey and is never offered.
 *
 * Each option is named by its path, "Packaging › Bottles", since its
 * indent alone says nothing to a screen reader, and two categories of one
 * name under different parents would sound alike (WCAG 1.3.1).
 */
export function CategorySelect({
  categories,
  leaveOut,
  unchosen,
  ...field
}: Omit<ComponentProps<typeof SelectField>, 'children'> & {
  categories: readonly ProductCategory[];
  leaveOut?: ReadonlySet<string> | null;
  /** What the box says before a choice, its value NOT_CHOSEN. */
  unchosen?: string;
}) {
  return (
    <SelectField {...field}>
      {/* In the list only so the box has something to show for it. */}
      {unchosen && (
        <MenuItem value={NOT_CHOSEN} disabled sx={{ display: 'none' }}>
          <Box component="span" sx={{ color: 'text.secondary' }}>
            {unchosen}
          </Box>
        </MenuItem>
      )}
      {categoryPlaces(categories)
        .filter((place) => !leaveOut?.has(place.id))
        .map((place) => (
          <MenuItem
            key={place.id}
            value={place.id}
            aria-label={pathName(place.path)}
            sx={{ pl: 2 + place.depth * 2 }}
          >
            {place.name}
          </MenuItem>
        ))}
    </SelectField>
  );
}
