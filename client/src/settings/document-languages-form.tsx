import { Typography } from '@mui/material';
import { type SubmitEvent, useState } from 'react';
import { useIntl } from 'react-intl';

import {
  DocumentLanguageFields,
  type LanguagePair,
} from '../components/document-language-fields';
import { SettingsSection } from '../components/settings-section';
import { api } from '../lib/api';
import type { Locale } from '../lib/locales';
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
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
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
