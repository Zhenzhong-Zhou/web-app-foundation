import {
  Box,
  Dialog,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Link,
  Skeleton,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useEffect, useId, useRef, useState } from 'react';
import { useIntl } from 'react-intl';

import type {
  ChooseProductNameLanguageDto,
  ProductNameLanguageChosen,
  ProductNameLanguagePreview,
  ProductNameToChoose,
} from '../api/types.gen';
import { DialogFooter } from '../components/dialog-footer';
import { FilterRow } from '../components/filter-row';
import { FormError } from '../components/form-error';
import { ListError } from '../components/list-error';
import { listNameParts } from '../i18n/list-names';
import { api, ApiError, hasCode } from '../lib/api';
import type { NameKeep } from '../lib/api-names';
import { languageWord, type Locale } from '../lib/locales';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useResource } from '../lib/use-resource';
import { useSubmit } from '../lib/use-submit';
import { identityOf, radioId, readAgain, rowName } from './name-choices';
import { NamesToChoose } from './names-to-choose';

/**
 * Name items in a language? (ADR-054, amended for #531): what choosing it
 * will do, read from the server, then the choice. It says how many own
 * names will count as the language's and how many copies go, and lists
 * each name kept in it that differs, for the own or the kept one to be
 * chosen on every row; nothing is chosen for the reader.
 *
 * Mounted for each Save that changes the language, and open once the
 * preview has come, or after the wait any indicator waits, so a list too
 * long to choose from at once is refused at the field without the dialog
 * opening (`onTooMany`). The main button is never off once the preview is
 * read: pressed with rows left it sends nothing and says so at each row,
 * focus on the first. A list the server finds changed since it was shown
 * is read again, each choice kept where its row still stands.
 */
