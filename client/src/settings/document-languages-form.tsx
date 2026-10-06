import {
  Checkbox,
  FormControlLabel,
  FormGroup,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';
import { useIntl } from 'react-intl';

import {
  DocumentLanguageFields,
  type LanguagePair,
} from '../components/document-language-fields';
import { SettingsSection } from '../components/settings-section';
import { api } from '../lib/api';
import { LANGUAGE_NAMES, type Locale, SUPPORTED_LOCALES } from '../lib/locales';
import { useSubmit } from '../lib/use-submit';

/**
 * What the organization's packing slips, invoices and credit notes print in
 * (ADR-054): the default every partner without a pair of its own takes.
 * Each document keeps the pair it was made with, so a change here reaches
 * the next one and rewrites none already made.
 *
 * Unlike a partner's, the first cannot be left empty: this is the default
 * the others fall back to. Seeded from props at mount and remounted by the
 * caller's key when the saved pair changes.
 */
export function OrganizationDocumentLanguages({
  documentLanguage,
  documentSecondLanguage,
  readOnly,
  onSaved,
}: {
  documentLanguage: Locale;
  documentSecondLanguage: Locale | null;
  readOnly: boolean;
  onSaved: () => Promise<void>;
}) {
  const intl = useIntl();
  const [pair, setPair] = useState<LanguagePair>({
    first: documentLanguage,
    second: documentSecondLanguage,
  });

  const { submitting, error, submit } = useSubmit(onSaved, {
    success: intl.formatMessage({
      id: 'partners.documentLanguages.saved',
      defaultMessage: 'Document languages saved',
    }),
  });

  const changed =
    pair.first !== documentLanguage || pair.second !== documentSecondLanguage;

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!pair.first) return;

    void submit(() =>
      api('/organization', {
        method: 'PATCH',
        // Both, always: the server checks the pair as it will stand.
        body: JSON.stringify({
          documentLanguage: pair.first,
          documentSecondLanguage: pair.second,
        }),
      }),
    );
  }

  return (
    <SettingsSection
      title={intl.formatMessage({
        id: 'partners.documentLanguages.title',
        defaultMessage: 'Document languages',
      })}
      onSubmit={handleSubmit}
      error={error}
      submitting={submitting}
      readOnly={readOnly}
      saveLabel={intl.formatMessage({
        id: 'partners.documentLanguages.save',
        defaultMessage: 'Save document languages',
      })}
      saveDisabled={!changed || !pair.first}
      notice={
        <Typography variant="body2" color="text.secondary">
          {intl.formatMessage({
            id: 'settings.org.documentLanguages.notice',
            defaultMessage:
              'For every partner without languages of its own, from the next packing slip, invoice or credit note made. Those already made keep their languages.',
          })}
        </Typography>
      }
    >
      <DocumentLanguageFields
        idPrefix="organization-document-language"
        value={pair}
        onChange={setPair}
        disabled={readOnly}
      />
    </SettingsSection>
  );
}

/**
 * The languages a product must have a name in before an invoice in that
 * language can be issued (ADR-054). The server checks at issue and names
 * the SKUs that lack one; this only chooses which languages it checks.
 * Unchecked, a missing name prints as the product's own name.
 */
export function RequiredNameLanguages({
  value,
  readOnly,
  onSaved,
}: {
  value: Locale[];
  readOnly: boolean;
  onSaved: () => Promise<void>;
}) {
  const intl = useIntl();
  const [chosen, setChosen] = useState<Locale[]>(value);

  const { submitting, error, submit } = useSubmit(onSaved, {
    success: intl.formatMessage({
      id: 'settings.org.requiredNames.saved',
      defaultMessage: 'Required names saved',
    }),
  });

  // Order-blind: checking and unchecking back is no change.
  const changed =
    chosen.length !== value.length ||
    chosen.some((locale) => !value.includes(locale));

  function toggle(locale: Locale, checked: boolean) {
    setChosen((current) =>
      checked
        ? SUPPORTED_LOCALES.filter(
            (item) => item === locale || current.includes(item),
          )
        : current.filter((item) => item !== locale),
    );
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    void submit(() =>
      api('/organization', {
        method: 'PATCH',
        body: JSON.stringify({ requiredNameLanguages: chosen }),
      }),
    );
  }

  return (
    <SettingsSection
      title={intl.formatMessage({
        id: 'settings.org.requiredNames.title',
        defaultMessage: 'Product names required on invoices',
      })}
      onSubmit={handleSubmit}
      error={error}
      submitting={submitting}
      readOnly={readOnly}
      saveLabel={intl.formatMessage({
        id: 'settings.org.requiredNames.save',
        defaultMessage: 'Save required names',
      })}
      saveDisabled={!changed}
      notice={
        <Typography variant="body2" color="text.secondary">
          {intl.formatMessage({
            id: 'settings.org.requiredNames.notice',
            defaultMessage:
              'An invoice printing in a checked language cannot be issued while any of its items has no name in it. Unchecked, a missing name prints as the product’s own.',
          })}
        </Typography>
      }
    >
      <FormGroup row>
        {SUPPORTED_LOCALES.map((locale) => (
          <FormControlLabel
            key={locale}
            control={
              <Checkbox
                checked={chosen.includes(locale)}
                onChange={(event) => toggle(locale, event.target.checked)}
                disabled={readOnly}
              />
            }
            // Each language in its own name, as the pickers show them.
            label={<span lang={locale}>{LANGUAGE_NAMES[locale]}</span>}
          />
        ))}
      </FormGroup>
    </SettingsSection>
  );
}
