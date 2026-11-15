import {
  Box,
  Button,
  Paper,
  Radio,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';

import type { ProductNameToChoose } from '../api/types.gen';
import { StatusChip } from '../components/status-chip';
import type { NameKeep } from '../lib/api-names';
import { NO_VALUE } from '../lib/format';
import { languageWord, type Locale } from '../lib/locales';
import { STATUS_TONES } from '../theme/status';
import {
  descriptionsDiffer,
  identityOf,
  radioId,
  rowName,
} from './name-choices';

/**
 * The names kept in the language being chosen that differ from their own
 * (ADR-054, amended for #531), one row each: the item or variant, then a
 * radio for its own name and one for the kept name, a description beside
 * each where it differs too, chosen with its name. Each column's heading
 * chooses it on every row shown. Below 600 px each row is a card, the two
 * headings' buttons above them.
 *
 * A row the list gained when it was read again is marked New; once Save
 * was pressed with rows left, each says under it to choose one.
 */
export function NamesToChoose({
  idPrefix,
  rows,
  identities,
  language,
  choices,
  fresh,
  refused,
  phone,
  onChoose,
  onChooseShown,
}: {
  /** Each row's radios are named from it, for the dialog to focus one. */
  idPrefix: string;
  rows: readonly ProductNameToChoose[];
  /** Each row's identity, worked out once for the list (identityOf). */
  identities: ReadonlyMap<ProductNameToChoose, string>;
  language: Locale;
  /** Each row's choice, by its identity. */
  choices: Readonly<Record<string, NameKeep>>;
  /** The identities of the rows new since the list was read again. */
  fresh: ReadonlySet<string>;
  /** Save was pressed with rows left. */
  refused: boolean;
  phone: boolean;
  onChoose: (identity: string, keep: NameKeep) => void;
  onChooseShown: (keep: NameKeep) => void;
}) {
  const intl = useIntl();
  const word = languageWord(language, intl.locale);
  const column: Record<NameKeep, string> = {
    own: intl.formatMessage({
      id: 'settings.itemNames.column.own',
      defaultMessage: 'Own name',
    }),
    kept: intl.formatMessage(
      {
        id: 'settings.itemNames.column.kept',
        defaultMessage: '{language} name',
      },
      { language: word },
    ),
  };
  const chooseShown = (keep: NameKeep) =>
    intl.formatMessage(
      {
        id: 'settings.itemNames.column.choose',
        defaultMessage: '{column}: choose it on every row shown',
      },
      { column: column[keep] },
    );

  /** What a row offers on one side: its name, and its description too. */
  const side = (row: ProductNameToChoose, keep: NameKeep): ReactNode => {
    const name = keep === 'own' ? row.ownName : row.keptName;
    const description =
      keep === 'own' ? row.ownDescription : row.keptDescription;
    const lang = keep === 'kept' ? language : undefined;
    return (
      <Box component="span" sx={{ display: 'block' }}>
        <span lang={lang}>{name ?? NO_VALUE}</span>
        {descriptionsDiffer(row) && (
          <Typography
            variant="body2"
            component="span"
            lang={lang}
            sx={{ display: 'block', color: 'text.secondary' }}
          >
            {description || NO_VALUE}
          </Typography>
        )}
      </Box>
    );
  };

  const each = rows.map((row) => {
    const identity = identities.get(row) ?? identityOf(row);
    const left = refused && !choices[identity];
    const rowId = `${idPrefix}-${row.kind}-${row.id}`;
    const headerId = `${rowId}-name`;
    const problemId = `${rowId}-problem`;
    const radio = (keep: NameKeep) => (
      <Stack
        component="label"
        direction="row"
        spacing={0.5}
        sx={{ alignItems: 'flex-start', cursor: 'pointer' }}
      >
        <Radio
          id={radioId(idPrefix, row, keep)}
          name={rowId}
          value={keep}
          checked={choices[identity] === keep}
          onChange={() => onChoose(identity, keep)}
          sx={{ mt: -0.75 }}
          slotProps={{
            input: {
              'aria-describedby': left ? `${headerId} ${problemId}` : headerId,
              'aria-invalid': left || undefined,
            },
          }}
        />
        {side(row, keep)}
      </Stack>
    );
    return {
      identity,
      label: (
        <>
          <span id={headerId}>{rowName(row, intl)}</span>
          {fresh.has(identity) && (
            <Box component="span" sx={{ ml: 1 }}>
              <StatusChip
                tone={STATUS_TONES.itemNames.new}
                label={intl.formatMessage({
                  id: 'settings.itemNames.new',
                  defaultMessage: 'New',
                })}
              />
            </Box>
          )}
          {left && (
            <Typography
              id={problemId}
              variant="body2"
              sx={{ color: 'error.main' }}
            >
              {intl.formatMessage({
                id: 'settings.itemNames.chooseOne',
                defaultMessage: 'Choose one to keep',
              })}
            </Typography>
          )}
        </>
      ),
      own: radio('own'),
      kept: radio('kept'),
    };
  });

  if (phone) {
    return (
      <Stack spacing={1.5}>
        <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }}>
          {(['own', 'kept'] as const).map((keep) => (
            <Button
              key={keep}
              variant="outlined"
              aria-label={chooseShown(keep)}
              onClick={() => onChooseShown(keep)}
            >
              {intl.formatMessage(
                keep === 'own'
                  ? {
                      id: 'settings.itemNames.every.own',
                      defaultMessage: 'Every own name',
                    }
                  : {
                      id: 'settings.itemNames.every.kept',
                      defaultMessage: 'Every {language} name',
                    },
                { language: word },
              )}
            </Button>
          ))}
        </Stack>
        {each.map((row) => (
          <Paper key={row.identity} variant="outlined" sx={{ p: 1.5 }}>
            <Stack spacing={1}>
              <Box sx={{ fontWeight: 600 }}>{row.label}</Box>
              {row.own}
              {row.kept}
            </Stack>
          </Paper>
        ))}
      </Stack>
    );
  }

  return (
    <Paper variant="outlined">
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>
                {intl.formatMessage({
                  id: 'products.names.of',
                  defaultMessage: 'Item or variant',
                })}
              </TableCell>
              {(['own', 'kept'] as const).map((keep) => (
                <TableCell key={keep}>
                  <Button
                    variant="text"
                    aria-label={chooseShown(keep)}
                    onClick={() => onChooseShown(keep)}
                    sx={{ ml: -1 }}
                  >
                    {column[keep]}
                  </Button>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {each.map((row) => (
              <TableRow key={row.identity}>
                <TableCell component="th" scope="row">
                  {row.label}
                </TableCell>
                <TableCell>{row.own}</TableCell>
                <TableCell>{row.kept}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}
