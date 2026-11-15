import {
  Alert,
  Checkbox,
  FormControlLabel,
  FormGroup,
  FormLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  type SubmitEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { useIntl } from 'react-intl';

import { SettingsSection } from '../components/settings-section';
import { StatusChip } from '../components/status-chip';
import { api } from '../lib/api';
import {
  isLocale,
  LANGUAGE_NAMES,
  languageWord,
  type Locale,
  SUPPORTED_LOCALES,
} from '../lib/locales';
import { useSubmit } from '../lib/use-submit';
import { rem } from '../theme/rem';
import { STATUS_TONES } from '../theme/status';
import { ItemNamesConfirmation } from './item-names-confirmation';

/** The select's value for not set: MUI's Select needs a string. */
const NOT_SET = '';

/**
 * Item names on the Documents tab (ADR-054, amended for #531): the
 * language the items are named in, then the languages documents require
 * an item's name in. In the items' own language the own name is the name,
 * so that language is shown ticked and fixed, met by each item's own name.
 * Not set is offered only while it is not set.
 *
 * A Save that changes the language opens the confirmation, which says
 * what the change will do; the required languages, if they changed too,
 * are saved once the language is. Seeded from props at mount and remounted
 * by the caller's key when what is saved changes.
 */
export function ItemNamesSection({
  language,
  required,
  readOnly,
  onSaved,
}: {
  /** The language the items are named in; null for not set. */
  language: Locale | null;
  required: Locale[];
  readOnly: boolean;
  onSaved: () => Promise<void>;
}) {
  const intl = useIntl();
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  const [named, setNamed] = useState<Locale | null>(language);
  const [chosen, setChosen] = useState<Locale[]>(required);
  const [confirming, setConfirming] = useState(false);
  const [tooMany, setTooMany] = useState<{
    count: number;
    limit: number;
  } | null>(null);

  // Order-blind: ticking and unticking back is no change.
  const requiredChanged =
    chosen.length !== required.length ||
    chosen.some((locale) => !required.includes(locale));
  const languageChanged = named !== language;

  const saveRequired = () =>
    api('/organization', {
      method: 'PATCH',
      body: JSON.stringify({ requiredNameLanguages: chosen }),
    });

  const saved = useSubmit(onSaved, {
    success: intl.formatMessage({
      id: 'settings.itemNames.savedRequired',
      defaultMessage: 'Item names saved',
    }),
  });
  // After the confirmation, which says what it saved.
  const afterChoice = useSubmit(onSaved);

  const onTooMany = useCallback((count: number, limit: number) => {
    setConfirming(false);
    setTooMany({ count, limit });
  }, []);

  // The refusal at its field, focus on it, once the confirmation has gone
  // and given focus back.
  useEffect(() => {
    if (tooMany) field.current?.focus();
  }, [tooMany]);

  function toggle(locale: Locale, checked: boolean) {
    setChosen((current) =>
      checked
        ? SUPPORTED_LOCALES.filter(
            (each) => each === locale || current.includes(each),
          )
        : current.filter((each) => each !== locale),
    );
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (languageChanged && named) {
      setTooMany(null);
      setConfirming(true);
    } else {
      void saved.submit(saveRequired);
    }
  }

  function chosenLanguage() {
    setConfirming(false);
    void afterChoice.submit(async () => {
      if (requiredChanged) await saveRequired();
    });
  }

  const helpId = `${id}-help`;

  return (
    <>
      <SettingsSection
        title={intl.formatMessage({
          id: 'settings.itemNames.title',
          defaultMessage: 'Item names',
        })}
        onSubmit={handleSubmit}
        error={saved.error ?? afterChoice.error}
        submitting={saved.submitting || afterChoice.submitting || confirming}
        readOnly={readOnly}
        saveLabel={intl.formatMessage({
          id: 'settings.itemNames.save',
          defaultMessage: 'Save item names',
        })}
        saveDisabled={!languageChanged && !requiredChanged}
        notice={
          named === null &&
          chosen.length > 0 && (
            <Alert severity="info">
              {intl.formatMessage({
                id: 'settings.itemNames.notSet',
                defaultMessage:
                  'Choose the language items are named in, so that documents requiring it print each item’s own name.',
              })}
            </Alert>
          )
        }
      >
        <TextField
          id={`${id}-language`}
          select
          label={intl.formatMessage({
            id: 'settings.itemNames.language',
            defaultMessage: 'Items are named in',
          })}
          value={named ?? NOT_SET}
          onChange={(event) => {
            setTooMany(null);
            setNamed(isLocale(event.target.value) ? event.target.value : null);
          }}
          disabled={readOnly}
          inputRef={field}
          error={tooMany !== null}
          helperText={
            tooMany
              ? intl.formatMessage(
                  {
                    id: 'settings.itemNames.tooMany',
                    defaultMessage:
                      '{count, number} names kept in {language} differ from their own, and at most {limit, number} can be chosen at once. Change some in Edit names first, then choose again.',
                  },
                  {
                    ...tooMany,
                    language: named ? languageWord(named, intl.locale) : '',
                  },
                )
              : intl.formatMessage({
                  id: 'settings.itemNames.languageHelp',
                  defaultMessage:
                    'The language each item’s own name is typed in. Once chosen, it can be changed but not cleared.',
                })
          }
          slotProps={{
            select: { displayEmpty: true },
            inputLabel: { shrink: true },
          }}
          sx={{ maxWidth: rem(360) }}
          fullWidth
        >
          {language === null && (
            <MenuItem value={NOT_SET}>
              {intl.formatMessage({
                id: 'settings.itemNames.notSetChoice',
                defaultMessage: 'Not set',
              })}
            </MenuItem>
          )}
          {SUPPORTED_LOCALES.map((locale) => (
            // Each language in its own name, as the pickers show them.
            <MenuItem key={locale} value={locale} lang={locale}>
              {LANGUAGE_NAMES[locale]}
            </MenuItem>
          ))}
        </TextField>

        <Stack
          component="fieldset"
          spacing={0.5}
          sx={{ border: 0, p: 0, m: 0 }}
        >
          <FormLabel component="legend" sx={{ color: 'text.primary' }}>
            {intl.formatMessage({
              id: 'settings.itemNames.required',
              defaultMessage: 'Names documents require',
            })}
          </FormLabel>
          <FormGroup row>
            {SUPPORTED_LOCALES.map((locale) => {
              const own = locale === named;
              return (
                <FormControlLabel
                  key={locale}
                  control={
                    <Checkbox
                      checked={own || chosen.includes(locale)}
                      onChange={(event) => toggle(locale, event.target.checked)}
                      disabled={readOnly || own}
                      slotProps={{
                        input: { 'aria-describedby': own ? helpId : undefined },
                      }}
                    />
                  }
                  label={
                    <Stack
                      direction="row"
                      spacing={1}
                      useFlexGap
                      sx={{ alignItems: 'center', flexWrap: 'wrap' }}
                    >
                      <span lang={locale}>{LANGUAGE_NAMES[locale]}</span>
                      {own && (
                        <span id={helpId}>
                          <StatusChip
                            tone={STATUS_TONES.itemNames.met}
                            label={intl.formatMessage({
                              id: 'settings.itemNames.met',
                              defaultMessage: 'Met by each item’s own name',
                            })}
                          />
                        </span>
                      )}
                    </Stack>
                  }
                />
              );
            })}
          </FormGroup>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {intl.formatMessage({
              id: 'settings.itemNames.requiredHelp',
              defaultMessage:
                'A document printing in a ticked language cannot be issued while one of its items has no name in it. Unticked, a missing name prints as the item’s own.',
            })}
          </Typography>
        </Stack>
      </SettingsSection>
      {confirming && named && (
        <ItemNamesConfirmation
          language={named}
          from={language}
          onTooMany={onTooMany}
          onClose={() => setConfirming(false)}
          onChosen={chosenLanguage}
        />
      )}
    </>
  );
}
