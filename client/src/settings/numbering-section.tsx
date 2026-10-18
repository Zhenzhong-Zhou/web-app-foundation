import TodayIcon from '@mui/icons-material/Today';
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Skeleton,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { type SubmitEvent, useId, useRef, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import type { Numbering } from '../api/types.gen';
import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { SettingsSection } from '../components/settings-section';
import { api, hasCode } from '../lib/api';
import type { NumberingReset } from '../lib/api-names';
import { formatDay, NO_VALUE } from '../lib/format';
import {
  commonFormats,
  couldPrintSame,
  DATE_TOKENS,
  formatNumber,
  lettersOf,
  nextPeriodStart,
  type NumberingFormat,
  type PrefixProblem,
  prefixProblem,
} from '../lib/numbering';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useResource } from '../lib/use-resource';
import { useSubmit } from '../lib/use-submit';
import { rem } from '../theme/rem';

const SERIES = [
  'invoice',
  'creditNote',
  'returnAuthorization',
  'saleOrder',
  'purchaseOrder',
] as const;

type SeriesKey = (typeof SERIES)[number];

/** The letters a common format keeps when a prefix starts otherwise. */
const LETTERS: Record<SeriesKey, string> = {
  invoice: 'INV',
  creditNote: 'CN',
  returnAuthorization: 'RMA',
  saleOrder: 'SO',
  purchaseOrder: 'PO',
};

const RESETS: NumberingReset[] = ['never', 'yearly', 'monthly', 'daily'];

const SECTION = defineMessages({
  title: { id: 'settings.numbering.title', defaultMessage: 'Numbering' },
  document: { id: 'settings.numbering.document', defaultMessage: 'Document' },
  startsAgain: {
    id: 'settings.numbering.startsAgain',
    defaultMessage: 'Starts again',
  },
});

const SERIES_NAME = defineMessages({
  invoice: { id: 'settings.numbering.invoice', defaultMessage: 'Invoices' },
  creditNote: {
    id: 'settings.numbering.creditNote',
    defaultMessage: 'Credit notes',
  },
  returnAuthorization: {
    id: 'settings.numbering.returnAuthorization',
    defaultMessage: 'Return authorizations',
  },
  saleOrder: {
    id: 'settings.numbering.saleOrder',
    defaultMessage: 'Sale orders',
  },
  purchaseOrder: {
    id: 'settings.numbering.purchaseOrder',
    defaultMessage: 'Purchase orders',
  },
});

const RESET_LABEL = defineMessages({
  never: { id: 'settings.numbering.reset.never', defaultMessage: 'Never' },
  yearly: {
    id: 'settings.numbering.reset.yearly',
    defaultMessage: 'Each year',
  },
  monthly: {
    id: 'settings.numbering.reset.monthly',
    defaultMessage: 'Each month',
  },
  daily: { id: 'settings.numbering.reset.daily', defaultMessage: 'Each day' },
});

const PROBLEM = defineMessages({
  characters: {
    id: 'settings.numbering.problem.characters',
    defaultMessage:
      'Capital letters, digits, -, _ and / only, and the date from the buttons.',
  },
  start: {
    id: 'settings.numbering.problem.start',
    defaultMessage: 'Start with a letter, a digit or the date.',
  },
  end: {
    id: 'settings.numbering.problem.end',
    defaultMessage:
      'End with a letter or a sign, never a digit or the date, so where the number begins is clear.',
  },
  doubleSlash: {
    id: 'settings.numbering.problem.doubleSlash',
    defaultMessage: 'No // in a prefix.',
  },
  repeated: {
    id: 'settings.numbering.problem.repeated',
    defaultMessage: 'Each part of the date at most once.',
  },
  tooLong: {
    id: 'settings.numbering.problem.tooLong',
    defaultMessage: 'At most 16 characters, printed.',
  },
  tooLongWithDigits: {
    id: 'settings.numbering.problem.tooLongWithDigits',
    defaultMessage: 'The prefix and its digits print at most 20 characters.',
  },
});

/** One series as the form holds it; `next` is null until it is typed. */
interface Draft {
  prefix: string;
  digits: string;
  reset: NumberingReset;
  next: string | null;
}

/**
 * Settings → Organization → Documents → Numbering (ADR-073), as approved on
 * the canvas. Loads its own data: the numbering is a resource of its own,
 * not part of the organization's profile.
 */
