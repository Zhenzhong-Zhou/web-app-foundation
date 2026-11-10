import { MenuItem, TextField, type TextFieldProps } from '@mui/material';
import type { ReactNode } from 'react';

/**
 * A select whose empty choice is named in words, "Everywhere", "All
 * categories", "None (Uncategorised)", and shows them in its box when it
 * is the one chosen (#274; the design language's "A field with a known set
 * of values"). MUI's select leaves the empty value blank under its label
 * unless asked, which reads as nothing chosen rather than as a choice.
 *
 * `value` is `''` for the empty choice, which comes first in the list;
 * `children` are the other choices, each a `MenuItem` with its value. The
 * rest is a TextField's: the label, the help under it, its size.
 *
 * Items' category and type use it; the app's other selects move to it as
 * their screens are next changed (ADR-092).
 */
export function SelectField({
  emptyLabel,
  renderValue,
  children,
  ...field
}: Omit<TextFieldProps, 'select' | 'children' | 'slotProps'> & {
  /** The empty choice, in words. */
  emptyLabel: string;
  /**
   * What the box shows for a value, where the chosen option holds more
   * than its name, as a count beside it; the empty one is `emptyLabel`.
   */
  renderValue?: (value: string) => ReactNode;
  children: ReactNode;
}) {
  return (
    <TextField
      {...field}
      select
      slotProps={{
        select: {
          displayEmpty: true,
          ...(renderValue && {
            renderValue: (value: unknown) =>
              value === '' ? emptyLabel : renderValue(String(value)),
          }),
        },
        inputLabel: { shrink: true },
      }}
    >
      <MenuItem value="">{emptyLabel}</MenuItem>
      {children}
    </TextField>
  );
}
