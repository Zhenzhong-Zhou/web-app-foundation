import { MenuItem } from '@mui/material';
import type { ComponentProps } from 'react';

import type { ProductCategory } from '../api/types.gen';
import { SelectField } from '../components/select-field';
import { categoryPlaces } from './item-list';

/**
 * A category to choose (ADR-092): the whole tree, each under its parent,
 * an empty one too, after the empty choice named in words. Add item,
 * Edit, Set category and a category's Under choose with it; `leaveOut`
 * drops what may not be chosen, as Move drops the category's own branch.
 */
export function CategorySelect({
  categories,
  leaveOut,
  ...field
}: Omit<ComponentProps<typeof SelectField>, 'children'> & {
  categories: readonly ProductCategory[];
  leaveOut?: ReadonlySet<string> | null;
}) {
  return (
    <SelectField {...field}>
      {categoryPlaces(categories)
        .filter((place) => !leaveOut?.has(place.id))
        .map((place) => (
          <MenuItem
            key={place.id}
            value={place.id}
            sx={{ pl: 2 + place.depth * 2 }}
          >
            {place.name}
          </MenuItem>
        ))}
    </SelectField>
  );
}
