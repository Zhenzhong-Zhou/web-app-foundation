import SearchIcon from '@mui/icons-material/Search';
import {
  Autocomplete,
  Box,
  Button,
  Dialog,
  InputAdornment,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useIntl } from 'react-intl';
import { useNavigate } from 'react-router-dom';

import type { LookupGroup, LookupResult } from '../api/types.gen';
import { ExpiryChip } from '../components/expiry-chip';
import { ProductCover } from '../components/product-cover';
import { OPEN_LOOKUP } from '../errors/open-lookup';
import { lotExpiry } from '../inventory/lot-expiry';
import { BarButton } from '../layout/bar-button';
import { api } from '../lib/api';
import type { LookupKind } from '../lib/api-names';
import { SEPARATOR } from '../lib/format';
import { OFFER_BACK } from '../lib/offer-back';
import { openDialog } from '../lib/open-dialog';
import { RECENT_PATHS, type RecentEntry } from '../lib/recent';
import { RECENT_KIND_LABELS, recentTitle } from '../lib/recent-labels';
import { useExpiryStatus } from '../lib/use-expiry-status';
import { productTypeIcon, typeAfter } from '../products/product-types';
import { rem } from '../theme/rem';
import { KIND_LABELS, LIST_LABELS, listOf, pathOf } from './lookup-kinds';
import { lookupLongEnough } from './lookup-minimum';
import { useLookup } from './use-lookup';

/** One row in the list: a record, a group's "Show all", or one recently
 * opened, offered before anything is typed (ADR-058). */
type Option =
  | { type: 'result'; kind: LookupKind; result: LookupResult }
  | { type: 'all'; kind: LookupKind; to: string }
  | { type: 'recent'; entry: RecentEntry };

/** The search's recently opened, before typing (ADR-058). */
const RECENT_IN_SEARCH = 5;

/**
 * The top bar's lookup (ADR-056): type a lot code, a number, a SKU or a
 * name, and go to the record. A combobox: results under the box grouped by
 * kind, arrow keys move, Enter opens, Escape closes. `/` or ⌘K / Ctrl+K
 * focuses it from anywhere but a field being typed in.
 *
 * Asks after a pause in typing, and drops an answer that arrives after a
 * newer question, so the list never shows results for old text. From the
 * `md` width the box sits in the bar; below it, a search button opens it
 * full screen, its list filling the screen under the field.
 */
export function LookupBox() {
  const theme = useTheme();
  // noSsr: this app renders in the browser only, so the width is known on
  // the first render, and the bar never draws the button and then the box.
  const inline = useMediaQuery(theme.breakpoints.up('md'), { noSsr: true });
  const intl = useIntl();
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // Where the full-screen search's field ends, its gutter below included:
  // the list fills the screen from there, rather than MUI's 40% of it,
  // which left a group's Show all under its edge (#312).
  const [fieldEnd, setFieldEnd] = useState(0);
  const measure = useCallback((node: HTMLElement | null) => {
    if (node) setFieldEnd(node.getBoundingClientRect().bottom);
  }, []);

  // `/` and ⌘K / Ctrl+K, unless the person is typing somewhere.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '');
      const shortcut =
        (event.key === '/' && !typing) ||
        // Chrome's autofill sends a keydown with no key at all.
        ((event.key as string | undefined)?.toLowerCase() === 'k' &&
          (event.metaKey || event.ctrlKey));
      if (!shortcut) return;
      event.preventDefault();
      if (inline) input.current?.focus();
      else setOpen(true);
    }
    // A status page's "Search everything" opens it the same way.
    function onOpen() {
      if (inline) input.current?.focus();
      else setOpen(true);
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_LOOKUP, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_LOOKUP, onOpen);
    };
  }, [inline]);

  const label = intl.formatMessage({
    id: 'search.label',
    defaultMessage: 'Search everything',
  });

  if (inline) {
    return (
      <Box sx={{ width: '100%', maxWidth: rem(420) }}>
        <LookupField inputRef={input} />
      </Box>
    );
  }

  return (
    <>
      <BarButton
        aria-label={label}
        word={intl.formatMessage({
          id: 'layout.bar.search',
          defaultMessage: 'Search',
        })}
        icon={<SearchIcon />}
        onClick={openDialog(() => setOpen(true))}
      />
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullScreen
        aria-label={label}
        // The lookup, not a dialog to the person: no amber line (ADR-081).
        slotProps={{ paper: { component: 'div' } }}
      >
        {/* Close beside the field: a phone or a tablet has no Escape, and
            the sheet covers the whole screen (#480). */}
        <Stack
          ref={measure}
          direction="row"
          spacing={1}
          sx={{ p: 2, alignItems: 'center' }}
        >
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <LookupField
              autoFocus
              onDone={() => setOpen(false)}
              listHeight={`calc(100dvh - ${fieldEnd}px)`}
            />
          </Box>
          {/* Its own name: the list's arrow is also "Close" while open. */}
          <Button
            onClick={() => setOpen(false)}
            aria-label={intl.formatMessage({
              id: 'search.closeSheet',
              defaultMessage: 'Close search',
            })}
          >
            {intl.formatMessage({
              id: 'common.close',
              defaultMessage: 'Close',
            })}
          </Button>
        </Stack>
      </Dialog>
    </>
  );
}

