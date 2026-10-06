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
 * What this partner's packing slips, invoices and credit notes print in
 * (ADR-054), when it differs from the organization's. Each document takes
 * the pair as it stands the day it is made and keeps it, so a change here
 * reaches the next document and rewrites none already made.
 *
 * Seeded from props at mount and remounted by the caller's key when the
 * saved pair changes, as the price-list section beside it is.
 */
export function PartnerDocumentLanguages({
  partnerId,
  documentLanguage,
  documentSecondLanguage,
  readOnly,
  onSaved,
}: {
  partnerId: string;
  documentLanguage: Locale | null;
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

    void submit(() =>
      api(`/partners/${partnerId}`, {
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
      saveDisabled={!changed}
      notice={
        <Typography variant="body2" color="text.secondary">
          {intl.formatMessage({
            id: 'partners.documentLanguages.notice',
            defaultMessage:
              'Packing slips, invoices and credit notes for this partner, from the next one made. Those already made keep their languages.',
          })}
        </Typography>
      }
    >
      <DocumentLanguageFields
        idPrefix="partner-document-language"
        value={pair}
        onChange={setPair}
        disabled={readOnly}
        defaultLabel={intl.formatMessage({
          id: 'partners.documentLanguages.organizationDefault',
          defaultMessage: 'The organization’s default',
        })}
      />
    </SettingsSection>
  );
}
