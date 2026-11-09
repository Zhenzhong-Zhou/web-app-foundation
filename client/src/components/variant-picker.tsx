import { Autocomplete, Box, TextField, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';

import type { VariantOption } from '../api/types.gen';
import { itemName } from '../lib/format';
import { usePickerSearch } from '../lib/use-picker-search';
import {
  PRODUCT_TYPES,
  type ProductType,
  productTypeLabel,
} from '../products/product-types';

/** "WIDGET-1 — Widget (Large)": the SKU first, because it is what people type. */
function labelFor(option: VariantOption): string {
  return `${option.sku} — ${itemName(option.productName, option.variantName)}`;
}

/** What an item is picked for, which decides the types listed first. */
export type PickerTask = 'sale' | 'purchase' | 'recipe' | 'run';

/**
 * The types each task uses, listed first, each under its name, in this
 * order, and every other item after them under Other items, still there
 * to choose: a surplus raw material may be sold (ADR-092). A purchase puts
 * none first, since a wholesaler buys products too: every type under its
 * name, in Items' tabs' order. So does a picker given no task, a receipt,
 * a reorder point or Movements' filter.
 */
const TYPES_FIRST: Record<PickerTask, readonly ProductType[] | null> = {
  sale: ['good', 'sample'],
  purchase: null,
  recipe: ['material', 'packaging'],
  run: ['good'],
};

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
 * an answer. A catalogue that failed to load (`failed`) says so in the list
 * instead, never that nothing matches (#303).
 *
 * Takes and reports an id, not the option, so the forms using it keep the
 * `variantId: string` they already submit and reset. A value missing from
 * `options` — the catalogue still loading, or a variant filtered out — shows
 * as empty rather than as a raw id.
 *
 * `required` reaches the native input, so the browser refuses an empty submit
 * exactly as it did for the select.
 *
 * Each option is translate="no", so a browser translating the page leaves
 * the SKU and names as typed (#245); the chosen one is the input's value,
 * which no browser translates. Its type, beside it, is the app's own word.
 *
 * Grouped by type, the `task`'s types first (TYPES_FIRST), each group in
 * the order it was given: the catalogue's before anything is typed, the
 * server's rank while a search is (ADR-092). The theme's renderGroup makes
 * each heading name its group for a screen reader (option-group.tsx).
 */
export function VariantPicker({
  id,
  label,
  options,
  loading = false,
  failed = false,
  value,
  onChange,
  required = false,
  disabled = false,
  helperText,
  error = false,
  autoFocus = false,
  task,
}: {
  id: string;
  label: string;
  options: VariantOption[];
  /** The catalogue has not come back yet (useVariants' `answered`). */
  loading?: boolean;
  /** The catalogue's read failed (useVariants' `failed`). */
  failed?: boolean;
  value: string;
  onChange: (variantId: string) => void;
  required?: boolean;
  disabled?: boolean;
  /** Said under it, and read with it (`aria-describedby`). */
  helperText?: ReactNode;
  /** A refusal of what was picked, said in `helperText` (WCAG 3.3.1). */
  error?: boolean;
  /** The dialog's first field, where typing starts once it opens (#313). */
  autoFocus?: boolean;
  /** What the item is for; none groups every type, none first. */
  task?: PickerTask;
}) {
  const intl = useIntl();
  const selected = options.find((option) => option.id === value) ?? null;
  const catalogueFailed = intl.formatMessage({
    id: 'inventory.catalogueFailed',
    defaultMessage: 'Could not load the catalogue.',
  });
  const { shown, autocomplete } = usePickerSearch(
    '/products/variants',
    options,
    {
      loading,
      noMatches: intl.formatMessage({
        id: 'components.variantPicker.noMatches',
        defaultMessage: 'No matching items',
      }),
      failed: catalogueFailed,
    },
  );

  const types: readonly string[] = (task && TYPES_FIRST[task]) ?? PRODUCT_TYPES;
  // A type this client does not know is with Other items.
  const groupOf = (option: VariantOption) => {
    const at = types.indexOf(option.type);
    return at === -1 ? types.length : at;
  };
  const otherItems = intl.formatMessage({
    id: 'components.variantPicker.otherItems',
    defaultMessage: 'Other items',
  });
  // A stable sort, so each group keeps the order it was given.
  const grouped = [...shown].sort((a, b) => groupOf(a) - groupOf(b));

  return (
    <Autocomplete
      {...autocomplete}
      noOptionsText={failed ? catalogueFailed : autocomplete.noOptionsText}
      id={id}
      options={grouped}
      groupBy={(option) => {
        const at = groupOf(option);
        return at < types.length
          ? productTypeLabel(types[at], intl)
          : otherItems;
      }}
      value={selected}
      onChange={(_event, option) => onChange(option?.id ?? '')}
      getOptionLabel={labelFor}
      // The type at the end of the row, or under the item where a narrow
      // field leaves no room beside it, as on a phone's order line. Two
      // blocks, so a screen reader reads a space between them.
      renderOption={({ key, ...props }, option) => (
        <Box
          component="li"
          key={key}
          {...props}
          translate="no"
          sx={{ flexWrap: 'wrap', columnGap: 2 }}
        >
          <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>{labelFor(option)}</Box>
          <Typography
            component="div"
            variant="body2"
            translate="yes"
            sx={{ color: 'text.secondary' }}
          >
            {productTypeLabel(option.type, intl)}
          </Typography>
        </Box>
      )}
      isOptionEqualToValue={(option, current) => option.id === current.id}
      disabled={disabled}
      fullWidth
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          required={required}
          helperText={helperText}
          error={error}
          autoFocus={autoFocus}
        />
      )}
    />
  );
}
