import { MenuItem, Stack, TextField } from '@mui/material';
import { useIntl } from 'react-intl';

import {
  isLocale,
  LANGUAGE_NAMES,
  type Locale,
  SUPPORTED_LOCALES,
} from '../lib/locales';

/** The pair as a form holds it: null is "none" (or "the default"). */
export interface LanguagePair {
  first: Locale | null;
  second: Locale | null;
}

/** A select's value for null: MUI's Select needs a string. */
const NONE = '';

/**
 * The one or two languages a customer's documents print in (ADR-054): the
 * first, then optionally a second for a bilingual sheet. Used for a
 * partner, where the first may be left to the organization's default, and
 * for the organization itself, where it may not.
 *
 * The rules the server holds, kept here so the form never offers what it
 * would refuse: no second without a first, and never the first again.
 * Clearing the first clears the second with it, since the pair is set
 * whole.
 */
export function DocumentLanguageFields({
  idPrefix,
  value,
  onChange,
  disabled = false,
  defaultLabel,
}: {
  idPrefix: string;
  value: LanguagePair;
  onChange: (value: LanguagePair) => void;
  disabled?: boolean;
  /** When given, the first may be left empty, shown as this. */
  defaultLabel?: string;
}) {
  const intl = useIntl();

  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
      <TextField
        id={`${idPrefix}-first`}
        select
        fullWidth
        disabled={disabled}
        label={intl.formatMessage({
          id: 'components.documentLanguages.first',
          defaultMessage: 'Documents print in',
        })}
        value={value.first ?? NONE}
        onChange={(event) => {
          const first = isLocale(event.target.value)
            ? event.target.value
            : null;
          onChange({
            first,
            second:
              first === null || value.second === first ? null : value.second,
          });
        }}
      >
        {defaultLabel !== undefined && (
          <MenuItem value={NONE}>{defaultLabel}</MenuItem>
        )}
        {SUPPORTED_LOCALES.map((locale) => (
          <MenuItem key={locale} value={locale} lang={locale}>
            {LANGUAGE_NAMES[locale]}
          </MenuItem>
        ))}
      </TextField>

      <TextField
        id={`${idPrefix}-second`}
        select
        fullWidth
        disabled={disabled || value.first === null}
        label={intl.formatMessage({
          id: 'components.documentLanguages.second',
          defaultMessage: 'Then also in',
        })}
        value={value.second ?? NONE}
        onChange={(event) =>
          onChange({
            ...value,
            second: isLocale(event.target.value) ? event.target.value : null,
          })
        }
        helperText={intl.formatMessage({
          id: 'components.documentLanguages.second.help',
          defaultMessage: 'For a bilingual sheet: each label in both.',
        })}
      >
        <MenuItem value={NONE}>
          {intl.formatMessage({
            id: 'components.documentLanguages.oneLanguage',
            defaultMessage: 'Nothing else',
          })}
        </MenuItem>
        {SUPPORTED_LOCALES.filter((locale) => locale !== value.first).map(
          (locale) => (
            <MenuItem key={locale} value={locale} lang={locale}>
              {LANGUAGE_NAMES[locale]}
            </MenuItem>
          ),
        )}
      </TextField>
    </Stack>
  );
}