export function NumberingSection({ readOnly }: { readOnly: boolean }) {
  const intl = useIntl();
  const { data, error, reload } = useResource<{ numbering: Numbering }>(
    '/organization/numbering',
  );
  const showSkeleton = useDelayedFlag(!data && !error);

  if (!data) {
    if (error) return <FormError message={error} />;
    return showSkeleton ? (
      <Skeleton
        variant="rounded"
        height={320}
        aria-label={intl.formatMessage({
          id: 'settings.numbering.loading',
          defaultMessage: 'Loading numbering',
        })}
      />
    ) : null;
  }

  return readOnly ? (
    <NumberingSummary numbering={data.numbering} />
  ) : (
    <NumberingForm
      // A save reloads the numbering, and the form starts again from it.
      key={JSON.stringify(data.numbering)}
      numbering={data.numbering}
      onSaved={reload}
    />
  );
}

/** The numbering as it stands, for a member who may not change it. */
function NumberingSummary({ numbering }: { numbering: Numbering }) {
  const intl = useIntl();
  const title = intl.formatMessage(SECTION.title);

  return (
    <SettingsSection
      title={title}
      onSubmit={(event) => event.preventDefault()}
      error={null}
      submitting={false}
      readOnly
      saveLabel=""
    >
      <TableContainer>
        <Table size="small" aria-label={title}>
          <TableHead>
            <TableRow>
              <TableCell>{intl.formatMessage(SECTION.document)}</TableCell>
              <TableCell>{intl.formatMessage(SECTION.startsAgain)}</TableCell>
              <TableCell>
                {intl.formatMessage({
                  id: 'settings.numbering.nextGiven',
                  defaultMessage: 'Next to be given',
                })}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {SERIES.map((key) => {
              const { prefix, digits, reset, next } = numbering[key];
              return (
                <TableRow key={key}>
                  <TableCell component="th" scope="row">
                    {intl.formatMessage(SERIES_NAME[key])}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage(RESET_LABEL[reset])}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>
                    {formatNumber(prefix, digits, next[reset], numbering.today)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography>
        {numbering.documentsInDateOrder
          ? intl.formatMessage({
              id: 'settings.numbering.inOrder',
              defaultMessage:
                'Invoices and credit notes are kept in date order.',
            })
          : intl.formatMessage({
              id: 'settings.numbering.notInOrder',
              defaultMessage:
                'Invoices and credit notes are not kept in date order.',
            })}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {intl.formatMessage({
          id: 'settings.numbering.ownerOnly',
          defaultMessage: 'An Owner can change it.',
        })}
      </Typography>
    </SettingsSection>
  );
}

function NumberingForm({
  numbering,
  onSaved,
}: {
  numbering: Numbering;
  onSaved: () => Promise<void>;
}) {
  const intl = useIntl();
  const theme = useTheme();
  const narrow = useMediaQuery(theme.breakpoints.down('md'), { noSsr: true });
  const { today } = numbering;

  const [drafts, setDrafts] = useState<Record<SeriesKey, Draft>>(
    () =>
      Object.fromEntries(
        SERIES.map((key) => [
          key,
          {
            prefix: numbering[key].prefix,
            digits: String(numbering[key].digits),
            reset: numbering[key].reset,
            next: null,
          },
        ]),
      ) as Record<SeriesKey, Draft>,
  );
  const [inOrder, setInOrder] = useState(numbering.documentsInDateOrder);
  const [editing, setEditing] = useState<SeriesKey | null>(null);
  const [confirming, setConfirming] = useState(false);
  const inputs = useRef<Partial<Record<SeriesKey, HTMLInputElement | null>>>(
    {},
  );
  // What a field in error points at with aria-describedby: the words that
  // say why (conventions.md, "Error codes").
  const id = useId();
  const refusalId = `${id}-refusal`;
  const clashId = `${id}-clash`;
  const problemId = (key: SeriesKey) => `${id}-${key}-problem`;
  const digitsProblemId = (key: SeriesKey) => `${id}-${key}-digits`;
  const nextProblemId = (key: SeriesKey) => `${id}-${key}-next`;
  const describedBy = (...ids: (string | false | undefined)[]) =>
    ids.filter(Boolean).join(' ') || undefined;

  const { submitting, error, errorCode, errorDetails, reset, submit } =
    useSubmit(
      async () => {
        setConfirming(false);
        await onSaved();
      },
      {
        success: intl.formatMessage({
          id: 'settings.numbering.saved',
          defaultMessage: 'Numbering saved',
        }),
      },
    );

  const set = (key: SeriesKey, change: Partial<Draft>) =>
    setDrafts((current) => ({
      ...current,
      [key]: { ...current[key], ...change },
    }));

  const digitsOf = (key: SeriesKey) => Number(drafts[key].digits);
  const nextOf = (key: SeriesKey) =>
    drafts[key].next !== null
      ? Number(drafts[key].next)
      : numbering[key].next[drafts[key].reset];
  const printed = (key: SeriesKey) =>
    formatNumber(drafts[key].prefix, digitsOf(key), nextOf(key), today);

  const digitsValid = (key: SeriesKey) =>
    /^\d+$/.test(drafts[key].digits) &&
    digitsOf(key) >= 1 &&
    digitsOf(key) <= 10;
  const nextValid = (key: SeriesKey) =>
    drafts[key].next === null ||
    (/^\d+$/.test(drafts[key].next ?? '') && Number(drafts[key].next) >= 1);
  const problemOf = (key: SeriesKey): PrefixProblem | null =>
    digitsValid(key)
      ? prefixProblem(drafts[key].prefix, digitsOf(key), drafts[key].reset)
      : null;
  const validOf = (key: SeriesKey) =>
    digitsValid(key) && nextValid(key) && problemOf(key) === null;

  const clash = SERIES.flatMap((first, index) =>
    SERIES.slice(index + 1)
      .filter((second) =>
        couldPrintSame(drafts[first].prefix, drafts[second].prefix),
      )
      .map((second) => [first, second] as const),
  )[0];

  const changed = SERIES.filter(
    (key) =>
      drafts[key].next !== null ||
      drafts[key].prefix !== numbering[key].prefix ||
      digitsOf(key) !== numbering[key].digits ||
      drafts[key].reset !== numbering[key].reset,
  );
  const dirty =
    changed.length > 0 || inOrder !== numbering.documentsInDateOrder;
  const blocked = clash !== undefined || !SERIES.every(validOf);

  /** The series a refusal named, marked on its row, keyed on its code. */
  const taken = hasCode(errorCode, 'numbering_number_taken');
  const refused = new Set(
    taken || hasCode(errorCode, 'numbering_prefix_shared')
      ? SERIES.filter((key) => errorDetails?.series?.includes(key))
      : [],
  );
  const lowest = taken ? (errorDetails?.lowest ?? null) : null;

  function save() {
    void submit(() =>
      api('/organization/numbering', {
        method: 'PUT',
        body: JSON.stringify({
          ...Object.fromEntries(
            SERIES.map((key) => [
              key,
              {
                prefix: drafts[key].prefix,
                digits: digitsOf(key),
                reset: drafts[key].reset,
                // Only when typed: a form left open must not drag the
                // counter back (ADR-073).
                ...(drafts[key].next !== null
                  ? { next: Number(drafts[key].next) }
                  : {}),
              },
            ]),
          ),
          documentsInDateOrder: inOrder,
        }),
      }),
    );
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (blocked) return;
    // Given numbers cannot be taken back, so a change to a series is shown
    // first; the switch on its own saves straight away.
    if (changed.length > 0) setConfirming(true);
    else save();
  }

  /** A date token typed in where the cursor is, or at the end. */
  function insertToken(key: SeriesKey, token: string) {
    const input = inputs.current[key];
    const { prefix } = drafts[key];
    const start = input?.selectionStart ?? prefix.length;
    const end = input?.selectionEnd ?? prefix.length;
    set(key, { prefix: prefix.slice(0, start) + token + prefix.slice(end) });
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  /** The parts of the date a reset needs, added before the last separator. */
  function addDate(key: SeriesKey) {
    const { prefix, reset } = drafts[key];
    const has = (token: string) => prefix.includes(token);
    const wanted = [
      has('{YYYY}') || has('{YY}') ? null : '{YYYY}',
      reset !== 'yearly' && !has('{MM}') ? '{MM}' : null,
      reset === 'daily' && !has('{DD}') ? '{DD}' : null,
    ].filter((token): token is string => token !== null);
    const separator = /[-_/]$/.exec(prefix)?.[0] ?? '-';
    const base = prefix.replace(/[-_/]+$/, '');
    set(key, {
      prefix: `${base}${base ? separator : ''}${wanted.join('')}${separator}`,
    });
  }

  function applyFormat(key: SeriesKey, format: NumberingFormat) {
    set(key, {
      prefix: format.prefix,
      digits: String(format.digits),
      reset: format.reset,
    });
  }

  const seriesName = (key: SeriesKey) => intl.formatMessage(SERIES_NAME[key]);
  const fieldLabel = (key: SeriesKey, field: string) =>
    intl.formatMessage(
      { id: 'settings.numbering.fieldOf', defaultMessage: '{series}: {field}' },
      { series: seriesName(key), field },
    );
  const PREFIX = intl.formatMessage({
    id: 'settings.numbering.prefix',
    defaultMessage: 'Prefix',
  });
  const DIGITS = intl.formatMessage({
    id: 'settings.numbering.digits',
    defaultMessage: 'Digits',
  });
  const TITLE = intl.formatMessage(SECTION.title);
  const STARTS_AGAIN = intl.formatMessage(SECTION.startsAgain);
  const NEXT = intl.formatMessage({
    id: 'settings.numbering.next',
    defaultMessage: 'Next number',
  });
  const PRINTS_AS = intl.formatMessage({
    id: 'settings.numbering.printsAs',
    defaultMessage: 'Prints as',
  });

  const prefixField = (key: SeriesKey, fullWidth = false) => (
    <TextField
      size="small"
      value={drafts[key].prefix}
      onChange={(event) =>
        set(key, { prefix: event.target.value.toUpperCase() })
      }
      onFocus={() => setEditing(key)}
      error={
        problemOf(key) !== null || refused.has(key) || clash?.includes(key)
      }
      fullWidth={fullWidth}
      slotProps={{
        htmlInput: {
          'aria-label': fieldLabel(key, PREFIX),
          'aria-describedby': describedBy(
            problemOf(key) !== null && problemId(key),
            refused.has(key) && refusalId,
            clash?.includes(key) && clashId,
          ),
          maxLength: 40,
          ref: (element: HTMLInputElement | null) => {
            inputs.current[key] = element;
          },
        },
      }}
      sx={fullWidth ? undefined : { width: rem(170) }}
    />
  );

  const digitsField = (key: SeriesKey, fullWidth = false) => (
    <TextField
      size="small"
      type="number"
      value={drafts[key].digits}
      onChange={(event) => set(key, { digits: event.target.value })}
      error={!digitsValid(key)}
      fullWidth={fullWidth}
      slotProps={{
        htmlInput: {
          'aria-label': fieldLabel(key, DIGITS),
          'aria-describedby': describedBy(
            !digitsValid(key) && digitsProblemId(key),
          ),
          min: 1,
          max: 10,
        },
      }}
      sx={fullWidth ? undefined : { width: rem(80) }}
    />
  );

  const resetField = (key: SeriesKey, fullWidth = false) => (
    <TextField
      select
      size="small"
      value={drafts[key].reset}
      onChange={(event) =>
        set(key, { reset: event.target.value as NumberingReset })
      }
      fullWidth={fullWidth}
      slotProps={{
        htmlInput: { 'aria-label': fieldLabel(key, STARTS_AGAIN) },
      }}
      sx={fullWidth ? undefined : { width: rem(150) }}
    >
      {RESETS.map((each) => (
        <MenuItem key={each} value={each}>
          {intl.formatMessage(RESET_LABEL[each])}
        </MenuItem>
      ))}
    </TextField>
  );

  const nextField = (key: SeriesKey) => (
    <Stack spacing={0.5}>
      <TextField
        size="small"
        type="number"
        value={drafts[key].next ?? String(nextOf(key))}
        onChange={(event) => set(key, { next: event.target.value })}
        error={!nextValid(key) || (refused.has(key) && lowest !== null)}
        slotProps={{
          htmlInput: {
            'aria-label': fieldLabel(key, NEXT),
            'aria-describedby': describedBy(
              !nextValid(key) && nextProblemId(key),
              refused.has(key) && lowest !== null && refusalId,
            ),
            min: 1,
          },
        }}
        sx={{ width: rem(110) }}
      />
      {numbering[key].last && (
        <Typography variant="caption" color="text.secondary" noWrap>
          {intl.formatMessage(
            { id: 'settings.numbering.last', defaultMessage: 'Last: {number}' },
            { number: numbering[key].last },
          )}
        </Typography>
      )}
    </Stack>
  );

  const printsAs = (key: SeriesKey) => {
    const nextStart = nextPeriodStart(drafts[key].reset, today);
    const valid = validOf(key);
    return (
      <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
        <Box
          aria-live="polite"
          sx={{
            backgroundColor: (t) => t.palette.action.selected,
            color: 'primary.main',
            fontWeight: 600,
            borderRadius: 1,
            px: 1,
            py: 0.5,
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {valid ? printed(key) : NO_VALUE}
        </Box>
        {valid && nextStart && (
          <Typography variant="caption" color="text.secondary" noWrap>
            {intl.formatMessage(
              {
                id: 'settings.numbering.fromNextPeriod',
                defaultMessage: 'From {day}: {number}',
              },
              {
                day: formatDay(nextStart),
                number: formatNumber(
                  drafts[key].prefix,
                  digitsOf(key),
                  1,
                  nextStart,
                ),
              },
            )}
          </Typography>
        )}
      </Stack>
    );
  };

  /** Under the prefix being edited: the formats, the date, what is wrong. */
  const helper = (key: SeriesKey) => {
    const problem = problemOf(key);
    const formats = commonFormats(lettersOf(drafts[key].prefix, LETTERS[key]));
    const year = today.slice(0, 4);
    const yearLabel = (value: string) =>
      intl.formatMessage(
        { id: 'settings.numbering.token.year', defaultMessage: 'Year {value}' },
        { value },
      );
    const tokenLabel: Record<(typeof DATE_TOKENS)[number], string> = {
      '{YYYY}': yearLabel(year),
      '{YY}': yearLabel(year.slice(2)),
      '{MM}': intl.formatMessage(
        {
          id: 'settings.numbering.token.month',
          defaultMessage: 'Month {value}',
        },
        { value: today.slice(5, 7) },
      ),
      '{DD}': intl.formatMessage(
        { id: 'settings.numbering.token.day', defaultMessage: 'Day {value}' },
        { value: today.slice(8, 10) },
      ),
    };
    return (
      <Stack spacing={1}>
        {!digitsValid(key) && (
          <Typography
            variant="body2"
            role="alert"
            id={digitsProblemId(key)}
            sx={{ color: 'error.main' }}
          >
            {intl.formatMessage({
              id: 'settings.numbering.problem.digits',
              defaultMessage: 'Digits: a whole number from 1 to 10.',
            })}
          </Typography>
        )}
        {!nextValid(key) && (
          <Typography
            variant="body2"
            role="alert"
            id={nextProblemId(key)}
            sx={{ color: 'error.main' }}
          >
            {intl.formatMessage({
              id: 'settings.numbering.problem.next',
              defaultMessage: 'Next number: a whole number, 1 or more.',
            })}
          </Typography>
        )}
        {problem && (
          <Stack spacing={1} sx={{ color: 'error.main' }}>
            <Typography variant="body2" role="alert" id={problemId(key)}>
              {problem === 'resetNeedsDate'
                ? intl.formatMessage(
                    {
                      id: 'settings.numbering.problem.resetNeedsDate',
                      defaultMessage:
                        '{reset, select, yearly {Starting again each year needs the year in the prefix} monthly {Starting again each month needs the year and month in the prefix} other {Starting again each day needs the whole date in the prefix}}, or the same numbers would come back.',
                    },
                    { reset: drafts[key].reset },
                  )
                : intl.formatMessage(PROBLEM[problem])}
            </Typography>
            {problem === 'resetNeedsDate' && (
              <Button
                variant="outlined"
                size="small"
                onClick={() => addDate(key)}
                sx={{ alignSelf: 'flex-start' }}
              >
                {intl.formatMessage({
                  id: 'settings.numbering.addDate',
                  defaultMessage: 'Add the date',
                })}
              </Button>
            )}
          </Stack>
        )}
        <Typography variant="body2" color="text.secondary">
          {intl.formatMessage({
            id: 'settings.numbering.formats',
            defaultMessage: 'Start from a common format:',
          })}
        </Typography>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {formats.map((format) => {
            const pressed =
              drafts[key].prefix === format.prefix &&
              drafts[key].reset === format.reset &&
              digitsOf(key) === format.digits;
            return (
              <Button
                key={format.prefix}
                variant={pressed ? 'contained' : 'outlined'}
                size="small"
                aria-pressed={pressed}
                onClick={() => applyFormat(key, format)}
              >
                {intl.formatMessage(
                  {
                    id: 'settings.numbering.format',
                    defaultMessage:
                      '{number}{reset, select, never {} yearly {, each year} monthly {, each month} other {, each day}}',
                  },
                  {
                    number: formatNumber(
                      format.prefix,
                      format.digits,
                      1,
                      today,
                    ),
                    reset: format.reset,
                  },
                )}
              </Button>
            );
          })}
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {intl.formatMessage({
            id: 'settings.numbering.dateTokens',
            defaultMessage: 'Or add the date where the cursor is:',
          })}
        </Typography>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {DATE_TOKENS.map((token) => (
            <Button
              key={token}
              variant="outlined"
              size="small"
              // Keep the cursor in the prefix while the button is pressed.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insertToken(key, token)}
            >
              {tokenLabel[token]}
            </Button>
          ))}
        </Stack>
      </Stack>
    );
  };

  /**
   * A refusal from the server, in the section or in the confirm dialog it
   * came from: with the least next number it accepts, one tap uses it and
   * goes back to the form to save again.
   */
  const refusal = error && (
    <FormError message={error} id={refusalId}>
      {lowest !== null && refused.size === 1 && (
        <Button
          variant="outlined"
          color="inherit"
          size="small"
          onClick={() => {
            const [key] = [...refused];
            set(key, { next: String(lowest) });
            reset();
            setConfirming(false);
          }}
        >
          {intl.formatMessage(
            {
              id: 'settings.numbering.useLowest',
              defaultMessage: 'Use {number}',
            },
            { number: String(lowest) },
          )}
        </Button>
      )}
    </FormError>
  );

  return (
    <>
      <SettingsSection
        title={TITLE}
        onSubmit={handleSubmit}
        error={null}
        submitting={submitting}
        readOnly={false}
        saveLabel={intl.formatMessage({
          id: 'settings.numbering.save',
          defaultMessage: 'Save numbering',
        })}
        saveDisabled={!dirty || blocked}
      >
        <Typography variant="body2" color="text.secondary">
          {intl.formatMessage({
            id: 'settings.numbering.intro',
            defaultMessage:
              'How each kind of document is numbered. A number already given never changes: a change applies from the next document made.',
          })}
        </Typography>

        {!confirming && refusal}

        {clash && (
          <FormError
            id={clashId}
            message={intl.formatMessage(
              {
                id: 'settings.numbering.clash',
                defaultMessage:
                  '{first} and {second} would print the same numbers. Give each its own prefix.',
              },
              {
                first: seriesName(clash[0]),
                second: seriesName(clash[1]).toLocaleLowerCase(intl.locale),
              },
            )}
          />
        )}

        {narrow ? (
          <Stack
            divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}
            sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}
          >
            {SERIES.map((key) => (
              <Box key={key}>
                <Button
                  fullWidth
                  color="inherit"
                  aria-expanded={editing === key}
                  onClick={() => setEditing(editing === key ? null : key)}
                  sx={{ justifyContent: 'space-between', px: 2, py: 1.5 }}
                >
                  <Stack sx={{ alignItems: 'flex-start' }}>
                    <Typography sx={{ fontWeight: 600 }}>
                      {seriesName(key)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {intl.formatMessage(RESET_LABEL[drafts[key].reset])}
                    </Typography>
                  </Stack>
                  {printsAs(key)}
                </Button>
                {/* A row in error stays open, so its reason shows. */}
                {(editing === key || !validOf(key)) && (
                  <Stack spacing={2} sx={{ px: 2, pb: 2 }}>
                    {helper(key)}
                    {prefixField(key, true)}
                    <Stack direction="row" spacing={2}>
                      {digitsField(key, true)}
                      {resetField(key, true)}
                    </Stack>
                    {nextField(key)}
                  </Stack>
                )}
              </Box>
            ))}
          </Stack>
        ) : (
          <TableContainer
            sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}
          >
            <Table size="small" aria-label={TITLE}>
              <TableHead>
                <TableRow>
                  <TableCell>{intl.formatMessage(SECTION.document)}</TableCell>
                  <TableCell>{PREFIX}</TableCell>
                  <TableCell>{DIGITS}</TableCell>
                  <TableCell>{STARTS_AGAIN}</TableCell>
                  <TableCell>{NEXT}</TableCell>
                  <TableCell>{PRINTS_AS}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {SERIES.map((key) => [
                  <TableRow key={key} sx={{ verticalAlign: 'top' }}>
                    <TableCell component="th" scope="row" sx={{ pt: 2.5 }}>
                      {seriesName(key)}
                    </TableCell>
                    <TableCell>{prefixField(key)}</TableCell>
                    <TableCell>{digitsField(key)}</TableCell>
                    <TableCell>{resetField(key)}</TableCell>
                    <TableCell>{nextField(key)}</TableCell>
                    <TableCell>{printsAs(key)}</TableCell>
                  </TableRow>,
                  editing === key || !validOf(key) ? (
                    <TableRow key={`${key}-helper`}>
                      <TableCell colSpan={6} sx={{ bgcolor: 'action.hover' }}>
                        {helper(key)}
                      </TableCell>
                    </TableRow>
                  ) : null,
                ])}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
          <TodayIcon fontSize="small" color="action" sx={{ mt: 0.25 }} />
          <Typography variant="body2" color="text.secondary">
            {intl.formatMessage(
              {
                id: 'settings.numbering.ownDate',
                defaultMessage:
                  'A year, month or day in a number is the document’s own date: an invoice dated 31 December and issued in January takes the old year’s next number. “Prints as” is today’s, {day}.',
              },
              { day: formatDay(today) },
            )}
          </Typography>
        </Stack>

        <FormControlLabel
          control={
            <Switch
              checked={inOrder}
              onChange={(event) => setInOrder(event.target.checked)}
            />
          }
          label={
            <Stack>
              <Typography>
                {intl.formatMessage({
                  id: 'settings.numbering.dateOrder',
                  defaultMessage:
                    'Keep invoices and credit notes in date order',
                })}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {intl.formatMessage({
                  id: 'settings.numbering.dateOrder.help',
                  defaultMessage:
                    'An invoice or credit note can’t be dated before the latest one already given in its series. France requires this; most countries don’t.',
                })}
              </Typography>
            </Stack>
          }
          sx={{ alignItems: 'flex-start' }}
        />
      </SettingsSection>

      <Dialog
        open={confirming}
        onClose={submitting ? undefined : () => setConfirming(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          {intl.formatMessage({
            id: 'settings.numbering.confirm.title',
            defaultMessage: 'Change the numbering?',
          })}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            {refusal}
            <DialogContentText>
              {intl.formatMessage({
                id: 'settings.numbering.confirm.intro',
                defaultMessage:
                  'Numbers already given stay as they are. From the next document:',
              })}
            </DialogContentText>
            <Stack
              component="ul"
              sx={{ listStyle: 'none', m: 0, p: 0, gap: 1.5 }}
            >
              {changed.map((key) => (
                <Box component="li" key={key}>
                  <Typography sx={{ fontWeight: 600 }}>
                    {seriesName(key)}
                  </Typography>
                  <Typography variant="body2">
                    {intl.formatMessage(
                      {
                        id: 'settings.numbering.confirm.next',
                        defaultMessage: 'Next: {number}',
                      },
                      { number: printed(key) },
                    )}
                  </Typography>
                  {numbering[key].last && (
                    <Typography variant="body2" color="text.secondary">
                      {intl.formatMessage(
                        {
                          id: 'settings.numbering.confirm.last',
                          defaultMessage: 'The last given stays {number}.',
                        },
                        { number: numbering[key].last },
                      )}
                    </Typography>
                  )}
                </Box>
              ))}
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {intl.formatMessage({
                id: 'settings.numbering.confirm.note',
                defaultMessage:
                  'A number given after this keeps its form, even if you change the numbering back later.',
              })}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogFooter
          submitting={submitting}
          onCancel={() => {
            reset();
            setConfirming(false);
          }}
          onConfirm={save}
          label={intl.formatMessage({
            id: 'settings.numbering.confirm.action',
            defaultMessage: 'Change numbering',
          })}
          pendingLabel={intl.formatMessage({
            id: 'common.saving',
            defaultMessage: 'Saving…',
          })}
        />
      </Dialog>
    </>
  );
}
