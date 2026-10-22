import CloseIcon from '@mui/icons-material/Close';
import { Alert, Button, IconButton, Snackbar } from '@mui/material';
import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';

import { LANGUAGE_NAMES, type Locale } from '../lib/locales';
import { useLanguage } from './use-language';

/**
 * A language in its own name, marked with its own lang, so a screen reader
 * says 简体中文 in Chinese whatever the message around it is in.
 */
function LanguageName({ locale }: { locale: Locale }) {
  return <span lang={locale}>{LANGUAGE_NAMES[locale]}</span>;
}

/**
 * A language chosen that would not load (ADR-081): the screens stay in the
 * one they were in, and this says so, with Try again, until it is closed:
 * no timer (WCAG 2.2.1), since nothing changes until someone acts. At the
 * foot of the screen, where confirmations show; one that arrives meanwhile
 * shows over it for its few seconds.
 */
export function LanguageFailureToast() {
  const intl = useIntl();
  const { failure, retry, dismiss } = useLanguage();
  const failed = failure && !failure.atStart ? failure.locale : null;
  // Still named while it closes, once the failure has gone.
  const [named, setNamed] = useState(failed);
  if (failed && failed !== named) setNamed(failed);

  return (
    <Snackbar
      open={failed !== null}
      onClose={(_event, reason) => {
        // A click elsewhere is somebody carrying on, not dismissing.
        if (reason !== 'clickaway') dismiss();
      }}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      message={
        named && (
          <FormattedMessage
            id="language.failed"
            defaultMessage="Couldn’t load {language}. Check your connection and try again."
            values={{ language: <LanguageName locale={named} /> }}
          />
        )
      }
      action={
        <>
          <Button color="inherit" onClick={retry}>
            {intl.formatMessage({
              id: 'common.tryAgain',
              defaultMessage: 'Try again',
            })}
          </Button>
          <IconButton
            color="inherit"
            aria-label={intl.formatMessage({
              id: 'common.close',
              defaultMessage: 'Close',
            })}
            onClick={dismiss}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </>
      }
      slotProps={{ content: { role: 'status' } }}
    />
  );
}

/**
 * The language this device or the account holds, which would not load as
 * the app started (ADR-081): English rather than a blank page, and this
 * says so in the warning tone, with Try again. No close: it stays true
 * until the language loads or another is chosen.
 */
export function LanguageFailureBanner() {
  const intl = useIntl();
  const { failure, retry } = useLanguage();
  if (!failure?.atStart) return null;

  return (
    <Alert
      severity="warning"
      role="status"
      action={
        <Button variant="text" color="inherit" onClick={retry}>
          {intl.formatMessage({
            id: 'common.tryAgain',
            defaultMessage: 'Try again',
          })}
        </Button>
      }
    >
      <FormattedMessage
        id="language.failedAtStart"
        defaultMessage="Couldn’t load {language}, so the app is in English for now."
        values={{ language: <LanguageName locale={failure.locale} /> }}
      />
    </Alert>
  );
}
