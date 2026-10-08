import SearchIcon from '@mui/icons-material/Search';
import {
  Autocomplete,
  Box,
  Dialog,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { useNavigate } from 'react-router-dom';

import { ExpiryChip } from '../components/expiry-chip';
import { OPEN_LOOKUP } from '../errors/open-lookup';
import { api } from '../lib/api';
import type { LookupKind, LookupResponse, LookupResult } from '../lib/types';
import { KIND_LABELS, listOf, pathOf } from './lookup-kinds';

/** The server's minimum, after trimming (ADR-056). */
const MIN_LENGTH = 2;
/** Waits this long after the last key before asking. */
const DELAY_MS = 200;

/** One row in the list: a record, or a group's "Show all". */
type Option =
  | { type: 'result'; kind: LookupKind; result: LookupResult }
  | { type: 'all'; kind: LookupKind; to: string };

/**
 * The top bar's lookup (ADR-056): type a lot code, a number, a SKU or a
 * name, and go to the record. A combobox: results under the box grouped by
 * kind, arrow keys move, Enter opens, Escape closes. `/` or ⌘K / Ctrl+K
 * focuses it from anywhere but a field being typed in.
 *
 * Asks after a pause in typing, and drops an answer that arrives after a
 * newer question, so the list never shows results for old text. From the
 * `md` width the box sits in the bar; below it, a search button opens it
 * full width.
 */
export function LookupBox() {
  const theme = useTheme();
  // noSsr: this app renders in the browser only, so the width is known on
  // the first render, and the bar never draws the button and then the box.
  const inline = useMediaQuery(theme.breakpoints.up('md'), { noSsr: true });
  const intl = useIntl();
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // `/` and ⌘K / Ctrl+K, unless the person is typing somewhere.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '');
      const shortcut =
        (event.key === '/' && !typing) ||
        (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey));
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
      <Box sx={{ width: '100%', maxWidth: 420 }}>
        <LookupField inputRef={input} />
      </Box>
    );
  }

  return (
    <>
      <IconButton aria-label={label} onClick={() => setOpen(true)}>
        <SearchIcon />
      </IconButton>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullScreen
        aria-label={label}
      >
        <Box sx={{ p: 2 }}>
          <LookupField autoFocus onDone={() => setOpen(false)} />
        </Box>
      </Dialog>
    </>
  );
}

function LookupField({
  inputRef,
  autoFocus,
  onDone,
}: {
  inputRef?: React.Ref<HTMLInputElement>;
  autoFocus?: boolean;
  onDone?: () => void;
}) {
  const intl = useIntl();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const latest = useRef(0);

  // Fetches after the pause; the state that shows it is waiting, or that
  // the text is too short, is set where the typing happens (onInputChange).
  useEffect(() => {
    const query = text.trim();
    if (query.length < MIN_LENGTH) return;

    const asked = ++latest.current;
    const timer = setTimeout(() => {
      api<LookupResponse>(`/lookup?q=${encodeURIComponent(query)}`)
        .then((response) => {
          // An answer to an older question is dropped.
          if (asked !== latest.current) return;
          setOptions(optionsOf(response, query));
        })
        .catch(() => {
          if (asked === latest.current) setOptions([]);
        })
        .finally(() => {
          if (asked === latest.current) setLoading(false);
        });
    }, DELAY_MS);

    return () => clearTimeout(timer);
  }, [text]);

  function go(option: Option) {
    navigate(
      option.type === 'all' ? option.to : pathOf(option.kind, option.result),
    );
    latest.current += 1;
    setText('');
    setOptions([]);
    setLoading(false);
    onDone?.();
  }

  const short = text.trim().length < MIN_LENGTH;

  return (
    <Autocomplete<Option, false, false, false>
      options={options}
      groupBy={(option) => intl.formatMessage(KIND_LABELS[option.kind])}
      getOptionLabel={(option) =>
        option.type === 'result' ? option.result.title : option.to
      }
      // The server has matched and ranked them; nothing to filter here.
      filterOptions={(all) => all}
      isOptionEqualToValue={(a, b) => a === b}
      value={null}
      inputValue={text}
      onInputChange={(_event, value, reason) => {
        if (reason === 'reset') return;
        setText(value);
        const long = value.trim().length >= MIN_LENGTH;
        setLoading(long);
        if (!long) {
          // Too short to ask: forget any answer still on its way.
          latest.current += 1;
          setOptions([]);
        }
      }}
      onChange={(_event, option) => {
        if (option) go(option);
      }}
      loading={loading}
      autoHighlight
      openOnFocus={false}
      noOptionsText={
        short
          ? intl.formatMessage({
              id: 'search.typeMore',
              defaultMessage: 'Type at least two characters.',
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
          {option.type === 'all' ? (
            <Typography variant="body2" color="primary">
              {intl.formatMessage(
                {
                  id: 'search.showAll',
                  defaultMessage: 'Show all in {list}',
                },
                { list: intl.formatMessage(KIND_LABELS[option.kind]) },
              )}
            </Typography>
          ) : (
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
                  <Typography variant="caption" color="text.secondary">
                    {intl.formatMessage({
                      id: 'search.close',
                      defaultMessage: 'close match',
                    })}
                  </Typography>
                )}
              </Stack>
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: 'center', minWidth: 0 }}
              >
                {option.result.detail && (
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {option.result.detail}
                  </Typography>
                )}
                {option.result.expiresAt && (
                  <ExpiryChip expiresAt={option.result.expiresAt} />
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

/** The answer as rows: each group's records, then its "Show all". */
function optionsOf(response: LookupResponse, query: string): Option[] {
  return response.groups.flatMap(({ kind, results }) => {
    const rows: Option[] = results.map((result) => ({
      type: 'result',
      kind,
      result,
    }));
    const to = listOf(kind, query);
    return to ? [...rows, { type: 'all', kind, to }] : rows;
  });
}