export function ItemNamesConfirmation({
  language,
  from,
  onTooMany,
  onClose,
  onChosen,
}: {
  language: Locale;
  /** The language the items are named in now, or null for not set. */
  from: Locale | null;
  /** More names differ than can be chosen at once: how many, and the most. */
  onTooMany: (count: number, limit: number) => void;
  onClose: () => void;
  onChosen: () => void;
}) {
  const intl = useIntl();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true });
  const titleId = useId();
  const prefix = useId();
  const word = languageWord(language, intl.locale);

  const {
    data,
    error: readError,
    loading,
    reload,
  } = useResource<ProductNameLanguagePreview>(
    `/organization/product-name-language?language=${language}`,
  );
  const slow = useDelayedFlag(loading);
  const over = data !== null && data.total > data.differing.length;

  const [choices, setChoices] = useState<Record<string, NameKeep>>({});
  // The rows the server refused as changed, to tell what changed once the
  // list is read again.
  const [before, setBefore] = useState<ProductNameToChoose[] | null>(null);
  const [refused, setRefused] = useState(false);
  // Only those left, as they were when it was pressed, so a row chosen
  // stays in view, its radio focused, until the filter is pressed again.
  const [onlyLeft, setOnlyLeft] = useState<Set<string> | null>(null);
  const refusal = useRef<HTMLDivElement>(null);

  const rows = data?.differing ?? [];
  const left = rows.filter((row) => !choices[identityOf(row)]);
  const shown = onlyLeft
    ? rows.filter((row) => onlyLeft.has(identityOf(row)))
    : rows;
  const again = before
    ? readAgain(before, rows)
    : { fresh: new Set<string>(), gone: [] };

  useEffect(() => {
    if (data && over) onTooMany(data.total, data.differing.length);
  }, [data, over, onTooMany]);

  const { submitting, error, submit } = useSubmit<ProductNameLanguageChosen>(
    () => onChosen(),
    { success: (result) => savedMessage(result) },
  );

  // A refusal from the server comes into view with focus.
  useEffect(() => {
    if (error) refusal.current?.focus();
  }, [error]);

  function savedMessage(result: ProductNameLanguageChosen) {
    const counts = [
      result.copiesRemoved > 0 &&
        intl.formatMessage(
          {
            id: 'settings.itemNames.savedCopies',
            defaultMessage:
              '{count, plural, one {# copy removed} other {# copies removed}}',
          },
          { count: result.copiesRemoved },
        ),
      result.renamed > 0 &&
        intl.formatMessage(
          {
            id: 'settings.itemNames.savedRenamed',
            defaultMessage:
              '{count, plural, one {# item renamed} other {# items renamed}}',
          },
          { count: result.renamed },
        ),
    ].filter((part) => part !== false);

    return counts.length === 0
      ? intl.formatMessage(
          {
            id: 'settings.itemNames.saved',
            defaultMessage: 'Items are named in {language}.',
          },
          { language: word },
        )
      : intl.formatMessage(
          {
            id: 'settings.itemNames.savedWithCounts',
            defaultMessage: 'Items are named in {language}. {counts}.',
          },
          {
            language: word,
            counts: intl.formatList(counts, { type: 'conjunction' }),
          },
        );
  }

  function focusRow(row: ProductNameToChoose) {
    document.getElementById(radioId(prefix, row, 'own'))?.focus();
  }

  function choose(identity: string, keep: NameKeep) {
    setChoices((current) => ({ ...current, [identity]: keep }));
  }

  function chooseShown(keep: NameKeep) {
    setChoices((current) => ({
      ...current,
      ...Object.fromEntries(shown.map((row) => [identityOf(row), keep])),
    }));
  }

  function save() {
    if (!data) return;
    if (left.length > 0) {
      setRefused(true);
      focusRow(left[0]);
      return;
    }

    const body: ChooseProductNameLanguageDto = {
      language,
      // Each row as it was shown, for the server to tell it has not changed.
      choices: rows.map((row) => ({
        kind: row.kind,
        id: row.id,
        keep: choices[identityOf(row)],
        ownName: row.ownName,
        keptName: row.keptName,
        ownDescription: row.ownDescription,
        keptDescription: row.keptDescription,
      })),
    };
    void submit(async () => {
      try {
        return await api<ProductNameLanguageChosen>(
          '/organization/product-name-language',
          { method: 'PUT', body: JSON.stringify(body) },
        );
      } catch (caught) {
        if (
          caught instanceof ApiError &&
          hasCode(caught.code ?? null, 'product_names_changed')
        ) {
          setBefore(rows);
          setOnlyLeft(null);
          setRefused(false);
          void reload();
        }
        throw caught;
      }
    });
  }

  const open = !over && (data !== null || readError !== null || slow);
  const leftLinks = listNameParts(
    intl,
    left.map((row) => rowName(row, intl)),
    { type: 'conjunction' },
    (name, index) => (
      <Link
        key={identityOf(left[index])}
        component="button"
        type="button"
        underline="always"
        onClick={() => focusRow(left[index])}
        sx={{ verticalAlign: 'baseline' }}
      >
        {name}
      </Link>
    ),
  );

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      fullWidth
      maxWidth="md"
      fullScreen={phone}
      aria-labelledby={titleId}
    >
      <DialogTitle id={titleId}>
        {intl.formatMessage(
          {
            id: 'settings.itemNames.confirm.title',
            defaultMessage: 'Name items in {language}?',
          },
          { language: word },
        )}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {error && (
            <Box ref={refusal} tabIndex={-1} sx={{ outline: 'none' }}>
              <FormError message={error}>
                {again.gone.length > 0 &&
                  intl.formatMessage(
                    {
                      id: 'settings.itemNames.gone',
                      defaultMessage: 'No longer on the list: {names}.',
                    },
                    {
                      names: intl.formatList(
                        again.gone.map((row) => rowName(row, intl)),
                        { type: 'conjunction' },
                      ),
                    },
                  )}
              </FormError>
            </Box>
          )}

          <ListError error={readError} onRetry={() => void reload()} />

          {data === null ? (
            slow && (
              <Stack spacing={1}>
                <Skeleton height={32} />
                <Skeleton height={32} />
                <Skeleton height={32} />
              </Stack>
            )
          ) : (
            <>
              <DialogContentText>
                {intl.formatMessage(
                  {
                    id: 'settings.itemNames.confirm.lead',
                    defaultMessage:
                      'The own names of {items, plural, one {# item} other {# items}}{variants, plural, =0 {} one { and # variant} other { and # variants}} will count as {language} names{changing, select, yes {, no longer as {from} names} other {}}. Nothing is translated.',
                  },
                  {
                    items: data.items,
                    variants: data.variants,
                    language: word,
                    changing: from ? 'yes' : 'no',
                    from: from ? languageWord(from, intl.locale) : '',
                  },
                )}
              </DialogContentText>

              {data.copies > 0 && (
                <Typography>
                  {intl.formatMessage(
                    {
                      id: 'settings.itemNames.confirm.copies',
                      defaultMessage:
                        '{count, plural, one {# {language} name is the same as its own and will be removed as a copy.} other {# {language} names are the same as their own and will be removed as copies.}}',
                    },
                    { count: data.copies, language: word },
                  )}
                </Typography>
              )}

              {rows.length > 0 && (
                <>
                  <Typography>
                    {intl.formatMessage(
                      {
                        id: 'settings.itemNames.confirm.choose',
                        defaultMessage:
                          '{count, plural, one {# {language} name differs from its own. Choose the one to keep.} other {# {language} names differ from their own. Choose the one to keep on each row, or press a column’s heading to choose it on every row shown.}}',
                      },
                      { count: rows.length, language: word },
                    )}
                  </Typography>

                  {refused && left.length > 0 && (
                    <FormError
                      message={intl.formatMessage(
                        {
                          id: 'settings.itemNames.left',
                          defaultMessage:
                            '{count, plural, one {Choose the name to keep on this row first:} other {Choose the name to keep on these # rows first:}}',
                        },
                        { count: left.length },
                      )}
                    >
                      {leftLinks}
                    </FormError>
                  )}

                  <FilterRow
                    quick={[
                      {
                        id: 'all',
                        label: intl.formatMessage({
                          id: 'settings.itemNames.filter.all',
                          defaultMessage: 'All',
                        }),
                        count: rows.length,
                        pressed: onlyLeft === null,
                        onToggle: () => setOnlyLeft(null),
                      },
                      {
                        id: 'left',
                        label: intl.formatMessage({
                          id: 'settings.itemNames.filter.left',
                          defaultMessage: 'Only those left',
                        }),
                        count: left.length,
                        pressed: onlyLeft !== null,
                        onToggle: () =>
                          setOnlyLeft(new Set(left.map(identityOf))),
                      },
                    ]}
                  />

                  <NamesToChoose
                    idPrefix={prefix}
                    rows={shown}
                    language={language}
                    choices={choices}
                    fresh={again.fresh}
                    refused={refused}
                    phone={phone}
                    onChoose={choose}
                    onChooseShown={chooseShown}
                  />

                  <Typography
                    variant="body2"
                    aria-live="polite"
                    sx={{ color: 'text.secondary' }}
                  >
                    {intl.formatMessage(
                      {
                        id: 'settings.itemNames.chosenCount',
                        defaultMessage:
                          '{chosen, number} of {total, number} chosen',
                      },
                      { chosen: rows.length - left.length, total: rows.length },
                    )}
                  </Typography>
                </>
              )}

              <Typography>
                {intl.formatMessage({
                  id: 'settings.itemNames.confirm.final',
                  defaultMessage:
                    'This can’t be undone: items stay named in a language, and the names removed can’t be brought back.',
                })}
              </Typography>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogFooter
        submitting={submitting}
        onCancel={onClose}
        onConfirm={save}
        disabled={data === null}
        label={intl.formatMessage(
          {
            id: 'settings.itemNames.confirm.action',
            defaultMessage: 'Name items in {language}',
          },
          { language: word },
        )}
        pendingLabel={intl.formatMessage({
          id: 'common.saving',
          defaultMessage: 'Saving…',
        })}
      />
    </Dialog>
  );
}
