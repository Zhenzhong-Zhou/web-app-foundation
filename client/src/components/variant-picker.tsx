import { Autocomplete, TextField } from '@mui/material';

import { itemName } from '../lib/format';
import type { VariantOption } from '../lib/types';

/** "WIDGET-1 — Widget (Large)": the SKU first, because it is what people type. */
function labelFor(option: VariantOption): string {
  return `${option.sku} — ${itemName(option.productName, option.variantName)}`;
}

/**
 * Choosing a variant by typing rather than scrolling.
 *
 * A select is fine at ten options and unusable at fifty: the list runs off
 * the screen and the only way to find a SKU is to read every row. Autocomplete
 * filters on the whole label, so either the SKU or the product name finds it.
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
  value,
  onChange,
  required = false,
  disabled = false,
  helperText,
}: {
  id: string;
  label: string;
  options: VariantOption[];
  value: string;
  onChange: (variantId: string) => void;
  required?: boolean;
  disabled?: boolean;
  helperText?: string;
}) {
  const selected = options.find((option) => option.id === value) ?? null;

  return (
    <Autocomplete
      id={id}
      options={options}
      value={selected}
      onChange={(_event, option) => onChange(option?.id ?? '')}
      getOptionLabel={labelFor}
      isOptionEqualToValue={(option, current) => option.id === current.id}
      disabled={disabled}
      fullWidth
      noOptionsText="No matching items"
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
