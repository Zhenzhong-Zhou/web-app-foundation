import { Autocomplete, TextField } from '@mui/material';
import { useIntl } from 'react-intl';

import type { Partner } from '../api/types.gen';
import { nameAndCode } from '../lib/format';
import { usePickerSearch } from '../lib/use-picker-search';

/**
 * The empty choice's row, one object for every render: Autocomplete reads a
 * new value object as a new choice, and would put its label back over what
 * is being typed.
 */
const NONE = { id: '', none: true } as const;

type Choice = Partner | typeof NONE;

/**
 * Choosing a partner by typing, behind every partner picker: New order's
 * Partner, a sample's Given to and Plan run's contract manufacturer
 * (ADR-056, amended).
 *
 * Before anything is typed, it lists `options`, the partners as the form
 * offers them. From the first character it asks `GET /partners?search=`
 * (usePickerSearch): a partner by its name, accents and punctuation aside
 * and by pinyin, its code and its tax ID, best match first. While it asks,
 * or while `loading`, it says it is loading, in the popup's status, which a
 * screen reader hears; "No matching partners" comes only from an answer.
 *
 * `none` names the empty choice in words (#274), as Plan run's "We make it
 * ourselves": a row of its own, first whatever is typed, and the field's
 * value while no partner is chosen, never a placeholder. While the picker
 * waits it is not listed, since MUI says it is loading only in an empty
 * list.
 *
 * Takes and reports an id, '' for none, as VariantPicker does.
 */
export function PartnerPicker({
  id,
  label,
  options,
  loading = false,
  none,
  value,
  onChange,
  required = false,
  disabled = false,
  helperText,
}: {
  id: string;
  label: string;
  options: Partner[];
  /** The partners have not come back yet. */
  loading?: boolean;
  /** The empty choice's words, when the form offers one. */
  none?: string;
  value: string;
  onChange: (partnerId: string) => void;
  required?: boolean;
  disabled?: boolean;
  helperText?: string;
}) {
  const intl = useIntl();
  const { shown, waiting, autocomplete } = usePickerSearch<Partner, Choice>(
    '/partners',
    options,
    {
      loading,
      noMatches: intl.formatMessage({
        id: 'components.partnerPicker.noMatches',
        defaultMessage: 'No matching partners',
      }),
      failed: intl.formatMessage({
        id: 'components.partnerPicker.failed',
        defaultMessage: 'Could not load the partners.',
      }),
    },
  );
  const selected: Choice | null =
    options.find((option) => option.id === value) ??
    (value === '' && none !== undefined ? NONE : null);
  const listed: Choice[] = waiting
    ? []
    : none !== undefined
      ? [NONE, ...shown]
      : shown;

  return (
    <Autocomplete
      {...autocomplete}
      id={id}
      options={listed}
      value={selected}
      onChange={(_event, choice) => onChange(choice?.id ?? '')}
      getOptionLabel={(choice) =>
        'none' in choice ? (none ?? '') : nameAndCode(choice.name, choice.code)
      }
      isOptionEqualToValue={(choice, current) => choice.id === current.id}
      disabled={disabled}
      fullWidth
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          required={required}
          helperText={helperText}
        />
      )}
    />
  );
}
