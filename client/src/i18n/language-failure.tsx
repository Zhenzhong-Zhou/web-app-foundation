import CloseIcon from '@mui/icons-material/Close';
import { Alert, Button, IconButton, Snackbar } from '@mui/material';
import { type ReactNode, useMemo, useState } from 'react';
import { FormattedMessage, RawIntlProvider, useIntl } from 'react-intl';

import { Reload } from '../errors/status-actions';
import { formattingLocale, LANGUAGE_NAMES, type Locale } from '../lib/locales';
import { ENGLISH, type Messages } from './catalogues';
import FAILURE_WORDS from './compiled/failure-words.json';
import { makeIntl } from './intl';
import type { LanguageFailure } from './language-context';
import { useLanguage } from './use-language';

/**
 * A language in its own name, marked with its own lang, so a screen reader
 * says 简体中文 in Chinese whatever the message around it is in.
 */
function LanguageName({ locale }: { locale: Locale }) {
  return <span lang={locale}>{LANGUAGE_NAMES[locale]}</span>;
}

/**
 * What it says is said in the language that would not load, the one the
 * person chose and reads (ADR-081, as built): its catalogue is what failed,
 * so its few words for saying so ship in the main chunk
 * (scripts/write-failure-words.mjs), over the English ones. Marked with
 * its lang, for a screen reader's voice and the browser's glyphs.
 */
function InLanguage({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const tag = formattingLocale(locale, navigator.languages);
  const intl = useMemo(
    () =>
      makeIntl(
        tag,
        locale === 'en'
          ? ENGLISH
          : {
              ...ENGLISH,
              ...(FAILURE_WORDS[locale] as unknown as Messages),
            },
      ),
    [locale, tag],
  );
  return (
    <RawIntlProvider value={intl}>
      <span lang={tag}>{children}</span>
    </RawIntlProvider>
  );
}

/**
 * Why a language would not load, said: a newer build whose files this tab
 * cannot read, which a reload brings (ADR-081), or the connection.
 */
function Why({
  failure,
  orElse,
}: {
  failure: LanguageFailure;
  orElse: ReactNode;
}) {
  return failure.why === 'newer' ? (
    <FormattedMessage
      id="language.failedNewVersion"
      defaultMessage="Couldn’t load {language}, since a new version came out while this tab was open. Reload to use it; nothing is lost."
      values={{ language: <LanguageName locale={failure.locale} /> }}
    />
  ) : (
    orElse
  );
}

function TryAgain({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  const intl = useIntl();
  return (
    <Button
      variant="text"
      color="inherit"
      onClick={onClick}
      disabled={disabled}
    >
      {intl.formatMessage({
        id: 'common.tryAgain',
        defaultMessage: 'Try again',
      })}
    </Button>
  );
}

/**
 * A language chosen that would not load (ADR-081): the screens stay in the
 * one they were in, and this says so, with Try again, until it is closed:
 * no timer (WCAG 2.2.1), since nothing changes until someone acts. A newer
 * build its reason, Reload instead. At the foot of the screen, with the
 * confirmations (ToastProvider's foot), one above it while it shows.
 */
export function LanguageFailureToast() {
  const { failure, retry, dismiss } = useLanguage();
  const failed = failure && !failure.atStart ? failure : null;
  // Still said while it closes, once the failure has gone.
  const [said, setSaid] = useState(failed);
  if (failed && failed !== said) setSaid(failed);

  return (
    <Snackbar
      open={failed !== null}
      onClose={(_event, reason) => {
        // A click elsewhere is somebody carrying on, not dismissing.
        if (reason !== 'clickaway') dismiss();
      }}
      // In the foot's stack, which places it (ToastProvider).
      sx={{ position: 'static' }}
      slotProps={{ content: { role: 'status' } }}
      message={
        said && (
          <InLanguage locale={said.locale}>
            <Why
              failure={said}
              orElse={
                <FormattedMessage
                  id="language.failed"
                  defaultMessage="Couldn’t load {language}. Check your connection and try again."
                  values={{ language: <LanguageName locale={said.locale} /> }}
                />
              }
            />
          </InLanguage>
        )
      }
      action={
        said && (
          <InLanguage locale={said.locale}>
            {said.why === 'newer' ? <Reload /> : <TryAgain onClick={retry} />}
            <CloseButton onClick={dismiss} />
          </InLanguage>
        )
      }
    />
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  const intl = useIntl();
  return (
    <IconButton
      color="inherit"
      aria-label={intl.formatMessage({
        id: 'common.close',
        defaultMessage: 'Close',
      })}
      onClick={onClick}
    >
      <CloseIcon fontSize="small" />
    </IconButton>
  );
}

/**
 * The language this device or the account holds, which would not load as
 * the app started (ADR-081): English rather than a blank page, and this
 * says so in the warning tone, in the language that failed, with Try
 * again, or Reload when a newer build is why. No close: it stays true until
 * the language loads or another is chosen. While Try again tries, it says
 * so, and says why again if it fails again, so a press never seems to do
 * nothing.
 */
export function LanguageFailureBanner() {
  const { failure, retry } = useLanguage();
  // The failure Try again was pressed for: a new one comes if it fails.
  const [tried, setTried] = useState<LanguageFailure | null>(null);
  if (!failure?.atStart) return null;
  const trying = tried === failure;

  return (
    <Alert
      severity="warning"
      role="status"
      action={
        <InLanguage locale={failure.locale}>
          {failure.why === 'newer' ? (
            <Reload />
          ) : (
            <TryAgain
              disabled={trying}
              onClick={() => {
                setTried(failure);
                retry();
              }}
            />
          )}
        </InLanguage>
      }
    >
      <InLanguage locale={failure.locale}>
        {trying ? (
          <FormattedMessage
            id="language.loadingAgain"
            defaultMessage="Loading {language} again…"
            values={{ language: <LanguageName locale={failure.locale} /> }}
          />
        ) : (
          <Why
            failure={failure}
            orElse={
              <FormattedMessage
                id="language.failedAtStart"
                defaultMessage="Couldn’t load {language}, so the app is in English for now."
                values={{ language: <LanguageName locale={failure.locale} /> }}
              />
            }
          />
        )}
      </InLanguage>
    </Alert>
  );
}