function LookupField({
  inputRef,
  autoFocus,
  onDone,
  listHeight,
}: {
  inputRef?: React.Ref<HTMLInputElement>;
  autoFocus?: boolean;
  onDone?: () => void;
  /** The list's greatest height, when not MUI's 40% of the screen. */
  listHeight?: string;
}) {
  const intl = useIntl();
  const navigate = useNavigate();
  const lookup = useLookup();
  const { text, answer, loading } = lookup;
  const options = answer ? optionsOf(answer.groups, answer.query) : [];
  const [recent, setRecent] = useState<Option[]>([]);

  // Before anything is typed, the last records opened: `/` then Enter
  // reopens the last one. Read each time the field is focused, so it is
  // as fresh as the last page opened.
  function loadRecent() {
    api<{ recent: RecentEntry[] }>(`/recent?limit=${RECENT_IN_SEARCH}`)
      .then((response) =>
        setRecent(
          response.recent.map((entry) => ({ type: 'recent', entry }) as Option),
        ),
      )
      .catch(() => setRecent([]));
  }

  // Read once when the box appears too, so the list is ready to open on
  // the first focus rather than after it.
  useEffect(() => {
    loadRecent();
  }, []);

  function go(option: Option) {
    navigate(
      option.type === 'recent'
        ? RECENT_PATHS[option.entry.kind](option.entry.id)
        : option.type === 'all'
          ? option.to
          : pathOf(option.kind, option.result),
      // Back returns to where the search was typed (#341).
      { state: OFFER_BACK },
    );
    lookup.clear();
    onDone?.();
  }

  const short = !lookupLongEnough(text);
  const empty = text.trim() === '';

  return (
    <Autocomplete<Option, false, false, false>
      options={empty ? recent : options}
      groupBy={(option) =>
        option.type === 'recent'
          ? intl.formatMessage({
              id: 'recent.title',
              defaultMessage: 'Recently opened',
            })
          : intl.formatMessage(KIND_LABELS[option.kind])
      }
      getOptionLabel={(option) =>
        option.type === 'recent'
          ? (option.entry.title ?? '')
          : option.type === 'result'
            ? option.result.title
            : option.to
      }
      // The server has matched and ranked them; nothing to filter here.
      filterOptions={(all) => all}
      isOptionEqualToValue={(a, b) => a === b}
      value={null}
      inputValue={text}
      onInputChange={(_event, value, reason) => {
        if (reason === 'reset') return;
        lookup.type(value);
      }}
      onChange={(_event, option) => {
        if (option) go(option);
      }}
      loading={loading}
      slotProps={{ listbox: { sx: { maxHeight: listHeight } } }}
      autoHighlight
      // Opens on focus only to offer what was recently opened.
      openOnFocus={recent.length > 0}
      onFocus={loadRecent}
      noOptionsText={
        short
          ? intl.formatMessage({
              id: 'search.typeMore',
              defaultMessage:
                'Type at least two characters, or one Chinese character.',
            })
          : intl.formatMessage({
              id: 'search.nothing',
              defaultMessage: 'Nothing found.',
            })
      }
      loadingText={intl.formatMessage({
        id: 'search.loading',
        defaultMessage: 'Searching…',
      })}
      renderOption={({ key, ...props }, option) => (
        <li key={key} {...props}>
          {option.type === 'recent' ? (
            <RecentOption entry={option.entry} />
          ) : option.type === 'all' ? (
            <Typography variant="body2" color="primary">
              {intl.formatMessage(
                {
                  id: 'search.showAll',
                  defaultMessage: 'Show all in {list}',
                },
                { list: intl.formatMessage(LIST_LABELS[option.kind]) },
              )}
            </Typography>
          ) : (
            <Stack
              direction="row"
              spacing={1.5}
              sx={{ alignItems: 'center', minWidth: 0, width: '100%' }}
            >
              {/* An item shows its product's cover, or its type's icon, as
                Items does, so items line up either way (ADR-066, #546). */}
              {option.kind === 'item' && (
                <ProductCover
                  fileId={option.result.coverFileId}
                  name={option.result.title}
                  icon={
                    option.result.type
                      ? productTypeIcon(option.result.type)
                      : undefined
                  }
                  size={32}
                />
              )}
              <Stack sx={{ minWidth: 0, width: '100%' }}>
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: 'center', minWidth: 0 }}
                >
                  <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                    {option.result.title}
                  </Typography>
                  {option.result.close && (
                    <Typography
                      variant="caption"
                      sx={{ color: 'text.secondary' }}
                    >
                      {intl.formatMessage({
                        id: 'search.close',
                        defaultMessage: 'close match',
                      })}
                    </Typography>
                  )}
                </Stack>
                {option.kind === 'lot' ? (
                  <LotLine result={option.result} />
                ) : (
                  option.result.detail && (
                    <Typography
                      variant="body2"
                      noWrap
                      sx={{ color: 'text.secondary' }}
                    >
                      {/* An item's code, and its type as a word beside its
                        icon, since Items holds every type (#548). */}
                      {option.result.detail}
                      {option.result.type &&
                        typeAfter(option.result.type, intl)}
                    </Typography>
                  )
                )}
              </Stack>
            </Stack>
          )}
        </li>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          inputRef={inputRef}
          autoFocus={autoFocus}
          size="small"
          placeholder={intl.formatMessage({
            id: 'search.placeholder',
            defaultMessage: 'Search orders, lots, items, partners…',
          })}
          slotProps={{
            ...params.slotProps,
            htmlInput: {
              ...params.slotProps.htmlInput,
              'aria-label': intl.formatMessage({
                id: 'search.label',
                defaultMessage: 'Search everything',
              }),
            },
            input: {
              ...params.slotProps.input,
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
      )}
    />
  );
}

/**
 * The answer as rows: each group's records, then its "Show all" when one of
 * them is not a close match. Close matches are the lookup's alone
 * (ADR-056), so a list opened for them alone would find nothing (#311).
 */
function optionsOf(groups: LookupGroup[], query: string): Option[] {
  return groups.flatMap(({ kind, results }) => {
    const rows: Option[] = results.map((result) => ({
      type: 'result',
      kind,
      result,
    }));
    const to = listOf(kind, query);
    const listed = results.some((result) => !result.close);
    return to && listed ? [...rows, { type: 'all', kind, to }] : rows;
  });
}

/**
 * A lot's second line (#618; ADR-094, R5, R6 and R9): its item's code,
 * then its expiry with its label, "Expires Nov 19, 2028", or the chip that
 * says how near it is, or "Expiry to add" while it is not known; then its
 * supplier's lot, which finds it too, or "Supplier's lot to add" for a
 * code made here with none. A lot that does not expire says nothing of
 * it, as before. The parts are dotted apart and wrap between them, so
 * none runs into the one before it.
 */
function LotLine({ result }: { result: LookupResult }) {
  const intl = useIntl();
  const near = useExpiryStatus(result.expiresAt);

  const parts: { key: string; part: ReactNode }[] = [];
  if (result.detail) parts.push({ key: 'sku', part: result.detail });
  if (result.expiry === 'unknown') {
    parts.push({
      key: 'expiry',
      part: intl.formatMessage({
        id: 'inventory.lot.expiryToAdd',
        defaultMessage: 'Expiry to add',
      }),
    });
  } else if (result.expiresAt) {
    parts.push({
      key: 'expiry',
      part: near ? (
        <ExpiryChip expiresAt={result.expiresAt} />
      ) : (
        lotExpiry(result, intl)
      ),
    });
  }
  if (result.supplierLot) {
    parts.push({
      key: 'supplierLot',
      part: intl.formatMessage(
        {
          id: 'inventory.lot.supplierLotIs',
          defaultMessage: 'Supplier’s lot {code}',
        },
        { code: result.supplierLot },
      ),
    });
  } else if (result.isAssigned) {
    parts.push({
      key: 'supplierLot',
      part: intl.formatMessage({
        id: 'inventory.lot.supplierLotToAdd',
        defaultMessage: 'Supplier’s lot to add',
      }),
    });
  }

  return (
    <Typography
      component="div"
      variant="body2"
      sx={{ color: 'text.secondary' }}
    >
      {parts.map(({ key, part }, index) => (
        <Fragment key={key}>
          {index > 0 && SEPARATOR}
          <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
            {part}
          </Box>
        </Fragment>
      ))}
    </Typography>
  );
}

/** A recently opened record: its name, and what kind it is and when. */
function RecentOption({ entry }: { entry: RecentEntry }) {
  const intl = useIntl();
  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ justifyContent: 'space-between', width: '100%', minWidth: 0 }}
    >
      <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
        {recentTitle(intl, entry)}
        {entry.detail && (
          <Typography
            component="span"
            variant="body2"
            sx={{ color: 'text.secondary', fontWeight: 400, ml: 1 }}
          >
            {entry.detail}
          </Typography>
        )}
      </Typography>
      <Typography variant="caption" noWrap sx={{ color: 'text.secondary' }}>
        {intl.formatMessage(RECENT_KIND_LABELS[entry.kind])}
      </Typography>
    </Stack>
  );
}
