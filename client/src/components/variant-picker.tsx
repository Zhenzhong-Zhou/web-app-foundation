import { Autocomplete, TextField } from '@mui/material';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';

import type { VariantOption } from '../api/types.gen';
import { api } from '../lib/api';
import { itemName } from '../lib/format';
import { withSearch } from '../lib/use-list-search';

/** As a list waits for typing to stop (useListSearch). */
const WAIT_MS = 300;

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
 * (useVariants). From the first character, as a list does, it asks
 * `GET /products/variants?search=` a moment after typing stops, and shows
 * the answer in the server's order: an item by its SKU, its names in every
 * language and their pinyin, best match first. Nothing is matched here.
 *
 * The answer is kept to `options`, so what a form leaves out (a variant
 * already on the order) stays out, and every item shown is one the form can
 * read the unit of. An answer that comes after a newer search is dropped.
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

  // What was typed, not the label MUI writes back on a choice or a blur.
  const [typed, setTyped] = useState('');
  const search = typed.trim();
  // The last answer, with the search it answers; null ids for a failure.
  const [found, setFound] = useState<{
    search: string;
    ids: string[] | null;
  } | null>(null);

  useEffect(() => {
    if (!search) return;

    let ignore = false;
    const timer = setTimeout(() => {
      void api<VariantOption[]>(withSearch('/products/variants', search))
        .then((rows) => {
          if (!ignore) setFound({ search, ids: rows.map((row) => row.id) });
        })
        .catch(() => {
          if (!ignore) setFound({ search, ids: null });
        });
    }, WAIT_MS);

    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [search]);

  const answer = search && found?.search === search ? found : null;
  const offered = new Map(options.map((option) => [option.id, option]));
  const shown = !search
    ? options
    : (answer?.ids ?? []).flatMap((variantId) => offered.get(variantId) ?? []);

  return (
    <Autocomplete
      id={id}
      options={shown}
      filterOptions={asAnswered}
      value={selected}
      onChange={(_event, option) => onChange(option?.id ?? '')}
      onInputChange={(_event, text, reason) =>
        setTyped(reason === 'input' ? text : '')
      }
      getOptionLabel={labelFor}
      isOptionEqualToValue={(option, current) => option.id === current.id}
      disabled={disabled}
      fullWidth
      loading={loading || (search !== '' && answer === null)}
      loadingText={intl.formatMessage({
        id: 'common.loading',
        defaultMessage: 'Loading…',
      })}
      noOptionsText={
        answer?.ids === null
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
