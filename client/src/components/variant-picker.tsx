import { Autocomplete, TextField } from '@mui/material';
import { useIntl } from 'react-intl';

import type { VariantOption } from '../api/types.gen';
import { itemName } from '../lib/format';
import { usePickerSearch } from '../lib/use-picker-search';

/** "WIDGET-1 — Widget (Large)": the SKU first, because it is what people type. */
function labelFor(option: VariantOption): string {
  return `${option.sku} — ${itemName(option.productName, option.variantName)}`;
}

/** The options as given: the server has matched and ordered them. */
const asAnswered = (options: VariantOption[]) => options;

/**
 * Choosing a variant by typing rather than scrolling, behind every item
 * picker (ADR-056, amended).
 *
 * A select is fine at ten options and unusable at fifty: the list runs off
 * the screen and the only way to find a SKU is to read every row. Before
 * anything is typed, it lists `options`, the catalogue as the form offers it
 * (useVariants). From the first character it asks
 * `GET /products/variants?search=` (usePickerSearch): an item by its SKU,
 * its names in every language and their pinyin, best match first.
 * While it asks, or while `loading`, it says it is loading, in the popup's
 * status, which a screen reader hears; "No matching items" comes only from
 * an answer.
 *
 * Takes and reports an id, not the option, so the forms using it keep the
 * `variantId: string` they already submit and reset. A value missing from
 * `options` — the catalogue still loading, or a variant filtered out — shows
 * as empty rather than as a raw id.
 *
 * `required` reaches the native input, so the browser refuses an empty submit
 * exactly as it did for the select.
 */
export function VariantPicker({
  id,
  label,
  options,
  loading = false,
  value,
  onChange,
  required = false,
  disabled = false,
  helperText,
}: {
  id: string;
  label: string;
  options: VariantOption[];
  /** The catalogue has not come back yet (useVariants' `answered`). */
  loading?: boolean;
  value: string;
  onChange: (variantId: string) => void;
  required?: boolean;
  disabled?: boolean;
  helperText?: string;
}) {
  const intl = useIntl();
  const selected = options.find((option) => option.id === value) ?? null;
  const { shown, asking, failed, onInputChange } = usePickerSearch(
    '/products/variants',
    options,
  );

  return (
    <Autocomplete
      id={id}
      options={shown}
      filterOptions={asAnswered}
      value={selected}
      onChange={(_event, option) => onChange(option?.id ?? '')}
      onInputChange={onInputChange}
      getOptionLabel={labelFor}
      isOptionEqualToValue={(option, current) => option.id === current.id}
      disabled={disabled}
      fullWidth
      loading={loading || asking}
      loadingText={intl.formatMessage({
        id: 'common.loading',
        defaultMessage: 'Loading…',
      })}
      noOptionsText={
        failed
          ? intl.formatMessage({
              id: 'inventory.catalogueFailed',
              defaultMessage: 'Could not load the catalogue.',
            })
          : intl.formatMessage({
              id: 'components.variantPicker.noMatches',
              defaultMessage: 'No matching items',
            })
      }
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
