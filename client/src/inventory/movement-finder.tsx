import { Autocomplete, Box, TextField } from '@mui/material';
import { useIntl } from 'react-intl';

import type { LookupResult, VariantOption } from '../api/types.gen';
import type { OrderStatus } from '../lib/api-names';
import { itemName } from '../lib/format';
import { fulfillmentLabel, orderStatusLabel } from '../orders/status';
import { KIND_LABELS } from '../search/lookup-kinds';
import { lookupLongEnough } from '../search/lookup-minimum';
import { useLookup } from '../search/use-lookup';
import { rem } from '../theme/rem';
import { lotExpiryPart } from './lot-expiry';

/** The kinds Movements filters by; never a run or a return (126). */
const FINDS = ['item', 'lot', 'order'] as const;
type Find = (typeof FINDS)[number];

interface Option {
  kind: Find;
  result: LookupResult;
}

/** What a choice writes to the address, by 95a's keys. */
export type FoundFilter =
  { variantId: string; lotId: string } | { orderId: string };

const SEPARATOR = ' · ';

/**
 * What to offer of the lookup's items, lots and orders (126's polish): a
 * lot whose code, supplier's lot or the former code it was found by is
 * the whole text typed, alone, as MCS-001 is though MCS-0010 starts with
 * it (ADR-094, R6; amended, R10, F3); else the exact
 * matches alone while any match; else the close ones, a typo's
 * (`close`), which the box heads Close matches. The top bar's search
 * shows them all, its own way.
 */
function offered(options: Option[], query: string): Option[] {
  // Full width read as usual, as the lookup reads it: ＭＣＳ－００１.
  const typed = query.normalize('NFKC').trim().toLowerCase();
  const exact = options.filter(({ result }) => !result.close);
  const whole = exact.find(
    ({ kind, result }) =>
      kind === 'lot' &&
      [result.title, result.supplierLot, result.formerCode].some(
        (code) => code?.toLowerCase() === typed,
      ),
  );
  return whole ? [whole] : exact.length > 0 ? exact : options;
}

/**
 * Movements' Item field as one find box (126): as one types, the top
 * bar's lookup (useLookup, `GET /v1/lookup`, its kinds by the reader's
 * permissions) offers matching items, lots and orders, grouped and in
 * words, the exact first (offered); a lot by its code or its supplier's
 * lot (ADR-094, R6). An item sets the Item filter; a lot its item and
 * the lot, so the stock card counts that lot (85a); an order the order.
 * Each shows as a chip under the row, the box emptied; typed text alone
 * never filters.
 *
 * Arrows, Enter and Escape as the top bar's search. A lot's item is the
 * one its SKU names among `variants`, the page's list.
 */
export function MovementFinder({
  id,
  variants,
  onFind,
}: {
  id: string;
  variants: VariantOption[];
  onFind: (filter: FoundFilter) => void;
}) {
  const intl = useIntl();
  const lookup = useLookup();
  const { text, answer, loading } = lookup;
  const options = offered(
    (answer?.groups ?? []).flatMap(({ kind, results }) =>
      (FINDS as readonly string[]).includes(kind)
        ? results.map((result) => ({ kind: kind as Find, result }))
        : [],
    ),
    answer?.query ?? '',
  );
  const itemOf = (sku: string | null) =>
    variants.find((variant) => variant.sku === sku) ?? null;

  /** An option in words, as 126 writes them. */
  function words({ kind, result }: Option): string {
    if (kind === 'item') {
      return [result.title, result.detail].filter(Boolean).join(SEPARATOR);
    }
    if (kind === 'lot') {
      const item = itemOf(result.detail);
      return [
        intl.formatMessage(
          { id: 'inventory.movements.findLot', defaultMessage: 'Lot {code}' },
          { code: result.title },
        ),
        // Which finds it as its code does (ADR-094, R6).
        result.supplierLot &&
          intl.formatMessage(
            {
              id: 'inventory.movements.findSupplierLot',
              defaultMessage: 'supplier’s lot {code}',
            },
            { code: result.supplierLot },
          ),
        item ? itemName(item.productName, item.variantName) : result.detail,
        // Its expiry, or "expiry to add" while it is not known (ADR-094,
        // D2); nothing for one that does not expire.
        lotExpiryPart(result, intl),
      ]
        .filter(Boolean)
        .join(SEPARATOR);
    }
    const direction = result.direction ?? 'purchase';
    const state = result.fulfillment
      ? fulfillmentLabel(result.fulfillment, direction)
      : result.status
        ? orderStatusLabel(result.status as OrderStatus, direction)
        : null;
    return [result.title, result.detail, state].filter(Boolean).join(SEPARATOR);
  }

  function choose({ kind, result }: Option) {
    lookup.clear();
    if (kind === 'order') onFind({ orderId: result.id });
    else if (kind === 'item') onFind({ variantId: result.id, lotId: '' });
    else
      onFind({ variantId: itemOf(result.detail)?.id ?? '', lotId: result.id });
  }

  const label = intl.formatMessage({
    id: 'inventory.movements.find',
    defaultMessage: 'Find an item, lot or order',
  });

  return (
    <Box sx={{ flex: `1 1 ${rem(260)}`, minWidth: rem(220) }}>
      <Autocomplete<Option, false, false, false>
        id={id}
        options={options}
        groupBy={(option) =>
          option.result.close
            ? intl.formatMessage({
                id: 'inventory.movements.closeMatches',
                defaultMessage: 'Close matches',
              })
            : intl.formatMessage(KIND_LABELS[option.kind])
        }
        getOptionLabel={words}
        getOptionKey={(option) => `${option.kind}:${option.result.id}`}
        // The server has matched and ranked them; nothing to filter here.
        filterOptions={(all) => all}
        value={null}
        inputValue={text}
        onInputChange={(_event, value, reason) => {
          if (reason !== 'reset') lookup.type(value);
        }}
        onChange={(_event, option) => {
          if (option) choose(option);
        }}
        loading={loading}
        autoHighlight
        size="small"
        noOptionsText={
          lookupLongEnough(text)
            ? intl.formatMessage({
                id: 'search.nothing',
                defaultMessage: 'Nothing found.',
              })
            : intl.formatMessage({
                id: 'search.typeMore',
                defaultMessage:
                  'Type at least two characters, or one Chinese character.',
              })
        }
        loadingText={intl.formatMessage({
          id: 'search.loading',
          defaultMessage: 'Searching…',
        })}
        renderInput={(params) => <TextField {...params} label={label} />}
      />
    </Box>
  );
}
